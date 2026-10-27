"""add constraint groups (constraints-board rows)

Revision ID: a6c4e8f2b1d9
Revises: f1b7d3a9c5e2
Create Date: 2026-10-27 12:00:00.000000

A constraint group is a row of the constraints board that stands for one or more shifts, so a
location with two identical mornings can show them as one row. Weekly constraints are stored per
group instead of per shift.

Every existing shift gets its own unnamed group, and every constraint row moves to its shift's
group. Since each group has exactly one shift, dropping weekly_constraints.shift_id loses nothing;
managers merge groups afterwards. Hand-written: autogenerate would also try to "fix" the unrelated
weekly_constraints.source drift. Names match app/core/models.py, so this migration and the
startup create_all produce the same schema.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a6c4e8f2b1d9'
down_revision: Union[str, Sequence[str], None] = 'f1b7d3a9c5e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _abort_if_rows(conn, sql: str, problem: str) -> None:
    """Raises with the offending rows listed, so they can be fixed by hand before re-running."""
    rows = conn.execute(sa.text(sql)).fetchall()
    if rows:
        details = "; ".join(", ".join(f"{key}={value}" for key, value in row._mapping.items()) for row in rows)
        raise RuntimeError(
            f"Cannot add constraint groups, {problem}: {details}. Resolve them manually and re-run the migration."
        )


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()

    # 0. The new unique (employee, group, date) is (employee, shift, date) while groups are 1:1
    _abort_if_rows(bind, """
        SELECT employee_id, shift_id, date, string_agg(id::text, ',' ORDER BY id) AS constraint_ids
        FROM weekly_constraints
        GROUP BY employee_id, shift_id, date
        HAVING count(*) > 1
    """, "these weekly constraints are duplicated on (employee, shift, date)")

    # 1. Table (the app's startup create_all may already have created it)
    inspector = sa.inspect(bind)
    if not inspector.has_table('constraint_groups'):
        op.create_table(
            'constraint_groups',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('location_id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(length=40), nullable=True),
            sa.ForeignKeyConstraint(
                ['location_id'], ['locations.id'], name='fk_constraint_groups_location_id', ondelete='CASCADE'
            ),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_constraint_groups_id', 'constraint_groups', ['id'])
        op.create_index('ix_constraint_groups_location_id', 'constraint_groups', ['location_id'])

    # 2. Columns, nullable until they are backfilled
    op.add_column('shift_definitions', sa.Column('constraint_group_id', sa.Integer(), nullable=True))
    op.add_column('weekly_constraints', sa.Column('group_id', sa.Integer(), nullable=True))

    # 3. One unnamed group per shift. The temp column ties each new group to its shift
    op.add_column('constraint_groups', sa.Column('_shift_id', sa.Integer(), nullable=True))
    op.execute("""
        INSERT INTO constraint_groups (location_id, name, _shift_id)
        SELECT s.location_id, NULL, s.id FROM shift_definitions s ORDER BY s.id
    """)
    op.execute("""
        UPDATE shift_definitions s SET constraint_group_id = g.id
        FROM constraint_groups g WHERE g._shift_id = s.id
    """)

    # 4. Every constraint row moves to its shift's group
    op.execute("""
        UPDATE weekly_constraints wc SET group_id = s.constraint_group_id
        FROM shift_definitions s WHERE s.id = wc.shift_id
    """)
    op.drop_column('constraint_groups', '_shift_id')

    # 5. Nothing may be left behind before shift_id is dropped
    _abort_if_rows(
        bind,
        "SELECT string_agg(id::text, ',' ORDER BY id) AS ids FROM shift_definitions "
        "WHERE constraint_group_id IS NULL HAVING count(*) > 0",
        "these shifts were left without a group",
    )
    _abort_if_rows(
        bind,
        "SELECT string_agg(id::text, ',' ORDER BY id) AS ids FROM weekly_constraints "
        "WHERE group_id IS NULL HAVING count(*) > 0",
        "these weekly constraints were left without a group (their shift_id is NULL or unknown)",
    )

    # 6. Constraints, then the old column (dropping it also drops its foreign key and index)
    op.alter_column('shift_definitions', 'constraint_group_id', existing_type=sa.Integer(), nullable=False)
    op.alter_column('weekly_constraints', 'group_id', existing_type=sa.Integer(), nullable=False)
    op.create_foreign_key(
        'fk_shift_definitions_constraint_group_id', 'shift_definitions', 'constraint_groups',
        ['constraint_group_id'], ['id'], ondelete='RESTRICT',
    )
    op.create_foreign_key(
        'fk_weekly_constraints_group_id', 'weekly_constraints', 'constraint_groups',
        ['group_id'], ['id'], ondelete='RESTRICT',
    )
    op.create_index('ix_shift_definitions_constraint_group_id', 'shift_definitions', ['constraint_group_id'])
    op.create_index('ix_weekly_constraints_group_id', 'weekly_constraints', ['group_id'])
    op.create_unique_constraint(
        'uix_weekly_constraint_employee_group_date', 'weekly_constraints', ['employee_id', 'group_id', 'date']
    )
    op.drop_column('weekly_constraints', 'shift_id')


def downgrade() -> None:
    """
    Downgrade schema. Each constraint row becomes one row per shift of its group, which is what
    it applied to. Rows of a group that has no shifts left (kept as history) can't be expressed
    per shift, so the downgrade refuses to run while any exist.
    """
    bind = op.get_bind()
    _abort_if_rows(bind, """
        SELECT wc.group_id, string_agg(wc.id::text, ',' ORDER BY wc.id) AS constraint_ids
        FROM weekly_constraints wc
        WHERE NOT EXISTS (SELECT 1 FROM shift_definitions s WHERE s.constraint_group_id = wc.group_id)
        GROUP BY wc.group_id
    """, "these weekly constraints belong to groups without shifts")

    op.drop_constraint('uix_weekly_constraint_employee_group_date', 'weekly_constraints', type_='unique')
    op.add_column('weekly_constraints', sa.Column('shift_id', sa.Integer(), nullable=True))
    # The first shift of the group keeps the original row; the others get copies
    op.execute("""
        WITH first_shifts AS (
            SELECT constraint_group_id, MIN(id) AS shift_id FROM shift_definitions GROUP BY constraint_group_id
        )
        UPDATE weekly_constraints wc SET shift_id = fs.shift_id
        FROM first_shifts fs WHERE fs.constraint_group_id = wc.group_id
    """)
    # weekly_constraints.source exists only in databases built by the migrations, not by create_all
    columns = ['employee_id', 'group_id', 'date', 'constraint_type']
    if any(c['name'] == 'source' for c in sa.inspect(bind).get_columns('weekly_constraints')):
        columns.append('source')
    copied = ", ".join(columns)
    selected = ", ".join(f"wc.{column}" for column in columns)
    op.execute(f"""
        INSERT INTO weekly_constraints (shift_id, {copied})
        SELECT s.id, {selected}
        FROM weekly_constraints wc
        JOIN shift_definitions s ON s.constraint_group_id = wc.group_id AND s.id <> wc.shift_id
    """)
    op.alter_column('weekly_constraints', 'shift_id', existing_type=sa.Integer(), nullable=False)
    op.create_foreign_key(None, 'weekly_constraints', 'shift_definitions', ['shift_id'], ['id'])

    # Dropping the columns also drops their foreign keys and indexes
    op.drop_column('weekly_constraints', 'group_id')
    op.drop_column('shift_definitions', 'constraint_group_id')
    op.drop_table('constraint_groups')
