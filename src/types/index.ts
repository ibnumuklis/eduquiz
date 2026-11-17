export type MemberRole = "school_admin" | "teacher" | "student";
export type AppRole = MemberRole | "super_admin";
export type QuizStatus = "draft" | "published" | "closed";
export type QuizAccess = "assigned" | "code" | "both";
export type QuestionType = "multiple_choice" | "multiple_select" | "true_false" | "short_answer" | "fill_blank";
export type AttemptStatus = "in_progress" | "submitted";
export type MonitorStatus = "not_started" | "in_progress" | "completed" | "late" | "missed";

export interface School {
  id: string;
  name: string;
  slug: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  logo_url: string | null;
  status: "active" | "inactive";
  academic_year: string | null;
  semester: "ganjil" | "genap" | null;
  timezone: string;
  leaderboard_enabled: boolean;
  leaderboard_show_names: boolean;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url: string | null;
  phone: string | null;
  is_super_admin: boolean;
  xp: number;
  level: number;
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
}

export interface Membership {
  id: string;
  school_id: string;
  role: MemberRole;
  status: "active" | "disabled";
  student_number: string | null;
  school: Pick<School, "id" | "name" | "status" | "timezone" | "slug">;
}

export interface Quiz {
  id: string;
  school_id: string;
  teacher_id: string;
  subject_id: string | null;
  title: string;
  description: string | null;
  status: QuizStatus;
  access: QuizAccess;
  access_code: string;
  duration_minutes: number;
  start_at: string | null;
  end_at: string | null;
  max_attempts: number;
  shuffle_questions: boolean;
  shuffle_options: boolean;
  passing_grade: number;
  show_result: boolean;
  show_explanation: boolean;
  published_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuestionOption {
  id: string;
  question_id: string;
  label: string;
  is_correct: boolean;
  position: number;
}

export interface Question {
  id: string;
  quiz_id: string;
  type: QuestionType;
  prompt: string;
  image_path: string | null;
  points: number;
  explanation: string | null;
  accepted_answers: string[];
  case_sensitive: boolean;
  manual_grading: boolean;
  position: number;
  question_options: QuestionOption[];
}

export interface AttemptQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  image_path: string | null;
  image_url?: string | null;
  points: number;
  options: { id: string; label: string }[];
}

export interface AttemptPayload {
  attempt: {
    id: string;
    status: AttemptStatus;
    started_at: string;
    expires_at: string;
    submitted_at: string | null;
    attempt_number: number;
    answered_count: number;
    total_questions: number;
  };
  quiz: { id: string; title: string; description: string | null; duration_minutes: number; show_result: boolean };
  server_now: string;
  questions: AttemptQuestion[];
  answers: Record<string, { selected_option_ids: string[]; text_answer: string | null }>;
}

export interface ReviewItem {
  id: string;
  type: QuestionType;
  prompt: string;
  image_path: string | null;
  image_url?: string | null;
  points: number;
  explanation: string | null;
  accepted_answers: string[] | null;
  options: { id: string; label: string; is_correct: boolean | null }[];
  answer: {
    selected_option_ids: string[];
    text_answer: string | null;
    is_correct: boolean | null;
    points_awarded: number | null;
    needs_manual_grading: boolean;
    answer_id: string | null;
  };
}

export interface QuizResult {
  id: string;
  attempt_id: string;
  quiz_id: string;
  student_id: string;
  score: number;
  points_earned: number;
  points_possible: number;
  correct_count: number;
  wrong_count: number;
  unanswered_count: number;
  pending_manual: number;
  passed: boolean;
  duration_seconds: number;
  xp_awarded: number;
  graded_at: string;
  created_at: string;
}

export interface ReviewPayload {
  visible: boolean;
  show_keys?: boolean;
  quiz: { id: string; title: string; passing_grade?: number };
  attempt: { id: string; started_at?: string; submitted_at: string | null; attempt_number?: number; auto_submitted?: boolean; is_late?: boolean };
  result?: QuizResult;
  items?: ReviewItem[];
}

export interface MonitorRow {
  student_id: string;
  full_name: string;
  email: string;
  class_name: string | null;
  attempt_id: string | null;
  attempt_number: number | null;
  status: MonitorStatus;
  started_at: string | null;
  last_active_at: string | null;
  submitted_at: string | null;
  answered_count: number;
  total_questions: number;
  progress: number;
  score: number | null;
  passed: boolean | null;
  pending_manual: number | null;
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };
