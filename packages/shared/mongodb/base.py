"""Base class for all ClaimIt MongoDB document models."""

from pydantic import BaseModel, ConfigDict, Field


class BaseDocument(BaseModel):
    # Pydantic v2 treats leading-underscore field names as private attributes,
    # so the Mongo `_id` is exposed as `id` with an explicit alias. Both names
    # are accepted on construction via populate_by_name.
    id: str = Field(alias="_id")

    model_config = ConfigDict(populate_by_name=True)
