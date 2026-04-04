"""add checkin checkout fields

Revision ID: d17e2b6f90aa
Revises: b6d9b7e4a1c2
Create Date: 2026-04-04 12:10:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "d17e2b6f90aa"
down_revision: Union[str, Sequence[str], None] = "b6d9b7e4a1c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("checkins", sa.Column("checked_out_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("checkins", sa.Column("checkout_status", sa.Enum("plenty", "filling", "packed", name="checkin_status"), nullable=True))
    op.add_column("checkins", sa.Column("checkout_note", sa.Text(), nullable=True))
    op.add_column(
        "checkins",
        sa.Column("auto_timed_out", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("checkins", "auto_timed_out")
    op.drop_column("checkins", "checkout_note")
    op.drop_column("checkins", "checkout_status")
    op.drop_column("checkins", "checked_out_at")
