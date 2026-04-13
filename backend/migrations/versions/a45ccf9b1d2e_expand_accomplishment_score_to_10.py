"""expand accomplishment score to 10

Revision ID: a45ccf9b1d2e
Revises: f2c4aa75b119
Create Date: 2026-04-04 14:10:00.000000

"""

from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = "a45ccf9b1d2e"
down_revision: Union[str, Sequence[str], None] = "f2c4aa75b119"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(
        "ALTER TABLE personal_study_sessions "
        "DROP CONSTRAINT IF EXISTS ck_personal_sessions_accomplishment_score"
    )
    op.execute(
        "ALTER TABLE personal_study_sessions "
        "ADD CONSTRAINT ck_personal_sessions_accomplishment_score "
        "CHECK ((accomplishment_score IS NULL) OR (accomplishment_score BETWEEN 1 AND 10))"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.execute(
        "ALTER TABLE personal_study_sessions "
        "DROP CONSTRAINT IF EXISTS ck_personal_sessions_accomplishment_score"
    )
    op.execute(
        "ALTER TABLE personal_study_sessions "
        "ADD CONSTRAINT ck_personal_sessions_accomplishment_score "
        "CHECK ((accomplishment_score IS NULL) OR (accomplishment_score BETWEEN 1 AND 5))"
    )
