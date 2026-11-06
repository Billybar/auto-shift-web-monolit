"""add employee default constraints and week submitted marker

Revision ID: 9d4e6b2f8a1c
Revises: b3d5f7a9c1e4
Create Date: 2026-11-05 12:00:00.000000

- employee_default_constraints: an employee's recurring "default week" (board row x day of week).
- weekly_notes.submitted_at: when the employee's week was submitted. A week that isn't submitted,
  has no saved rows and hasn't ended uses the employee's defaults.

Backfills, so no existing week changes meaning:
- every existing weekly_notes row came from a sync or an import, so it is submitted;
- every employee of a published week that hasn't ended gets a marker, so setting defaults later
  never changes a published week. Past weeks never use defaults, so they need no marker.

Hand-written: the new column reuses the existing Postgres enum `constrainttype`, and autogenerate
would also try to "fix" the unrelated weekly_constraints.source drift.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '9d4e6b2f8a1c'
down_revision: Union[str, Sequence[str], None] = 'b3d5f7a9c1e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # The app's startup create_all may already have created the table (it never adds the column)
    if not sa.inspect(op.get_bind()).has_table('employee_default_constraints'):
        _create_default_constraints_table()

    op.add_column('weekly_notes', sa.Column('submitted_at', sa.DateTime(), nullable=True))

    op.execute("UPDATE weekly_notes SET submitted_at = now() WHERE submitted_at IS NULL")
    op.execute(
        """
        INSERT INTO weekly_notes (employee_id, week_start_date, note, submitted_at)
        SELECT e.id, sw.week_start_date, NULL, COALESCE(sw.published_at, now())
        FROM schedule_weeks sw
        JOIN employees e ON e.location_id = sw.location_id
        WHERE sw.is_published AND sw.week_start_date + 6 >= CURRENT_DATE
        ON CONFLICT (employee_id, week_start_date)
        DO UPDATE SET submitted_at = COALESCE(weekly_notes.submitted_at, EXCLUDED.submitted_at)
        """
    )


def _create_default_constraints_table() -> None:
    op.create_table(
        'employee_default_constraints',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('employee_id', sa.Integer(), nullable=False),
        sa.Column('group_id', sa.Integer(), nullable=False),
        sa.Column('day_of_week', sa.Integer(), nullable=False),
        sa.Column(
            'constraint_type',
            postgresql.ENUM(
                'CANNOT_WORK', 'MUST_WORK', 'PREFER_NOT', 'PREFER_TO', name='constrainttype', create_type=False
            ),
            nullable=False,
        ),
        sa.CheckConstraint('day_of_week BETWEEN 0 AND 6', name='ck_default_constraint_day_of_week'),
        sa.ForeignKeyConstraint(
            ['employee_id'], ['employees.id'],
            name='fk_employee_default_constraints_employee_id', ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['group_id'], ['constraint_groups.id'],
            name='fk_employee_default_constraints_group_id', ondelete='CASCADE',
        ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'employee_id', 'group_id', 'day_of_week', name='uix_default_constraint_employee_group_day'
        ),
    )
    op.create_index(
        op.f('ix_employee_default_constraints_id'), 'employee_default_constraints', ['id'], unique=False
    )
    op.create_index(
        op.f('ix_employee_default_constraints_employee_id'), 'employee_default_constraints', ['employee_id'],
        unique=False,
    )
    op.create_index(
        op.f('ix_employee_default_constraints_group_id'), 'employee_default_constraints', ['group_id'],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_employee_default_constraints_group_id'), table_name='employee_default_constraints')
    op.drop_index(op.f('ix_employee_default_constraints_employee_id'), table_name='employee_default_constraints')
    op.drop_index(op.f('ix_employee_default_constraints_id'), table_name='employee_default_constraints')
    op.drop_table('employee_default_constraints')
    # Marker rows hold no note: before this revision a week without a note had no row
    op.execute("DELETE FROM weekly_notes WHERE note IS NULL")
    op.drop_column('weekly_notes', 'submitted_at')
