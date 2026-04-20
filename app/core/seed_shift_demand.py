from sqlalchemy.orm import Session
from app.core.models import ShiftDemand  # Adjust the model name if necessary
from app.core.database import SessionLocal


def seed_shift_requirements(db: Session):
    """
    Seeds the requirements for shift definitions 4, 5, and 6.
    Each shift will require 2 employees for every day of the week (0-6).
    """
    shift_ids = [4, 5, 6]
    days_of_week = range(7)  # 0 to 6
    required_count = 2

    for shift_id in shift_ids:
        for day in days_of_week:
            # Check if the record already exists to prevent duplicates
            existing = db.query(ShiftDemand).filter_by(
                shift_definition_id=shift_id,
                day_of_week=day
            ).first()

            if not existing:
                new_requirement = ShiftDemand(
                    shift_definition_id=shift_id,
                    day_of_week=day,
                    required_employees=required_count
                )
                db.add(new_requirement)

    try:
        db.commit()
        print("Successfully seeded 21 shift requirements.")
    except Exception as e:
        db.rollback()
        print(f"Error seeding data: {e}")


if __name__ == "__main__":
    # This allows running the script directly
    db = SessionLocal()
    try:
        seed_shift_requirements(db)
    finally:
        db.close()