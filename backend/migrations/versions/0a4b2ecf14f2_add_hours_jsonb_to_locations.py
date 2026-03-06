"""add hours jsonb to locations

Revision ID: 0a4b2ecf14f2
Revises: 9fd2c0a4e8b7
Create Date: 2026-03-05 10:30:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "0a4b2ecf14f2"
down_revision: Union[str, Sequence[str], None] = "9fd2c0a4e8b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("locations", sa.Column("hours", postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("locations", "hours")
