export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_log: {
        Row: {
          action: string
          admin_role: Database["public"]["Enums"]["admin_role"] | null
          admin_user_id: string | null
          approval_ref: string | null
          created_at: string
          id: number
          ip_hash: string | null
          reason: string | null
          request_id: string | null
          success: boolean
          summary: Json
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          admin_role?: Database["public"]["Enums"]["admin_role"] | null
          admin_user_id?: string | null
          approval_ref?: string | null
          created_at?: string
          id?: never
          ip_hash?: string | null
          reason?: string | null
          request_id?: string | null
          success?: boolean
          summary?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          admin_role?: Database["public"]["Enums"]["admin_role"] | null
          admin_user_id?: string | null
          approval_ref?: string | null
          created_at?: string
          id?: never
          ip_hash?: string | null
          reason?: string | null
          request_id?: string | null
          success?: boolean
          summary?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: []
      }
      admin_incident_events: {
        Row: {
          admin_user_id: string | null
          created_at: string
          id: number
          incident_id: number
          note: string
        }
        Insert: {
          admin_user_id?: string | null
          created_at?: string
          id?: never
          incident_id: number
          note: string
        }
        Update: {
          admin_user_id?: string | null
          created_at?: string
          id?: never
          incident_id?: number
          note?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_incident_events_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "admin_incidents"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_incidents: {
        Row: {
          affected_systems: string[]
          created_at: string
          created_by: string | null
          description: string | null
          id: number
          owner_admin: string | null
          postmortem_url: string | null
          resolved_at: string | null
          severity: string
          started_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          affected_systems?: string[]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: never
          owner_admin?: string | null
          postmortem_url?: string | null
          resolved_at?: string | null
          severity: string
          started_at?: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          affected_systems?: string[]
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: never
          owner_admin?: string | null
          postmortem_url?: string | null
          resolved_at?: string | null
          severity?: string
          started_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          created_at: string
          created_by: string | null
          display_name: string | null
          last_reviewed_at: string | null
          role: Database["public"]["Enums"]["admin_role"]
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          last_reviewed_at?: string | null
          role: Database["public"]["Enums"]["admin_role"]
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          last_reviewed_at?: string | null
          role?: Database["public"]["Enums"]["admin_role"]
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      analytics_category_daily: {
        Row: {
          avg_points: number | null
          category: string
          completions: number
          day: string
          exposures: number
          formula_version: number
          median_points: number | null
          perfect_rate: number | null
          updated_at: string
          zero_rate: number | null
        }
        Insert: {
          avg_points?: number | null
          category: string
          completions?: number
          day: string
          exposures?: number
          formula_version?: number
          median_points?: number | null
          perfect_rate?: number | null
          updated_at?: string
          zero_rate?: number | null
        }
        Update: {
          avg_points?: number | null
          category?: string
          completions?: number
          day?: string
          exposures?: number
          formula_version?: number
          median_points?: number | null
          perfect_rate?: number | null
          updated_at?: string
          zero_rate?: number | null
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          app_version: string | null
          attempt_purpose: string | null
          build_number: string | null
          category: string | null
          country_code: string | null
          created_at: string
          dedup_key: string | null
          engine_id: string | null
          environment: string
          event_name: string
          event_version: number
          id: number
          ingestion_request_id: string | null
          is_anonymous: boolean | null
          occurred_at: string
          platform: string | null
          properties: Json
          puzzle_id: string | null
          received_at: string
          screen: string | null
          session_id: string | null
          source: string
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          attempt_purpose?: string | null
          build_number?: string | null
          category?: string | null
          country_code?: string | null
          created_at?: string
          dedup_key?: string | null
          engine_id?: string | null
          environment?: string
          event_name: string
          event_version?: number
          id?: never
          ingestion_request_id?: string | null
          is_anonymous?: boolean | null
          occurred_at: string
          platform?: string | null
          properties?: Json
          puzzle_id?: string | null
          received_at?: string
          screen?: string | null
          session_id?: string | null
          source?: string
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          attempt_purpose?: string | null
          build_number?: string | null
          category?: string | null
          country_code?: string | null
          created_at?: string
          dedup_key?: string | null
          engine_id?: string | null
          environment?: string
          event_name?: string
          event_version?: number
          id?: never
          ingestion_request_id?: string | null
          is_anonymous?: boolean | null
          occurred_at?: string
          platform?: string | null
          properties?: Json
          puzzle_id?: string | null
          received_at?: string
          screen?: string | null
          session_id?: string | null
          source?: string
          user_id?: string | null
        }
        Relationships: []
      }
      analytics_gameplay_daily: {
        Row: {
          avg_score: number | null
          day: string
          formula_version: number
          median_score: number | null
          practice_completions: number
          practice_starts: number
          ranked_completions: number
          ranked_starts: number
          updated_at: string
        }
        Insert: {
          avg_score?: number | null
          day: string
          formula_version?: number
          median_score?: number | null
          practice_completions?: number
          practice_starts?: number
          ranked_completions?: number
          ranked_starts?: number
          updated_at?: string
        }
        Update: {
          avg_score?: number | null
          day?: string
          formula_version?: number
          median_score?: number | null
          practice_completions?: number
          practice_starts?: number
          ranked_completions?: number
          ranked_starts?: number
          updated_at?: string
        }
        Relationships: []
      }
      analytics_subject_flags: {
        Row: {
          created_at: string
          created_by: string | null
          environment: string | null
          exclude_from_business_kpis: boolean
          reason: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          environment?: string | null
          exclude_from_business_kpis?: boolean
          reason?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          environment?: string | null
          exclude_from_business_kpis?: boolean
          reason?: string | null
          user_id?: string
        }
        Relationships: []
      }
      analytics_user_daily: {
        Row: {
          active_users: number
          day: string
          formula_version: number
          new_anonymous: number
          new_permanent: number
          new_users: number
          updated_at: string
        }
        Insert: {
          active_users?: number
          day: string
          formula_version?: number
          new_anonymous?: number
          new_permanent?: number
          new_users?: number
          updated_at?: string
        }
        Update: {
          active_users?: number
          day?: string
          formula_version?: number
          new_anonymous?: number
          new_permanent?: number
          new_users?: number
          updated_at?: string
        }
        Relationships: []
      }
      attempt_items: {
        Row: {
          answer_payload: Json | null
          attempt_id: string
          awarded_score: number | null
          created_at: string
          id: string
          opened_at: string
          position: number
          result_payload: Json | null
          slot_id: string
          status: Database["public"]["Enums"]["item_status"]
          submitted_at: string | null
          verdict: Database["public"]["Enums"]["answer_verdict"] | null
        }
        Insert: {
          answer_payload?: Json | null
          attempt_id: string
          awarded_score?: number | null
          created_at?: string
          id?: string
          opened_at?: string
          position: number
          result_payload?: Json | null
          slot_id: string
          status?: Database["public"]["Enums"]["item_status"]
          submitted_at?: string | null
          verdict?: Database["public"]["Enums"]["answer_verdict"] | null
        }
        Update: {
          answer_payload?: Json | null
          attempt_id?: string
          awarded_score?: number | null
          created_at?: string
          id?: string
          opened_at?: string
          position?: number
          result_payload?: Json | null
          slot_id?: string
          status?: Database["public"]["Enums"]["item_status"]
          submitted_at?: string | null
          verdict?: Database["public"]["Enums"]["answer_verdict"] | null
        }
        Relationships: [
          {
            foreignKeyName: "attempt_items_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempt_items_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "ranked_result_projection"
            referencedColumns: ["attempt_id"]
          },
        ]
      }
      attempts: {
        Row: {
          active_denominator: number | null
          app_version: string | null
          attempt_purpose: Database["public"]["Enums"]["attempt_purpose"]
          cheat_flags: Json
          completed_at: string | null
          content_hash_snapshot: string | null
          country_code_snapshot: string | null
          created_at: string
          final_score: number | null
          id: string
          integrity_status: Database["public"]["Enums"]["ranked_integrity"]
          invalidated_at: string | null
          invalidation_reason: string | null
          is_ranked: boolean
          pack_id: string | null
          practice_pack_id: string | null
          ranked_date: string | null
          recalc_version: number
          scoring_version: string | null
          session_id: string
          started_at: string
          status: Database["public"]["Enums"]["attempt_status"]
          total_solve_ms: number | null
          user_id: string | null
          username_snapshot: string | null
        }
        Insert: {
          active_denominator?: number | null
          app_version?: string | null
          attempt_purpose: Database["public"]["Enums"]["attempt_purpose"]
          cheat_flags?: Json
          completed_at?: string | null
          content_hash_snapshot?: string | null
          country_code_snapshot?: string | null
          created_at?: string
          final_score?: number | null
          id?: string
          integrity_status?: Database["public"]["Enums"]["ranked_integrity"]
          invalidated_at?: string | null
          invalidation_reason?: string | null
          is_ranked?: boolean
          pack_id?: string | null
          practice_pack_id?: string | null
          ranked_date?: string | null
          recalc_version?: number
          scoring_version?: string | null
          session_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["attempt_status"]
          total_solve_ms?: number | null
          user_id?: string | null
          username_snapshot?: string | null
        }
        Update: {
          active_denominator?: number | null
          app_version?: string | null
          attempt_purpose?: Database["public"]["Enums"]["attempt_purpose"]
          cheat_flags?: Json
          completed_at?: string | null
          content_hash_snapshot?: string | null
          country_code_snapshot?: string | null
          created_at?: string
          final_score?: number | null
          id?: string
          integrity_status?: Database["public"]["Enums"]["ranked_integrity"]
          invalidated_at?: string | null
          invalidation_reason?: string | null
          is_ranked?: boolean
          pack_id?: string | null
          practice_pack_id?: string | null
          ranked_date?: string | null
          recalc_version?: number
          scoring_version?: string | null
          session_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["attempt_status"]
          total_solve_ms?: number | null
          user_id?: string | null
          username_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attempts_country_code_snapshot_fkey"
            columns: ["country_code_snapshot"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "attempts_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "daily_packs"
            referencedColumns: ["pack_id"]
          },
          {
            foreignKeyName: "attempts_practice_pack_id_fkey"
            columns: ["practice_pack_id"]
            isOneToOne: false
            referencedRelation: "practice_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_usernames: {
        Row: {
          normalized: string
          reason: string
        }
        Insert: {
          normalized: string
          reason: string
        }
        Update: {
          normalized?: string
          reason?: string
        }
        Relationships: []
      }
      content_reviews: {
        Row: {
          decision: Database["public"]["Enums"]["review_decision"]
          id: string
          notes: string | null
          puzzle_id: string | null
          reviewed_at: string
          reviewer_confidence: number | null
          reviewer_id: string | null
          seed_id: string | null
        }
        Insert: {
          decision: Database["public"]["Enums"]["review_decision"]
          id?: string
          notes?: string | null
          puzzle_id?: string | null
          reviewed_at?: string
          reviewer_confidence?: number | null
          reviewer_id?: string | null
          seed_id?: string | null
        }
        Update: {
          decision?: Database["public"]["Enums"]["review_decision"]
          id?: string
          notes?: string | null
          puzzle_id?: string | null
          reviewed_at?: string
          reviewer_confidence?: number | null
          reviewer_id?: string | null
          seed_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_reviews_puzzle_id_fkey"
            columns: ["puzzle_id"]
            isOneToOne: false
            referencedRelation: "puzzles"
            referencedColumns: ["puzzle_id"]
          },
          {
            foreignKeyName: "content_reviews_seed_id_fkey"
            columns: ["seed_id"]
            isOneToOne: false
            referencedRelation: "puzzle_seeds"
            referencedColumns: ["seed_id"]
          },
        ]
      }
      countries: {
        Row: {
          active: boolean
          code: string
          created_at: string
          display_order: number
          name: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          display_order?: number
          name: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          display_order?: number
          name?: string
        }
        Relationships: []
      }
      daily_pack_slots: {
        Row: {
          category: Database["public"]["Enums"]["slot_category"]
          created_at: string
          engine_id: string
          id: string
          max_score: number
          pack_id: string
          position: number
          puzzle_id: string
          void_reason: string | null
          void_status: boolean
          voided_at: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["slot_category"]
          created_at?: string
          engine_id: string
          id?: string
          max_score?: number
          pack_id: string
          position: number
          puzzle_id: string
          void_reason?: string | null
          void_status?: boolean
          voided_at?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["slot_category"]
          created_at?: string
          engine_id?: string
          id?: string
          max_score?: number
          pack_id?: string
          position?: number
          puzzle_id?: string
          void_reason?: string | null
          void_status?: boolean
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_pack_slots_engine_id_fkey"
            columns: ["engine_id"]
            isOneToOne: false
            referencedRelation: "puzzle_engines"
            referencedColumns: ["engine_id"]
          },
          {
            foreignKeyName: "daily_pack_slots_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "daily_packs"
            referencedColumns: ["pack_id"]
          },
          {
            foreignKeyName: "daily_pack_slots_puzzle_id_fkey"
            columns: ["puzzle_id"]
            isOneToOne: true
            referencedRelation: "puzzles"
            referencedColumns: ["puzzle_id"]
          },
        ]
      }
      daily_packs: {
        Row: {
          content_hash: string
          created_at: string
          difficulty_label: string
          incident_status: Database["public"]["Enums"]["incident_level"]
          pack_date: string | null
          pack_id: string
          pack_index: number
          published_at: string | null
          status: Database["public"]["Enums"]["pack_status"]
          updated_at: string
        }
        Insert: {
          content_hash: string
          created_at?: string
          difficulty_label: string
          incident_status?: Database["public"]["Enums"]["incident_level"]
          pack_date?: string | null
          pack_id: string
          pack_index: number
          published_at?: string | null
          status?: Database["public"]["Enums"]["pack_status"]
          updated_at?: string
        }
        Update: {
          content_hash?: string
          created_at?: string
          difficulty_label?: string
          incident_status?: Database["public"]["Enums"]["incident_level"]
          pack_date?: string | null
          pack_id?: string
          pack_index?: number
          published_at?: string | null
          status?: Database["public"]["Enums"]["pack_status"]
          updated_at?: string
        }
        Relationships: []
      }
      operational_flags: {
        Row: {
          content_publication_enabled: boolean
          expires_at: string | null
          id: boolean
          message: string | null
          mode: string
          practice_starts_enabled: boolean
          purchases_enabled: boolean
          ranked_starts_enabled: boolean
          reason: string | null
          set_by: string | null
          updated_at: string
        }
        Insert: {
          content_publication_enabled?: boolean
          expires_at?: string | null
          id?: boolean
          message?: string | null
          mode?: string
          practice_starts_enabled?: boolean
          purchases_enabled?: boolean
          ranked_starts_enabled?: boolean
          reason?: string | null
          set_by?: string | null
          updated_at?: string
        }
        Update: {
          content_publication_enabled?: boolean
          expires_at?: string | null
          id?: boolean
          message?: string | null
          mode?: string
          practice_starts_enabled?: boolean
          purchases_enabled?: boolean
          ranked_starts_enabled?: boolean
          reason?: string | null
          set_by?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      player_entitlements: {
        Row: {
          billing_issue_detected_at: string | null
          created_at: string
          current_period_end: string | null
          entitlement_state: string
          entitlement_version: number
          expiration_reason: string | null
          grace_period_end: string | null
          is_active: boolean
          latest_event_id: string | null
          original_purchased_at: string | null
          period_type: string | null
          purchased_at: string | null
          revenuecat_entitlement_id: string | null
          revenuecat_product_id: string | null
          revenuecat_store: string | null
          revoked_at: string | null
          source: string
          source_updated_at: string
          unsubscribe_detected_at: string | null
          updated_at: string
          user_id: string
          will_renew: boolean
        }
        Insert: {
          billing_issue_detected_at?: string | null
          created_at?: string
          current_period_end?: string | null
          entitlement_state?: string
          entitlement_version?: number
          expiration_reason?: string | null
          grace_period_end?: string | null
          is_active?: boolean
          latest_event_id?: string | null
          original_purchased_at?: string | null
          period_type?: string | null
          purchased_at?: string | null
          revenuecat_entitlement_id?: string | null
          revenuecat_product_id?: string | null
          revenuecat_store?: string | null
          revoked_at?: string | null
          source?: string
          source_updated_at?: string
          unsubscribe_detected_at?: string | null
          updated_at?: string
          user_id: string
          will_renew?: boolean
        }
        Update: {
          billing_issue_detected_at?: string | null
          created_at?: string
          current_period_end?: string | null
          entitlement_state?: string
          entitlement_version?: number
          expiration_reason?: string | null
          grace_period_end?: string | null
          is_active?: boolean
          latest_event_id?: string | null
          original_purchased_at?: string | null
          period_type?: string | null
          purchased_at?: string | null
          revenuecat_entitlement_id?: string | null
          revenuecat_product_id?: string | null
          revenuecat_store?: string | null
          revoked_at?: string | null
          source?: string
          source_updated_at?: string
          unsubscribe_detected_at?: string | null
          updated_at?: string
          user_id?: string
          will_renew?: boolean
        }
        Relationships: []
      }
      practice_pack_slots: {
        Row: {
          category: Database["public"]["Enums"]["slot_category"]
          engine_id: string
          id: string
          max_score: number
          position: number
          practice_pack_id: string
          puzzle_id: string
        }
        Insert: {
          category: Database["public"]["Enums"]["slot_category"]
          engine_id: string
          id?: string
          max_score?: number
          position: number
          practice_pack_id: string
          puzzle_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["slot_category"]
          engine_id?: string
          id?: string
          max_score?: number
          position?: number
          practice_pack_id?: string
          puzzle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_pack_slots_engine_id_fkey"
            columns: ["engine_id"]
            isOneToOne: false
            referencedRelation: "puzzle_engines"
            referencedColumns: ["engine_id"]
          },
          {
            foreignKeyName: "practice_pack_slots_practice_pack_id_fkey"
            columns: ["practice_pack_id"]
            isOneToOne: false
            referencedRelation: "practice_packs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_pack_slots_puzzle_id_fkey"
            columns: ["puzzle_id"]
            isOneToOne: false
            referencedRelation: "puzzles"
            referencedColumns: ["puzzle_id"]
          },
        ]
      }
      practice_packs: {
        Row: {
          created_at: string
          exclusion_date: string
          id: string
          selection_seed: string
          selection_version: number
          user_id: string
        }
        Insert: {
          created_at?: string
          exclusion_date: string
          id?: string
          selection_seed: string
          selection_version?: number
          user_id: string
        }
        Update: {
          created_at?: string
          exclusion_date?: string
          id?: string
          selection_seed?: string
          selection_version?: number
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          country_changed_at: string | null
          country_code: string | null
          created_at: string
          display_country: boolean
          forced_rename: boolean
          id: string
          moderation_flags: Json
          onboarding_status: Database["public"]["Enums"]["onboarding_status"]
          rank_restricted_until: string | null
          updated_at: string
          username: string | null
          username_changed_at: string | null
          username_normalized: string | null
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          country_changed_at?: string | null
          country_code?: string | null
          created_at?: string
          display_country?: boolean
          forced_rename?: boolean
          id: string
          moderation_flags?: Json
          onboarding_status?: Database["public"]["Enums"]["onboarding_status"]
          rank_restricted_until?: string | null
          updated_at?: string
          username?: string | null
          username_changed_at?: string | null
          username_normalized?: string | null
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          country_changed_at?: string | null
          country_code?: string | null
          created_at?: string
          display_country?: boolean
          forced_rename?: boolean
          id?: string
          moderation_flags?: Json
          onboarding_status?: Database["public"]["Enums"]["onboarding_status"]
          rank_restricted_until?: string | null
          updated_at?: string
          username?: string | null
          username_changed_at?: string | null
          username_normalized?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_country_code_fkey"
            columns: ["country_code"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
        ]
      }
      puzzle_answers: {
        Row: {
          answer_payload: Json
          created_at: string
          explanation: string
          puzzle_id: string
          updated_at: string
        }
        Insert: {
          answer_payload: Json
          created_at?: string
          explanation: string
          puzzle_id: string
          updated_at?: string
        }
        Update: {
          answer_payload?: Json
          created_at?: string
          explanation?: string
          puzzle_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "puzzle_answers_puzzle_id_fkey"
            columns: ["puzzle_id"]
            isOneToOne: true
            referencedRelation: "puzzles"
            referencedColumns: ["puzzle_id"]
          },
        ]
      }
      puzzle_engines: {
        Row: {
          accessibility_profile: Json
          active: boolean
          build_status: Database["public"]["Enums"]["engine_build_status"]
          builder_id: string
          category: Database["public"]["Enums"]["category"]
          created_at: string
          engine_id: string
          estimated_time_ms: number
          explanation_strategy: string
          max_difficulty: number
          min_app_version: string
          min_days_between: number
          min_difficulty: number
          name: string
          prompt_template_id: string | null
          rotation_weight: number
          scoring_id: string
          ui_component: string
          updated_at: string
          validator_id: string
          weekly_cap: number
        }
        Insert: {
          accessibility_profile?: Json
          active?: boolean
          build_status?: Database["public"]["Enums"]["engine_build_status"]
          builder_id: string
          category: Database["public"]["Enums"]["category"]
          created_at?: string
          engine_id: string
          estimated_time_ms: number
          explanation_strategy: string
          max_difficulty: number
          min_app_version?: string
          min_days_between: number
          min_difficulty: number
          name: string
          prompt_template_id?: string | null
          rotation_weight?: number
          scoring_id: string
          ui_component: string
          updated_at?: string
          validator_id: string
          weekly_cap: number
        }
        Update: {
          accessibility_profile?: Json
          active?: boolean
          build_status?: Database["public"]["Enums"]["engine_build_status"]
          builder_id?: string
          category?: Database["public"]["Enums"]["category"]
          created_at?: string
          engine_id?: string
          estimated_time_ms?: number
          explanation_strategy?: string
          max_difficulty?: number
          min_app_version?: string
          min_days_between?: number
          min_difficulty?: number
          name?: string
          prompt_template_id?: string | null
          rotation_weight?: number
          scoring_id?: string
          ui_component?: string
          updated_at?: string
          validator_id?: string
          weekly_cap?: number
        }
        Relationships: []
      }
      puzzle_seeds: {
        Row: {
          authored_difficulty: number
          content_hash: string
          created_at: string
          engine_id: string
          generation_model: string | null
          payload: Json
          prompt_version: string | null
          schema_version: number
          seed_id: string
          source_type: Database["public"]["Enums"]["seed_source"]
          status: Database["public"]["Enums"]["seed_status"]
          updated_at: string
        }
        Insert: {
          authored_difficulty: number
          content_hash: string
          created_at?: string
          engine_id: string
          generation_model?: string | null
          payload: Json
          prompt_version?: string | null
          schema_version?: number
          seed_id: string
          source_type: Database["public"]["Enums"]["seed_source"]
          status?: Database["public"]["Enums"]["seed_status"]
          updated_at?: string
        }
        Update: {
          authored_difficulty?: number
          content_hash?: string
          created_at?: string
          engine_id?: string
          generation_model?: string | null
          payload?: Json
          prompt_version?: string | null
          schema_version?: number
          seed_id?: string
          source_type?: Database["public"]["Enums"]["seed_source"]
          status?: Database["public"]["Enums"]["seed_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "puzzle_seeds_engine_id_fkey"
            columns: ["engine_id"]
            isOneToOne: false
            referencedRelation: "puzzle_engines"
            referencedColumns: ["engine_id"]
          },
        ]
      }
      puzzle_validation_results: {
        Row: {
          findings: Json
          id: string
          passed: boolean
          puzzle_id: string
          validated_at: string
          validation_hash: string
          validation_source: string
          validator_version: string
        }
        Insert: {
          findings?: Json
          id?: string
          passed: boolean
          puzzle_id: string
          validated_at?: string
          validation_hash: string
          validation_source: string
          validator_version: string
        }
        Update: {
          findings?: Json
          id?: string
          passed?: boolean
          puzzle_id?: string
          validated_at?: string
          validation_hash?: string
          validation_source?: string
          validator_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "puzzle_validation_results_puzzle_id_fkey"
            columns: ["puzzle_id"]
            isOneToOne: false
            referencedRelation: "puzzles"
            referencedColumns: ["puzzle_id"]
          },
        ]
      }
      puzzles: {
        Row: {
          approved_at: string | null
          builder_version: string
          category: Database["public"]["Enums"]["category"]
          content_hash: string
          created_at: string
          difficulty: number
          engine_id: string
          prompt: string
          public_payload: Json
          puzzle_id: string
          retired_at: string | null
          seed_id: string
          status: Database["public"]["Enums"]["puzzle_status"]
          updated_at: string
          validator_version: string
        }
        Insert: {
          approved_at?: string | null
          builder_version: string
          category: Database["public"]["Enums"]["category"]
          content_hash: string
          created_at?: string
          difficulty: number
          engine_id: string
          prompt: string
          public_payload: Json
          puzzle_id: string
          retired_at?: string | null
          seed_id: string
          status?: Database["public"]["Enums"]["puzzle_status"]
          updated_at?: string
          validator_version: string
        }
        Update: {
          approved_at?: string | null
          builder_version?: string
          category?: Database["public"]["Enums"]["category"]
          content_hash?: string
          created_at?: string
          difficulty?: number
          engine_id?: string
          prompt?: string
          public_payload?: Json
          puzzle_id?: string
          retired_at?: string | null
          seed_id?: string
          status?: Database["public"]["Enums"]["puzzle_status"]
          updated_at?: string
          validator_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "puzzles_engine_id_fkey"
            columns: ["engine_id"]
            isOneToOne: false
            referencedRelation: "puzzle_engines"
            referencedColumns: ["engine_id"]
          },
          {
            foreignKeyName: "puzzles_seed_id_fkey"
            columns: ["seed_id"]
            isOneToOne: false
            referencedRelation: "puzzle_seeds"
            referencedColumns: ["seed_id"]
          },
        ]
      }
      release_policy: {
        Row: {
          id: boolean
          mode: string
          updated_at: string
        }
        Insert: {
          id?: boolean
          mode?: string
          updated_at?: string
        }
        Update: {
          id?: boolean
          mode?: string
          updated_at?: string
        }
        Relationships: []
      }
      revenuecat_webhook_events: {
        Row: {
          app_user_id_fingerprint: string | null
          error_code: string | null
          event_id: string
          event_type: string | null
          processed_at: string | null
          received_at: string
          status: string
        }
        Insert: {
          app_user_id_fingerprint?: string | null
          error_code?: string | null
          event_id: string
          event_type?: string | null
          processed_at?: string | null
          received_at?: string
          status?: string
        }
        Update: {
          app_user_id_fingerprint?: string | null
          error_code?: string | null
          event_id?: string
          event_type?: string | null
          processed_at?: string | null
          received_at?: string
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      ranked_result_projection: {
        Row: {
          attempt_id: string | null
          brewscore: number | null
          completed_at: string | null
          country_code_snapshot: string | null
          integrity_status:
            | Database["public"]["Enums"]["ranked_integrity"]
            | null
          ranked_date: string | null
          result_version: number | null
          total_solve_ms: number | null
          user_id: string | null
          username_snapshot: string | null
        }
        Insert: {
          attempt_id?: string | null
          brewscore?: number | null
          completed_at?: string | null
          country_code_snapshot?: string | null
          integrity_status?:
            | Database["public"]["Enums"]["ranked_integrity"]
            | null
          ranked_date?: string | null
          result_version?: number | null
          total_solve_ms?: never
          user_id?: string | null
          username_snapshot?: string | null
        }
        Update: {
          attempt_id?: string | null
          brewscore?: number | null
          completed_at?: string | null
          country_code_snapshot?: string | null
          integrity_status?:
            | Database["public"]["Enums"]["ranked_integrity"]
            | null
          ranked_date?: string | null
          result_version?: number | null
          total_solve_ms?: never
          user_id?: string | null
          username_snapshot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attempts_country_code_snapshot_fkey"
            columns: ["country_code_snapshot"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Functions: {
      admin_activation_funnel: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      admin_active_users: { Args: { p_as_of: string }; Returns: Json }
      admin_can: {
        Args: {
          p_capability: string
          p_role: Database["public"]["Enums"]["admin_role"]
        }
        Returns: boolean
      }
      admin_category_stats: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      admin_engine_stats: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      admin_gameplay_daily: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      admin_kpi_overview: { Args: never; Returns: Json }
      admin_log: {
        Args: {
          p_action: string
          p_admin: string
          p_approval_ref: string
          p_ip_hash: string
          p_reason: string
          p_request_id: string
          p_role: Database["public"]["Enums"]["admin_role"]
          p_success: boolean
          p_summary: Json
          p_target_id: string
          p_target_type: string
        }
        Returns: number
      }
      admin_ranked_funnel: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      admin_retention: { Args: { p_from: string; p_to: string }; Returns: Json }
      admin_revenue_snapshot: { Args: never; Returns: Json }
      admin_role_of: {
        Args: { p_user: string }
        Returns: Database["public"]["Enums"]["admin_role"]
      }
      admin_user_daily: {
        Args: { p_from: string; p_to: string }
        Returns: Json
      }
      analytics_event_allowed: { Args: { p_name: string }; Returns: boolean }
      analytics_excluded: { Args: { p_user: string }; Returns: boolean }
      analytics_excluded_ids: { Args: never; Returns: string[] }
      analytics_props_safe: { Args: { p_props: Json }; Returns: boolean }
      app_version_ok: { Args: { v: string }; Returns: boolean }
      check_rank_eligibility: {
        Args: { p_app_version?: string; p_today?: string; p_user: string }
        Returns: Json
      }
      check_username_available: { Args: { p_username: string }; Returns: Json }
      claim_webhook_event: {
        Args: {
          p_event_id: string
          p_event_type: string
          p_fingerprint: string
        }
        Returns: boolean
      }
      current_release_policy: { Args: never; Returns: string }
      entitlement_has_premium: { Args: { p_state: string }; Returns: boolean }
      finish_webhook_event: {
        Args: { p_error?: string; p_event_id: string; p_status: string }
        Returns: undefined
      }
      get_daily_leaderboard: {
        Args: {
          p_after_position?: number
          p_date?: string
          p_limit?: number
          p_scope?: string
        }
        Returns: Json
      }
      get_my_daily_rank: { Args: { p_date?: string }; Returns: Json }
      get_my_entitlements: { Args: never; Returns: Json }
      get_my_practice_history: {
        Args: { p_before?: string; p_limit?: number }
        Returns: Json
      }
      get_my_practice_summary: { Args: never; Returns: Json }
      get_my_profile: { Args: never; Returns: Json }
      get_my_progress_detail: {
        Args: { p_days?: number; p_today?: string }
        Returns: Json
      }
      get_my_progress_summary: { Args: { p_today?: string }; Returns: Json }
      get_my_ranked_history: {
        Args: { p_before?: string; p_limit?: number }
        Returns: Json
      }
      get_operational_status: { Args: never; Returns: Json }
      get_public_pack: {
        Args: { p_date?: string }
        Returns: {
          category: Database["public"]["Enums"]["category"]
          difficulty: number
          engine_id: string
          max_score: number
          pack_date: string
          pack_difficulty: string
          position: number
          prompt: string
          public_payload: Json
          puzzle_id: string
        }[]
      }
      get_today_player_status: {
        Args: { p_app_version?: string }
        Returns: Json
      }
      ingest_analytics_events: {
        Args: { p_events: Json; p_is_anon: boolean; p_user: string }
        Returns: Json
      }
      is_admin: { Args: { p_user: string }; Returns: boolean }
      is_rank_eligible: { Args: { p_user?: string }; Returns: boolean }
      operational_allows: { Args: { p_area: string }; Returns: boolean }
      practice_daily_allowance: { Args: never; Returns: number }
      practice_pack_public: { Args: { p_pack: string }; Returns: Json }
      publish_pack: {
        Args: { p_date: string; p_pack_id: string }
        Returns: undefined
      }
      rebuild_analytics_day: { Args: { p_day: string }; Returns: undefined }
      rebuild_analytics_rollups: {
        Args: { p_from: string; p_to: string }
        Returns: number
      }
      recalculate_ranked_result: {
        Args: { p_attempt_id: string }
        Returns: Json
      }
      ret: {
        Args: { p_cohort: string; p_n: number; p_size: number }
        Returns: number
      }
      set_country: {
        Args: { p_country: string; p_display?: boolean }
        Returns: Json
      }
      set_operational_flags: {
        Args: {
          p_expires_at: string
          p_message: string
          p_mode: string
          p_practice: boolean
          p_publication: boolean
          p_purchases: boolean
          p_ranked: boolean
          p_reason: string
          p_set_by: string
        }
        Returns: Json
      }
      set_release_policy: { Args: { p_mode: string }; Returns: string }
      set_subject_flag: {
        Args: {
          p_by: string
          p_env: string
          p_exclude: boolean
          p_reason: string
          p_user: string
        }
        Returns: undefined
      }
      set_username: { Args: { p_username: string }; Returns: Json }
      start_practice_pack: {
        Args: {
          p_app_version?: string
          p_session_id: string
          p_user_id: string
        }
        Returns: Json
      }
      sync_account_type: { Args: never; Returns: Json }
      sync_player_entitlement: {
        Args: { p_fields: Json; p_state: string; p_user_id: string }
        Returns: Json
      }
      validate_username: { Args: { p_username: string }; Returns: string }
    }
    Enums: {
      account_type: "anonymous" | "permanent"
      admin_role:
        | "founder"
        | "super_admin"
        | "product_admin"
        | "content_admin"
        | "finance"
        | "support"
        | "engineering"
        | "viewer"
      answer_verdict: "correct" | "partial" | "incorrect"
      attempt_purpose: "ranked" | "practice" | "guest"
      attempt_status: "active" | "completed" | "expired" | "invalidated"
      category:
        | "observation"
        | "pattern"
        | "logic"
        | "language-logic"
        | "attention-speed"
      engine_build_status: "built" | "planned" | "retired"
      incident_level: "none" | "level_1" | "level_2" | "level_3"
      item_status: "opened" | "submitted" | "voided"
      onboarding_status: "username_required" | "complete"
      pack_status: "draft" | "testing" | "approved" | "live" | "archived"
      puzzle_status: "draft" | "validated" | "approved" | "retired"
      ranked_integrity: "clean" | "review" | "invalidated"
      review_decision: "approved" | "rejected" | "needs_changes"
      seed_source: "human" | "ai" | "imported"
      seed_status: "draft" | "validated" | "approved" | "rejected" | "retired"
      slot_category:
        | "observation"
        | "pattern"
        | "logic"
        | "language-logic"
        | "attention-speed"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_type: ["anonymous", "permanent"],
      admin_role: [
        "founder",
        "super_admin",
        "product_admin",
        "content_admin",
        "finance",
        "support",
        "engineering",
        "viewer",
      ],
      answer_verdict: ["correct", "partial", "incorrect"],
      attempt_purpose: ["ranked", "practice", "guest"],
      attempt_status: ["active", "completed", "expired", "invalidated"],
      category: [
        "observation",
        "pattern",
        "logic",
        "language-logic",
        "attention-speed",
      ],
      engine_build_status: ["built", "planned", "retired"],
      incident_level: ["none", "level_1", "level_2", "level_3"],
      item_status: ["opened", "submitted", "voided"],
      onboarding_status: ["username_required", "complete"],
      pack_status: ["draft", "testing", "approved", "live", "archived"],
      puzzle_status: ["draft", "validated", "approved", "retired"],
      ranked_integrity: ["clean", "review", "invalidated"],
      review_decision: ["approved", "rejected", "needs_changes"],
      seed_source: ["human", "ai", "imported"],
      seed_status: ["draft", "validated", "approved", "rejected", "retired"],
      slot_category: [
        "observation",
        "pattern",
        "logic",
        "language-logic",
        "attention-speed",
      ],
    },
  },
} as const

// --- Hand-maintained aliases (re-append after `npm run supabase:types`) ---
export type PublicPackSlotRow =
  Database['public']['Functions']['get_public_pack']['Returns'][number];
