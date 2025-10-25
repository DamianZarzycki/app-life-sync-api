import { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../db/database.types.js';
import type {
  UUID,
  ReportDeliveryDto,
  ListReportDeliveriesResponseDto,
  EmailDeliveryResponseDto,
  DeliveryChannel,
  DeliveryStatus,
} from '../types.js';
import type { ListReportDeliveriesQuery } from '../validation/report-deliveries.js';

/**
 * Custom error for when a report is not found or user doesn't own it
 */
export class ReportNotFoundError extends Error {
  constructor(public reportId: UUID) {
    super(`Report ${reportId} not found`);
    this.name = 'ReportNotFoundError';
  }
}

/**
 * Custom error for when user has unsubscribed from email
 */
export class EmailUnsubscribedError extends Error {
  constructor() {
    super('User has unsubscribed from email delivery');
    this.name = 'EmailUnsubscribedError';
  }
}

/**
 * Custom error for when email is not in preferred delivery channels
 */
export class EmailNotPreferredError extends Error {
  constructor() {
    super('Email delivery is not enabled in user preferences');
    this.name = 'EmailNotPreferredError';
  }
}

/**
 * Custom error for when user preferences are not found
 */
export class PreferencesNotFoundError extends Error {
  constructor(public userId: UUID) {
    super(`Preferences for user ${userId} not found`);
    this.name = 'PreferencesNotFoundError';
  }
}

/**
 * Custom error for when delivery already exists
 */
export class DeliveryAlreadyExistsError extends Error {
  constructor(public reportId: UUID) {
    super(`Delivery already exists for report ${reportId}`);
    this.name = 'DeliveryAlreadyExistsError';
  }
}

/**
 * Custom error for when a delivery is not found or user doesn't own it
 */
export class DeliveryNotFoundError extends Error {
  constructor(public deliveryId: UUID) {
    super(`Report delivery ${deliveryId} not found`);
    this.name = 'DeliveryNotFoundError';
  }
}

/**
 * ReportDeliveriesService handles report delivery operations
 * Manages listing, filtering, pagination, and creation of report deliveries
 *
 * This service uses user-scoped Supabase clients to enforce RLS (Row-Level Security)
 * ensuring users can only access their own report deliveries
 */
export class ReportDeliveriesService {
  /**
   * Initialize service with Supabase client
   * @param userClient - User-scoped Supabase client (for RLS enforcement via JWT)
   */
  constructor(private userClient: SupabaseClient<Database>) {}

  /**
   * Retrieve paginated list of report deliveries for authenticated user with optional filtering
   *
   * @param userId - UUID of the authenticated user
   * @param query - ListReportDeliveriesQuery with optional filters
   * @returns ListReportDeliveriesResponseDto with paginated deliveries and metadata
   * @throws Error if database query fails
   */
  async listReportDeliveries(
    userId: UUID,
    query: ListReportDeliveriesQuery
  ): Promise<ListReportDeliveriesResponseDto> {
    const { report_id, channel, status, limit = 20, offset = 0 } = query;

    // Build the count query to get total matching deliveries
    let countQuery = this.userClient
      .from('report_deliveries')
      .select('id', { count: 'exact' })
      .eq('user_id', userId);

    // Build the data query to get paginated results
    let dataQuery = this.userClient.from('report_deliveries').select('*').eq('user_id', userId);

    // Apply optional filters
    if (report_id) {
      countQuery = countQuery.eq('report_id', report_id);
      dataQuery = dataQuery.eq('report_id', report_id);
    }

    if (channel) {
      countQuery = countQuery.eq('channel', channel);
      dataQuery = dataQuery.eq('channel', channel);
    }

    if (status) {
      countQuery = countQuery.eq('status', status);
      dataQuery = dataQuery.eq('status', status);
    }

    // Apply sorting (most recent first)
    dataQuery = dataQuery.order('created_at', { ascending: false });

    // Apply pagination
    dataQuery = dataQuery.range(offset, offset + limit - 1);

    // Execute count query
    const { error: countError, count } = await countQuery;
    if (countError) {
      console.error('ReportDeliveriesService.listReportDeliveries count error:', countError);
      throw new Error(`Failed to count deliveries: ${countError.message}`);
    }

    // Execute data query
    const { data: deliveries, error: dataError } = await dataQuery;
    if (dataError) {
      console.error('ReportDeliveriesService.listReportDeliveries data error:', dataError);
      throw new Error(`Failed to retrieve deliveries: ${dataError.message}`);
    }

    // Build and return paginated response DTO
    const total = count ?? 0;
    return {
      items: (deliveries || []) as ReportDeliveryDto[],
      total,
      limit,
      offset,
    };
  }

  /**
   * Queue email delivery for a report if user preferences allow
   *
   * Performs multi-step validation:
   * 1. Verify report exists and user owns it
   * 2. Verify user preferences exist
   * 3. Verify email is in preferred_delivery_channels
   * 4. Verify user has not unsubscribed (email_unsubscribed_at is NULL)
   * 5. Verify no delivery already queued for this report+channel
   * 6. Create new delivery record with status='queued'
   *
   * @param userId - UUID of the authenticated user
   * @param reportId - UUID of the report to queue
   * @returns EmailDeliveryResponseDto with created delivery
   * @throws ReportNotFoundError if report doesn't exist or user doesn't own it
   * @throws PreferencesNotFoundError if preferences don't exist
   * @throws EmailUnsubscribedError if user has opted out
   * @throws EmailNotPreferredError if email not in preferred channels
   * @throws DeliveryAlreadyExistsError if delivery already queued
   */
  async queueEmailDelivery(userId: UUID, reportId: UUID): Promise<EmailDeliveryResponseDto> {
    // Step 1: Fetch report (RLS ensures user ownership)
    const { data: report, error: reportError } = await this.userClient
      .from('reports')
      .select('id, user_id')
      .eq('id', reportId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (reportError) {
      console.error('ReportDeliveriesService.queueEmailDelivery report fetch error:', reportError);
      throw new Error(`Failed to fetch report: ${reportError.message}`);
    }

    if (!report) {
      throw new ReportNotFoundError(reportId);
    }

    // Step 2: Fetch user preferences (RLS ensures user ownership)
    const { data: preferences, error: preferencesError } = await this.userClient
      .from('preferences')
      .select('preferred_delivery_channels, email_unsubscribed_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (preferencesError) {
      console.error(
        'ReportDeliveriesService.queueEmailDelivery preferences fetch error:',
        preferencesError
      );
      throw new Error(`Failed to fetch preferences: ${preferencesError.message}`);
    }

    if (!preferences) {
      throw new PreferencesNotFoundError(userId);
    }

    // Step 3: Validate email is in preferred channels
    const emailChannels = preferences.preferred_delivery_channels as DeliveryChannel[];
    if (!emailChannels.includes('email')) {
      throw new EmailNotPreferredError();
    }

    // Step 4: Validate user has not unsubscribed
    if (preferences.email_unsubscribed_at !== null) {
      throw new EmailUnsubscribedError();
    }

    // Step 5: Check if delivery already exists for this report
    const { data: existingDelivery, error: existingError } = await this.userClient
      .from('report_deliveries')
      .select('id')
      .eq('report_id', reportId)
      .eq('channel', 'email')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingError) {
      console.error(
        'ReportDeliveriesService.queueEmailDelivery existing check error:',
        existingError
      );
      throw new Error(`Failed to check existing delivery: ${existingError.message}`);
    }

    if (existingDelivery) {
      throw new DeliveryAlreadyExistsError(reportId);
    }

    // Step 6: Create new delivery record
    const { data: delivery, error: insertError } = await this.userClient
      .from('report_deliveries')
      .insert({
        report_id: reportId,
        user_id: userId,
        channel: 'email',
        status: 'queued',
      })
      .select('id, status, channel')
      .single();

    if (insertError) {
      console.error('ReportDeliveriesService.queueEmailDelivery insert error:', insertError);

      // Handle unique constraint violation
      if (insertError.code === '23505') {
        throw new DeliveryAlreadyExistsError(reportId);
      }

      throw new Error(`Failed to create delivery: ${insertError.message}`);
    }

    if (!delivery) {
      throw new Error('Failed to create delivery: no data returned');
    }

    return {
      delivery: {
        id: delivery.id,
        status: delivery.status as DeliveryStatus,
        channel: delivery.channel as DeliveryChannel,
      },
    };
  }

  /**
   * Mark a report delivery as opened by updating its status to 'opened'
   *
   * Performs validation:
   * 1. Verify delivery exists and user owns it
   * 2. Update delivery status to 'opened' with current timestamp
   * 3. Return void on success
   *
   * @param userId - UUID of the authenticated user
   * @param deliveryId - UUID of the delivery to mark as opened
   * @returns void
   * @throws DeliveryNotFoundError if delivery doesn't exist or user doesn't own it
   */
  async markDeliveryOpened(userId: UUID, deliveryId: UUID): Promise<void> {
    // Step 1: Fetch delivery to verify existence and ownership
    const { data: delivery, error: fetchError } = await this.userClient
      .from('report_deliveries')
      .select('id, user_id')
      .eq('id', deliveryId)
      .eq('user_id', userId)
      .maybeSingle();

    if (fetchError) {
      console.error('ReportDeliveriesService.markDeliveryOpened fetch error:', fetchError);
      throw new Error(`Failed to fetch delivery: ${fetchError.message}`);
    }

    if (!delivery) {
      throw new DeliveryNotFoundError(deliveryId);
    }

    // Step 2: Update delivery with status='opened' and opened_at=now()
    const { error: updateError } = await this.userClient
      .from('report_deliveries')
      .update({
        status: 'opened' as const,
        opened_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', deliveryId)
      .eq('user_id', userId);

    if (updateError) {
      console.error('ReportDeliveriesService.markDeliveryOpened update error:', updateError);
      throw new Error(`Failed to update delivery: ${updateError.message}`);
    }
  }
}
