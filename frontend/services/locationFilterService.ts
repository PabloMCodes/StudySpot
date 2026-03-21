import type { Location, SearchIntent } from "../types/location";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const TIME_RANGE_SEPARATOR = /[–-]/;
const OPEN_NOW_KEYWORDS = ["open now", "open rn", "open"] as const;
const OUTLET_KEYWORDS = ["outlet", "outlets", "plug", "plugs", "charging"] as const;
const QUIET_KEYWORDS = ["quiet", "silent", "low noise"] as const;
const CATEGORY_KEYWORDS: Record<string, string[]> = {
  cafe: ["cafe", "coffee shop"],
  coffee: ["coffee", "espresso", "latte"],
  boba: ["boba", "milk tea", "bubble tea"],
  bakery: ["bakery", "pastry", "dessert"],
  library: ["library", "study room"],
};

export const DEFAULT_SEARCH_INTENT: SearchIntent = {
  queryText: "",
  openNow: false,
  openAtMinutes: null,
  minQuietLevel: null,
  hasOutlets: null,
  categories: [],
};

function normalizeText(value: string): string {
  return value.replace(/\u202f|\u2009/g, " ").replace(/\s+/g, " ").trim();
}

function parseMinutes(timeValue: string): number | null {
  const match = normalizeText(timeValue).match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (!match) {
    return null;
  }

  let hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  const meridiem = match[3].toUpperCase();

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return null;
  }

  hour %= 12;
  if (meridiem === "PM") {
    hour += 12;
  }

  return hour * 60 + minute;
}

function isWithinRange(rangeText: string, targetMinutes: number): boolean | null {
  const normalized = normalizeText(rangeText);
  const [startRaw, endRaw] = normalized.split(TIME_RANGE_SEPARATOR).map((value) => value.trim());

  if (!startRaw || !endRaw) {
    return null;
  }

  const start = parseMinutes(startRaw);
  const end = parseMinutes(endRaw);

  if (start === null || end === null) {
    return null;
  }

  if (end >= start) {
    return targetMinutes >= start && targetMinutes <= end;
  }

  // Cross-midnight range (example: 10 PM - 2 AM)
  return targetMinutes >= start || targetMinutes <= end;
}

function isOpenFromHoursArray(hours: string[], atDate: Date): boolean | null {
  const dayLabel = DAY_NAMES[atDate.getDay()];
  const dayEntry = hours.find((entry) => normalizeText(entry).startsWith(`${dayLabel}:`));

  if (!dayEntry) {
    return null;
  }

  const schedule = normalizeText(dayEntry.split(":").slice(1).join(":"));
  if (!schedule) {
    return null;
  }

  if (/closed/i.test(schedule)) {
    return false;
  }

  if (/open 24 hours/i.test(schedule)) {
    return true;
  }

  const ranges = schedule.split(",").map((value) => value.trim());
  const targetMinutes = atDate.getHours() * 60 + atDate.getMinutes();

  let parsedAnyRange = false;

  for (const range of ranges) {
    const inRange = isWithinRange(range, targetMinutes);
    if (inRange === true) {
      return true;
    }
    if (inRange !== null) {
      parsedAnyRange = true;
    }
  }

  return parsedAnyRange ? false : null;
}

function isOpenFromSimpleTimes(location: Location, atDate: Date): boolean | null {
  if (!location.open_time || !location.close_time) {
    return null;
  }

  const start = parseMinutes(location.open_time);
  const end = parseMinutes(location.close_time);

  if (start === null || end === null) {
    return null;
  }

  const targetMinutes = atDate.getHours() * 60 + atDate.getMinutes();

  if (end >= start) {
    return targetMinutes >= start && targetMinutes <= end;
  }

  return targetMinutes >= start || targetMinutes <= end;
}

export function isLocationOpenAt(location: Location, atDate: Date): boolean | null {
  if (Array.isArray(location.hours)) {
    const openByHours = isOpenFromHoursArray(location.hours, atDate);
    if (openByHours !== null) {
      return openByHours;
    }
  }

  return isOpenFromSimpleTimes(location, atDate);
}

export function isLocationOpenNow(location: Location, now: Date): boolean | null {
  return isLocationOpenAt(location, now);
}

function includesAny(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function includesCategory(text: string, category: string): boolean {
  const keywords = CATEGORY_KEYWORDS[category] ?? [category];
  return includesAny(text, keywords);
}

function matchesTextQuery(location: Location, queryText: string): boolean {
  const query = normalizeText(queryText).toLowerCase();
  if (!query) {
    return true;
  }

  const haystack = [
    location.name,
    location.address ?? "",
    location.category ?? "",
    location.description ?? "",
    location.editorial_summary ?? "",
    ...(location.types ?? []),
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

export function parseNaturalLanguageToIntent(queryText: string): Partial<SearchIntent> {
  const normalized = normalizeText(queryText).toLowerCase();
  if (!normalized) {
    return {};
  }

  const nextCategories = Object.keys(CATEGORY_KEYWORDS).filter((category) =>
    includesCategory(normalized, category),
  );

  return {
    openNow: includesAny(normalized, OPEN_NOW_KEYWORDS),
    hasOutlets: includesAny(normalized, OUTLET_KEYWORDS) ? true : null,
    minQuietLevel: includesAny(normalized, QUIET_KEYWORDS) ? 4 : null,
    categories: nextCategories,
  };
}

export function applySearchIntent(
  locations: Location[],
  intent: SearchIntent,
  now = new Date(),
): Location[] {
  const targetDate = intent.openAtMinutes !== null
    ? new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        Math.floor(intent.openAtMinutes / 60),
        intent.openAtMinutes % 60,
      )
    : now;

  return locations.filter((location) => {
    if (!matchesTextQuery(location, intent.queryText)) {
      return false;
    }

    if (intent.minQuietLevel && location.quiet_level < intent.minQuietLevel) {
      return false;
    }

    if (intent.hasOutlets === true && !location.has_outlets) {
      return false;
    }

    if (intent.categories.length > 0) {
      const categoryText = `${location.category ?? ""} ${(location.types ?? []).join(" ")}`.toLowerCase();
      const categoryMatch = intent.categories.some((category) => includesCategory(categoryText, category));
      if (!categoryMatch) {
        return false;
      }
    }

    if (intent.openNow || intent.openAtMinutes !== null) {
      const isOpen = isLocationOpenAt(location, targetDate);
      // Keep unknowns visible so sparse/incomplete hours data doesn't wipe out the map.
      if (isOpen === false) {
        return false;
      }
    }

    return true;
  });
}
