export interface MeetingMetadata {
  university: string;
  meeting_id: string;
  title: string;
  time: string;
  location: string;
  chair: string;
  attendees: string;
  objective: string;
  sources: string[];
  reviewer: string;
  review_date: string;
}

export interface TranscriptSegment {
  start: number;
  end: number;
  start_fmt: string;
  end_fmt: string;
  speaker: string;
  text: string;
}

export interface KeyPoint {
  bold: string;
  detail: string;
  source: string;
}

export interface DecisionItem {
  status: 'Đã kết luận' | 'Đang đề xuất' | 'Chưa xác định';
  content: string;
  implication: string;
}

export interface TaskItem {
  code: string;
  deliverable: string;
  owner: string;
  deadline: string;
  basis: string;
}

export interface RiskItem {
  issue: string;
  impact: string;
  mitigation: string;
}

export interface DirectionSignals {
  stated: string;
  disagreements: string;
  to_verify: string;
}

export interface VerificationItem {
  item: string;
  evidence: string;
  status: 'Đã rõ' | 'Cần kiểm chứng';
}

export interface MeetingAnalysis {
  meeting: MeetingMetadata;
  key_points: KeyPoint[];
  decisions: DecisionItem[];
  tasks: TaskItem[];
  risks: RiskItem[];
  follow_up: string[];
  direction_signals: DirectionSignals;
  suggestions: string[];
  verification: VerificationItem[];
}
