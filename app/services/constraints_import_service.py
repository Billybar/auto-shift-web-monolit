import logging
from datetime import date, timedelta
from sqlalchemy.orm import Session
from typing import Dict, List

from app.core.models import Employee, WeeklyConstraint, ConstraintType, ShiftDefinition
from app.api.endpoints_constraints import ConstraintSource
from app.parsers.yalam_parser import parse_yalam_html


# ===== Initialize the logger for this specific module  ======
logger = logging.getLogger(__name__)
# =============================================================

def _apply_constraints_to_db(
        db: Session,
        valid_constraints: Dict[int, List[tuple]],
        start_of_week: date,
        location_id: int
) -> None:
    """
    Handles the database transaction:
    1. Maps generic indices to actual dates and shift IDs.
    2. Deletes existing constraints for the specific week and employees.
    3. Inserts the new constraints.
    """
    if not valid_constraints:
        return

    # 1. Fetch shift definitions for the given location to map shift_index to shift_id
    # Assuming shift definitions are created in order (e.g., Morning, Evening, Night)
    shifts = db.query(ShiftDefinition).filter(
        ShiftDefinition.location_id == location_id
    ).order_by(ShiftDefinition.start_time).all()

    if not shifts:
        raise ValueError(f"No shift definitions found for location {location_id}")

    employee_ids = list(valid_constraints.keys())
    end_of_week = start_of_week + timedelta(days=6)

    try:
        # 2. Delete existing constraints ONLY for the current week and for the employees in the file
        db.query(WeeklyConstraint).filter(
            WeeklyConstraint.employee_id.in_(employee_ids),
            WeeklyConstraint.date >= start_of_week,
            WeeklyConstraint.date <= end_of_week
        ).delete(synchronize_session=False)

        # 3. Prepare new constraints for Bulk Insert
        new_constraints = []
        for emp_id, constraints_list in valid_constraints.items():
            for day_index, shift_index in constraints_list:

                # Protect against out-of-bounds shift indexes from external systems
                if shift_index >= len(shifts):
                    continue

                target_date = start_of_week + timedelta(days=day_index)
                target_shift_id = shifts[shift_index].id

                new_constraints.append(
                    WeeklyConstraint(
                        employee_id=emp_id,
                        shift_id=target_shift_id,
                        date=target_date,
                        constraint_type=ConstraintType.CANNOT_WORK  # Set enum based on models.py
                    )
                )

        # 4. Bulk insert the new constraints
        if new_constraints:
            db.bulk_save_objects(new_constraints)

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
    if source == ConstraintSource.YALAM:
        parsed_data = parse_yalam_html(html_content)
    # elif source == ConstraintSource.MISHMAROT:
    #     parsed_data = parse_mishmarot_html(html_content)
    else:
        raise ValueError(f"Parser for source '{source}' is not implemented yet.")

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

    # elif source == ConstraintSource.MISHMAROT:
    #     records = db.query(Employee.mishmarot_id, Employee.id).filter(...)
    #     ext_to_internal_map = {row.mishmarot_id: row.id for row in records}

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

    # 4. Apply Database Updates within a transaction
    _apply_constraints_to_db(db, valid_constraints, start_of_week, location_id)

    # Log successful completion
    logger.info(f"Constraints import finished successfully. Processed {len(valid_constraints)} employees.")

    return {
        "status": "success",
        "processed_employees_count": len(valid_constraints),
        "missing_employees_ids": missing_employees
    }