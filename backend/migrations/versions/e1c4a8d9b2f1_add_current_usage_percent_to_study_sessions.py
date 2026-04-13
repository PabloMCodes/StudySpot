"""add current usage percent to study sessions

Revision ID: e1c4a8d9b2f1
Revises: d17e2b6f90aa
Create Date: 2026-04-07 20:15:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e1c4a8d9b2f1"
down_revision: Union[str, Sequence[str], None] = "d17e2b6f90aa"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "study_sessions",
        sa.Column(
            "current_usage_percent",
            sa.SmallInteger(),
            server_default=sa.text("0"),
            nullable=False,
        ),
    )
    op.create_check_constraint(
        "ck_study_sessions_current_usage_percent",
        "study_sessions",
        "current_usage_percent IN (0, 25, 50, 75, 100)",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "ck_study_sessions_current_usage_percent",
        "study_sessions",
        type_="check",
    )
    op.drop_column("study_sessions", "current_usage_percent")
