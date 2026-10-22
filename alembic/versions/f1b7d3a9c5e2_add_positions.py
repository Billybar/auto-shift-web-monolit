"""add positions (employee roles per shift)

Revision ID: f1b7d3a9c5e2
Revises: e4a9c2d1b6f8
Create Date: 2026-10-22 12:00:00.000000

Every location gets a default role and every existing row is backfilled with it, so a location
with one role behaves exactly as before. Hand-written: autogenerate would also try to "fix" the
unrelated weekly_constraints.source drift. Constraint and index names match app/core/models.py,
so this migration and the startup create_all produce the same schema.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1b7d3a9c5e2'
down_revision: Union[str, Sequence[str], None] = 'e4a9c2d1b6f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Snapshot of DEFAULT_POSITION_NAME / DEFAULT_POSITION_COLOR, hardcoded so later changes don't rewrite this migration
DEFAULT_POSITION_NAME = 'כללי'
DEFAULT_POSITION_COLOR = '94A3B8'

# The default role of each location: its first role by sort_order, then id
DEFAULT_POSITIONS_CTE = """
    default_positions AS (
        SELECT DISTINCT ON (location_id) location_id, id
        FROM positions
        ORDER BY location_id, sort_order, id
    )
"""

ROLE_TABLES = ('shift_demands', 'shift_demand_overrides', 'assignments')


def _abort_if_rows(conn, sql: str, problem: str) -> None:
    """Raises with the offending rows listed, so they can be fixed by hand before re-running."""
    rows = conn.execute(sa.text(sql)).fetchall()
    if rows:
        details = "; ".join(", ".join(f"{key}={value}" for key, value in row._mapping.items()) for row in rows)
        raise RuntimeError(f"Cannot add positions, {problem}: {details}. Resolve them manually and re-run the migration.")


def _pre_checks(conn) -> None:
    """Step 0: refuse to run on data the new unique constraints or the backfill can't handle."""
    _abort_if_rows(conn, """
        SELECT employee_id, shift_id, date, string_agg(id::text, ',' ORDER BY id) AS assignment_ids
        FROM assignments
        GROUP BY employee_id, shift_id, date
        HAVING count(*) > 1
    """, "these assignments are duplicated on (employee, shift, date)")
    _abort_if_rows(conn, """
        SELECT shift_definition_id, day_of_week, string_agg(id::text, ',' ORDER BY id) AS demand_ids
        FROM shift_demands
        GROUP BY shift_definition_id, day_of_week
        HAVING count(*) > 1
    """, "these weekly template rows are duplicated on (shift, day)")
    _abort_if_rows(conn, """
        SELECT shift_definition_id, date, string_agg(id::text, ',' ORDER BY id) AS override_ids
        FROM shift_demand_overrides
        GROUP BY shift_definition_id, date
        HAVING count(*) > 1
    """, "these demand overrides are duplicated on (shift, date)")

    null_checks = {
        'assignments': ('location_id', 'employee_id', 'shift_id', 'date'),
        'shift_demands': ('shift_definition_id', 'day_of_week', 'required_employees'),
        'shift_demand_overrides': ('shift_definition_id', 'date', 'required_employees'),
        'shift_definitions': ('location_id', 'default_staff_count'),
        'employees': ('location_id',),
    }
    for table, columns in null_checks.items():
        condition = " OR ".join(f"{column} IS NULL" for column in columns)
        _abort_if_rows(
            conn,
            f"SELECT string_agg(id::text, ',' ORDER BY id) AS ids FROM {table} WHERE {condition} HAVING count(*) > 0",
            f"{table} has NULLs in {', '.join(columns)}",
        )


def _drop_unique_on_columns(bind, table: str, columns: list[str]) -> None:
    """
    Drops the unique constraint or unique index on exactly these columns. It came from create_all,
    so its name and kind are not guaranteed.
    """
    inspector = sa.inspect(bind)
    for constraint in inspector.get_unique_constraints(table):
        if constraint['column_names'] == columns:
            op.drop_constraint(constraint['name'], table, type_='unique')
    for index in inspector.get_indexes(table):
        if index['unique'] and index['column_names'] == columns and not index.get('duplicates_constraint'):
            op.drop_index(index['name'], table_name=table)


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    _pre_checks(bind)

    # 1. Tables (the app's startup create_all may already have created them)
    inspector = sa.inspect(bind)
    if not inspector.has_table('positions'):
        op.create_table(
            'positions',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('location_id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(length=40), nullable=False),
            sa.Column('color', sa.String(length=6), nullable=False),
            sa.Column('sort_order', sa.Integer(), nullable=False),
            sa.Column('is_active', sa.Boolean(), nullable=False),
            sa.ForeignKeyConstraint(['location_id'], ['locations.id'], name='fk_positions_location_id', ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('location_id', 'name', name='uix_position_location_name'),
        )
        op.create_index('ix_positions_id', 'positions', ['id'])
        op.create_index('ix_positions_location_id', 'positions', ['location_id'])
    if not inspector.has_table('employee_positions'):
        op.create_table(
            'employee_positions',
            sa.Column('employee_id', sa.Integer(), nullable=False),
            sa.Column('position_id', sa.Integer(), nullable=False),
            sa.Column('is_primary', sa.Boolean(), server_default=sa.text('false'), nullable=False),
            sa.ForeignKeyConstraint(['employee_id'], ['employees.id'], name='fk_employee_positions_employee_id', ondelete='CASCADE'),
            sa.ForeignKeyConstraint(['position_id'], ['positions.id'], name='fk_employee_positions_position_id', ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('employee_id', 'position_id'),
        )
        op.create_index('ix_employee_positions_position_id', 'employee_positions', ['position_id'])
        op.create_index(
            'uix_employee_primary_position', 'employee_positions', ['employee_id'],
            unique=True, postgresql_where=sa.text('is_primary'),
        )

    # 2. One default role per location
    bind.execute(
        sa.text("""
            INSERT INTO positions (location_id, name, color, sort_order, is_active)
            SELECT l.id, :name, :color, 0, true
            FROM locations l
            WHERE NOT EXISTS (SELECT 1 FROM positions p WHERE p.location_id = l.id)
        """),
        {"name": DEFAULT_POSITION_NAME, "color": DEFAULT_POSITION_COLOR},
    )

    # 3. Every employee holds their location's default role, as primary
    op.execute(f"""
        WITH {DEFAULT_POSITIONS_CTE}
        INSERT INTO employee_positions (employee_id, position_id, is_primary)
        SELECT e.id, dp.id, true
        FROM employees e
        JOIN default_positions dp ON dp.location_id = e.location_id
        WHERE NOT EXISTS (SELECT 1 FROM employee_positions ep WHERE ep.employee_id = e.id)
    """)

    # 4. Demand and assignments get the default role
    for table in ROLE_TABLES:
        op.add_column(table, sa.Column('position_id', sa.Integer(), nullable=True))
    op.execute(f"""
        WITH {DEFAULT_POSITIONS_CTE}
        UPDATE shift_demands sd SET position_id = dp.id
        FROM shift_definitions s JOIN default_positions dp ON dp.location_id = s.location_id
        WHERE s.id = sd.shift_definition_id AND sd.position_id IS NULL
    """)
    op.execute(f"""
        WITH {DEFAULT_POSITIONS_CTE}
        UPDATE shift_demand_overrides o SET position_id = dp.id
        FROM shift_definitions s JOIN default_positions dp ON dp.location_id = s.location_id
        WHERE s.id = o.shift_definition_id AND o.position_id IS NULL
    """)
    op.execute(f"""
        WITH {DEFAULT_POSITIONS_CTE}
        UPDATE assignments a SET position_id = dp.id
        FROM default_positions dp
        WHERE dp.location_id = a.location_id AND a.position_id IS NULL
    """)

    # 5. default_staff_count was the fallback for days without a template row: make it explicit
    op.execute(f"""
        WITH {DEFAULT_POSITIONS_CTE}
        INSERT INTO shift_demands (shift_definition_id, day_of_week, required_employees, position_id)
        SELECT s.id, d.day, s.default_staff_count, dp.id
        FROM shift_definitions s
        CROSS JOIN generate_series(0, 6) AS d(day)
        JOIN default_positions dp ON dp.location_id = s.location_id
        WHERE s.default_staff_count > 0
          AND NOT EXISTS (
              SELECT 1 FROM shift_demands sd
              WHERE sd.shift_definition_id = s.id AND sd.day_of_week = d.day
          )
    """)

    # 6. Constraints
    for table in ROLE_TABLES:
        _abort_if_rows(
            bind,
            f"SELECT string_agg(id::text, ',' ORDER BY id) AS ids FROM {table} WHERE position_id IS NULL HAVING count(*) > 0",
            f"{table} rows were left without a role",
        )
        op.alter_column(table, 'position_id', existing_type=sa.Integer(), nullable=False)

    op.create_foreign_key(
        'fk_shift_demands_position_id', 'shift_demands', 'positions', ['position_id'], ['id'], ondelete='CASCADE'
    )
    op.create_foreign_key(
        'fk_shift_demand_overrides_position_id', 'shift_demand_overrides', 'positions', ['position_id'], ['id'],
        ondelete='CASCADE',
    )
    op.create_foreign_key(
        'fk_assignments_position_id', 'assignments', 'positions', ['position_id'], ['id'], ondelete='RESTRICT'
    )
    for table in ROLE_TABLES:
        op.create_index(f'ix_{table}_position_id', table, ['position_id'])

    _drop_unique_on_columns(bind, 'shift_demand_overrides', ['shift_definition_id', 'date'])
    op.create_unique_constraint(
        'uix_shift_demand_day_position', 'shift_demands', ['shift_definition_id', 'day_of_week', 'position_id']
    )
    op.create_unique_constraint(
        'uix_shift_demand_override_date_position', 'shift_demand_overrides',
        ['shift_definition_id', 'date', 'position_id'],
    )
    op.create_unique_constraint(
        'uix_assignment_employee_shift_date', 'assignments', ['employee_id', 'shift_id', 'date']
    )

    # 7. Columns
    op.drop_column('shift_definitions', 'default_staff_count')
    op.add_column(
        'location_weights',
        sa.Column('secondary_position', sa.Integer(), server_default='3', nullable=False),
    )


def downgrade() -> None:
    """
    Downgrade schema. Only role information is lost: per-role demand collapses into one total per
    shift and day (or date), counting active roles only, which is the demand the new code resolves.
    """
    # Archived roles' demand is ignored by the new code, so it is not part of the effective totals
    op.execute("""
        DELETE FROM shift_demands sd USING positions p
        WHERE p.id = sd.position_id AND NOT p.is_active
    """)

    # Overrides first, while the per-role template still exists: the total for a date is
    # Σ over active roles of COALESCE(override, template, 0)
    op.execute("""
        CREATE TEMP TABLE _collapsed_overrides ON COMMIT DROP AS
        WITH override_dates AS (
            SELECT DISTINCT shift_definition_id, date FROM shift_demand_overrides
        ),
        cells AS (
            SELECT od.shift_definition_id, od.date, p.id AS position_id
            FROM override_dates od
            JOIN shift_definitions s ON s.id = od.shift_definition_id
            JOIN positions p ON p.location_id = s.location_id AND p.is_active
        )
        SELECT c.shift_definition_id, c.date,
               SUM(COALESCE(o.required_employees, t.required_employees, 0))::int AS required_employees
        FROM cells c
        LEFT JOIN shift_demand_overrides o
            ON o.shift_definition_id = c.shift_definition_id AND o.date = c.date AND o.position_id = c.position_id
        LEFT JOIN shift_demands t
            ON t.shift_definition_id = c.shift_definition_id
           AND t.day_of_week = EXTRACT(DOW FROM c.date)::int
           AND t.position_id = c.position_id
        GROUP BY c.shift_definition_id, c.date
    """)
    op.execute("DELETE FROM shift_demand_overrides")
    # position_id is still NOT NULL here; any valid id will do, the column is dropped below
    op.execute(f"""
        WITH {DEFAULT_POSITIONS_CTE}
        INSERT INTO shift_demand_overrides (shift_definition_id, date, required_employees, position_id)
        SELECT c.shift_definition_id, c.date, c.required_employees, dp.id
        FROM _collapsed_overrides c
        JOIN shift_definitions s ON s.id = c.shift_definition_id
        JOIN default_positions dp ON dp.location_id = s.location_id
    """)

    # Templates: SUM per (shift, day), kept on the lowest id
    op.execute("""
        CREATE TEMP TABLE _collapsed_templates ON COMMIT DROP AS
        SELECT MIN(id) AS id, SUM(required_employees)::int AS required_employees
        FROM shift_demands
        GROUP BY shift_definition_id, day_of_week
    """)
    op.execute("DELETE FROM shift_demands WHERE id NOT IN (SELECT id FROM _collapsed_templates)")
    op.execute("""
        UPDATE shift_demands sd SET required_employees = c.required_employees
        FROM _collapsed_templates c WHERE c.id = sd.id
    """)

    op.drop_constraint('uix_assignment_employee_shift_date', 'assignments', type_='unique')
    op.drop_constraint('uix_shift_demand_override_date_position', 'shift_demand_overrides', type_='unique')
    op.drop_constraint('uix_shift_demand_day_position', 'shift_demands', type_='unique')
    op.create_unique_constraint(
        'uix_shift_demand_override_date', 'shift_demand_overrides', ['shift_definition_id', 'date']
    )

    # Days without a template row now really mean 0 (the template was made explicit on upgrade)
    op.add_column(
        'shift_definitions',
        sa.Column('default_staff_count', sa.Integer(), server_default='0', nullable=False),
    )
    op.alter_column('shift_definitions', 'default_staff_count', server_default=None)
    op.drop_column('location_weights', 'secondary_position')

    # Dropping the columns also drops their foreign keys and indexes
    for table in ROLE_TABLES:
        op.drop_column(table, 'position_id')
    op.drop_table('employee_positions')
    op.drop_table('positions')
