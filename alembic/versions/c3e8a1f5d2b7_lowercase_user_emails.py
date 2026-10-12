"""lowercase user emails

Revision ID: c3e8a1f5d2b7
Revises: 484996a3adf8
Create Date: 2026-10-12 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3e8a1f5d2b7'
down_revision: Union[str, Sequence[str], None] = '484996a3adf8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    conn = op.get_bind()

    # Abort if two accounts differ only by case/whitespace: lowercasing would violate the unique
    # index, and they are linked to employees, so merging them needs a manual decision.
    collisions = conn.execute(sa.text("""
        SELECT lower(trim(email)) AS normalized, string_agg(email, ', ' ORDER BY id) AS originals
        FROM users
        GROUP BY lower(trim(email))
        HAVING count(*) > 1
    """)).fetchall()
    if collisions:
        details = "; ".join(f"{row.normalized} <- [{row.originals}]" for row in collisions)
        raise RuntimeError(
            f"Cannot lowercase user emails, these accounts collide: {details}. "
            "Resolve them manually and re-run the migration."
        )

    op.execute("UPDATE users SET email = lower(trim(email)) WHERE email <> lower(trim(email))")

    op.create_check_constraint("ck_users_email_lowercase", "users", "email = lower(email)")


def downgrade() -> None:
    """Downgrade schema."""
    # The original casing is not recoverable; only the constraint is removed.
    op.drop_constraint("ck_users_email_lowercase", "users", type_="check")
