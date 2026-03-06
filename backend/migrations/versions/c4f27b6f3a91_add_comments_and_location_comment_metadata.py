"""add comments and location comment metadata

Revision ID: c4f27b6f3a91
Revises: 857812ee8190
Create Date: 2026-03-04 18:45:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c4f27b6f3a91"
down_revision: Union[str, Sequence[str], None] = "857812ee8190"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "locations",
        sa.Column("description_updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "locations",
        sa.Column("comment_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
    )

    op.create_table(
        "comments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("location_id", sa.UUID(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_comments_location_id"), "comments", ["location_id"], unique=False)
    op.create_index(op.f("ix_comments_user_id"), "comments", ["user_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_comments_user_id"), table_name="comments")
    op.drop_index(op.f("ix_comments_location_id"), table_name="comments")
    op.drop_table("comments")
    op.drop_column("locations", "comment_count")
    op.drop_column("locations", "description_updated_at")
