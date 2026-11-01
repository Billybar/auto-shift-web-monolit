"""add prefer_to weight

Revision ID: b3d5f7a9c1e4
Revises: a6c4e8f2b1d9
Create Date: 2026-11-01 12:00:00.000000

The penalty per "prefer to work" board mark the employee didn't get. Existing locations get the
default through server_default. Hand-written: autogenerate would also try to "fix" the unrelated
weekly_constraints.source drift.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3d5f7a9c1e4'
down_revision: Union[str, Sequence[str], None] = 'a6c4e8f2b1d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'location_weights',
        sa.Column('prefer_to', sa.Integer(), server_default='5', nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('location_weights', 'prefer_to')
