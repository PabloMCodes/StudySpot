"""add google places fields to locations

Revision ID: b6d9b7e4a1c2
Revises: 0a4b2ecf14f2
Create Date: 2026-03-05 16:40:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "b6d9b7e4a1c2"
down_revision: Union[str, Sequence[str], None] = "0a4b2ecf14f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _locations_columns() -> set[str]:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return {column["name"] for column in inspector.get_columns("locations")}


def upgrade() -> None:
    """Upgrade schema."""
    existing_columns = _locations_columns()

    if "address" not in existing_columns:
        op.add_column("locations", sa.Column("address", sa.String(), nullable=True))
    if "category" not in existing_columns:
        op.add_column("locations", sa.Column("category", sa.String(), nullable=True))
    if "rating" not in existing_columns:
        op.add_column("locations", sa.Column("rating", sa.Float(), nullable=True))
    if "review_count" not in existing_columns:
        op.add_column("locations", sa.Column("review_count", sa.Integer(), nullable=True))
    if "price_level" not in existing_columns:
        op.add_column("locations", sa.Column("price_level", sa.Integer(), nullable=True))
    if "website" not in existing_columns:
        op.add_column("locations", sa.Column("website", sa.String(), nullable=True))
    if "phone" not in existing_columns:
        op.add_column("locations", sa.Column("phone", sa.String(), nullable=True))
    if "maps_url" not in existing_columns:
        op.add_column("locations", sa.Column("maps_url", sa.String(), nullable=True))
    if "editorial_summary" not in existing_columns:
        op.add_column("locations", sa.Column("editorial_summary", sa.Text(), nullable=True))
    if "types" not in existing_columns:
        op.add_column(
            "locations",
            sa.Column("types", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        )


def downgrade() -> None:
    """Downgrade schema."""
    existing_columns = _locations_columns()

    if "types" in existing_columns:
        op.drop_column("locations", "types")
    if "editorial_summary" in existing_columns:
        op.drop_column("locations", "editorial_summary")
    if "maps_url" in existing_columns:
        op.drop_column("locations", "maps_url")
    if "phone" in existing_columns:
        op.drop_column("locations", "phone")
    if "website" in existing_columns:
        op.drop_column("locations", "website")
    if "price_level" in existing_columns:
        op.drop_column("locations", "price_level")
    if "review_count" in existing_columns:
        op.drop_column("locations", "review_count")
    if "rating" in existing_columns:
        op.drop_column("locations", "rating")
    if "category" in existing_columns:
        op.drop_column("locations", "category")
    if "address" in existing_columns:
        op.drop_column("locations", "address")
