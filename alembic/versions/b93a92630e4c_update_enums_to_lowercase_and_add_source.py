"""update_enums_to_lowercase_and_add_source

Revision ID: b93a92630e4c
Revises: df46f3b39342
Create Date: 2026-03-27 10:14:16.222966

"""
from typing import Sequence, Union
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b93a92630e4c'
down_revision: Union[str, Sequence[str], None] = 'df46f3b39342'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create the new ConstraintSource ENUM type in the DB
    constraint_source_enum = postgresql.ENUM('yalam', 'mishmarot', 'shiftorg', name='constraintsource')
    constraint_source_enum.create(op.get_bind(), checkfirst=True)

    # 2. Add the 'source' column to 'weekly_constraints'
    op.add_column('weekly_constraints', sa.Column('source', constraint_source_enum, nullable=True))

def downgrade() -> None:
    # Drop the column and the enum type
    op.drop_column('weekly_constraints', 'source')
    op.execute("DROP TYPE constraintsource")
