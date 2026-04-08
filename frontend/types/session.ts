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
  current_usage_percent: 0 | 25 | 50 | 75 | 100;
}
export interface CreateStudySessionPayload {
  location_id: string;
  title: string;
  ends_at: string;
  max_participants: number;
  current_usage_percent: 0 | 25 | 50 | 75 | 100;
}
export interface SessionUsageUpdatePayload {
  current_usage_percent: 0 | 25 | 50 | 75 | 100;
}

export interface SessionActionResponse {
  message: string;
}
