"""add soft preference levels to employee settings

Revision ID: a7c2e9d4f1b3
Revises: e8a1c3f5b7d2
Create Date: 2026-11-20 14:00:00.000000

How much each employee minds a short rest gap, 2 nights in a row and 3 nights in a row. The solver
scales the location's weight by the level. Existing rows get 'normal' (today's behaviour) through
server_default. Hand-written, like the previous weight migrations: autogenerate also picks up unrelated drift.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a7c2e9d4f1b3'
down_revision: Union[str, Sequence[str], None] = 'e8a1c3f5b7d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

COLUMNS = ('rest_gap_pref', 'two_consecutive_nights_pref', 'consecutive_nights_pref')

soft_preference = sa.Enum(
    'dont_care', 'normal', 'prefer_not', 'avoid', name='softpreference',
)


def upgrade() -> None:
    """Upgrade schema."""
    soft_preference.create(op.get_bind(), checkfirst=True)
    for column in COLUMNS:
        op.add_column(
            'employee_settings',
            sa.Column(column, soft_preference, server_default='normal', nullable=False),
        )


def downgrade() -> None:
    """Downgrade schema."""
    for column in COLUMNS:
        op.drop_column('employee_settings', column)
    soft_preference.drop(op.get_bind(), checkfirst=True)
