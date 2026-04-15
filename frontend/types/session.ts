export type UsagePercent = 0 | 25 | 50 | 75 | 100;

export interface PersonalSession {
  id: string;
  location_id: string | null;
  location_name: string | null;
  topic: string;
  start_note: string | null;
  accomplishment_score: number | null;
  rating: number | null;
  focus_level: number | null;
  end_note: string | null;
  photo_url: string | null;
  photo_urls: string[];
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

export interface CompletePersonalSessionPayload {
  rating?: number;
  focus_level?: number;
  accomplishment_score?: number;
  note?: string;
  image_url?: string;
}

export interface StudySession {
  id: string;
  location_id: string;
  creator_id: string;
  title: string;
  created_at: string;
  ends_at: string;
  max_participants: number;
  participants: number;
  is_active: boolean;
  public: boolean;
  current_usage_percent: UsagePercent;
}

export interface CreateStudySessionPayload {
  location_id: string;
  title: string;
  ends_at: string;
  max_participants: number;
  current_usage_percent: UsagePercent;
}

export interface SessionUsageUpdatePayload {
  current_usage_percent: UsagePercent;
}

export interface SessionActionResponse {
  message: string;
}
