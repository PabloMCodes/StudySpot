"""add checkin labels and location interactions

Revision ID: b1d4c7f09a2e
Revises: a45ccf9b1d2e
Create Date: 2026-04-05 12:10:00.000000
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "b1d4c7f09a2e"
down_revision: Union[str, Sequence[str], None] = "a45ccf9b1d2e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("checkins", sa.Column("crowd_label", sa.String(length=20), nullable=True))
    op.add_column("checkins", sa.Column("checkout_crowd_label", sa.String(length=20), nullable=True))

    op.create_table(
        "location_interactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("location_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("interaction_type", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["location_id"], ["locations.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_location_interactions_location_id",
        "location_interactions",
        ["location_id"],
        unique=False,
    )
    op.create_index(
        "ix_location_interactions_location_id_created_at",
        "location_interactions",
        ["location_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_location_interactions_location_id_created_at", table_name="location_interactions")
    op.drop_index("ix_location_interactions_location_id", table_name="location_interactions")
    op.drop_table("location_interactions")

    op.drop_column("checkins", "checkout_crowd_label")
    op.drop_column("checkins", "crowd_label")
