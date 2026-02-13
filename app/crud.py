from sqlalchemy.orm import Session
from app.core import models, schemas


# --- Employee Operations ---
def get_employee(db: Session, employee_id: int):
    return db.query(models.Employee).filter(models.Employee.id == employee_id).first()


def get_employees_by_location(db: Session, location_id: int):
    return db.query(models.Employee).filter(models.Employee.location_id == location_id).all()


def create_employee(db: Session, employee: schemas.EmployeeCreate):
    db_employee = models.Employee(
        name=employee.name,
        color=employee.color,
        location_id=employee.location_id,
        is_active=employee.is_active
    )
    db.add(db_employee)
    db.commit()
    db.refresh(db_employee)
    return db_employee


# --- Location / Weights Operations ---
def update_weights(db: Session, location_id: int, weights: schemas.WeightsUpdate):
    # Search for existing weights for this location
    db_weights = db.query(models.LocationWeights).filter(models.LocationWeights.location_id == location_id).first()

    # If not exists, create it (Lazy creation)
    if not db_weights:
        db_weights = models.LocationWeights(location_id=location_id)
        db.add(db_weights)

    # Update fields
    for key, value in weights.dict(exclude_unset=True).items():
        setattr(db_weights, key, value)

    db.commit()
    db.refresh(db_weights)
    return db_weights