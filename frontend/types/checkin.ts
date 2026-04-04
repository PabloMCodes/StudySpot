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
  lat: number;
  lng: number;
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
  availability_label?: string;
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

export interface CheckoutCheckinPayload {
  checkin_id: string;
  occupancy_percent: OccupancyPercent;
  lat: number;
  lng: number;
  note?: string;
}

export interface MyCheckinSession {
  id: string;
  location_id: string;
  location_name: string;
  location_address: string | null;
  checkin_occupancy_percent: OccupancyPercent;
  checkout_occupancy_percent: OccupancyPercent | null;
  note: string | null;
  checked_in_at: string;
  checked_out_at: string | null;
  duration_minutes: number | null;
  is_active: boolean;
  auto_timed_out: boolean;
}

export interface MyCheckinsResponse {
  active_checkin: MyCheckinSession | null;
  history: MyCheckinSession[];
}
