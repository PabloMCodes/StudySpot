"""add location open and close hours

Revision ID: 9fd2c0a4e8b7
Revises: 3c73f4c9b6d1
Create Date: 2026-03-05 00:10:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "9fd2c0a4e8b7"
down_revision: Union[str, Sequence[str], None] = "3c73f4c9b6d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("locations", sa.Column("open_time", sa.String(), nullable=True))
    op.add_column("locations", sa.Column("close_time", sa.String(), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("locations", "close_time")
    op.drop_column("locations", "open_time")
