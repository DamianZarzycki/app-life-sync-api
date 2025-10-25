import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types.js';
import type { UUID, ReportFeedbackDto } from '../types.js';
import type { SubmitFeedbackCommand } from '../validation/feedback.js';

/**
 * Custom error for when a report is not found
 */
export class ReportNotFoundError extends Error {
  constructor(public reportId: UUID) {
    super(`Report ${reportId} not found`);
    this.name = 'ReportNotFoundError';
  }
}

/**
 * Custom error for when feedback already exists for a report (with upsert=false)
 */
export class FeedbackAlreadyExistsError extends Error {
  constructor(
    public reportId: UUID,
    public feedbackId: UUID,
    public existingRating: number
  ) {
    super(
      `Feedback for report ${reportId} already exists (ID: ${feedbackId}, rating: ${existingRating})`
    );
    this.name = 'FeedbackAlreadyExistsError';
  }
}

/**
 * FeedbackService handles report feedback operations
 * Manages creation, updates, and retrieval of user feedback on reports
 *
 * This service uses user-scoped Supabase clients to enforce RLS (Row-Level Security)
 * ensuring users can only access/modify their own feedback
 */
export class FeedbackService {
  /**
   * Initialize service with Supabase client
   * @param userClient - User-scoped Supabase client (for RLS enforcement via JWT)
   */
  constructor(private userClient: SupabaseClient<Database>) {}

  /**
   * Submit or update feedback for a report (1:1 relationship)
   *
   * @param userId - UUID of the authenticated user
   * @param command - SubmitFeedbackCommand with report_id, rating, and optional comment
   * @param upsert - If true, create feedback or update existing. If false, throw error if exists.
   * @returns ReportFeedbackDto with the created or updated feedback
   * @throws ReportNotFoundError if report doesn't exist or user doesn't own it
   * @throws FeedbackAlreadyExistsError if feedback exists and upsert is false
   * @throws Error for unexpected database errors
   */
  async submitFeedback(
    userId: UUID,
    command: SubmitFeedbackCommand,
    upsert: boolean = false
  ): Promise<ReportFeedbackDto> {
    // Step 1: Verify report exists and user owns it
    await this.verifyReportExists(userId, command.report_id);
    console.log(`[INFO] Report ${command.report_id} verified for user ${userId}`);

    // Step 2: Check if feedback already exists for this report
    const existingFeedback = await this.findExistingFeedback(command.report_id);
    console.log(`[INFO] Existing feedback check: ${existingFeedback ? 'found' : 'not found'}`);

    // Step 3: Handle conflict if feedback exists and upsert is false
    if (existingFeedback && !upsert) {
      console.warn(
        `[WARN] User ${userId} attempted to submit feedback for report with existing feedback (upsert=false)`
      );
      throw new FeedbackAlreadyExistsError(
        command.report_id,
        existingFeedback.id,
        existingFeedback.rating
      );
    }

    // Step 4: Create or update feedback based on existence
    if (existingFeedback && upsert) {
      console.log(`[INFO] Updating existing feedback ${existingFeedback.id}`);
      return this.updateFeedback(existingFeedback.id, command);
    } else {
      console.log(`[INFO] Creating new feedback for report ${command.report_id}`);
      return this.createFeedback(userId, command);
    }
  }

  /**
   * Verify that a report exists and belongs to the authenticated user
   *
   * @param userId - UUID of the authenticated user
   * @param reportId - UUID of the report to verify
   * @returns Report object if found and user owns it
   * @throws ReportNotFoundError if report doesn't exist or user doesn't own it
   */
  private async verifyReportExists(userId: UUID, reportId: UUID): Promise<any> {
    const { data: report, error } = await this.userClient
      .from('reports')
      .select('id, user_id')
      .eq('id', reportId)
      .is('deleted_at', null)
      .single();

    // Handle not found error (PGRST116 is Supabase's error code for "no rows returned")
    if (error) {
      if (error.code === 'PGRST116') {
        console.warn(`[WARN] Report ${reportId} not found for user ${userId}`);
        throw new ReportNotFoundError(reportId);
      }
      console.error(`[ERROR] verifyReportExists database error: ${error.message}`);
      throw new Error(`Failed to verify report: ${error.message}`);
    }

    if (!report) {
      console.warn(`[WARN] Report ${reportId} not found for user ${userId}`);
      throw new ReportNotFoundError(reportId);
    }

    // Defense-in-depth: Explicitly verify user ownership (RLS already enforces this)
    if (report.user_id !== userId) {
      console.warn(`[WARN] Report ${reportId} does not belong to user ${userId}`);
      throw new ReportNotFoundError(reportId);
    }

    return report;
  }

  /**
   * Find existing feedback for a report (if any)
   *
   * @param reportId - UUID of the report
   * @returns Feedback object if exists, null otherwise
   * @throws Error for unexpected database errors
   */
  private async findExistingFeedback(reportId: UUID): Promise<any> {
    const { data: feedback, error } = await this.userClient
      .from('report_feedback')
      .select('id, rating, comment, created_at, updated_at')
      .eq('report_id', reportId)
      .single();

    // PGRST116 means no rows found, which is expected for new feedback
    if (error) {
      if (error.code === 'PGRST116') {
        return null; // No feedback exists, which is expected
      }
      console.error(`[ERROR] findExistingFeedback database error: ${error.message}`);
      throw new Error(`Failed to check existing feedback: ${error.message}`);
    }

    return feedback || null;
  }

  /**
   * Create new feedback for a report
   *
   * @param userId - UUID of the authenticated user
   * @param command - SubmitFeedbackCommand with report_id, rating, and optional comment
   * @returns Created ReportFeedbackDto
   * @throws Error for unexpected database errors
   */
  private async createFeedback(
    userId: UUID,
    command: SubmitFeedbackCommand
  ): Promise<ReportFeedbackDto> {
    const { data: feedback, error } = await this.userClient
      .from('report_feedback')
      .insert({
        report_id: command.report_id,
        user_id: userId,
        rating: command.rating,
        comment: command.comment || null,
      })
      .select('*')
      .single();

    if (error) {
      console.error(`[ERROR] createFeedback database error: ${error.message}`);
      throw new Error(`Failed to create feedback: ${error.message}`);
    }

    if (!feedback) {
      console.error(`[ERROR] createFeedback: No data returned from insert`);
      throw new Error('Failed to create feedback: No data returned');
    }

    console.log(`[INFO] Feedback created with ID ${feedback.id}`);
    return feedback as ReportFeedbackDto;
  }

  /**
   * Update existing feedback for a report
   *
   * @param feedbackId - UUID of the feedback record to update
   * @param command - SubmitFeedbackCommand with rating and optional comment
   * @returns Updated ReportFeedbackDto
   * @throws Error for unexpected database errors
   */
  private async updateFeedback(
    feedbackId: UUID,
    command: SubmitFeedbackCommand
  ): Promise<ReportFeedbackDto> {
    const { data: feedback, error } = await this.userClient
      .from('report_feedback')
      .update({
        rating: command.rating,
        comment: command.comment || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', feedbackId)
      .select('*')
      .single();

    if (error) {
      console.error(`[ERROR] updateFeedback database error: ${error.message}`);
      throw new Error(`Failed to update feedback: ${error.message}`);
    }

    if (!feedback) {
      console.error(`[ERROR] updateFeedback: No data returned from update`);
      throw new Error('Failed to update feedback: No data returned');
    }

    console.log(`[INFO] Feedback ${feedbackId} updated successfully`);
    return feedback as ReportFeedbackDto;
  }
}
