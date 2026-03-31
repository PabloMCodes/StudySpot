export type OccupancyPercent = 0 | 25 | 50 | 75 | 100;
export type BusynessLevel = "plenty" | "filling" | "packed";

export interface Checkin {
  id: string;
  userId: string;
  locationId: string;
  occupancyPercent: OccupancyPercent;
  status: BusynessLevel;
  createdAt: string;
  expiresAt: string;
}

export interface CreateCheckinPayload {
  location_id: string;
  occupancy_percent: OccupancyPercent;
  lat?: number;
  lng?: number;
}

export interface NearbyPromptPayload {
  lat: number;
  lng: number;
}

export interface CheckinPrompt {
  should_prompt: boolean;
  location_id: string | null;
  location_name: string | null;
  location_address: string | null;
  message: string | null;
  distance_meters: number | null;
  cooldown_remaining_minutes: number | null;
}

export interface CheckinAvailability {
  occupancy_percent: number;
  confidence: number;
  active_checkins: number;
}

export interface CheckinCreateResponse {
  checkin: {
    id: string;
    user_id: string;
    location_id: string;
    occupancy_percent: OccupancyPercent;
    status: BusynessLevel;
    created_at: string;
    expires_at: string;
  };
  availability: CheckinAvailability;
}
