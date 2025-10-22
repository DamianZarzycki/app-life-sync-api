import type { Database, Tables, TablesInsert, TablesUpdate, Enums, Json } from './db/database.types';

// Alias for UUIDs as strings (Supabase exposes UUIDs as strings in generated types)
export type UUID = string;

// ==========================
// Common Envelopes and Enums
// ==========================

export type PaginatedResponse<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
};

export type ErrorResponseDto = {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
};

export type CategorySort = 'name_asc' | 'name_desc';
export type NotesSort = 'created_at_desc' | 'created_at_asc' | 'updated_at_desc';
export type ReportsSort = 'created_at_desc' | 'created_at_asc';

// Narrowed enum aliases sourced from DB to ensure coupling to schema
export type DeliveryChannel = Enums<'delivery_channel_type'>; // 'in_app' | 'email'
export type DeliveryStatus = Enums<'delivery_status_type'>; // 'queued' | 'sent' | 'opened'
export type GeneratedBy = Enums<'generated_by_type'>; // 'scheduled' | 'on_demand'

// ==============
// Auth / Session
// ==============

export type MeResponseDto = {
  userId: UUID;
  email: string;
  emailVerified: boolean;
  hasProfile: boolean;
  hasPreferences: boolean;
};

export type SignInSessionDto = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: 'bearer';
};

export type SignInUserDto = {
  id: UUID;
  email: string;
  email_confirmed_at: string | null;
};

export type SignInResponseDto = {
  user: SignInUserDto;
  session: SignInSessionDto;
};

// =========
// Profiles
// =========

// DTO mirrors DB row shape for stable API contract
export type ProfileDto = Pick<
  Tables<'profiles'>,
  'user_id' | 'timezone' | 'created_at' | 'updated_at'
>;

// Command accepts only the updatable field(s)
export type UpdateProfileCommand = Required<Pick<TablesUpdate<'profiles'>, 'timezone'>>;

// ============
// Preferences
// ============

export type PreferencesDto = Tables<'preferences'>;

// Make update fields required at the API boundary; DB-level defaults/validation still apply
export type UpdatePreferencesCommand = Required<
  Pick<
    TablesUpdate<'preferences'>,
    | 'active_categories'
    | 'report_dow'
    | 'report_hour'
    | 'preferred_delivery_channels'
    | 'email_unsubscribed_at'
    | 'max_daily_notes'
  >
> & {
  // Ensure element-level coupling with DB enums and UUIDs
  active_categories: UUID[];
  preferred_delivery_channels: DeliveryChannel[];
};

// ===========
// Categories
// ===========

export type CategoryDto = Tables<'categories'>;

export type ListCategoriesQuery = {
  active?: boolean; // default true
  sort?: CategorySort; // default 'name_asc'
  limit?: number; // default 20, max 100
  offset?: number; // default 0
};

export type ListCategoriesResponseDto = PaginatedResponse<CategoryDto>;

// =====
// Notes
// =====

export type NoteDto = Tables<'notes'>;

export type ListNotesQuery = {
  category_id?: UUID | UUID[]; // supports single, repeated, or comma-separated upstream
  from?: string; // ISO datetime
  to?: string; // ISO datetime
  include_deleted?: boolean; // default false
  limit?: number; // default 20, max 100
  offset?: number; // default 0
  sort?: NotesSort; // default 'created_at_desc'
};

export type ListNotesResponseDto = PaginatedResponse<NoteDto>;

export type CreateNoteCommand = Pick<TablesInsert<'notes'>, 'category_id' | 'title' | 'content'>;

export type UpdateNoteCommand = Pick<TablesUpdate<'notes'>, 'category_id' | 'title' | 'content'>;

// =========
// Dashboard
// =========

export type DashboardQuery = {
  timezone?: string; // default profile timezone
  since?: string; // ISO date range start (default 4 weeks)
};

export type DashboardSummaryDto = {
  active_categories: UUID[];
  notes_count: Record<UUID, number>;
  streak_days: number;
};

export type RecentReportDto = Pick<
  Tables<'reports'>,
  'id' | 'generated_by' | 'created_at'
>;

export type DashboardDto = {
  summary: DashboardSummaryDto;
  recent_reports: RecentReportDto[];
};

// =======
// Reports
// =======

export type ReportDto = Tables<'reports'>;

export type ListReportsQuery = {
  week_start_local?: string; // YYYY-MM-DD
  generated_by?: GeneratedBy;
  include_deleted?: boolean; // default false
  limit?: number; // default 20, max 100
  offset?: number; // default 0
  sort?: ReportsSort; // default 'created_at_desc'
};

export type ListReportsResponseDto = PaginatedResponse<ReportDto>;

export type GenerateReportCommand = {
  include_categories: UUID[];
};

// =================
// Report Deliveries
// =================

export type ReportDeliveryDto = Tables<'report_deliveries'>;

export type ListReportDeliveriesQuery = {
  report_id?: UUID;
  channel?: DeliveryChannel;
  status?: DeliveryStatus;
  limit?: number; // default 20, max 100
  offset?: number; // default 0
};

export type ListReportDeliveriesResponseDto = PaginatedResponse<ReportDeliveryDto>;

export type EmailDeliveryResponseDto = {
  delivery: Pick<ReportDeliveryDto, 'id' | 'status' | 'channel'>;
};

// ===============
// Report Feedback
// ===============

export type ReportFeedbackDto = Tables<'report_feedback'>;

export type SubmitFeedbackCommand = Pick<
  TablesInsert<'report_feedback'>,
  'report_id' | 'rating' | 'comment'
>;

// =========
// Analytics
// =========

// Align to DB row for GET responses
export type AnalyticsEventDto = Tables<'analytics_events'>;

// Client-side command excludes server-owned fields
export type RecordAnalyticsEventCommand = Omit<
  TablesInsert<'analytics_events'>,
  'user_id'
> & {
  source: 'web' | 'api';
};

export type ListAnalyticsEventsQuery = {
  event_name?: string;
  from?: string; // ISO datetime
  to?: string; // ISO datetime
  limit?: number; // default 20, max 100
  offset?: number; // default 0
};

export type AnalyticsEventsListResponseDto = PaginatedResponse<AnalyticsEventDto>;

export type AnalyticsEventResponseDto = Pick<AnalyticsEventDto, 'id'>;


