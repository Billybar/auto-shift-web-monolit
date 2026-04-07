from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import select
from typing import List, Optional

from app.core import models, schemas
from app.core.database import get_db
from app.core.security import get_password_hash

# Import our security dependencies
from app.api.dependencies import (
    get_current_user,
    get_current_admin_user,
    get_current_manager_user,
    get_current_scheduler_user
)

router = APIRouter()

# ==========================================
# Read Operations (Allowed for all authenticated users)
# ==========================================

@router.get("/", response_model=List[schemas.EmployeeResponse])
def read_employees(
    location_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    # Guard: Must be a logged-in user (Admin, Manager, Scheduler, or Employee)
    current_user: models.User = Depends(get_current_user)
):
    """
    Retrieve employees.
    Admins see all. Managers/Schedulers see employees in their permitted locations.
    Regular employees see only colleagues in their own location.
    """
    stmt = select(models.Employee).options(joinedload(models.Employee.user))

    # Apply RBAC Data Filtering for non-admins
    if current_user.role != schemas.RoleEnum.ADMIN:
        allowed_location_ids = [loc.id for loc in current_user.locations]
        allowed_client_ids = [client.id for client in current_user.clients]

        # Allow regular employees to see their own location's staff
        if current_user.role == schemas.RoleEnum.EMPLOYEE and current_user.employee_id:
            allowed_location_ids.append(current_user.employee.location_id)

        # Join with Location to filter securely
        stmt = stmt.join(models.Location).where(
            (models.Employee.location_id.in_(allowed_location_ids)) |
            (models.Location.client_id.in_(allowed_client_ids))
        )

    if location_id:
        stmt = stmt.where(models.Employee.location_id == location_id)

    stmt = stmt.offset(skip).limit(limit)
    result = db.execute(stmt)
    return result.scalars().all()


@router.get("/{employee_id}", response_model=schemas.EmployeeResponse)
def read_employee_by_id(
    employee_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    """
    Retrieve a specific employee by their ID.
    """
    stmt = select(models.Employee).options(joinedload(models.Employee.user))

    # Apply RBAC Data Filtering for non-admins (Prevent IDO vulnerability)
    if current_user.role != schemas.RoleEnum.ADMIN:
        allowed_location_ids = [loc.id for loc in current_user.locations]
        allowed_client_ids = [client.id for client in current_user.clients]

        if current_user.role == schemas.RoleEnum.EMPLOYEE and current_user.employee_id:
            allowed_location_ids.append(current_user.employee.location_id)

        stmt = stmt.join(models.Location).where(
            (models.Employee.location_id.in_(allowed_location_ids)) |
            (models.Location.client_id.in_(allowed_client_ids))
        )

    result = db.execute(stmt)
    employee = result.scalar_one_or_none()

    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee not found or access denied"
        )
    return employee

# ==========================================
# Write Operations (Restricted to Admins ONLY)
# ==========================================

@router.post("/", response_model=schemas.EmployeeResponse, status_code=status.HTTP_201_CREATED)
def create_employee(
    employee_in: schemas.EmployeeCreate,
    db: Session = Depends(get_db),
    # Guard: Admins, Managers, and Schedulers can create employees
    current_user: models.User = Depends(get_current_scheduler_user)
):
    """
    Create a new employee linked to a specific Location. (Admin only)
    """
    # 1. Verify that the location exists and fetch its parent Client eagerly
    location_stmt = (
        select(models.Location)
        .options(joinedload(models.Location.client))
        .where(models.Location.id == employee_in.location_id)
    )
    location = db.execute(location_stmt).scalar_one_or_none()

    if not location:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")

    # 2. RBAC Check: Ensure the user is authorized for this specific location
    if current_user.role != schemas.RoleEnum.ADMIN:
        allowed_location_ids = [loc.id for loc in current_user.locations]
        allowed_client_ids = [client.id for client in current_user.clients]

        if location.id not in allowed_location_ids and location.client_id not in allowed_client_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to add employees to this location"
            )

    # 3. Check if a User with this email already exists
    user_exists_stmt = select(models.User).where(models.User.email == employee_in.email)
    existing_user = db.execute(user_exists_stmt).scalar_one_or_none()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    try:
        # 4. CREATE EMPLOYEE FIRST (Since User needs the Employee ID)
        db_employee = models.Employee(
            notes=employee_in.notes,
            location_id=employee_in.location_id,
            color=employee_in.color,
            is_active=employee_in.is_active,
            yalam_id=employee_in.yalam_id,
            mishmarot_id=employee_in.mishmarot_id,
            shiftorg_id=employee_in.shiftorg_id
        )
        db.add(db_employee)
        db.flush()  # Flush to get db_employee.id

        # 5. CREATE USER AND LINK M2M ASSOCIATIONS (Organization, Client, Location)
        hashed_password = get_password_hash(employee_in.password)

        # Extract organization_id from the eagerly loaded client
        derived_org_id = location.client.organization_id if location.client else None

        db_user = models.User(
            email=employee_in.email,
            first_name=employee_in.first_name,
            last_name=employee_in.last_name,
            hashed_password=hashed_password,
            role=schemas.RoleEnum.EMPLOYEE,
            employee_id=db_employee.id,
            organization_id=derived_org_id  # 1. Assign Organization
        )

        # 5.1. Assign Client (Many-to-Many)
        if location.client:
            db_user.clients.append(location.client)

        # 5.2. Assign Location (Many-to-Many)
        db_user.locations.append(location)

        db.add(db_user)

        # Update the User record to point back to the Employee (if using explicit bidirectional IDs, optional but good practice based on your model)
        db_user.employee_id = db_employee.id

        # 6. Initialize default settings for this employee
        default_settings = models.EmployeeSettings(
            employee_id=db_employee.id,
            min_shifts_per_week=0,
            max_shifts_per_week=6
        )
        db.add(default_settings)

        # 7. Commit the entire transaction atomically
        db.commit()
        db.refresh(db_employee)

        return db_employee

    except Exception as e:
        # If any step fails, rollback everything to avoid orphaned records
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create employee: {str(e)}"
        )


@router.put("/{employee_id}", response_model=schemas.EmployeeResponse)
def update_employee(
        employee_id: int,
        employee_update: schemas.EmployeeUpdate,
        db: Session = Depends(get_db),
        # Guard: Admins, Managers, and Schedulers ONLY
        current_user: models.User = Depends(get_current_scheduler_user)
):
    """
    Update an existing employee's details.
    """
    stmt = select(models.Employee).where(models.Employee.id == employee_id)

    # Apply RBAC Data Filtering for non-admins
    if current_user.role != schemas.RoleEnum.ADMIN:
        allowed_location_ids = [loc.id for loc in current_user.locations]
        allowed_client_ids = [client.id for client in current_user.clients]

        # 1. Verify access to the EXISTING employee
        stmt = stmt.join(models.Location).where(
            (models.Employee.location_id.in_(allowed_location_ids)) |
            (models.Location.client_id.in_(allowed_client_ids))
        )

        # 2. Security Check: Verify access to the NEW location_id
        new_loc_stmt = select(models.Location).where(models.Location.id == employee_update.location_id)
        new_loc = db.execute(new_loc_stmt).scalar_one_or_none()

        if not new_loc or (new_loc.id not in allowed_location_ids and new_loc.client_id not in allowed_client_ids):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to move employee to this new location"
            )

    db_employee = db.execute(stmt).scalar_one_or_none()

    if not db_employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found or access denied")

    # 1. Update User (Identity) fields if they were provided in the request
    if db_employee.user:
        if employee_update.first_name is not None:
            db_employee.user.first_name = employee_update.first_name
        if employee_update.last_name is not None:
            db_employee.user.last_name = employee_update.last_name
        if employee_update.email is not None:
            # Check for email collision before updating
            email_check = db.execute(select(models.User).where(
                models.User.email == employee_update.email,
                models.User.id != db_employee.user.id
            )).scalar_one_or_none()
            if email_check:
                raise HTTPException(status_code=400, detail="Email already in use by another user")
            db_employee.user.email = employee_update.email

    # 2. Update Employee fields if they were provided
    if employee_update.location_id is not None:
        db_employee.location_id = employee_update.location_id
    if employee_update.color is not None:
        db_employee.color = employee_update.color
    if employee_update.is_active is not None:
        db_employee.is_active = employee_update.is_active
    if employee_update.notes is not None:
        db_employee.notes = employee_update.notes
    if employee_update.yalam_id is not None:
        db_employee.yalam_id = employee_update.yalam_id
    if employee_update.mishmarot_id is not None:
        db_employee.mishmarot_id = employee_update.mishmarot_id
    if employee_update.shiftorg_id is not None:
        db_employee.shiftorg_id = employee_update.shiftorg_id

    # Commit the transaction (updates both tables atomically)
    db.commit()
    db.refresh(db_employee)
    return db_employee


@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_employee(  # FIXED: Renamed function
        employee_id: int,
        db: Session = Depends(get_db),
        # Guard: Admins, Managers, and Schedulers ONLY
        current_user: models.User = Depends(get_current_scheduler_user)
):
    """
    Hard delete an employee.
    """
    stmt = select(models.Employee).where(models.Employee.id == employee_id)

    # Apply RBAC Data Filtering for non-admins
    if current_user.role != schemas.RoleEnum.ADMIN:
        allowed_location_ids = [loc.id for loc in current_user.locations]
        allowed_client_ids = [client.id for client in current_user.clients]

        stmt = stmt.join(models.Location).where(
            (models.Employee.location_id.in_(allowed_location_ids)) |
            (models.Location.client_id.in_(allowed_client_ids))
        )

    db_employee = db.execute(stmt).scalar_one_or_none()

    if not db_employee:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found or access denied")

    # Fetch the associated user before deleting the employee
    user_stmt = select(models.User).where(models.User.employee_id == employee_id)
    user_to_delete = db.execute(user_stmt).scalar_one_or_none()

    try:
        # Delete the Employee profile
        db.delete(db_employee)

        # Delete the User account to prevent orphaned logins
        if user_to_delete:
            db.delete(user_to_delete)

        # Commit both deletes atomically
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete employee: {str(e)}"
        )

    return None


@router.put("/{employee_id}/settings", response_model=schemas.EmployeeSettingsResponse)
def update_employee_settings(
    employee_id: int,
    settings_in: schemas.EmployeeSettingsUpdate,
    db: Session = Depends(get_db),

    # Guard: Admins, Managers, and Schedulers can update settings
    current_user: models.User = Depends(get_current_scheduler_user)
):
    """
    Update optimization rules and preferences for a specific employee.
    ... (docstrings remain exactly the same) ...
    """
    # 1. Build the query using SQLAlchemy 2.0 syntax
    stmt = select(models.EmployeeSettings)

    # 2. Apply RBAC Data Filtering for non-admins
    if current_user.role != schemas.RoleEnum.ADMIN:
        allowed_location_ids = [loc.id for loc in current_user.locations]
        allowed_client_ids = [client.id for client in current_user.clients]

        # Join Employee and Location to verify access rights securely in the DB layer
        stmt = stmt.join(models.Employee).join(models.Location).where(
            (models.Employee.location_id.in_(allowed_location_ids)) |
            (models.Location.client_id.in_(allowed_client_ids))
        )

    # 3. Filter by the specific employee_id
    stmt = stmt.where(models.EmployeeSettings.employee_id == employee_id)

    # 4. Execute the statement and fetch the scalar result
    db_settings = db.execute(stmt).scalar_one_or_none()

    if not db_settings:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee settings not found or access denied"
        )

    # Update only the fields that were provided in the request
    update_data = settings_in.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_settings, key, value)

    db.commit()
    db.refresh(db_settings)

    return db_settings