"""add source_key to locations

Revision ID: 3c73f4c9b6d1
Revises: c4f27b6f3a91
Create Date: 2026-03-05 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "3c73f4c9b6d1"
down_revision: Union[str, Sequence[str], None] = "c4f27b6f3a91"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("locations", sa.Column("source_key", sa.String(), nullable=True))

    # Ensure pre-existing rows receive deterministic keys before enforcing NOT NULL + uniqueness.
    op.execute(
        """
        UPDATE locations
        SET source_key = 'legacy:' || id::text
        WHERE source_key IS NULL
        """
    )

    op.alter_column("locations", "source_key", existing_type=sa.String(), nullable=False)
    op.create_unique_constraint("uq_locations_source_key", "locations", ["source_key"])
    op.create_index(op.f("ix_locations_source_key"), "locations", ["source_key"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_locations_source_key"), table_name="locations")
    op.drop_constraint("uq_locations_source_key", "locations", type_="unique")
    op.drop_column("locations", "source_key")
