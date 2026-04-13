export interface PersonalSession {
  id: string;
  location_id: string | null;
  location_name: string | null;
  topic: string;
  start_note: string | null;
  accomplishment_score: number | null;
  end_note: string | null;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  is_active: boolean;
  is_location_verified: boolean;
  auto_timed_out: boolean;
}

export interface PersonalSessionsListResponse {
  active_session: PersonalSession | null;
  history: PersonalSession[];
}

export interface StartPersonalSessionPayload {
  topic: string;
  location_id?: string;
  lat?: number;
  lng?: number;
  start_note?: string;
}

export interface EndPersonalSessionPayload {
  session_id: string;
  accomplishment_score: number;
  end_note?: string;
}
