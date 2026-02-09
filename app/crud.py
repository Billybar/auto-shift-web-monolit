# app/crud.py
from sqlalchemy.orm import Session
from . import models, schemas


def get_employee(db: Session, employee_id: int):
    return db.query(models.Employee).filter(models.Employee.id == employee_id).first()


def create_employee(db: Session, employee: schemas.EmployeeCreate, workplace_id: int):
    # Convert Pydantic model to SQLAlchemy model
    db_employee = models.Employee(
        **employee.dict(),
        workplace_id=workplace_id
    )
    db.add(db_employee)
    db.commit()
    db.refresh(db_employee)
    return db_employee


def delete_employee(db: Session, employee_id: int):
    db_employee = get_employee(db, employee_id)
    if db_employee:
        db.delete(db_employee)
        db.commit()
    return db_employee


def update_weights(db: Session, workplace_id: int, weights: schemas.WeightsUpdate):
    db_weights = db.query(models.WorkplaceWeights).filter(models.WorkplaceWeights.workplace_id == workplace_id).first()
    if not db_weights:
        return None

    # Update only provided fields
    for key, value in weights.dict(exclude_unset=True).items():
        setattr(db_weights, key, value)

    db.commit()
    db.refresh(db_weights)
    return db_weights