"""add personal study sessions

Revision ID: f2c4aa75b119
Revises: e1f9a4b87c10
Create Date: 2026-04-04 13:25:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f2c4aa75b119"
down_revision: Union[str, Sequence[str], None] = "e1f9a4b87c10"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "personal_study_sessions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("location_id", sa.UUID(), nullable=True),
        sa.Column("topic", sa.String(length=200), nullable=False),
        sa.Column("start_note", sa.String(), nullable=True),
        sa.Column("end_note", sa.String(), nullable=True),
        sa.Column("accomplishment_score", sa.SmallInteger(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_location_verified", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("auto_timed_out", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.CheckConstraint(
            "(accomplishment_score IS NULL) OR (accomplishment_score BETWEEN 1 AND 5)",
            name="ck_personal_sessions_accomplishment_score",
        ),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_personal_study_sessions_location_id"), "personal_study_sessions", ["location_id"], unique=False)
    op.create_index(op.f("ix_personal_study_sessions_user_id"), "personal_study_sessions", ["user_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_personal_study_sessions_user_id"), table_name="personal_study_sessions")
    op.drop_index(op.f("ix_personal_study_sessions_location_id"), table_name="personal_study_sessions")
    op.drop_table("personal_study_sessions")
