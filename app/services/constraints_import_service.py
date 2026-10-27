import logging
from datetime import date, timedelta
from sqlalchemy import delete, select
from sqlalchemy.orm import Session
from typing import Dict, List, Optional

from app.core import shift_timing
from app.core.models import Employee, WeeklyConstraint, WeeklyNote, ShiftDefinition
from app.core.enums import ConstraintType, ConstraintSource, ErrorCode, ShiftCategory
from app.core.errors import AppError
from app.api.endpoints_constraints import ConstraintSource


from app.parsers.yalam_parser import parse_yalam_html
from app.parsers.mishmarot_parser import parse_mishmarot_html, parse_mishmarot_notes


# ===== Initialize the logger for this specific module  ======
logger = logging.getLogger(__name__)
# =============================================================

# The parsers give one shift slot per day. A slot covers every shift of its category,
# since a location may have several (e.g. two morning shifts), and so every constraints-board row
# (group) that holds one of them.
SLOT_CATEGORIES = {0: ShiftCategory.MORNING, 1: ShiftCategory.EVENING, 2: ShiftCategory.NIGHT}


def _apply_constraints_to_db(
        db: Session,
        valid_constraints: Dict[int, List[tuple]],
        start_of_week: date,
        location_id: int,
        notes: Optional[Dict[int, Optional[str]]] = None
) -> None:
    """
    Handles the database transaction:
    1. Maps each (day index, shift slot) to a date and to every group (board row) holding a shift
       of the slot's category.
    2. Deletes existing constraints for the specific week and employees, on this location's board.
    3. Inserts the new constraints.
    4. If notes were provided, replaces the weekly notes of those employees for the week.
    """
    if not valid_constraints:
        return

    # 1. Fetch shift definitions for the given location, grouped by category (read from their hours)
    shifts = db.execute(select(ShiftDefinition).where(ShiftDefinition.location_id == location_id)).scalars().all()

    if not shifts:
        raise AppError(
            ErrorCode.IMPORT_NO_SHIFT_DEFINITIONS,
            f"No shift definitions found for location {location_id}",
            status_code=409,
        )

    try:
        timings = shift_timing.build_timings(shifts)
    except shift_timing.InvalidShiftHours as e:
        raise AppError(
            ErrorCode.SHIFT_INVALID_HOURS,
            f"Shift {e.shift_id} has invalid hours; set an HH:MM start and end time that differ",
            status_code=409,
            params={"shift_id": e.shift_id, "shift_name": e.shift_name},
        ) from e
    # A group that mixes categories (e.g. a morning and an evening merged) is blocked by either slot
    group_of_shift = {s.id: s.constraint_group_id for s in shifts}
    groups_by_category: Dict[ShiftCategory, List[int]] = {category: [] for category in ShiftCategory}
    for timing in sorted(timings.values(), key=lambda t: (t.start, t.shift_id)):
        group_id = group_of_shift[timing.shift_id]
        if group_id not in groups_by_category[timing.category]:
            groups_by_category[timing.category].append(group_id)

    employee_ids = list(valid_constraints.keys())
    end_of_week = start_of_week + timedelta(days=6)

    try:
        # 2. Delete existing constraints ONLY for the current week, the employees in the file and
        # this location's board (rows kept as history in a group without shifts stay)
        db.execute(
            delete(WeeklyConstraint).where(
                WeeklyConstraint.employee_id.in_(employee_ids),
                WeeklyConstraint.date >= start_of_week,
                WeeklyConstraint.date <= end_of_week,
                WeeklyConstraint.group_id.in_(set(group_of_shift.values())),
            )
        )

        # 3. Prepare new constraints for Bulk Insert
        new_constraints = []
        added = set()
        skipped_slots = 0
        for emp_id, constraints_list in valid_constraints.items():
            for day_index, shift_slot in constraints_list:

                # Unknown slots from external systems, or a category this location has no shift for
                target_group_ids = groups_by_category.get(SLOT_CATEGORIES.get(shift_slot), [])
                if not target_group_ids:
                    skipped_slots += 1
                    continue

                target_date = start_of_week + timedelta(days=day_index)
                for target_group_id in target_group_ids:
                    if (emp_id, target_group_id, target_date) in added:
                        continue
                    added.add((emp_id, target_group_id, target_date))
                    new_constraints.append(
                        WeeklyConstraint(
                            employee_id=emp_id,
                            group_id=target_group_id,
                            date=target_date,
                            constraint_type=ConstraintType.CANNOT_WORK  # Set enum based on models.py
                        )
                    )

        if skipped_slots:
            logger.info(
                f"Skipped {skipped_slots} imported constraints for location {location_id}: "
                f"no shift of their category (or an unknown shift slot)"
            )

        # 4. Bulk insert the new constraints
        if new_constraints:
            db.bulk_save_objects(new_constraints)

        # 5. Mirror the weekly notes: replace the week's note of every employee in the file
        if notes:
            db.execute(
                delete(WeeklyNote).where(
                    WeeklyNote.employee_id.in_(list(notes.keys())),
                    WeeklyNote.week_start_date == start_of_week
                )
            )
            db.add_all([
                WeeklyNote(employee_id=emp_id, week_start_date=start_of_week, note=note)
                for emp_id, note in notes.items()
                if note
            ])

        # Commit the transaction
        db.commit()

    except Exception as e:
        db.rollback()  # Rollback on any failure to prevent partial data

        # exc_info=True prints the full stack trace to the logs, crucial for DB errors
        logger.error(f"Database transaction failed during constraints import: {str(e)}", exc_info=True)

        raise e


def process_external_constraints(
        db: Session,
        html_content: str,
        source: ConstraintSource,
        start_of_week: date,
        location_id: int
) -> dict:
    """
    Routes the HTML content to the appropriate parser, cross-references
    extracted IDs with the database, and safely updates the database.
    """

    # Log the start of the process
    logger.info(
        f"Starting constraints import. Source: {source.value}, Location ID: {location_id}, Week: {start_of_week}")

    # 1. Route to the specific parser based on the external source
    if source not in (ConstraintSource.YALAM, ConstraintSource.MISHMAROT):
        raise AppError(
            ErrorCode.IMPORT_SOURCE_NOT_SUPPORTED,
            f"Parser for source '{source.value}' is not implemented yet.",
        )

    try:
        if source == ConstraintSource.YALAM:
            parsed_data = parse_yalam_html(html_content)
        else:
            parsed_data = parse_mishmarot_html(html_content)

        # Weekly notes are currently only exported by Mishmarot
        parsed_notes = parse_mishmarot_notes(html_content) if source == ConstraintSource.MISHMAROT else None
    except Exception as e:
        # The file isn't the export format we expect (wrong source selected, or a changed export)
        logger.exception(f"Failed to parse {source.value} file for location {location_id}")
        raise AppError(
            ErrorCode.IMPORT_PARSE_FAILED,
            f"Could not parse the file as a {source.value} export",
            params={"source": source.value},
        ) from e

    # 2. Fetch external-to-internal ID mapping based on the source
    ext_to_internal_map = {}

    if source == ConstraintSource.YALAM:
        # Fetch only employees in this location who have a yalam_id
        records = db.query(Employee.yalam_id, Employee.id).filter(
            Employee.location_id == location_id,
            Employee.yalam_id.isnot(None)
        ).all()
        # Create a dictionary: {"111031": 15, "111172": 16}
        ext_to_internal_map = {row.yalam_id: row.id for row in records}

    elif source == ConstraintSource.MISHMAROT:
        # Fetch only employees in this location who have a mishmarot_id
        records = db.query(Employee.mishmarot_id, Employee.id).filter(
            Employee.location_id == location_id,
            Employee.mishmarot_id.isnot(None)
        ).all()
        ext_to_internal_map = {row.mishmarot_id: row.id for row in records}

    valid_constraints = {}
    missing_employees = []

    # 3. Cross-reference parsed external IDs with the mapping
    for ext_id, constraints in parsed_data.items():
        if ext_id in ext_to_internal_map:
            # We found the external ID! Get the real internal DB ID.
            internal_id = ext_to_internal_map[ext_id]
            valid_constraints[internal_id] = constraints
        else:
            missing_employees.append(ext_id)

    # Log warning if there are missing employees
    if missing_employees:
        logger.warning(
            f"Found {len(missing_employees)} employees in the {source.value} file that are not mapped in the DB. "
            f"Unmapped External IDs: {missing_employees}. These will be skipped."
        )

    # Map notes to internal IDs (unmapped IDs are already reported in missing_employees)
    valid_notes = None
    if parsed_notes is not None:
        valid_notes = {
            ext_to_internal_map[ext_id]: note
            for ext_id, note in parsed_notes.items()
            if ext_id in ext_to_internal_map
        }

    # 4. Apply Database Updates within a transaction
    _apply_constraints_to_db(db, valid_constraints, start_of_week, location_id, valid_notes)

    imported_notes_count = sum(1 for note in (valid_notes or {}).values() if note)

    # Log successful completion
    logger.info(
        f"Constraints import finished successfully. Processed {len(valid_constraints)} employees, "
        f"imported {imported_notes_count} weekly notes.")

    return {
        "status": "success",
        "processed_employees_count": len(valid_constraints),
        "imported_notes_count": imported_notes_count,
        "missing_employees_ids": missing_employees
    }