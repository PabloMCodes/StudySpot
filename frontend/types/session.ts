export interface StudySession {
  id: string;
  locationId: string;
  topic: string;
  startTime: string;
  endTime: string;
  maxParticipants: number;
  participantCount: number;
  isPublic: boolean;
}
