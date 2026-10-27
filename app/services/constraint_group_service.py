# app/services/constraint_group_service.py
"""
Constraint groups: the rows of the constraints board. Each shift belongs to one group, and a
group may hold several shifts that employees mark together. WeeklyConstraint rows point at a group.

Regrouping is retroactive, since constraints are read through the group's current shifts. Merge
and split keep every submitted row: nothing here deletes a WeeklyConstraint.
"""
from dataclasses import dataclass
from typing import List

from sqlalchemy import exists, select
from sqlalchemy.orm import Session, selectinload

from app.core import shift_timing
from app.core.models import ConstraintGroup, ShiftDefinition, WeeklyConstraint


@dataclass(frozen=True)
class MergeResult:
    # Rows moved from the source group into the target
    moved: int
    # Rows left in the emptied source group, because the target already had a row on that (employee, date)
    conflicts: int


def create_group_for(shift: ShiftDefinition) -> ConstraintGroup:
    """
    Gives a new shift its own unnamed group (its own board row). The shift needs its location_id;
    the group is saved with it.
    """
    group = ConstraintGroup(location_id=shift.location_id)
    shift.constraint_group = group
    return group


def list_groups(db: Session, location_id: int) -> List[ConstraintGroup]:
    """
    The location's groups that have shifts, in the order of the work day of their first shift.
    Groups without shifts are history only and are left out.
    """
    groups = db.execute(
        select(ConstraintGroup)
        .options(selectinload(ConstraintGroup.shifts))
        .where(ConstraintGroup.location_id == location_id)
    ).scalars().all()
    groups = [g for g in groups if g.shifts]
    return sorted(groups, key=lambda g: (min(shift_timing.display_key(s) for s in g.shifts), g.id))


def sorted_shift_ids(group: ConstraintGroup) -> List[int]:
    """The group's shifts, in the order of the work day."""
    return [s.id for s in sorted(group.shifts, key=shift_timing.display_key)]


def merge(db: Session, target: ConstraintGroup, source: ConstraintGroup) -> MergeResult:
    """
    Moves the source group's shifts and constraint rows into the target (both in one location).
    Where the target already has a row for the same (employee, date), the target's row wins and
    the source's row stays in the emptied source group as history. The source group is deleted
    when nothing is left in it. Flushes; the caller commits.
    """
    for shift in list(source.shifts):
        shift.constraint_group = target

    taken = set(db.execute(
        select(WeeklyConstraint.employee_id, WeeklyConstraint.date).where(WeeklyConstraint.group_id == target.id)
    ).tuples().all())
    source_rows = db.execute(select(WeeklyConstraint).where(WeeklyConstraint.group_id == source.id)).scalars().all()
    moved = conflicts = 0
    for row in source_rows:
        if (row.employee_id, row.date) in taken:
            conflicts += 1
        else:
            row.group_id = target.id
            moved += 1
    db.flush()

    if not conflicts:
        db.delete(source)
        db.flush()
    return MergeResult(moved=moved, conflicts=conflicts)


def split(db: Session, group: ConstraintGroup, shift: ShiftDefinition) -> ConstraintGroup:
    """
    Moves one shift of the group into a new unnamed group of its own. The group's constraint rows
    are copied to the new group, so the shift keeps the availability already submitted for it.
    Flushes; the caller commits.
    """
    new_group = create_group_for(shift)
    db.flush()
    rows = db.execute(select(WeeklyConstraint).where(WeeklyConstraint.group_id == group.id)).scalars().all()
    db.add_all(
        WeeklyConstraint(
            employee_id=row.employee_id, group_id=new_group.id, date=row.date, constraint_type=row.constraint_type,
        )
        for row in rows
    )
    db.flush()
    db.expire(group, ["shifts"])
    return new_group


def drop_if_unused(db: Session, group_id: int) -> None:
    """Deletes a group left with no shifts and no constraint rows (a group with history is kept). Flushes."""
    has_shifts = db.execute(select(exists().where(ShiftDefinition.constraint_group_id == group_id))).scalar()
    has_rows = db.execute(select(exists().where(WeeklyConstraint.group_id == group_id))).scalar()
    if has_shifts or has_rows:
        return
    group = db.get(ConstraintGroup, group_id)
    if group is not None:
        db.delete(group)
        db.flush()
