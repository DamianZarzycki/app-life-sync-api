export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      analytics_events: {
        Row: {
          created_at: string;
          event_name: string;
          id: number;
          properties: Json;
          schema_version: number;
          source: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          event_name: string;
          id?: number;
          properties?: Json;
          schema_version?: number;
          source: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          event_name?: string;
          id?: number;
          properties?: Json;
          schema_version?: number;
          source?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      categories: {
        Row: {
          active: boolean;
          created_at: string;
          id: string;
          name: string;
          slug: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
        };
        Relationships: [];
      };
      notes: {
        Row: {
          category_id: string;
          content: string;
          created_at: string;
          deleted_at: string | null;
          id: string;
          title: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          category_id: string;
          content: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          title?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          category_id?: string;
          content?: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          title?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notes_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'categories';
            referencedColumns: ['id'];
          },
        ];
      };
      preferences: {
        Row: {
          active_categories: string[];
          created_at: string;
          email_unsubscribed_at: string | null;
          max_daily_notes: number;
          preferred_delivery_channels: Database['public']['Enums']['delivery_channel_type'][];
          report_dow: number;
          report_hour: number;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          active_categories?: string[];
          created_at?: string;
          email_unsubscribed_at?: string | null;
          max_daily_notes?: number;
          preferred_delivery_channels?: Database['public']['Enums']['delivery_channel_type'][];
          report_dow?: number;
          report_hour?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active_categories?: string[];
          created_at?: string;
          email_unsubscribed_at?: string | null;
          max_daily_notes?: number;
          preferred_delivery_channels?: Database['public']['Enums']['delivery_channel_type'][];
          report_dow?: number;
          report_hour?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'preferences_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['user_id'];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          timezone: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          timezone?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          timezone?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      report_deliveries: {
        Row: {
          channel: Database['public']['Enums']['delivery_channel_type'];
          created_at: string;
          id: string;
          opened_at: string | null;
          queued_at: string;
          report_id: string;
          sent_at: string | null;
          status: Database['public']['Enums']['delivery_status_type'];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          channel: Database['public']['Enums']['delivery_channel_type'];
          created_at?: string;
          id?: string;
          opened_at?: string | null;
          queued_at?: string;
          report_id: string;
          sent_at?: string | null;
          status?: Database['public']['Enums']['delivery_status_type'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          channel?: Database['public']['Enums']['delivery_channel_type'];
          created_at?: string;
          id?: string;
          opened_at?: string | null;
          queued_at?: string;
          report_id?: string;
          sent_at?: string | null;
          status?: Database['public']['Enums']['delivery_status_type'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'report_deliveries_report_id_fkey';
            columns: ['report_id'];
            isOneToOne: false;
            referencedRelation: 'report_weeks';
            referencedColumns: ['report_id'];
          },
          {
            foreignKeyName: 'report_deliveries_report_id_fkey';
            columns: ['report_id'];
            isOneToOne: false;
            referencedRelation: 'reports';
            referencedColumns: ['id'];
          },
        ];
      };
      report_feedback: {
        Row: {
          comment: string | null;
          created_at: string;
          id: string;
          rating: number;
          report_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          comment?: string | null;
          created_at?: string;
          id?: string;
          rating: number;
          report_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          comment?: string | null;
          created_at?: string;
          id?: string;
          rating?: number;
          report_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'report_feedback_report_id_fkey';
            columns: ['report_id'];
            isOneToOne: true;
            referencedRelation: 'report_weeks';
            referencedColumns: ['report_id'];
          },
          {
            foreignKeyName: 'report_feedback_report_id_fkey';
            columns: ['report_id'];
            isOneToOne: true;
            referencedRelation: 'reports';
            referencedColumns: ['id'];
          },
        ];
      };
      reports: {
        Row: {
          categories_snapshot: Json;
          created_at: string;
          deleted_at: string | null;
          generated_by: Database['public']['Enums']['generated_by_type'];
          html: string;
          id: string;
          llm_model: string | null;
          pdf_path: string | null;
          system_prompt_version: string | null;
          text_version: string | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          categories_snapshot?: Json;
          created_at?: string;
          deleted_at?: string | null;
          generated_by: Database['public']['Enums']['generated_by_type'];
          html: string;
          id?: string;
          llm_model?: string | null;
          pdf_path?: string | null;
          system_prompt_version?: string | null;
          text_version?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          categories_snapshot?: Json;
          created_at?: string;
          deleted_at?: string | null;
          generated_by?: Database['public']['Enums']['generated_by_type'];
          html?: string;
          id?: string;
          llm_model?: string | null;
          pdf_path?: string | null;
          system_prompt_version?: string | null;
          text_version?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      report_weeks: {
        Row: {
          created_at: string | null;
          generated_by: Database['public']['Enums']['generated_by_type'] | null;
          report_id: string | null;
          timezone: string | null;
          user_id: string | null;
          week_start_local: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      util_is_valid_timezone: {
        Args: { tz: string };
        Returns: boolean;
      };
      util_local_date: {
        Args: { ts: string; tz: string };
        Returns: string;
      };
      util_local_week_start: {
        Args: { ts: string; tz: string };
        Returns: string;
      };
    };
    Enums: {
      delivery_channel_type: 'in_app' | 'email';
      delivery_status_type: 'queued' | 'sent' | 'opened';
      generated_by_type: 'scheduled' | 'on_demand';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
  | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
  ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
    DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
    DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
  ? R
  : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
  ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
    Row: infer R;
  }
  ? R
  : never
  : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema['Tables']
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
    Insert: infer I;
  }
  ? I
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
  ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
    Insert: infer I;
  }
  ? I
  : never
  : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
  | keyof DefaultSchema['Tables']
  | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
  : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
    Update: infer U;
  }
  ? U
  : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
  ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
    Update: infer U;
  }
  ? U
  : never
  : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
  | keyof DefaultSchema['Enums']
  | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
  ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
  : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
  ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
  : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
  | keyof DefaultSchema['CompositeTypes']
  | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
  ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
  : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
  ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
  : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      delivery_channel_type: ['in_app', 'email'],
      delivery_status_type: ['queued', 'sent', 'opened'],
      generated_by_type: ['scheduled', 'on_demand'],
    },
  },
} as const;
