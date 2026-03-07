import os
import requests
import time
import json

from database import SessionLocal
from models.location import Location
from requests.exceptions import RequestException
from sqlalchemy.exc import SQLAlchemyError

API_KEY = os.getenv("GOOGLE_PLACES_API_KEY")

MAX_LOCATIONS = 1500
RADIUS = 700
BATCH_SIZE = 50
REQUEST_TIMEOUT_SECONDS = 10
MAX_RETRIES = 4
BASE_BACKOFF_SECONDS = 1.5
PAGE_TOKEN_DELAY_SECONDS = 2.0
DETAILS_DELAY_SECONDS = 0.05

# primary place types
PLACE_TYPES = [
    "cafe",
    "bakery",
    "library",
    "book_store"
]

# keyword expansion
KEYWORDS = [
    "coffee",
    "coffee shop",
    "boba",
    "bubble tea",
    "matcha",
    "tea house",
    "dessert cafe",
    "study cafe"
]

# text search expansion
TEXT_SEARCH_QUERIES = [
    "coffee shop Orlando",
    "boba Orlando",
    "bubble tea Orlando",
    "matcha cafe Orlando",
    "independent coffee Orlando",
    "dessert cafe Orlando"
]

SEARCH_CENTERS = [
    {"name": "UCF", "lat": 28.6005, "lng": -81.2001},
    {"name": "Waterford Lakes", "lat": 28.5517, "lng": -81.2070},
    {"name": "Oviedo", "lat": 28.6716, "lng": -81.2081},
    {"name": "Winter Park", "lat": 28.6003, "lng": -81.3392},
    {"name": "Downtown Orlando", "lat": 28.5383, "lng": -81.3792},
]

# chains to skip
CHAIN_BLACKLIST = [
    "mcdonald",
    "kfc",
    "burger king",
    "wendy",
    "taco bell",
    "subway",
    "chipotle",
    "dominos",
    "pizza hut",
    "popeyes"
]

session = SessionLocal()
http = requests.Session()

seen_place_ids = set()
inserted = 0
details_calls = 0

json_file = "orlando_locations_backup.json"
json_locations = []

# -------------------------
# Load existing dataset
# -------------------------

existing_keys = set()

if os.path.exists(json_file):
    try:
        with open(json_file) as f:
            loaded = json.load(f)
            if isinstance(loaded, list):
                json_locations = loaded
            else:
                print("JSON backup is not a list, starting with empty in-memory dataset.")
    except (OSError, json.JSONDecodeError) as exc:
        print(f"Could not load JSON backup ({exc}), starting with empty in-memory dataset.")

    for place in json_locations:
        source_key = place.get("source_key")
        if source_key:
            existing_keys.add(source_key)

print("Existing JSON locations:", len(existing_keys))

# also check database
try:
    db_keys = set(
        r[0] for r in session.query(Location.source_key).all()
    )
except SQLAlchemyError as exc:
    session.rollback()
    db_keys = set()
    print(f"Could not load existing DB keys ({exc}), continuing with JSON keys only.")

existing_keys |= db_keys

print("Existing DB locations:", len(db_keys))


# -------------------------
# Quality filter
# -------------------------

def is_good_study_spot(details):

    rating = details.get("rating", 0)
    reviews = details.get("user_ratings_total", 0)
    status = details.get("business_status")
    types = details.get("types", [])

    BAD_TYPES = [
        "night_club",
        "casino",
        "liquor_store",
        "gas_station"
    ]

    for t in types:
        if t in BAD_TYPES:
            return False

    if status and status != "OPERATIONAL":
        return False

    if rating and rating < 1.5:
        return False

    if reviews and reviews < 2:
        return False

    return True


def is_chain_blacklisted(name: str | None) -> bool:
    if not name:
        return False
    normalized = name.lower()
    return any(chain in normalized for chain in CHAIN_BLACKLIST)


def reached_max_locations() -> bool:
    return inserted >= MAX_LOCATIONS


def safe_commit() -> bool:
    try:
        session.commit()
        return True
    except SQLAlchemyError as exc:
        session.rollback()
        print(f"DB commit failed: {exc}")
        return False


def request_google(url, params, label):
    backoff = BASE_BACKOFF_SECONDS

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            response = http.get(url, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
            data = response.json()
        except (RequestException, ValueError) as exc:
            if attempt == MAX_RETRIES:
                print(f"{label} request failed after {MAX_RETRIES} attempts: {exc}")
                return {}
            time.sleep(backoff)
            backoff *= 2
            continue

        status = data.get("status")

        if status in ["OK", "ZERO_RESULTS"]:
            return data

        if status in ["OVER_QUERY_LIMIT", "UNKNOWN_ERROR"]:
            if attempt == MAX_RETRIES:
                error_message = data.get("error_message")
                print(f"{label} API status after retries: {status}. {error_message or ''}".strip())
                return {}
            time.sleep(backoff)
            backoff *= 2
            continue

        if status == "INVALID_REQUEST" and params.get("pagetoken"):
            if attempt == MAX_RETRIES:
                print(f"{label} API status after retries: {status}")
                return {}
            time.sleep(max(PAGE_TOKEN_DELAY_SECONDS, backoff))
            backoff *= 2
            continue

        error_message = data.get("error_message")
        print(f"{label} API status: {status}. {error_message or ''}".strip())
        return {}

    return {}


# -------------------------
# Grid generator
# -------------------------

def grid_points(lat, lng):

    offset = 0.008

    return [
        (lat, lng),
        (lat + offset, lng),
        (lat - offset, lng),
        (lat, lng + offset),
        (lat, lng - offset),
    ]


# -------------------------
# Google API
# -------------------------

def nearby_search(lat, lng, place_type=None, keyword=None, token=None):

    url = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"

    params = {
        "location": f"{lat},{lng}",
        "radius": RADIUS,
        "key": API_KEY
    }

    if place_type:
        params["type"] = place_type

    if keyword:
        params["keyword"] = keyword

    if token:
        params["pagetoken"] = token

    return request_google(url, params, "Nearby")


def text_search(query):

    url = "https://maps.googleapis.com/maps/api/place/textsearch/json"

    params = {
        "query": query,
        "key": API_KEY
    }

    return request_google(url, params, "Text search")


def place_details(place_id):

    global details_calls

    url = "https://maps.googleapis.com/maps/api/place/details/json"

    params = {
        "place_id": place_id,
        "fields": (
            "name,formatted_address,geometry,rating,user_ratings_total,"
            "opening_hours,types,price_level,website,formatted_phone_number,"
            "url,business_status,editorial_summary"
        ),
        "key": API_KEY
    }

    details_calls += 1

    data = request_google(url, params, "Place details")

    if data.get("status") != "OK":
        return None

    return data.get("result")


# -------------------------
# Insert place
# -------------------------

def insert_place(place_id, name_hint=None):

    global inserted

    source_key = f"google:{place_id}"

    # Skip DB/API work early for known places.
    if source_key in existing_keys:
        return

    # Skip obvious chains before the expensive details call.
    if is_chain_blacklisted(name_hint):
        return

    details = place_details(place_id)

    if not details:
        return

    if is_chain_blacklisted(details.get("name")):
        return

    if not is_good_study_spot(details):
        return

    location_data = details.get("geometry", {}).get("location", {})
    lat = location_data.get("lat")
    lng = location_data.get("lng")
    if lat is None or lng is None:
        return

    types = details.get("types", [])
    category = types[0] if types else None
    editorial_summary_payload = details.get("editorial_summary") or {}
    if isinstance(editorial_summary_payload, dict):
        editorial_summary = editorial_summary_payload.get("overview")
    elif isinstance(editorial_summary_payload, str):
        editorial_summary = editorial_summary_payload
    else:
        editorial_summary = None

    location = Location(
        source_key=source_key,
        name=details.get("name"),
        address=details.get("formatted_address"),
        latitude=lat,
        longitude=lng,
        category=category,
        rating=details.get("rating"),
        review_count=details.get("user_ratings_total"),
        hours=details.get("opening_hours", {}).get("weekday_text"),
        price_level=details.get("price_level"),
        website=details.get("website"),
        phone=details.get("formatted_phone_number"),
        maps_url=details.get("url"),
        editorial_summary=editorial_summary,
        types=types
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
        "editorial_summary": editorial_summary,
        "types": types
    })

    existing_keys.add(source_key)

    inserted += 1

    print(f"Inserted ({inserted})", details.get("name"))

    if inserted % BATCH_SIZE == 0 and not safe_commit():
        raise RuntimeError("Stopping ingestion because DB commit failed.")

    time.sleep(DETAILS_DELAY_SECONDS)


# -------------------------
# Crawl
# -------------------------

if not API_KEY:
    raise RuntimeError("GOOGLE_PLACES_API_KEY is not set in the environment.")

try:
    for center in SEARCH_CENTERS:

        if reached_max_locations():
            break

        print("\nSearching:", center["name"])

        grid = grid_points(center["lat"], center["lng"])

        for lat, lng in grid:
            if reached_max_locations():
                break

            for place_type in PLACE_TYPES:
                if reached_max_locations():
                    break

                data = nearby_search(lat, lng, place_type=place_type)

                while True:
                    for result in data.get("results", []):
                        if reached_max_locations():
                            break

                        place_id = result.get("place_id")

                        if not place_id or place_id in seen_place_ids:
                            continue

                        seen_place_ids.add(place_id)
                        insert_place(place_id, name_hint=result.get("name"))

                    if reached_max_locations():
                        break

                    token = data.get("next_page_token")

                    if not token:
                        break

                    time.sleep(PAGE_TOKEN_DELAY_SECONDS)

                    data = nearby_search(lat, lng, place_type=place_type, token=token)

            if reached_max_locations():
                break

            for keyword in KEYWORDS:
                if reached_max_locations():
                    break

                data = nearby_search(lat, lng, keyword=keyword)

                for result in data.get("results", []):
                    if reached_max_locations():
                        break
                    place_id = result.get("place_id")

                    if place_id and place_id not in seen_place_ids:
                        seen_place_ids.add(place_id)
                        insert_place(place_id, name_hint=result.get("name"))


    if not reached_max_locations():
        print("\nRunning text search expansion...")

        for query in TEXT_SEARCH_QUERIES:
            if reached_max_locations():
                break

            data = text_search(query)

            for result in data.get("results", []):
                if reached_max_locations():
                    break

                place_id = result.get("place_id")

                if place_id and place_id not in seen_place_ids:
                    seen_place_ids.add(place_id)
                    insert_place(place_id, name_hint=result.get("name"))

    safe_commit()
except Exception as exc:
    session.rollback()
    print(f"Ingestion aborted due to error: {exc}")
finally:
    http.close()
    session.close()

    temp_json_file = f"{json_file}.tmp"
    try:
        with open(temp_json_file, "w") as f:
            json.dump(json_locations, f, indent=2)
        os.replace(temp_json_file, json_file)
    except OSError as exc:
        print(f"Could not write JSON backup: {exc}")

print("\nFinished")
print("New locations added:", inserted)
print("Total dataset size:", len(json_locations))
print("Details calls:", details_calls)
