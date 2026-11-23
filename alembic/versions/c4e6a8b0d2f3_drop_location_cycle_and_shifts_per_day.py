"""drop locations.cycle_length and locations.shifts_per_day

Revision ID: c4e6a8b0d2f3
Revises: b3d5f7a9c1e2
Create Date: 2026-11-23 13:00:00.000000

Both columns were dead config: nothing read them, and a location can have any number of shifts
(the engine reads each shift by its hours). No rows are deleted; downgrade restores the columns
with their old defaults (7 and 3), not the values they held.
Hand-written, like the previous migrations: autogenerate also picks up unrelated drift.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4e6a8b0d2f3'
down_revision: Union[str, Sequence[str], None] = 'b3d5f7a9c1e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_column('locations', 'shifts_per_day')
    op.drop_column('locations', 'cycle_length')


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column('locations', sa.Column('cycle_length', sa.Integer(), server_default='7', nullable=False))
    op.add_column('locations', sa.Column('shifts_per_day', sa.Integer(), server_default='3', nullable=False))
