from __future__ import annotations

import os
from dataclasses import dataclass, field

import httpx

_cache: dict[tuple[str, str], StoreInfo] = {}


@dataclass
class StoreInfo:
    address: str
    hours: list[str] = field(default_factory=list)
    phone: str = ""


async def geocode(city: str, state: str) -> tuple[float, float]:
    """Convert city + state to (lat, lon) using Google Maps Geocoding API.

    Intended for use by the api-gateway (PUT /api/v1/settings/location) to
    resolve a user's city/state into coordinates when they save their default
    location. The claim-agent uses the pre-resolved lat/lon from the User
    document directly and does not call this function.

    Raises ValueError if the address cannot be geocoded.
    """
    api_key = os.environ["GOOGLE_MAPS_API_KEY"]
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://maps.googleapis.com/maps/api/geocode/json",
            params={"address": f"{city}, {state}", "key": api_key},
        )
        resp.raise_for_status()
        data = resp.json()

    if data.get("status") != "OK" or not data.get("results"):
        raise ValueError(f"Could not geocode '{city}, {state}' (status={data.get('status')})")
    loc = data["results"][0]["geometry"]["location"]
    return loc["lat"], loc["lng"]


async def find_nearest_store(
    lat: float,
    lon: float,
    platform_name: str,
) -> StoreInfo | None:
    """Find the nearest store for a platform using Google Maps Places Text Search API.

    Returns None if no results found or the API call fails.
    """
    location_key = str(round(lat, 2)) + str(round(lon, 2))
    cache_key = (platform_name, location_key)
    if cache_key in _cache:
        return _cache[cache_key]

    api_key = os.environ["GOOGLE_MAPS_API_KEY"]
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                "https://places.googleapis.com/v1/places:searchText",
                headers={
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": api_key,
                    "X-Goog-FieldMask": (
                        "places.displayName,places.formattedAddress,"
                        "places.regularOpeningHours,places.nationalPhoneNumber"
                    ),
                },
                json={
                    "textQuery": f"{platform_name} store",
                    "locationBias": {
                        "circle": {
                            "center": {"latitude": lat, "longitude": lon},
                            "radius": 20000.0,
                        }
                    },
                    "maxResultCount": 1,
                },
            )
            resp.raise_for_status()
            data = resp.json()

        places = data.get("places") or []
        if not places:
            return None

        place = places[0]
        address = place.get("formattedAddress", "")
        opening_hours = place.get("regularOpeningHours") or {}
        hours: list[str] = opening_hours.get("weekdayDescriptions") or []
        phone: str = place.get("nationalPhoneNumber") or ""

        result = StoreInfo(address=address, hours=hours, phone=phone)
        _cache[cache_key] = result
        return result
    except Exception:
        return None
