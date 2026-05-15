"""Base class for all ClaimIt MongoDB document models."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class BaseDocument(BaseModel):
    # Pydantic v2 treats leading-underscore field names as private attributes,
    # so the Mongo `_id` is exposed as `id` with an explicit alias. Both names
    # are accepted on construction via populate_by_name.
    id: UUID = Field(alias="_id")
    updated_at: datetime | None = None

    model_config = ConfigDict(populate_by_name=True)
