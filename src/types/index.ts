export type MemberRole = "school_admin" | "teacher" | "student";
export type AppRole = MemberRole | "super_admin";
export type QuizStatus = "draft" | "published" | "closed";
export type QuizAccess = "assigned" | "code" | "both";
export type QuestionType =
  | "multiple_choice" | "multiple_select" | "true_false" | "short_answer" | "fill_blank"
  | "tf_grid" | "matching" | "ordering" | "essay" | "poll" | "word_cloud";
export type QuizMode = "standard" | "practice" | "exam";
export type QuizTheme = "default" | "batik" | "nusantara" | "angkasa" | "laut" | "hutan";
export type PowerupKind = "fifty_fifty" | "hint" | "second_chance";
export type IntegrityKind = "tab_hidden" | "window_blur" | "fullscreen_exit" | "copy" | "paste" | "context_menu" | "shortcut" | "split_screen";
export type QuizLanguage = "id" | "en" | "ar" | "ja" | "ko" | "zh" | "fr" | "de";
export interface RubricItem { criterion: string; points: number }
export interface QuestionPayload { hint?: string; rubric?: RubricItem[]; audio_path?: string; audio_max_plays?: number }
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
  folder_id: string | null;
  mode: QuizMode;
  mastery_target: number;
  require_fullscreen: boolean;
  detect_tab_switch: boolean;
  show_watermark: boolean;
  powerups_enabled: boolean;
  instant_feedback: boolean;
  theme: QuizTheme;
  integrity_alarm: boolean;
  language: QuizLanguage;
  shared_with_school: boolean;
}

export interface QuestionOption {
  id: string;
  question_id: string;
  label: string;
  is_correct: boolean;
  match_text: string | null;
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
  payload: QuestionPayload;
  stimulus_id: string | null;
  objective_id: string | null;
  question_options: QuestionOption[];
}

export interface Stimulus { id: string; title: string | null; content: string; image_path: string | null; image_url?: string | null }
export interface LearningObjective { id: string; code: string; description: string; subject_id: string | null; phase: string | null; grade_level: string | null; created_by: string | null }

export interface AttemptQuestion {
  id: string;
  type: QuestionType;
  prompt: string;
  image_path: string | null;
  image_url?: string | null;
  points: number;
  options: { id: string; label: string }[];
  stimulus?: (Omit<Stimulus, "id"> & { id?: string }) | null;
  rubric?: RubricItem[] | null;
  has_hint?: boolean;
  hint?: string | null;
  right_choices?: string[] | null;
  audio_path?: string | null;
  audio_url?: string | null;
  audio_max_plays?: number;
}

export interface AttemptAnswer {
  selected_option_ids: string[];
  text_answer: string | null;
  answer_data?: Record<string, boolean | string> | null;
  locked?: boolean;
  is_correct?: boolean | null;
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
    is_remedial?: boolean;
    time_multiplier?: number;
    powerups_used?: PowerupKind[];
    integrity_count?: number;
  };
  quiz: {
    id: string; title: string; description: string | null; duration_minutes: number; show_result: boolean;
    mode?: QuizMode; require_fullscreen?: boolean; detect_tab_switch?: boolean; show_watermark?: boolean;
    powerups_enabled?: boolean; instant_feedback?: boolean; theme?: QuizTheme;
    language?: QuizLanguage; integrity_alarm?: boolean;
  };
  student?: { full_name: string | null; student_number: string | null; read_aloud: boolean };
  server_now: string;
  questions: AttemptQuestion[];
  answers: Record<string, AttemptAnswer>;
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
  rubric?: RubricItem[] | null;
  stimulus?: { title: string | null; content: string; image_path: string | null } | null;
  objective?: { code: string; description: string } | null;
  audio_path?: string | null;
  audio_url?: string | null;
  options: { id: string; label: string; is_correct: boolean | null; match_text?: string | null }[];
  answer: {
    selected_option_ids: string[];
    text_answer: string | null;
    answer_data?: Record<string, boolean | string> | null;
    is_correct: boolean | null;
    points_awarded: number | null;
    needs_manual_grading: boolean;
    answer_id: string | null;
    teacher_feedback?: string | null;
    rubric_scores?: number[] | null;
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
  game_score: number;
  mastered: boolean;
  graded_at: string;
  created_at: string;
}

export interface ReviewPayload {
  visible: boolean;
  show_keys?: boolean;
  quiz: { id: string; title: string; passing_grade?: number; mode?: QuizMode; mastery_target?: number; language?: QuizLanguage };
  attempt: {
    id: string; started_at?: string; submitted_at: string | null; attempt_number?: number; auto_submitted?: boolean; is_late?: boolean;
    is_remedial?: boolean; integrity_count?: number; powerups_used?: PowerupKind[];
  };
  can_practice_again?: boolean;
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
  integrity_count: number;
  time_multiplier: number;
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };
