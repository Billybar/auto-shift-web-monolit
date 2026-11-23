"""add a penalty for 2 short rests in a row

Revision ID: b3d5f7a9c1e2
Revises: a7c2e9d4f1b3
Create Date: 2026-11-23 12:00:00.000000

A location weight, two_rest_gaps (per pair of short rests in a row, e.g. night, evening, morning),
and the matching employee preference level. Existing rows get the defaults through server_default.
Hand-written, like the previous weight migrations: autogenerate also picks up unrelated drift.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b3d5f7a9c1e2'
down_revision: Union[str, Sequence[str], None] = 'a7c2e9d4f1b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The type already exists (a7c2e9d4f1b3); don't create or drop it here
soft_preference = postgresql.ENUM(
    'dont_care', 'normal', 'prefer_not', 'avoid', name='softpreference', create_type=False,
)


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'location_weights',
        sa.Column('two_rest_gaps', sa.Integer(), server_default='15', nullable=False),
    )
    op.add_column(
        'employee_settings',
        sa.Column('two_rest_gaps_pref', soft_preference, server_default='normal', nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('employee_settings', 'two_rest_gaps_pref')
    op.drop_column('location_weights', 'two_rest_gaps')
