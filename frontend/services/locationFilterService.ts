import type { Location, LocationFilters } from "../types/location";

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

function isNowWithinRange(rangeText: string, nowMinutes: number): boolean | null {
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
    return nowMinutes >= start && nowMinutes <= end;
  }

  // Cross-midnight range (example: 10 PM - 2 AM)
  return nowMinutes >= start || nowMinutes <= end;
}

function isOpenFromHoursArray(hours: string[], now: Date): boolean | null {
  const dayLabel = DAY_NAMES[now.getDay()];
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
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  let parsedAnyRange = false;

  for (const range of ranges) {
    const inRange = isNowWithinRange(range, nowMinutes);
    if (inRange === true) {
      return true;
    }
    if (inRange !== null) {
      parsedAnyRange = true;
    }
  }

  return parsedAnyRange ? false : null;
}

function isOpenFromSimpleTimes(location: Location, now: Date): boolean | null {
  if (!location.open_time || !location.close_time) {
    return null;
  }

  const start = parseMinutes(location.open_time);
  const end = parseMinutes(location.close_time);

  if (start === null || end === null) {
    return null;
  }

  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (end >= start) {
    return nowMinutes >= start && nowMinutes <= end;
  }

  return nowMinutes >= start || nowMinutes <= end;
}

export function isLocationOpenNow(location: Location, now: Date): boolean | null {
  if (Array.isArray(location.hours)) {
    const openByHours = isOpenFromHoursArray(location.hours, now);
    if (openByHours !== null) {
      return openByHours;
    }
  }

  return isOpenFromSimpleTimes(location, now);
}

export function applyLocationFilters(
  locations: Location[],
  filters: LocationFilters,
  now = new Date(),
): Location[] {
  return locations.filter((location) => {
    if (filters.minQuietLevel && location.quiet_level < filters.minQuietLevel) {
      return false;
    }

    if (filters.openNow) {
      const isOpen = isLocationOpenNow(location, now);
      // Keep unknowns visible so sparse/incomplete hours data doesn't wipe out the map.
      if (isOpen === false) {
        return false;
      }
    }

    return true;
  });
}
