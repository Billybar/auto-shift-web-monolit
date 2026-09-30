# app/services/shift_demand_service.py
from datetime import date, timedelta
from typing import Dict, Tuple
from sqlalchemy.orm import Session

from app.core.models import ShiftDefinition, ShiftDemand, ShiftDemandOverride

def get_weekly_demand(db: Session, location_id: int, start_date: date) -> Dict[Tuple[int, date], Tuple[int, bool]]:
    """
    Computes the effective staff demand for each shift definition in a given location for a 7-day period.
    Returns a dictionary mapping (shift_definition_id, specific_date) to (required_employees, is_override).
    
    Precedence:
    1. Override for the specific date (ShiftDemandOverride)
    2. Weekly template for the specific weekday (ShiftDemand)
    3. Default fallback count (ShiftDefinition.default_staff_count)
    """
    end_date = start_date + timedelta(days=6)
    
    # 1. Fetch all shift definitions for the location
    shifts = db.query(ShiftDefinition).filter(ShiftDefinition.location_id == location_id).all()
    shift_ids = [s.id for s in shifts]
    
    if not shift_ids:
        return {}
        
    # 2. Fetch templates (ShiftDemand)
    templates = db.query(ShiftDemand).filter(ShiftDemand.shift_definition_id.in_(shift_ids)).all()
    # Map by (shift_id, day_of_week)
    template_map = {(t.shift_definition_id, t.day_of_week): t.required_employees for t in templates}
    
    # 3. Fetch overrides for the target week (ShiftDemandOverride)
    overrides = db.query(ShiftDemandOverride).filter(
        ShiftDemandOverride.shift_definition_id.in_(shift_ids),
        ShiftDemandOverride.date >= start_date,
        ShiftDemandOverride.date <= end_date
    ).all()
    # Map by (shift_id, date)
    override_map = {(o.shift_definition_id, o.date): o.required_employees for o in overrides}
    
    result = {}
    
    for shift in shifts:
        for day_offset in range(7):
            current_date = start_date + timedelta(days=day_offset)
            
            # Python weekday(): Monday is 0, Sunday is 6. 
            # Our system: Sunday is 0, Saturday is 6.
            # Conversion: (python_weekday + 1) % 7
            sys_day_of_week = (current_date.weekday() + 1) % 7
            
            # Check for override first
            if (shift.id, current_date) in override_map:
                result[(shift.id, current_date)] = (override_map[(shift.id, current_date)], True)
            # Then check template
            elif (shift.id, sys_day_of_week) in template_map:
                result[(shift.id, current_date)] = (template_map[(shift.id, sys_day_of_week)], False)
            # Finally, fallback to default
            else:
                result[(shift.id, current_date)] = (shift.default_staff_count, False)
                
    return result

def set_demand_override(db: Session, shift: ShiftDefinition, on_date: date, required_employees: int) -> Tuple[int, bool]:
    """
    Upserts or deletes a demand override for a specific date.
    If the requested 'required_employees' matches the standard template, the override is deleted (reset).
    Returns a tuple of (final_required_employees, is_override).
    """
    # Find what the template says for this day
    sys_day_of_week = (on_date.weekday() + 1) % 7
    template = db.query(ShiftDemand).filter(
        ShiftDemand.shift_definition_id == shift.id,
        ShiftDemand.day_of_week == sys_day_of_week
    ).first()
    
    template_value = template.required_employees if template else shift.default_staff_count
    
    # Check if override already exists
    existing_override = db.query(ShiftDemandOverride).filter(
        ShiftDemandOverride.shift_definition_id == shift.id,
        ShiftDemandOverride.date == on_date
    ).first()
    
    # If the requested value matches the template, delete any existing override (Reset)
    if required_employees == template_value:
        if existing_override:
            db.delete(existing_override)
            db.commit()
        return (template_value, False)
        
    # Otherwise, upsert the override
    if existing_override:
        existing_override.required_employees = required_employees
    else:
        new_override = ShiftDemandOverride(
            shift_definition_id=shift.id,
            date=on_date,
            required_employees=required_employees
        )
        db.add(new_override)
        
    db.commit()
    return (required_employees, True)