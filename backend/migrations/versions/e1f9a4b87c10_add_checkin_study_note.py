"""add checkin study note

Revision ID: e1f9a4b87c10
Revises: d17e2b6f90aa
Create Date: 2026-04-04 13:05:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e1f9a4b87c10"
down_revision: Union[str, Sequence[str], None] = "d17e2b6f90aa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("checkins", sa.Column("checkin_note", sa.Text(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("checkins", "checkin_note")
