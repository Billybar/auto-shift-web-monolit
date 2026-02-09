import datetime
from datetime import timedelta, date

# Import models and database connection
from database import SessionLocal, init_db
from models import (Workplace, Employee, ShiftDefinition,
                    EmployeeSettings, WorkplaceWeights, ConstraintType, WeeklyConstraint)

# Import the existing configuration file
import config


def get_next_sunday():
    """
    Helper function to calculate the date of the upcoming Sunday.
    Used to map relative day indices (0-6) from config to actual dates in the DB.
    """
    today = date.today()
    # Python's weekday(): Monday=0 ... Sunday=6
    # We want Sunday to be the start. Calculate days until next Sunday.
    days_ahead = 6 - today.weekday()
    if days_ahead <= 0:  # If today is Sunday, move to next week's Sunday
        days_ahead += 7
    return today + timedelta(days=days_ahead)


def seed_data():
    """
    Populates the database with initial data derived from 'config.py'.
    """
    print("--- Starting Database Seed from Config ---")

    # 1. Initialize the database and create tables
    init_db()
    session = SessionLocal()

    try:
        # Check if the data already exists to avoid duplicates
        if session.query(Workplace).first():
            print("Database already contains data. Skipping seed to avoid duplicates.")
            print("To re-seed: Delete the 'auto_shift.db' file and run this script again.")
            return

        # 2. Create a Workplace entity
        print("Creating Workplace based on config...")
        factory = Workplace(
            name="SL_HE",
            num_days_in_cycle=config.NUM_DAYS,
            num_shifts_per_day=config.NUM_SHIFTS
        )
        session.add(factory)
        session.flush()  # Flush to generate the ID for the factory

        # 3. Define Shift Types dynamically based on config.NUM_SHIFTS
        # Assuming indices in config map to: 0=Morning, 1=Afternoon, 2=Night, etc.
        print(f"Creating {config.NUM_SHIFTS} Shift Definitions...")

        # Default names fallback
        shift_names = ["בוקר", "ערב", "לילה"]
        db_shifts = []

        for i in range(config.NUM_SHIFTS):
            # Determine name: Use predefined list or generic name if index exceeds list
            name = shift_names[i] if i < len(shift_names) else f"Shift_{i}"

            s_def = ShiftDefinition(
                workplace_id=factory.id,
                shift_name=name,
                num_staff=config.SHIFTS_PER_DAY_DEMAND
            )
            session.add(s_def)
            db_shifts.append(s_def)

        session.flush()  # Flush to populate IDs for the shift definitions

        # 4. Define Workplace Optimization Weights
        # Mapping keys from config.WEIGHTS to DB columns
        print("Creating Workplace Weights...")
        w_config = config.WEIGHTS

        weights = WorkplaceWeights(
            workplace_id=factory.id,

            target_shifts=w_config.get('TARGET_SHIFTS', 40),
            rest_gap=w_config.get('REST_GAP', 40),

            max_nights=w_config.get('MAX_NIGHTS', 5),
            max_mornings=w_config.get('MAX_MORNINGS', 6),
            max_evenings=w_config.get('MAX_EVENINGS', 2),

            min_nights=w_config.get('MIN_NIGHTS', 5),
            min_mornings=w_config.get('MIN_MORNINGS', 4),
            min_evenings=w_config.get('MIN_EVENINGS', 2),

            consecutive_nights=w_config.get('CONSECUTIVE_NIGHTS', 100)
        )
        session.add(weights)

        # 5. Import Employees and constraints from Config
        print(f"Importing {len(config.EMPLOYEES)} employees from config.py...")

        reference_sunday = get_next_sunday()
        print(f"Mapping day index 0 (Sunday) to date: {reference_sunday}")

        for cfg_emp in config.EMPLOYEES:
            # A. Create Employee record
            db_emp = Employee(
                workplace_id=factory.id,
                name=cfg_emp.name,
                color=cfg_emp.color,
                is_active=cfg_emp.is_active
            )
            session.add(db_emp)
            session.flush()  # Generate Employee ID

            # B. Create Employee Settings (Contract/Preferences)
            # Note: Currently mapping max_shifts. Other specific prefs (min_nights)
            # would require schema updates to be stored persistently.
            settings = EmployeeSettings(
                employee_id=db_emp.id,
                min_shifts_per_week=0,  # Assuming 0 as default min
                max_shifts_per_week=cfg_emp.prefs.max_shifts
            )
            session.add(settings)

            # --- C. Create Constraints (Unavailability & Forced) ---
            if cfg_emp.state:
                # 1. Unavailable Shifts (CANNOT_WORK)
                for day_idx, shift_idx in cfg_emp.state.unavailable_shifts:
                    if shift_idx >= len(db_shifts): continue

                    target_date = reference_sunday + timedelta(days=day_idx)
                    target_shift_id = db_shifts[shift_idx].id

                    c1 = WeeklyConstraint(
                        employee_id=db_emp.id,
                        shift_id=target_shift_id,
                        date=target_date,
                        constraint_type=ConstraintType.CANNOT_WORK
                    )
                    session.add(c1)

                # 2. Forced Shifts (MUST_WORK) - הוספה חדשה
                for day_idx, shift_idx in cfg_emp.state.forced_shifts:
                    if shift_idx >= len(db_shifts): continue

                    target_date = reference_sunday + timedelta(days=day_idx)
                    target_shift_id = db_shifts[shift_idx].id

                    c2 = WeeklyConstraint(
                        employee_id=db_emp.id,
                        shift_id=target_shift_id,
                        date=target_date,
                        constraint_type=ConstraintType.MUST_WORK
                    )
                    session.add(c2)

        # Commit all changes to the database
        session.commit()
        print("Seed data populated successfully from config!")

    except Exception as e:
        # Rollback in case of any error to maintain DB integrity
        session.rollback()
        print(f"Error during seeding: {e}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    seed_data()