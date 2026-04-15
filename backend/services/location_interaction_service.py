"""Location interaction service.
This means logging view/click events stays out of routes.
"""

from __future__ import annotations

import uuid
from typing import Literal

from sqlalchemy.orm import Session

from models.location import Location
from models.location_interaction import LocationInteraction

InteractionType = Literal["view", "click"]


def log_location_interaction(
    db: Session,
    *,
    location_id: uuid.UUID,
    interaction_type: InteractionType,
) -> LocationInteraction:
    location = db.get(Location, location_id)
    if location is None:
        raise ValueError("Location not found")

    interaction = LocationInteraction(
        location_id=location_id,
        interaction_type=interaction_type,
    )
    db.add(interaction)
    db.commit()
    db.refresh(interaction)
    return interaction
