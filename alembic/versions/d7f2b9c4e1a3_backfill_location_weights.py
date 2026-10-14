"""backfill location weights

Revision ID: d7f2b9c4e1a3
Revises: c3e8a1f5d2b7
Create Date: 2026-10-14 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'd7f2b9c4e1a3'
down_revision: Union[str, Sequence[str], None] = 'c3e8a1f5d2b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # Give every location without a weights row the default weights, so the solver and the UI
    # read the same values. The numbers are a snapshot of DEFAULT_LOCATION_WEIGHTS at the time
    # of this migration; they are hardcoded on purpose so later default changes don't rewrite it.
    op.execute("""
        INSERT INTO location_weights (
            location_id, target_shifts, rest_gap, consecutive_nights,
            max_nights, max_mornings, max_evenings,
            min_nights, min_mornings, min_evenings
        )
        SELECT l.id, 40, 40, 100, 5, 6, 2, 0, 0, 0
        FROM locations l
        WHERE NOT EXISTS (
            SELECT 1 FROM location_weights w WHERE w.location_id = l.id
        )
    """)


def downgrade() -> None:
    """Downgrade schema."""
    # Backfilled rows can't be told apart from rows users saved, so nothing is removed.
    pass
