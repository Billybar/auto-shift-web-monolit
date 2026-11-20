"""add two_consecutive_nights weight

Revision ID: e8a1c3f5b7d2
Revises: 9d4e6b2f8a1c
Create Date: 2026-11-20 12:00:00.000000

The penalty per pair of nights in a row (a 3-night run counts as 2 pairs, on top of
consecutive_nights). Existing locations get the default through server_default.
Hand-written, like the prefer_to weight: autogenerate also picks up unrelated drift.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e8a1c3f5b7d2'
down_revision: Union[str, Sequence[str], None] = '9d4e6b2f8a1c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'location_weights',
        sa.Column('two_consecutive_nights', sa.Integer(), server_default='10', nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('location_weights', 'two_consecutive_nights')
