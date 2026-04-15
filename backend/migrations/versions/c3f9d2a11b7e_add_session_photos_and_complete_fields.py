"""add session photos and completion fields

Revision ID: c3f9d2a11b7e
Revises: b1d4c7f09a2e, e1c4a8d9b2f1
Create Date: 2026-04-13 22:30:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c3f9d2a11b7e"
down_revision: Union[str, Sequence[str], None] = ("b1d4c7f09a2e", "e1c4a8d9b2f1")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("personal_study_sessions", sa.Column("rating", sa.SmallInteger(), nullable=True))
    op.add_column("personal_study_sessions", sa.Column("focus_level", sa.SmallInteger(), nullable=True))
    op.create_check_constraint(
        "ck_personal_sessions_rating",
        "personal_study_sessions",
        "(rating IS NULL) OR (rating BETWEEN 1 AND 5)",
    )
    op.create_check_constraint(
        "ck_personal_sessions_focus_level",
        "personal_study_sessions",
        "(focus_level IS NULL) OR (focus_level BETWEEN 1 AND 4)",
    )

    op.create_table(
        "session_photos",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("location_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("image_url", sa.String(), nullable=False),
        sa.Column("helpful_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["session_id"], ["personal_study_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_session_photos_session_id"), "session_photos", ["session_id"], unique=False)
    op.create_index(op.f("ix_session_photos_user_id"), "session_photos", ["user_id"], unique=False)
    op.create_index(op.f("ix_session_photos_location_id"), "session_photos", ["location_id"], unique=False)
    op.create_index(
        "ix_session_photos_location_id_created_at",
        "session_photos",
        ["location_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_session_photos_helpful_created_at",
        "session_photos",
        ["helpful_count", "created_at"],
        unique=False,
    )

    op.create_table(
        "photo_feedback",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("photo_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["photo_id"], ["session_photos.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("photo_id", "user_id", name="uq_photo_feedback_photo_user"),
    )
    op.create_index("ix_photo_feedback_photo_id", "photo_feedback", ["photo_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_photo_feedback_photo_id", table_name="photo_feedback")
    op.drop_table("photo_feedback")

    op.drop_index("ix_session_photos_helpful_created_at", table_name="session_photos")
    op.drop_index("ix_session_photos_location_id_created_at", table_name="session_photos")
    op.drop_index(op.f("ix_session_photos_location_id"), table_name="session_photos")
    op.drop_index(op.f("ix_session_photos_user_id"), table_name="session_photos")
    op.drop_index(op.f("ix_session_photos_session_id"), table_name="session_photos")
    op.drop_table("session_photos")

    op.drop_constraint("ck_personal_sessions_focus_level", "personal_study_sessions", type_="check")
    op.drop_constraint("ck_personal_sessions_rating", "personal_study_sessions", type_="check")
    op.drop_column("personal_study_sessions", "focus_level")
    op.drop_column("personal_study_sessions", "rating")
