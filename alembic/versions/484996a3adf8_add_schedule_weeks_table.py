"""add schedule_weeks table

Revision ID: 484996a3adf8
Revises: b4145bfbb705
Create Date: 2026-10-05 15:37:04.281947

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '484996a3adf8'
down_revision: Union[str, Sequence[str], None] = 'b4145bfbb705'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # CHANGED: Create table schedule_weeks and backfill existing assignments
    op.create_table('schedule_weeks',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('location_id', sa.Integer(), nullable=False),
        sa.Column('week_start_date', sa.Date(), nullable=False),
        sa.Column('is_published', sa.Boolean(), nullable=False),
        sa.Column('published_at', sa.DateTime(), nullable=True),
        sa.Column('published_by_user_id', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['location_id'], ['locations.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['published_by_user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('location_id', 'week_start_date', name='uix_location_week')
    )
    op.create_index(op.f('ix_schedule_weeks_id'), 'schedule_weeks', ['id'], unique=False)
    op.create_index(op.f('ix_schedule_weeks_location_id'), 'schedule_weeks', ['location_id'], unique=False)
    op.create_index(op.f('ix_schedule_weeks_week_start_date'), 'schedule_weeks', ['week_start_date'], unique=False)

    # Backfill: Set existing weeks as published so employees don't lose access to historical schedules
    op.execute("""
        INSERT INTO schedule_weeks (location_id, week_start_date, is_published, published_at)
        SELECT DISTINCT location_id, (date - (EXTRACT(DOW FROM date)::int)), true, now()
        FROM assignments;
    """)


def downgrade() -> None:
    """Downgrade schema."""
    # CHANGED: Drop schedule_weeks table and indexes
    op.drop_index(op.f('ix_schedule_weeks_week_start_date'), table_name='schedule_weeks')
    op.drop_index(op.f('ix_schedule_weeks_location_id'), table_name='schedule_weeks')
    op.drop_index(op.f('ix_schedule_weeks_id'), table_name='schedule_weeks')
    op.drop_table('schedule_weeks')