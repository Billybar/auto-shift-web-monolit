# app/core/seed.py
import datetime
from datetime import timedelta, date
from sqlalchemy.orm import Session

# Absolute imports
from app.core.database import SessionLocal, init_db
from app.core.models import (
    Organization, Client, Location,
    ShiftDefinition, ShiftDemand,
    Employee, EmployeeSettings,
    WeeklyConstraint, ConstraintType, Assignment, User
)

# Import configuration
import app.core.config as config
from app.core.schemas import RoleEnum


def get_next_sunday():
    today = date.today()
    days_ahead = 6 - today.weekday()
    if days_ahead <= 0:
        days_ahead += 7
    return today + timedelta(days=days_ahead)


def seed_data():
    print("--- Starting Hierarchical Database Seed ---")

    # 1. Initialize Tables
    init_db()
    session = SessionLocal()

    try:
        # 2. Create Organization (Team3)
        if session.query(Organization).filter_by(name="Team3").first():
            print("Data already exists. Skipping.")
            return

        print("Creating Organization Tree...")
        org = Organization(name="Team3")
        session.add(org)
        session.flush()

        # 3. Create Client (SolarEdge)
        client = Client(name="SolarEdge", organization_id=org.id)
        session.add(client)
        session.flush()

        # 4. Create Location (Herzliya)
        location = Location(
            name="Herzliya Campus",
            client_id=client.id,
            cycle_length=config.NUM_DAYS,
            shifts_per_day=config.NUM_SHIFTS
        )
        session.add(location)
        session.flush()

        # 5. Define Shifts & Demands
        print("Configuring Shifts & Daily Demands...")
        shift_names = ["Morning", "Evening", "Night"]

        db_shifts = []
        for i, name in enumerate(shift_names):
            # Create the generic shift definition
            s_def = ShiftDefinition(
                location_id=location.id,
                shift_name=name,
                default_staff_count=config.SHIFTS_PER_DAY_DEMAND  # Default from config
            )
            session.add(s_def)
            session.flush()
            db_shifts.append(s_def)

            # DEMO: Special demand for Weekend!
            # If it's Morning (index 0) on Friday (5) -> Need only 1 worker instead of 2
            if name == "Morning":
                friday_demand = ShiftDemand(
                    shift_definition_id=s_def.id,
                    day_of_week=5,  # Friday
                    staff_needed=1  # Override default
                )
                session.add(friday_demand)

        # 6. Import Employees
        print(f"Importing {len(config.EMPLOYEES)} employees...")
        reference_sunday = get_next_sunday()

        for cfg_emp in config.EMPLOYEES:
            # Create Employee linked to LOCATION
            db_emp = Employee(
                location_id=location.id,  # New hierarchy link
                name=cfg_emp.name,
                color=cfg_emp.color,
                is_active=cfg_emp.is_active,
                history_streak=cfg_emp.state.history_streak,
                worked_last_fri_night=cfg_emp.state.worked_last_fri_night,
                worked_last_sat_noon=cfg_emp.state.worked_last_sat_noon,
                worked_last_sat_night=cfg_emp.state.worked_last_sat_night
            )
            session.add(db_emp)
            session.flush()

            # Create Settings
            settings = EmployeeSettings(
                employee_id=db_emp.id,
                min_shifts_per_week=0,
                max_shifts_per_week=cfg_emp.prefs.max_shifts,
                # Mapping extra prefs
                max_nights=cfg_emp.prefs.max_nights,
                min_nights=cfg_emp.prefs.min_nights,
                max_mornings=cfg_emp.prefs.max_mornings,
                min_mornings=cfg_emp.prefs.min_mornings,
                max_evenings=cfg_emp.prefs.max_evenings,
                min_evenings=cfg_emp.prefs.min_evenings
            )
            session.add(settings)

            # Create Constraints
            if cfg_emp.state:
                # Unavailable
                for day_idx, shift_idx in cfg_emp.state.unavailable_shifts:
                    if shift_idx >= len(db_shifts): continue
                    session.add(WeeklyConstraint(
                        employee_id=db_emp.id,
                        shift_id=db_shifts[shift_idx].id,
                        date=reference_sunday + timedelta(days=day_idx),
                        constraint_type=ConstraintType.CANNOT_WORK
                    ))

                # Forced
                for day_idx, shift_idx in cfg_emp.state.forced_shifts:
                    if shift_idx >= len(db_shifts): continue
                    session.add(WeeklyConstraint(
                        employee_id=db_emp.id,
                        shift_id=db_shifts[shift_idx].id,
                        date=reference_sunday + timedelta(days=day_idx),
                        constraint_type=ConstraintType.MUST_WORK
                    ))

        # 7. Create Initial Users (Identity/Auth)
        print("Creating System Users...")

        # NOTE: We are using a dummy hash here for the seed.
        # Once security.py is ready, import get_password_hash() and use it!
        dummy_hashed_password = "hashed_secret_password"

        # Create the main System Administrator
        admin_user = User(
            username="admin",
            hashed_password=dummy_hashed_password,
            role=RoleEnum.ADMIN,
            employee_id=None  # Admins don't necessarily have a scheduling profile
        )
        session.add(admin_user)

        # Let's create a User account for the first employee in our config (e.g., Ira)
        # Assuming db_emp is the last inserted employee or we query the first one
        first_employee = session.query(Employee).first()
        if first_employee:
            employee_user = User(
                username=first_employee.name.lower(),
                hashed_password=dummy_hashed_password,
                role=RoleEnum.EMPLOYEE,
                employee_id=first_employee.id  # Link the user to the employee profile!
            )
            session.add(employee_user)

        session.commit()
        print("Seed completed successfully! Users and hierarchy created.")

    except Exception as e:
        session.rollback()
        print(f"Seed failed: {e}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    seed_data()