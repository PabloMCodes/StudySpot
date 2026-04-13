export type CrowdLabel = "empty" | "available" | "busy" | "packed";
export type BusynessLevel = "plenty" | "filling" | "packed";
export type OccupancyPercent = 0 | 25 | 50 | 75 | 100;
export const DEFAULT_OCCUPANCY_OPTIONS: OccupancyPercent[] = [0, 25, 50, 75, 100];

export interface Checkin {
  id: string;
  userId: string;
  locationId: string;
  crowdLabel: CrowdLabel;
  status: BusynessLevel;
  createdAt: string;
  expiresAt: string;
}

export interface CreateCheckinPayload {
  location_id: string;
  crowd_label: CrowdLabel;
  lat: number;
  lng: number;
  study_note?: string;
}

export interface NearbyPromptPayload {
  lat: number;
  lng: number;
}

export interface CheckinPrompt {
  should_prompt: boolean;
  occupancy_options: OccupancyPercent[];
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
    crowd_label: CrowdLabel;
    status: BusynessLevel;
    created_at: string;
    expires_at: string;
  };
  availability: CheckinAvailability;
}

export interface CheckoutCheckinPayload {
  checkin_id: string;
  crowd_label: CrowdLabel;
  lat: number;
  lng: number;
  note?: string;
}

export interface MyCheckinSession {
  id: string;
  location_id: string;
  location_name: string;
  location_address: string | null;
  checkin_crowd_label: CrowdLabel;
  checkout_crowd_label: CrowdLabel | null;
  study_note: string | null;
  checkout_note: string | null;
  checked_in_at: string;
  checked_out_at: string | null;
  duration_minutes: number | null;
  is_active: boolean;
  auto_timed_out: boolean;
}

export interface MyCheckinsResponse {
  active_checkin: MyCheckinSession | null;
  history: MyCheckinSession[];
  occupancy_options: OccupancyPercent[];
}
