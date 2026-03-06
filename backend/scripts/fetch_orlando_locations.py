import os
import requests
import time
import json

from database import SessionLocal
from models.location import Location

API_KEY = os.getenv("GOOGLE_PLACES_API_KEY")

MAX_LOCATIONS = 1500
RADIUS = 1500

PLACE_TYPES = [
    "cafe",
    "bakery",
    "library",
    "book_store",
    "restaurant",
    "bar"
]

SEARCH_CENTERS = [
    {"name": "UCF", "lat": 28.6005, "lng": -81.2001},
    {"name": "Waterford Lakes", "lat": 28.5517, "lng": -81.2070},
    {"name": "Oviedo", "lat": 28.6716, "lng": -81.2081},
    {"name": "Winter Park", "lat": 28.6003, "lng": -81.3392},
    {"name": "Downtown Orlando", "lat": 28.5383, "lng": -81.3792},
]

session = SessionLocal()

seen_place_ids = set()
inserted = 0
details_calls = 0

json_locations = []


def nearby_search(lat, lng, place_type, next_page_token=None):

    url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"

    params = {
        "location": f"{lat},{lng}",
        "radius": RADIUS,
        "type": place_type,
        "key": API_KEY
    }

    if next_page_token:
        params["pagetoken"] = next_page_token

    try:
        r = requests.get(url, params=params, timeout=10)
        data = r.json()

        status = data.get("status")

        if status not in ["OK", "ZERO_RESULTS"]:
            print("Nearby search API status:", status)
            return {}

        return data

    except Exception as e:
        print("Nearby search error:", e)
        return {}


def place_details(place_id):

    global details_calls

    url = "https://maps.googleapis.com/maps/api/place/details/json"

    fields = (
        "name,"
        "formatted_address,"
        "geometry,"
        "rating,"
        "user_ratings_total,"
        "opening_hours,"
        "types,"
        "price_level,"
        "business_status,"
        "url,"
        "website,"
        "formatted_phone_number,"
        "editorial_summary"
    )

    params = {
        "place_id": place_id,
        "fields": fields,
        "key": API_KEY
    }

    try:
        r = requests.get(url, params=params, timeout=10)
        data = r.json()

        details_calls += 1

        status = data.get("status")

        if status != "OK":
            print("Details API status:", status)
            return None

        return data.get("result")

    except Exception as e:
        print("Details error:", e)
        return None


def insert_place(place_id):

    global inserted

    details = place_details(place_id)

    if not details:
        return

    lat = details.get("geometry", {}).get("location", {}).get("lat")
    lng = details.get("geometry", {}).get("location", {}).get("lng")

    if lat is None or lng is None:
        return

    source_key = f"google:{place_id}"

    existing = session.query(Location).filter_by(source_key=source_key).first()

    if existing:
        print("Skipping duplicate:", details.get("name"))
        return

    types = details.get("types", [])
    category = types[0] if types else None

    editorial_summary = details.get("editorial_summary", {}).get("overview")

    location = Location(
        source_key=source_key,
        name=details.get("name"),
        address=details.get("formatted_address"),
        latitude=lat,
        longitude=lng,
        category=category,
        rating=details.get("rating"),
        review_count=details.get("user_ratings_total"),
        hours=details.get("opening_hours", {}).get("weekday_text")
    )

    session.add(location)

    json_locations.append({
        "source_key": source_key,
        "name": details.get("name"),
        "address": details.get("formatted_address"),
        "latitude": lat,
        "longitude": lng,
        "category": category,
        "rating": details.get("rating"),
        "review_count": details.get("user_ratings_total"),
        "hours": details.get("opening_hours", {}).get("weekday_text"),
        "price_level": details.get("price_level"),
        "website": details.get("website"),
        "phone": details.get("formatted_phone_number"),
        "maps_url": details.get("url"),
        "editorial_summary": editorial_summary
    })

    inserted += 1

    print(f"Inserted ({inserted}):", details.get("name"))

    if inserted % 50 == 0:
        session.commit()
        session.flush()

    time.sleep(0.05)


for center in SEARCH_CENTERS:

    print("\nSearching area:", center["name"])

    for place_type in PLACE_TYPES:

        data = nearby_search(center["lat"], center["lng"], place_type)

        while True:

            for result in data.get("results", []):

                if inserted >= MAX_LOCATIONS:
                    break

                place_id = result.get("place_id")

                if not place_id:
                    continue

                if place_id in seen_place_ids:
                    continue

                seen_place_ids.add(place_id)

                insert_place(place_id)

            if inserted >= MAX_LOCATIONS:
                break

            next_token = data.get("next_page_token")

            if not next_token:
                break

            time.sleep(2)

            data = nearby_search(center["lat"], center["lng"], place_type, next_token)

        if inserted >= MAX_LOCATIONS:
            break

    if inserted >= MAX_LOCATIONS:
        break


session.commit()

with open("orlando_locations_backup.json", "w") as f:
    json.dump(json_locations, f, indent=2)

session.close()

print("\nFinished")
print("Locations inserted:", inserted)
print("Details calls:", details_calls)
print("JSON file created: orlando_locations_backup.json")