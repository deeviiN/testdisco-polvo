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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      app_remote_commands: {
        Row: {
          command_type: string
          created_at: string | null
          created_by: string | null
          id: string
          payload: Json | null
        }
        Insert: {
          command_type: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          payload?: Json | null
        }
        Update: {
          command_type?: string
          created_at?: string | null
          created_by?: string | null
          id?: string
          payload?: Json | null
        }
        Relationships: []
      }
      app_version_manifest: {
        Row: {
          id: boolean
          latest_build_time: number
          latest_version: string
          minimum_supported_build_time: number
          minimum_supported_version: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          latest_build_time?: number
          latest_version?: string
          minimum_supported_build_time?: number
          minimum_supported_version?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          latest_build_time?: number
          latest_version?: string
          minimum_supported_build_time?: number
          minimum_supported_version?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      assinaturas: {
        Row: {
          created_at: string
          id: string
          school_id: string
          status: string
          tipo: string
          ultima_pagamento_id: string | null
          updated_at: string
          user_id: string | null
          validade: string
        }
        Insert: {
          created_at?: string
          id?: string
          school_id: string
          status?: string
          tipo: string
          ultima_pagamento_id?: string | null
          updated_at?: string
          user_id?: string | null
          validade: string
        }
        Update: {
          created_at?: string
          id?: string
          school_id?: string
          status?: string
          tipo?: string
          ultima_pagamento_id?: string | null
          updated_at?: string
          user_id?: string | null
          validade?: string
        }
        Relationships: [
          {
            foreignKeyName: "assinaturas_ultima_pagamento_id_fkey"
            columns: ["ultima_pagamento_id"]
            isOneToOne: false
            referencedRelation: "pagamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      assistant_classes: {
        Row: {
          assistant_user_id: string
          class_label: string
          created_at: string
          education_level: string | null
          id: string
          school_id: string
          shift: string | null
          updated_at: string
        }
        Insert: {
          assistant_user_id: string
          class_label: string
          created_at?: string
          education_level?: string | null
          id?: string
          school_id: string
          shift?: string | null
          updated_at?: string
        }
        Update: {
          assistant_user_id?: string
          class_label?: string
          created_at?: string
          education_level?: string | null
          id?: string
          school_id?: string
          shift?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      assistant_transfer_logs: {
        Row: {
          created_at: string
          from_user_id: string
          id: string
          note: string | null
          roster_ids: string[]
          school_id: string
          to_user_id: string
        }
        Insert: {
          created_at?: string
          from_user_id: string
          id?: string
          note?: string | null
          roster_ids: string[]
          school_id: string
          to_user_id: string
        }
        Update: {
          created_at?: string
          from_user_id?: string
          id?: string
          note?: string | null
          roster_ids?: string[]
          school_id?: string
          to_user_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          new_data: Json | null
          old_data: Json | null
          performed_by: string | null
          record_id: string | null
          school_id: string | null
          table_name: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          performed_by?: string | null
          record_id?: string | null
          school_id?: string | null
          table_name: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          new_data?: Json | null
          old_data?: Json | null
          performed_by?: string | null
          record_id?: string | null
          school_id?: string | null
          table_name?: string
        }
        Relationships: []
      }
      booking_gestor_history: {
        Row: {
          booking_id: string
          created_at: string
          decided_by: string | null
          decided_by_name: string | null
          decided_by_role: string | null
          gestor_response: string | null
          gestor_status: string
          id: string
          school_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          decided_by?: string | null
          decided_by_name?: string | null
          decided_by_role?: string | null
          gestor_response?: string | null
          gestor_status: string
          id?: string
          school_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          decided_by?: string | null
          decided_by_name?: string | null
          decided_by_role?: string | null
          gestor_response?: string | null
          gestor_status?: string
          id?: string
          school_id?: string
        }
        Relationships: []
      }
      booking_reminders_sent: {
        Row: {
          booking_id: string
          channel: string
          id: string
          minutes_before: number
          sent_at: string
          user_id: string
        }
        Insert: {
          booking_id: string
          channel: string
          id?: string
          minutes_before: number
          sent_at?: string
          user_id: string
        }
        Update: {
          booking_id?: string
          channel?: string
          id?: string
          minutes_before?: number
          sent_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "booking_reminders_sent_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      booking_usage: {
        Row: {
          booking_id: string
          created_at: string
          duration_minutes: number | null
          end_source: string | null
          ended_at: string | null
          id: string
          school_id: string
          start_source: string | null
          started_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          duration_minutes?: number | null
          end_source?: string | null
          ended_at?: string | null
          id?: string
          school_id: string
          start_source?: string | null
          started_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          duration_minutes?: number | null
          end_source?: string | null
          ended_at?: string | null
          id?: string
          school_id?: string
          start_source?: string | null
          started_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          booking_date: string
          cancelled_by_id: string | null
          cancelled_by_name: string | null
          cancelled_by_role: string | null
          created_at: string
          description: string | null
          discipline: string | null
          end_time: string
          event_type: string
          gestor_announcement: string | null
          gestor_communique: string | null
          gestor_responded_at: string | null
          gestor_responded_by: string | null
          gestor_response: string | null
          gestor_status: string
          id: string
          resources: string[] | null
          school_id: string
          sector: string
          start_time: string
          status: string
          topic: string | null
          updated_at: string
          user_id: string
          visitor_info: string | null
          visitor_name: string | null
        }
        Insert: {
          booking_date: string
          cancelled_by_id?: string | null
          cancelled_by_name?: string | null
          cancelled_by_role?: string | null
          created_at?: string
          description?: string | null
          discipline?: string | null
          end_time: string
          event_type?: string
          gestor_announcement?: string | null
          gestor_communique?: string | null
          gestor_responded_at?: string | null
          gestor_responded_by?: string | null
          gestor_response?: string | null
          gestor_status?: string
          id?: string
          resources?: string[] | null
          school_id: string
          sector?: string
          start_time: string
          status?: string
          topic?: string | null
          updated_at?: string
          user_id: string
          visitor_info?: string | null
          visitor_name?: string | null
        }
        Update: {
          booking_date?: string
          cancelled_by_id?: string | null
          cancelled_by_name?: string | null
          cancelled_by_role?: string | null
          created_at?: string
          description?: string | null
          discipline?: string | null
          end_time?: string
          event_type?: string
          gestor_announcement?: string | null
          gestor_communique?: string | null
          gestor_responded_at?: string | null
          gestor_responded_by?: string | null
          gestor_response?: string | null
          gestor_status?: string
          id?: string
          resources?: string[] | null
          school_id?: string
          sector?: string
          start_time?: string
          status?: string
          topic?: string | null
          updated_at?: string
          user_id?: string
          visitor_info?: string | null
          visitor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bookings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      company_settings: {
        Row: {
          address: string
          admin_signature_path: string | null
          cep: string
          city: string
          cnpj: string
          created_at: string
          email: string
          id: string
          neighborhood: string
          number: string
          phone: string
          razao_social: string
          representative_cpf: string
          representative_name: string
          state: string
          updated_at: string
        }
        Insert: {
          address?: string
          admin_signature_path?: string | null
          cep?: string
          city?: string
          cnpj?: string
          created_at?: string
          email?: string
          id?: string
          neighborhood?: string
          number?: string
          phone?: string
          razao_social?: string
          representative_cpf?: string
          representative_name?: string
          state?: string
          updated_at?: string
        }
        Update: {
          address?: string
          admin_signature_path?: string | null
          cep?: string
          city?: string
          cnpj?: string
          created_at?: string
          email?: string
          id?: string
          neighborhood?: string
          number?: string
          phone?: string
          razao_social?: string
          representative_cpf?: string
          representative_name?: string
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      contract_count_divergences: {
        Row: {
          created_at: string
          db_awaiting_admin: number
          db_awaiting_gestor: number
          db_gestor_signed: number
          detected_by: string | null
          id: string
          notes: string | null
          ui_awaiting_admin: number
          ui_awaiting_gestor: number
          ui_gestor_signed: number
        }
        Insert: {
          created_at?: string
          db_awaiting_admin?: number
          db_awaiting_gestor?: number
          db_gestor_signed?: number
          detected_by?: string | null
          id?: string
          notes?: string | null
          ui_awaiting_admin?: number
          ui_awaiting_gestor?: number
          ui_gestor_signed?: number
        }
        Update: {
          created_at?: string
          db_awaiting_admin?: number
          db_awaiting_gestor?: number
          db_gestor_signed?: number
          detected_by?: string | null
          id?: string
          notes?: string | null
          ui_awaiting_admin?: number
          ui_awaiting_gestor?: number
          ui_gestor_signed?: number
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          read_at: string | null
          recipient_id: string
          school_id: string
          sender_id: string
          sender_name: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id: string
          school_id: string
          sender_id: string
          sender_name: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          read_at?: string | null
          recipient_id?: string
          school_id?: string
          sender_id?: string
          sender_name?: string
        }
        Relationships: []
      }
      gov_logos: {
        Row: {
          city: string | null
          created_at: string
          id: string
          is_active: boolean
          label: string
          logo_url: string
          scope: string
          state: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          logo_url: string
          scope: string
          state?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          logo_url?: string
          scope?: string
          state?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      health_checks: {
        Row: {
          created_at: string
          details: Json | null
          duration_ms: number | null
          id: string
          service: string
          status: string
        }
        Insert: {
          created_at?: string
          details?: Json | null
          duration_ms?: number | null
          id?: string
          service: string
          status: string
        }
        Update: {
          created_at?: string
          details?: Json | null
          duration_ms?: number | null
          id?: string
          service?: string
          status?: string
        }
        Relationships: []
      }
      inbox_requests: {
        Row: {
          audience: string
          created_at: string
          description: string | null
          id: string
          is_read: boolean
          payload: Json
          requester_user_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          school_id: string | null
          status: string
          target_user_id: string | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          audience: string
          created_at?: string
          description?: string | null
          id?: string
          is_read?: boolean
          payload?: Json
          requester_user_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          school_id?: string | null
          status?: string
          target_user_id?: string | null
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          audience?: string
          created_at?: string
          description?: string | null
          id?: string
          is_read?: boolean
          payload?: Json
          requester_user_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          school_id?: string | null
          status?: string
          target_user_id?: string | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      mp_settings: {
        Row: {
          force_test_mode: boolean
          id: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          force_test_mode?: boolean
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          force_test_mode?: boolean
          id?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string | null
          data: Json | null
          id: string
          is_read: boolean | null
          title: string
          user_id: string | null
        }
        Insert: {
          body: string
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          title: string
          user_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string | null
          data?: Json | null
          id?: string
          is_read?: boolean | null
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      pagamentos: {
        Row: {
          approved_at: string | null
          auto_generated: boolean
          created_at: string
          cycle_month: string | null
          data_fim: string | null
          data_inicio: string | null
          due_date: string | null
          expires_at: string | null
          id: string
          init_point: string | null
          manually_marked_paid: boolean
          marked_paid_at: string | null
          marked_paid_by: string | null
          metodo: string
          mp_external_reference: string | null
          mp_payment_id: string | null
          mp_preference_id: string | null
          mp_raw: Json | null
          plano: string
          qr_code: string | null
          qr_code_base64: string | null
          school_id: string
          status: string
          ticket_url: string | null
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          approved_at?: string | null
          auto_generated?: boolean
          created_at?: string
          cycle_month?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          due_date?: string | null
          expires_at?: string | null
          id?: string
          init_point?: string | null
          manually_marked_paid?: boolean
          marked_paid_at?: string | null
          marked_paid_by?: string | null
          metodo: string
          mp_external_reference?: string | null
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          mp_raw?: Json | null
          plano: string
          qr_code?: string | null
          qr_code_base64?: string | null
          school_id: string
          status?: string
          ticket_url?: string | null
          updated_at?: string
          user_id: string
          valor: number
        }
        Update: {
          approved_at?: string | null
          auto_generated?: boolean
          created_at?: string
          cycle_month?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          due_date?: string | null
          expires_at?: string | null
          id?: string
          init_point?: string | null
          manually_marked_paid?: boolean
          marked_paid_at?: string | null
          marked_paid_by?: string | null
          metodo?: string
          mp_external_reference?: string | null
          mp_payment_id?: string | null
          mp_preference_id?: string | null
          mp_raw?: Json | null
          plano?: string
          qr_code?: string | null
          qr_code_base64?: string | null
          school_id?: string
          status?: string
          ticket_url?: string | null
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "pagamentos_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      panel_settings: {
        Row: {
          break_after_periods: Json
          created_at: string
          highlight_color: string
          marquee_message: string | null
          mostrar_aniv_servidores: boolean
          panel_title: string | null
          refresh_seconds: number
          school_id: string
          show_absent: boolean
          show_finished: boolean
          tv_brand: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          break_after_periods?: Json
          created_at?: string
          highlight_color?: string
          marquee_message?: string | null
          mostrar_aniv_servidores?: boolean
          panel_title?: string | null
          refresh_seconds?: number
          school_id: string
          show_absent?: boolean
          show_finished?: boolean
          tv_brand?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          break_after_periods?: Json
          created_at?: string
          highlight_color?: string
          marquee_message?: string | null
          mostrar_aniv_servidores?: boolean
          panel_title?: string | null
          refresh_seconds?: number
          school_id?: string
          show_absent?: boolean
          show_finished?: boolean
          tv_brand?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      payment_integration_logs: {
        Row: {
          created_at: string | null
          event_type: string
          id: string
          mp_payment_id: string | null
          pagamento_id: string | null
          payload: Json | null
          status_after: string | null
          status_before: string | null
        }
        Insert: {
          created_at?: string | null
          event_type: string
          id?: string
          mp_payment_id?: string | null
          pagamento_id?: string | null
          payload?: Json | null
          status_after?: string | null
          status_before?: string | null
        }
        Update: {
          created_at?: string | null
          event_type?: string
          id?: string
          mp_payment_id?: string | null
          pagamento_id?: string | null
          payload?: Json | null
          status_after?: string | null
          status_before?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_integration_logs_pagamento_id_fkey"
            columns: ["pagamento_id"]
            isOneToOne: false
            referencedRelation: "pagamentos"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_pix_payments: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          payment_id: string
          qr_code: string | null
          qr_code_base64: string | null
          school_id: string
          status: string
          ticket_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          payment_id: string
          qr_code?: string | null
          qr_code_base64?: string | null
          school_id: string
          status?: string
          ticket_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          payment_id?: string
          qr_code?: string | null
          qr_code_base64?: string | null
          school_id?: string
          status?: string
          ticket_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      processed_webhook_events: {
        Row: {
          id: string
          mp_payment_id: string
          mp_payment_id_norm: string | null
          pagamento_id: string | null
          processed_at: string
          request_id: string | null
          status: string
          status_norm: string | null
        }
        Insert: {
          id?: string
          mp_payment_id: string
          mp_payment_id_norm?: string | null
          pagamento_id?: string | null
          processed_at?: string
          request_id?: string | null
          status: string
          status_norm?: string | null
        }
        Update: {
          id?: string
          mp_payment_id?: string
          mp_payment_id_norm?: string | null
          pagamento_id?: string | null
          processed_at?: string
          request_id?: string | null
          status?: string
          status_norm?: string | null
        }
        Relationships: []
      }
      profile_approval_decisions: {
        Row: {
          acknowledged_at: string | null
          created_at: string
          decided_by: string | null
          decided_by_name: string | null
          decision: string
          email: string | null
          full_name: string
          id: string
          intended_role: string | null
          phone: string | null
          reason: string | null
          school_id: string
          user_id: string
        }
        Insert: {
          acknowledged_at?: string | null
          created_at?: string
          decided_by?: string | null
          decided_by_name?: string | null
          decision: string
          email?: string | null
          full_name: string
          id?: string
          intended_role?: string | null
          phone?: string | null
          reason?: string | null
          school_id: string
          user_id: string
        }
        Update: {
          acknowledged_at?: string | null
          created_at?: string
          decided_by?: string | null
          decided_by_name?: string | null
          decision?: string
          email?: string | null
          full_name?: string
          id?: string
          intended_role?: string | null
          phone?: string | null
          reason?: string | null
          school_id?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address_cep: string | null
          address_city: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          approved_until: string | null
          cpf: string | null
          created_at: string
          discipline_blocked_at: string | null
          discipline_status: string
          discipline_suspended_until: string | null
          discipline_total_infractions: number
          discipline_unblocked_count: number
          full_name: string
          gender: string | null
          id: string
          id_doc_back_path: string | null
          id_doc_front_path: string | null
          id_doc_uploaded_at: string | null
          intended_role: string | null
          is_approved: boolean
          occupation: string | null
          occupation_detail: string | null
          payment_status: string | null
          phone: string | null
          plan_expires_at: string | null
          rejection_reason: string | null
          role: string
          school_id: string | null
          signature_url: string | null
          subscription_blocked_at: string | null
          subscription_deadline: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address_cep?: string | null
          address_city?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          approved_until?: string | null
          cpf?: string | null
          created_at?: string
          discipline_blocked_at?: string | null
          discipline_status?: string
          discipline_suspended_until?: string | null
          discipline_total_infractions?: number
          discipline_unblocked_count?: number
          full_name: string
          gender?: string | null
          id?: string
          id_doc_back_path?: string | null
          id_doc_front_path?: string | null
          id_doc_uploaded_at?: string | null
          intended_role?: string | null
          is_approved?: boolean
          occupation?: string | null
          occupation_detail?: string | null
          payment_status?: string | null
          phone?: string | null
          plan_expires_at?: string | null
          rejection_reason?: string | null
          role?: string
          school_id?: string | null
          signature_url?: string | null
          subscription_blocked_at?: string | null
          subscription_deadline?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address_cep?: string | null
          address_city?: string | null
          address_neighborhood?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          approved_until?: string | null
          cpf?: string | null
          created_at?: string
          discipline_blocked_at?: string | null
          discipline_status?: string
          discipline_suspended_until?: string | null
          discipline_total_infractions?: number
          discipline_unblocked_count?: number
          full_name?: string
          gender?: string | null
          id?: string
          id_doc_back_path?: string | null
          id_doc_front_path?: string | null
          id_doc_uploaded_at?: string | null
          intended_role?: string | null
          is_approved?: boolean
          occupation?: string | null
          occupation_detail?: string | null
          payment_status?: string | null
          phone?: string | null
          plan_expires_at?: string | null
          rejection_reason?: string | null
          role?: string
          school_id?: string | null
          signature_url?: string | null
          subscription_blocked_at?: string | null
          subscription_deadline?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string | null
          id: string
          platform: string | null
          token: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          platform?: string | null
          token: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          platform?: string | null
          token?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      reassignment_invites: {
        Row: {
          absent_period_number: number
          absent_roster_id: string
          absent_teacher_name: string | null
          attempt: number
          class_name: string | null
          covering_end_time: string | null
          covering_period_number: number
          covering_roster_id: string
          covering_teacher_name: string | null
          created_at: string
          created_by: string | null
          excluded_roster_ids: string[]
          id: string
          invite_date: string
          reason: string
          responded_at: string | null
          school_id: string
          shift: string | null
          status: string
          updated_at: string
        }
        Insert: {
          absent_period_number: number
          absent_roster_id: string
          absent_teacher_name?: string | null
          attempt?: number
          class_name?: string | null
          covering_end_time?: string | null
          covering_period_number: number
          covering_roster_id: string
          covering_teacher_name?: string | null
          created_at?: string
          created_by?: string | null
          excluded_roster_ids?: string[]
          id?: string
          invite_date?: string
          reason?: string
          responded_at?: string | null
          school_id: string
          shift?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          absent_period_number?: number
          absent_roster_id?: string
          absent_teacher_name?: string | null
          attempt?: number
          class_name?: string | null
          covering_end_time?: string | null
          covering_period_number?: number
          covering_roster_id?: string
          covering_teacher_name?: string | null
          created_at?: string
          created_by?: string | null
          excluded_roster_ids?: string[]
          id?: string
          invite_date?: string
          reason?: string
          responded_at?: string | null
          school_id?: string
          shift?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      responsibility_transfers: {
        Row: {
          approved_by: string | null
          booking_id: string
          created_at: string
          from_user_id: string
          id: string
          reason: string | null
          requested_at: string
          responded_at: string | null
          school_id: string
          status: string
          to_user_id: string
        }
        Insert: {
          approved_by?: string | null
          booking_id: string
          created_at?: string
          from_user_id: string
          id?: string
          reason?: string | null
          requested_at?: string
          responded_at?: string | null
          school_id: string
          status?: string
          to_user_id: string
        }
        Update: {
          approved_by?: string | null
          booking_id?: string
          created_at?: string
          from_user_id?: string
          id?: string
          reason?: string | null
          requested_at?: string
          responded_at?: string | null
          school_id?: string
          status?: string
          to_user_id?: string
        }
        Relationships: []
      }
      room_reassignments: {
        Row: {
          absent_period_number: number
          absent_roster_id: string | null
          absent_teacher_name: string
          cancelled_at: string | null
          cancelled_by: string | null
          class_name: string
          covering_original_period: number
          covering_roster_id: string | null
          covering_teacher_name: string
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          reason: string
          reassignment_date: string
          school_id: string
          shift: string
          vacated_end_time: string | null
          vacated_period_number: number
        }
        Insert: {
          absent_period_number: number
          absent_roster_id?: string | null
          absent_teacher_name: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          class_name: string
          covering_original_period: number
          covering_roster_id?: string | null
          covering_teacher_name: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          reason?: string
          reassignment_date: string
          school_id: string
          shift: string
          vacated_end_time?: string | null
          vacated_period_number: number
        }
        Update: {
          absent_period_number?: number
          absent_roster_id?: string | null
          absent_teacher_name?: string
          cancelled_at?: string | null
          cancelled_by?: string | null
          class_name?: string
          covering_original_period?: number
          covering_roster_id?: string | null
          covering_teacher_name?: string
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          reason?: string
          reassignment_date?: string
          school_id?: string
          shift?: string
          vacated_end_time?: string | null
          vacated_period_number?: number
        }
        Relationships: []
      }
      roster_call_settings: {
        Row: {
          created_at: string
          school_id: string
          tolerance_manha: number
          tolerance_noite: number
          tolerance_tarde: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          school_id: string
          tolerance_manha?: number
          tolerance_noite?: number
          tolerance_tarde?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          school_id?: string
          tolerance_manha?: number
          tolerance_noite?: number
          tolerance_tarde?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      schedule_change_logs: {
        Row: {
          actor_name: string
          actor_role: string
          actor_user_id: string
          change_type: string
          created_at: string
          details: Json
          id: string
          reduced_date: string | null
          school_id: string
          shift: string | null
          summary: string
        }
        Insert: {
          actor_name: string
          actor_role: string
          actor_user_id: string
          change_type: string
          created_at?: string
          details?: Json
          id?: string
          reduced_date?: string | null
          school_id: string
          shift?: string | null
          summary: string
        }
        Update: {
          actor_name?: string
          actor_role?: string
          actor_user_id?: string
          change_type?: string
          created_at?: string
          details?: Json
          id?: string
          reduced_date?: string | null
          school_id?: string
          shift?: string | null
          summary?: string
        }
        Relationships: []
      }
      schedule_periods: {
        Row: {
          created_at: string
          end_siren: string
          end_time: string
          id: string
          label: string
          period_number: number
          school_id: string
          shift: string
          start_siren: string
          start_time: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_siren?: string
          end_time: string
          id?: string
          label: string
          period_number: number
          school_id: string
          shift: string
          start_siren?: string
          start_time: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_siren?: string
          end_time?: string
          id?: string
          label?: string
          period_number?: number
          school_id?: string
          shift?: string
          start_siren?: string
          start_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      schedule_reduced_days: {
        Row: {
          created_at: string
          created_by: string | null
          end_siren: string
          end_time: string
          id: string
          label: string
          period_number: number
          reduced_date: string
          school_id: string
          shift: string
          start_siren: string
          start_time: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_siren?: string
          end_time: string
          id?: string
          label: string
          period_number: number
          reduced_date: string
          school_id: string
          shift: string
          start_siren?: string
          start_time: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_siren?: string
          end_time?: string
          id?: string
          label?: string
          period_number?: number
          reduced_date?: string
          school_id?: string
          shift?: string
          start_siren?: string
          start_time?: string
        }
        Relationships: []
      }
      school_discipline_settings: {
        Row: {
          auto_block: boolean
          block_duration_minutes: number
          checkin_tolerance_minutes: number
          created_at: string
          infractions_threshold: number
          manager_review: boolean
          school_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auto_block?: boolean
          block_duration_minutes?: number
          checkin_tolerance_minutes?: number
          created_at?: string
          infractions_threshold?: number
          manager_review?: boolean
          school_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auto_block?: boolean
          block_duration_minutes?: number
          checkin_tolerance_minutes?: number
          created_at?: string
          infractions_threshold?: number
          manager_review?: boolean
          school_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      school_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          school_id: string
          sender_name: string
          sender_user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          school_id: string
          sender_name: string
          sender_user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          school_id?: string
          sender_name?: string
          sender_user_id?: string
        }
        Relationships: []
      }
      school_siren_settings: {
        Row: {
          enabled: boolean
          long_seconds: number
          school_id: string
          short_seconds: number
          siren_kind: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          enabled?: boolean
          long_seconds?: number
          school_id: string
          short_seconds?: number
          siren_kind?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          enabled?: boolean
          long_seconds?: number
          school_id?: string
          short_seconds?: number
          siren_kind?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "school_siren_settings_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: true
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_transfer_requests: {
        Row: {
          created_at: string
          from_school_id: string
          id: string
          reason: string | null
          requested_role: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          to_school_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          from_school_id: string
          id?: string
          reason?: string | null
          requested_role?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          to_school_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          from_school_id?: string
          id?: string
          reason?: string | null
          requested_role?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          to_school_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      schools: {
        Row: {
          address: string | null
          city: string
          contract_version: string | null
          created_at: string
          gov_logo_url: string | null
          grace_period_days: number
          id: string
          inep_code: string | null
          is_active: boolean
          logo_url: string | null
          name: string
          network: string
          payment_plan: string | null
          state: string
          subscription_end_date: string | null
          subscription_status: string
        }
        Insert: {
          address?: string | null
          city: string
          contract_version?: string | null
          created_at?: string
          gov_logo_url?: string | null
          grace_period_days?: number
          id?: string
          inep_code?: string | null
          is_active?: boolean
          logo_url?: string | null
          name: string
          network?: string
          payment_plan?: string | null
          state: string
          subscription_end_date?: string | null
          subscription_status?: string
        }
        Update: {
          address?: string | null
          city?: string
          contract_version?: string | null
          created_at?: string
          gov_logo_url?: string | null
          grace_period_days?: number
          id?: string
          inep_code?: string | null
          is_active?: boolean
          logo_url?: string | null
          name?: string
          network?: string
          payment_plan?: string | null
          state?: string
          subscription_end_date?: string | null
          subscription_status?: string
        }
        Relationships: []
      }
      sector_labels: {
        Row: {
          created_at: string
          custom_label: string
          id: string
          school_id: string
          sector_key: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          custom_label: string
          id?: string
          school_id: string
          sector_key: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          custom_label?: string
          id?: string
          school_id?: string
          sector_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      security_finding_actions: {
        Row: {
          acted_at: string
          acted_by: string | null
          created_at: string
          explanation: string | null
          finding_id: string
          finding_name: string | null
          id: string
          level: string | null
          scan_timestamp: string | null
          scanner_name: string
          status: string
        }
        Insert: {
          acted_at?: string
          acted_by?: string | null
          created_at?: string
          explanation?: string | null
          finding_id: string
          finding_name?: string | null
          id?: string
          level?: string | null
          scan_timestamp?: string | null
          scanner_name: string
          status: string
        }
        Update: {
          acted_at?: string
          acted_by?: string | null
          created_at?: string
          explanation?: string | null
          finding_id?: string
          finding_name?: string | null
          id?: string
          level?: string | null
          scan_timestamp?: string | null
          scanner_name?: string
          status?: string
        }
        Relationships: []
      }
      security_linter_reports: {
        Row: {
          created_at: string | null
          diff_summary: string | null
          id: string
          issue_count: number
          raw_output: string | null
          scan_date: string | null
        }
        Insert: {
          created_at?: string | null
          diff_summary?: string | null
          id?: string
          issue_count: number
          raw_output?: string | null
          scan_date?: string | null
        }
        Update: {
          created_at?: string | null
          diff_summary?: string | null
          id?: string
          issue_count?: number
          raw_output?: string | null
          scan_date?: string | null
        }
        Relationships: []
      }
      servidores_aniversariantes: {
        Row: {
          cargo: string | null
          created_at: string
          created_by: string | null
          dia: number
          foto_url: string | null
          id: string
          mes: number
          nome: string
          school_id: string
          setor: string | null
          updated_at: string
        }
        Insert: {
          cargo?: string | null
          created_at?: string
          created_by?: string | null
          dia: number
          foto_url?: string | null
          id?: string
          mes: number
          nome: string
          school_id: string
          setor?: string | null
          updated_at?: string
        }
        Update: {
          cargo?: string | null
          created_at?: string
          created_by?: string | null
          dia?: number
          foto_url?: string | null
          id?: string
          mes?: number
          nome?: string
          school_id?: string
          setor?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "servidores_aniversariantes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          created_at: string | null
          description: string | null
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          created_at?: string | null
          description?: string | null
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      shift_push_dispatch_log: {
        Row: {
          created_at: string
          dispatch_date: string
          id: string
          period_id: string
          school_id: string
        }
        Insert: {
          created_at?: string
          dispatch_date: string
          id?: string
          period_id: string
          school_id: string
        }
        Update: {
          created_at?: string
          dispatch_date?: string
          id?: string
          period_id?: string
          school_id?: string
        }
        Relationships: []
      }
      signed_contracts: {
        Row: {
          accepted_at: string | null
          accepted_full_name: string | null
          accepted_geo_lat: number | null
          accepted_geo_lng: number | null
          accepted_ip: unknown
          accepted_user_agent: string | null
          contract_version: string | null
          document_hash: string | null
          file_name: string
          file_path: string
          file_size: number | null
          gestor_cpf: string | null
          id: string
          reacceptance: boolean
          school_id: string
          signer_role: string
          status: string
          uploaded_at: string
          uploaded_by: string
          verification_token: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_full_name?: string | null
          accepted_geo_lat?: number | null
          accepted_geo_lng?: number | null
          accepted_ip?: unknown
          accepted_user_agent?: string | null
          contract_version?: string | null
          document_hash?: string | null
          file_name: string
          file_path: string
          file_size?: number | null
          gestor_cpf?: string | null
          id?: string
          reacceptance?: boolean
          school_id: string
          signer_role?: string
          status?: string
          uploaded_at?: string
          uploaded_by: string
          verification_token?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_full_name?: string | null
          accepted_geo_lat?: number | null
          accepted_geo_lng?: number | null
          accepted_ip?: unknown
          accepted_user_agent?: string | null
          contract_version?: string | null
          document_hash?: string | null
          file_name?: string
          file_path?: string
          file_size?: number | null
          gestor_cpf?: string | null
          id?: string
          reacceptance?: boolean
          school_id?: string
          signer_role?: string
          status?: string
          uploaded_at?: string
          uploaded_by?: string
          verification_token?: string | null
        }
        Relationships: []
      }
      subscription_notifications: {
        Row: {
          acted_by: string | null
          channel: string
          created_at: string
          error_message: string | null
          event_type: string
          gestor_user_id: string | null
          id: string
          message: string
          recipient: string
          scheduled_at: string
          school_id: string
          sent_at: string | null
          status: string
          subject: string | null
        }
        Insert: {
          acted_by?: string | null
          channel: string
          created_at?: string
          error_message?: string | null
          event_type: string
          gestor_user_id?: string | null
          id?: string
          message: string
          recipient: string
          scheduled_at?: string
          school_id: string
          sent_at?: string | null
          status?: string
          subject?: string | null
        }
        Update: {
          acted_by?: string | null
          channel?: string
          created_at?: string
          error_message?: string | null
          event_type?: string
          gestor_user_id?: string | null
          id?: string
          message?: string
          recipient?: string
          scheduled_at?: string
          school_id?: string
          sent_at?: string | null
          status?: string
          subject?: string | null
        }
        Relationships: []
      }
      support_settings: {
        Row: {
          display_label: string
          id: boolean
          updated_at: string
          updated_by: string | null
          whatsapp_number: string
        }
        Insert: {
          display_label?: string
          id?: boolean
          updated_at?: string
          updated_by?: string | null
          whatsapp_number?: string
        }
        Update: {
          display_label?: string
          id?: boolean
          updated_at?: string
          updated_by?: string | null
          whatsapp_number?: string
        }
        Relationships: []
      }
      teacher_day_absence: {
        Row: {
          absence_date: string
          created_at: string
          from_period: number | null
          id: string
          marked_by: string | null
          reason: string
          school_id: string
          teacher_name: string
          updated_at: string
        }
        Insert: {
          absence_date: string
          created_at?: string
          from_period?: number | null
          id?: string
          marked_by?: string | null
          reason?: string
          school_id: string
          teacher_name: string
          updated_at?: string
        }
        Update: {
          absence_date?: string
          created_at?: string
          from_period?: number | null
          id?: string
          marked_by?: string | null
          reason?: string
          school_id?: string
          teacher_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      teacher_presence: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          marked_at: string
          marked_by: string
          notes: string | null
          school_id: string
          status: string
          teacher_user_id: string
          updated_at: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          marked_at?: string
          marked_by: string
          notes?: string | null
          school_id: string
          status: string
          teacher_user_id: string
          updated_at?: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          marked_at?: string
          marked_by?: string
          notes?: string | null
          school_id?: string
          status?: string
          teacher_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      teacher_roster: {
        Row: {
          assistant_user_id: string
          block_name: string | null
          class_name: string | null
          created_at: string
          discipline: string | null
          end_time: string
          id: string
          nickname: string | null
          notes: string | null
          original_assistant_user_id: string | null
          period_id: string | null
          room_name: string | null
          school_id: string
          shift: string | null
          start_time: string
          teacher_name: string
          updated_at: string
          weekday: number
        }
        Insert: {
          assistant_user_id: string
          block_name?: string | null
          class_name?: string | null
          created_at?: string
          discipline?: string | null
          end_time: string
          id?: string
          nickname?: string | null
          notes?: string | null
          original_assistant_user_id?: string | null
          period_id?: string | null
          room_name?: string | null
          school_id: string
          shift?: string | null
          start_time: string
          teacher_name: string
          updated_at?: string
          weekday: number
        }
        Update: {
          assistant_user_id?: string
          block_name?: string | null
          class_name?: string | null
          created_at?: string
          discipline?: string | null
          end_time?: string
          id?: string
          nickname?: string | null
          notes?: string | null
          original_assistant_user_id?: string | null
          period_id?: string | null
          room_name?: string | null
          school_id?: string
          shift?: string | null
          start_time?: string
          teacher_name?: string
          updated_at?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "teacher_roster_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "schedule_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      teacher_roster_presence: {
        Row: {
          created_at: string
          id: string
          marked_by: string | null
          notes: string | null
          period_number: number
          presence_date: string
          roster_id: string
          school_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          marked_by?: string | null
          notes?: string | null
          period_number: number
          presence_date: string
          roster_id: string
          school_id: string
          status: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          marked_by?: string | null
          notes?: string | null
          period_number?: number
          presence_date?: string
          roster_id?: string
          school_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "teacher_roster_presence_roster_id_fkey"
            columns: ["roster_id"]
            isOneToOne: false
            referencedRelation: "teacher_roster"
            referencedColumns: ["id"]
          },
        ]
      }
      tolerance_push_dispatch_log: {
        Row: {
          created_at: string
          dispatch_date: string
          id: string
          period_id: string
          school_id: string
        }
        Insert: {
          created_at?: string
          dispatch_date: string
          id?: string
          period_id: string
          school_id: string
        }
        Update: {
          created_at?: string
          dispatch_date?: string
          id?: string
          period_id?: string
          school_id?: string
        }
        Relationships: []
      }
      user_document_views: {
        Row: {
          folder_key: string
          last_viewed_at: string
          user_id: string
        }
        Insert: {
          folder_key: string
          last_viewed_at?: string
          user_id: string
        }
        Update: {
          folder_key?: string
          last_viewed_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_infractions: {
        Row: {
          booking_id: string
          created_at: string
          id: string
          school_id: string
          type: string
          user_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          id?: string
          school_id: string
          type: string
          user_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          id?: string
          school_id?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      webauthn_challenges: {
        Row: {
          challenge: string
          created_at: string
          email: string | null
          id: string
          type: string
          user_id: string | null
        }
        Insert: {
          challenge: string
          created_at?: string
          email?: string | null
          id?: string
          type: string
          user_id?: string | null
        }
        Update: {
          challenge?: string
          created_at?: string
          email?: string | null
          id?: string
          type?: string
          user_id?: string | null
        }
        Relationships: []
      }
      webauthn_credentials: {
        Row: {
          counter: number
          created_at: string
          credential_id: string
          device_name: string | null
          id: string
          public_key: string
          user_id: string
        }
        Insert: {
          counter?: number
          created_at?: string
          credential_id: string
          device_name?: string | null
          id?: string
          public_key: string
          user_id: string
        }
        Update: {
          counter?: number
          created_at?: string
          credential_id?: string
          device_name?: string | null
          id?: string
          public_key?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_contract_electronically: {
        Args: {
          _accepted_full_name?: string
          _accepted_geo_lat?: number
          _accepted_geo_lng?: number
          _accepted_ip: unknown
          _accepted_user_agent: string
          _contract_version: string
          _document_hash?: string
          _file_name: string
          _file_path: string
          _file_size: number
          _gestor_cpf: string
          _reacceptance?: boolean
          _school_id: string
          _verification_token?: string
        }
        Returns: {
          id: string
          verification_token: string
        }[]
      }
      activate_school_subscription: {
        Args: { _new_end_date: string; _school_id: string }
        Returns: undefined
      }
      admin_approve_gestor_trial: {
        Args: { _profile_id: string }
        Returns: {
          address_cep: string | null
          address_city: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          approved_until: string | null
          cpf: string | null
          created_at: string
          discipline_blocked_at: string | null
          discipline_status: string
          discipline_suspended_until: string | null
          discipline_total_infractions: number
          discipline_unblocked_count: number
          full_name: string
          gender: string | null
          id: string
          id_doc_back_path: string | null
          id_doc_front_path: string | null
          id_doc_uploaded_at: string | null
          intended_role: string | null
          is_approved: boolean
          occupation: string | null
          occupation_detail: string | null
          payment_status: string | null
          phone: string | null
          plan_expires_at: string | null
          rejection_reason: string | null
          role: string
          school_id: string | null
          signature_url: string | null
          subscription_blocked_at: string | null
          subscription_deadline: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_fix_school_subscription: {
        Args: {
          _end_date: string
          _reason: string
          _school_id: string
          _status: string
        }
        Returns: Json
      }
      admin_get_user_console: { Args: { _user_id: string }; Returns: Json }
      admin_global_kpis: { Args: never; Returns: Json }
      admin_list_audit_logs: {
        Args: {
          _action?: string
          _from?: string
          _limit?: number
          _offset?: number
          _school_id?: string
          _table_name?: string
          _to?: string
          _user_id?: string
        }
        Returns: {
          action: string
          created_at: string
          id: string
          new_data: Json
          old_data: Json
          performed_by: string
          performed_by_name: string
          record_id: string
          school_id: string
          school_name: string
          table_name: string
          total_count: number
        }[]
      }
      admin_list_blocked_by_deadline: {
        Args: never
        Returns: {
          approved_until: string
          city: string
          days_blocked: number
          full_name: string
          network: string
          phone: string
          role: string
          school_id: string
          school_name: string
          state: string
          subscription_blocked_at: string
          subscription_deadline: string
          user_id: string
        }[]
      }
      admin_list_schools_console: {
        Args: {
          _city?: string
          _limit?: number
          _network?: string
          _offset?: number
          _search?: string
          _state?: string
          _status?: string
        }
        Returns: {
          city: string
          days_left: number
          gestores_count: number
          id: string
          inep_code: string
          is_active: boolean
          name: string
          network: string
          pending_count: number
          state: string
          subscription_end_date: string
          subscription_status: string
          total_count: number
          users_count: number
        }[]
      }
      admin_list_users_with_auth: {
        Args: {
          _approved?: boolean
          _limit?: number
          _offset?: number
          _role?: string
          _school_id?: string
          _search?: string
        }
        Returns: {
          created_at: string
          discipline_status: string
          email: string
          email_confirmed_at: string
          full_name: string
          intended_role: string
          is_approved: boolean
          last_sign_in_at: string
          phone: string
          profile_id: string
          providers: Json
          role: string
          school_id: string
          school_name: string
          total_count: number
          user_id: string
        }[]
      }
      admin_log_action: {
        Args: {
          _action: string
          _new?: Json
          _old?: Json
          _reason?: string
          _record_id?: string
          _school_id?: string
          _table_name?: string
        }
        Returns: string
      }
      admin_log_impersonation: {
        Args: { _phase: string; _reason?: string; _school_id: string }
        Returns: Json
      }
      admin_log_profile_deletion: {
        Args: {
          _full_name: string
          _profile_id: string
          _reason?: string
          _user_id: string
        }
        Returns: undefined
      }
      admin_purge_contracts: { Args: { _school_id?: string }; Returns: Json }
      admin_purge_profiles: { Args: { _school_id?: string }; Returns: Json }
      admin_reactivate_blocked_user: {
        Args: { _grace_days?: number; _user_id: string }
        Returns: Json
      }
      admin_revoke_profile_access: {
        Args: { _profile_id: string; _reason?: string }
        Returns: {
          address_cep: string | null
          address_city: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          approved_until: string | null
          cpf: string | null
          created_at: string
          discipline_blocked_at: string | null
          discipline_status: string
          discipline_suspended_until: string | null
          discipline_total_infractions: number
          discipline_unblocked_count: number
          full_name: string
          gender: string | null
          id: string
          id_doc_back_path: string | null
          id_doc_front_path: string | null
          id_doc_uploaded_at: string | null
          intended_role: string | null
          is_approved: boolean
          occupation: string | null
          occupation_detail: string | null
          payment_status: string | null
          phone: string | null
          plan_expires_at: string | null
          rejection_reason: string | null
          role: string
          school_id: string | null
          signature_url: string | null
          subscription_blocked_at: string | null
          subscription_deadline: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_user_approval: {
        Args: { _approved: boolean; _reason: string; _user_id: string }
        Returns: Json
      }
      admin_set_user_blocked: {
        Args: { _blocked: boolean; _reason: string; _user_id: string }
        Returns: Json
      }
      admin_set_user_role: {
        Args: { _reason: string; _role: string; _user_id: string }
        Returns: Json
      }
      admin_unlink_self_profile: { Args: never; Returns: Json }
      apply_teacher_day_absence:
        | {
            Args: {
              p_date: string
              p_marked_by: string
              p_school_id: string
              p_teacher_name: string
            }
            Returns: number
          }
        | {
            Args: {
              p_date: string
              p_from_period?: number
              p_marked_by: string
              p_school_id: string
              p_teacher_name: string
            }
            Returns: number
          }
      approve_school_transfer: {
        Args: { _note?: string; _request_id: string }
        Returns: {
          created_at: string
          from_school_id: string
          id: string
          reason: string | null
          requested_role: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          to_school_id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "school_transfer_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      broadcast_app_refresh: { Args: never; Returns: undefined }
      bulk_set_schools_status: { Args: { _status: string }; Returns: Json[] }
      claim_absent_booking: {
        Args: { _booking_id: string }
        Returns: {
          booking_date: string
          cancelled_by_id: string | null
          cancelled_by_name: string | null
          cancelled_by_role: string | null
          created_at: string
          description: string | null
          discipline: string | null
          end_time: string
          event_type: string
          gestor_announcement: string | null
          gestor_communique: string | null
          gestor_responded_at: string | null
          gestor_responded_by: string | null
          gestor_response: string | null
          gestor_status: string
          id: string
          resources: string[] | null
          school_id: string
          sector: string
          start_time: string
          status: string
          topic: string | null
          updated_at: string
          user_id: string
          visitor_info: string | null
          visitor_name: string | null
        }
        SetofOptions: {
          from: "*"
          to: "bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cleanup_old_health_checks: { Args: never; Returns: undefined }
      cleanup_old_linter_reports: { Args: never; Returns: undefined }
      cleanup_push_subscription: {
        Args: { _endpoint: string }
        Returns: undefined
      }
      coord_reassign_assistant_rosters: {
        Args: {
          _from_user: string
          _note?: string
          _roster_ids: string[]
          _to_user: string
        }
        Returns: Json
      }
      create_reassignment_invite: {
        Args: {
          p_absent_period: number
          p_absent_roster_id: string
          p_excluded?: string[]
        }
        Returns: string
      }
      detect_infractions_daily: { Args: never; Returns: Json }
      enqueue_subscription_notifications: { Args: never; Returns: number }
      ensure_admin_profile: {
        Args: never
        Returns: {
          address_cep: string | null
          address_city: string | null
          address_neighborhood: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          approved_until: string | null
          cpf: string | null
          created_at: string
          discipline_blocked_at: string | null
          discipline_status: string
          discipline_suspended_until: string | null
          discipline_total_infractions: number
          discipline_unblocked_count: number
          full_name: string
          gender: string | null
          id: string
          id_doc_back_path: string | null
          id_doc_front_path: string | null
          id_doc_uploaded_at: string | null
          intended_role: string | null
          is_approved: boolean
          occupation: string | null
          occupation_detail: string | null
          payment_status: string | null
          phone: string | null
          plan_expires_at: string | null
          rejection_reason: string | null
          role: string
          school_id: string | null
          signature_url: string | null
          subscription_blocked_at: string | null
          subscription_deadline: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      find_school_by_inep: {
        Args: { _inep_code: string; _network?: string }
        Returns: {
          city: string
          id: string
          inep_code: string
          name: string
          state: string
        }[]
      }
      get_admin_dashboard_counts: {
        Args: never
        Returns: {
          approved_users: number
          pending_users: number
          subscribed_schools: number
          total_bookings: number
          total_schools: number
          total_users: number
        }[]
      }
      get_app_version_manifest: {
        Args: never
        Returns: {
          latest_build_time: number
          latest_version: string
          minimum_supported_build_time: number
          minimum_supported_version: string
          updated_at: string
        }[]
      }
      get_contract_pending_counts: {
        Args: never
        Returns: {
          awaiting_admin: number
          awaiting_gestor: number
          completed: number
          gestor_signed: number
          total_schools: number
        }[]
      }
      get_mp_force_test_mode: { Args: never; Returns: boolean }
      get_my_assinatura: {
        Args: never
        Returns: {
          created_at: string
          id: string
          school_id: string
          status: string
          tipo: string
          ultima_pagamento_id: string | null
          updated_at: string
          user_id: string | null
          validade: string
        }
        SetofOptions: {
          from: "*"
          to: "assinaturas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_my_latest_decision: {
        Args: never
        Returns: {
          acknowledged_at: string | null
          created_at: string
          decided_by: string | null
          decided_by_name: string | null
          decision: string
          email: string | null
          full_name: string
          id: string
          intended_role: string | null
          phone: string | null
          reason: string | null
          school_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "profile_approval_decisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_my_school_trial_phase: {
        Args: never
        Returns: {
          allowed_sector: string
          days_since_approval: number
          phase: string
          subscription_active: boolean
          trial_start: string
        }[]
      }
      get_my_subscription_deadline: {
        Args: never
        Returns: {
          days_remaining: number
          grace_period_days: number
          in_grace: boolean
          is_blocked: boolean
          school_name: string
          school_phone: string
          subscription_deadline: string
        }[]
      }
      get_my_trial_status: {
        Args: never
        Returns: {
          approved_until: string
          is_approved: boolean
          school_subscription_end_date: string
          school_subscription_status: string
          subscription_source: string
          trial_expired: boolean
        }[]
      }
      get_painel_aniversariantes: {
        Args: { _ref_date?: string; _school_id: string }
        Returns: {
          cargo: string
          dia: number
          foto_url: string
          id: string
          mes: number
          nome: string
          setor: string
        }[]
      }
      get_painel_tv_data: {
        Args: { _school_id: string; _weekday_override?: number }
        Returns: Json
      }
      get_pending_booking_reminders: {
        Args: never
        Returns: {
          booking_date: string
          booking_id: string
          minutes_before: number
          minutes_left: number
          school_id: string
          sector: string
          start_time: string
          topic: string
          user_id: string
        }[]
      }
      get_plan_migration_quote: {
        Args: { _school_id?: string }
        Returns: {
          cycle_start: string
          meses_ciclo: number
          meses_pagos: number
          meses_restantes: number
          school_id: string
          valor_mensal: number
          valor_total: number
        }[]
      }
      get_remaining_year_quote: {
        Args: { _school_id?: string }
        Returns: {
          cycle_start: string
          desconto_pct: number
          meses_ciclo: number
          meses_pagos: number
          meses_restantes: number
          school_id: string
          valor_mensal: number
          valor_total: number
        }[]
      }
      get_school_access_info: {
        Args: { _school_id: string }
        Returns: {
          access_level: string
          days_remaining: number
          grace_period_days: number
          subscription_end_date: string
          subscription_status: string
        }[]
      }
      get_school_access_level: { Args: { _school_id: string }; Returns: string }
      get_school_bookings_public: {
        Args: { _school_id: string }
        Returns: {
          booking_date: string
          description: string
          discipline: string
          end_time: string
          event_type: string
          id: string
          sector: string
          start_time: string
          status: string
          topic: string
          user_full_name: string
        }[]
      }
      get_school_gestor_public: {
        Args: { _school_id: string }
        Returns: {
          full_name: string
          phone: string
        }[]
      }
      get_school_public_info: {
        Args: { _school_id: string }
        Returns: {
          address: string
          city: string
          id: string
          inep_code: string
          is_active: boolean
          logo_url: string
          name: string
          network: string
          state: string
        }[]
      }
      get_school_subscription_admin: {
        Args: { _school_id: string }
        Returns: {
          grace_period_days: number
          subscription_end_date: string
          subscription_status: string
        }[]
      }
      get_school_subscription_countdown: {
        Args: { _school_id: string }
        Returns: number
      }
      get_school_trial_phase: {
        Args: { _school_id: string }
        Returns: {
          allowed_sector: string
          days_since_approval: number
          phase: string
          subscription_active: boolean
          trial_start: string
        }[]
      }
      get_security_definer_functions: {
        Args: never
        Returns: {
          anon: boolean
          auth: boolean
          name: string
        }[]
      }
      get_server_time: { Args: never; Returns: string }
      get_user_school_id: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_chef_of_school: {
        Args: { _school_id: string; _user_id: string }
        Returns: boolean
      }
      is_user_approved: { Args: { _uid: string }; Returns: boolean }
      liberar_assinatura: {
        Args: { _pagamento_id: string }
        Returns: {
          created_at: string
          id: string
          school_id: string
          status: string
          tipo: string
          ultima_pagamento_id: string | null
          updated_at: string
          user_id: string | null
          validade: string
        }
        SetofOptions: {
          from: "*"
          to: "assinaturas"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      list_contract_pending_stages: {
        Args: { _stage?: string }
        Returns: {
          admin_uploaded_at: string
          gestor_uploaded_at: string
          has_request: boolean
          school_id: string
          school_name: string
          stage: string
        }[]
      }
      list_expiring_schools_admin: {
        Args: { _limit?: number; _offset?: number }
        Returns: {
          city: string
          days_left: number
          id: string
          inep_code: string
          is_active: boolean
          name: string
          network: string
          state: string
          subscription_end_date: string
          subscription_status: string
        }[]
      }
      list_prospect_schools_admin: {
        Args: { _limit?: number; _offset?: number }
        Returns: {
          city: string
          created_at: string
          id: string
          inep_code: string
          is_active: boolean
          name: string
          network: string
          state: string
          subscription_status: string
        }[]
      }
      list_school_cities: {
        Args: { _state: string }
        Returns: {
          city: string
        }[]
      }
      list_school_cities_admin: {
        Args: { _state: string }
        Returns: {
          city: string
          school_count: number
        }[]
      }
      list_school_cities_public: {
        Args: { _network?: string; _state: string }
        Returns: {
          city: string
          school_count: number
        }[]
      }
      list_school_states_admin: {
        Args: never
        Returns: {
          state: string
        }[]
      }
      list_school_states_public: {
        Args: { _network?: string }
        Returns: {
          school_count: number
          state: string
        }[]
      }
      list_schools_admin: {
        Args: never
        Returns: {
          address: string
          city: string
          created_at: string
          grace_period_days: number
          id: string
          inep_code: string
          is_active: boolean
          logo_url: string
          name: string
          network: string
          state: string
          subscription_end_date: string
          subscription_status: string
        }[]
      }
      list_schools_admin_paginated: {
        Args: {
          _city?: string
          _limit?: number
          _network?: string
          _offset?: number
          _search?: string
          _state?: string
        }
        Returns: {
          address: string
          city: string
          created_at: string
          grace_period_days: number
          id: string
          inep_code: string
          is_active: boolean
          logo_url: string
          name: string
          network: string
          state: string
          subscription_end_date: string
          subscription_status: string
          total_count: number
        }[]
      }
      list_schools_by_location: {
        Args: { _city: string; _network?: string; _state: string }
        Returns: {
          address: string
          city: string
          id: string
          inep_code: string
          is_active: boolean
          logo_url: string
          name: string
          network: string
          state: string
        }[]
      }
      list_schools_deadlines_admin: {
        Args: never
        Returns: {
          city: string
          days_remaining: number
          gestor_email: string
          gestor_name: string
          gestor_phone: string
          network: string
          school_id: string
          school_name: string
          state: string
          status: string
          subscription_deadline: string
        }[]
      }
      list_schools_needing_monthly_boleto: {
        Args: never
        Returns: {
          cycle_month: string
          due_date: string
          gestor_user_id: string
          school_id: string
        }[]
      }
      list_schools_simple: {
        Args: { _limit?: number; _offset?: number; _search?: string }
        Returns: {
          cidade: string
          id: string
          nome: string
        }[]
      }
      list_schools_simple_filtered: {
        Args: {
          _city?: string
          _limit?: number
          _network?: string
          _offset?: number
          _search?: string
          _state?: string
        }
        Returns: {
          cidade: string
          id: string
          nome: string
          total_count: number
        }[]
      }
      list_subscribed_schools_admin: {
        Args: { _limit?: number; _offset?: number }
        Returns: {
          city: string
          grace_period_days: number
          id: string
          inep_code: string
          is_active: boolean
          name: string
          network: string
          state: string
          subscription_end_date: string
          subscription_status: string
        }[]
      }
      list_subscription_notifications_admin: {
        Args: never
        Returns: {
          channel: string
          created_at: string
          error_message: string
          event_type: string
          id: string
          message: string
          recipient: string
          scheduled_at: string
          school_id: string
          school_name: string
          sent_at: string
          status: string
          subject: string
        }[]
      }
      log_client_error: {
        Args: {
          _code?: string
          _context?: string
          _details?: string
          _hint?: string
          _message?: string
          _rpc: string
        }
        Returns: string
      }
      log_sensitive_event: {
        Args: {
          _action: string
          _details?: Json
          _record_id?: string
          _school_id?: string
          _table_name: string
        }
        Returns: string
      }
      manager_decide_profile: {
        Args: {
          _approve_as_intended?: boolean
          _decision: string
          _profile_id: string
          _reason?: string
        }
        Returns: {
          acknowledged_at: string | null
          created_at: string
          decided_by: string | null
          decided_by_name: string | null
          decision: string
          email: string | null
          full_name: string
          id: string
          intended_role: string | null
          phone: string | null
          reason: string | null
          school_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "profile_approval_decisions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      manager_unblock_user: { Args: { _user_id: string }; Returns: Json }
      mark_boleto_paid_manually: {
        Args: { _pagamento_id: string }
        Returns: {
          approved_at: string | null
          auto_generated: boolean
          created_at: string
          cycle_month: string | null
          data_fim: string | null
          data_inicio: string | null
          due_date: string | null
          expires_at: string | null
          id: string
          init_point: string | null
          manually_marked_paid: boolean
          marked_paid_at: string | null
          marked_paid_by: string | null
          metodo: string
          mp_external_reference: string | null
          mp_payment_id: string | null
          mp_preference_id: string | null
          mp_raw: Json | null
          plano: string
          qr_code: string | null
          qr_code_base64: string | null
          school_id: string
          status: string
          ticket_url: string | null
          updated_at: string
          user_id: string
          valor: number
        }
        SetofOptions: {
          from: "*"
          to: "pagamentos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      notify_school_gestores_communique: {
        Args: {
          _author_name: string
          _author_role: string
          _booking_id: string
          _school_id: string
          _summary: string
        }
        Returns: number
      }
      preview_bulk_set_schools_status: {
        Args: { _status: string }
        Returns: {
          already_in_status: number
          preserved_subscribers: number
          total_schools: number
          would_update: number
        }[]
      }
      process_mp_webhook_event: {
        Args: {
          _mp_payment_id: string
          _mp_raw: Json
          _request_id: string
          _status: string
        }
        Returns: Json
      }
      register_booking_checkpoint: {
        Args: { _booking_id: string; _kind: string }
        Returns: {
          booking_id: string
          created_at: string
          duration_minutes: number | null
          end_source: string | null
          ended_at: string | null
          id: string
          school_id: string
          start_source: string | null
          started_at: string | null
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "booking_usage"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_infraction: {
        Args: { _booking_id: string; _type: string; _user_id: string }
        Returns: Json
      }
      reject_school_transfer: {
        Args: { _note?: string; _request_id: string }
        Returns: {
          created_at: string
          from_school_id: string
          id: string
          reason: string | null
          requested_role: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          to_school_id: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "school_transfer_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_contract_signing: { Args: { _message?: string }; Returns: string }
      respond_reassignment_invite: {
        Args: { p_accept: boolean; p_invite_id: string }
        Returns: Json
      }
      search_schools_public: {
        Args: { search_query: string }
        Returns: {
          address: string
          city: string
          id: string
          inep_code: string
          is_active: boolean
          logo_url: string
          name: string
          network: string
          state: string
        }[]
      }
      set_minimum_supported_version: {
        Args: { _build_time: number; _version: string }
        Returns: {
          id: boolean
          latest_build_time: number
          latest_version: string
          minimum_supported_build_time: number
          minimum_supported_version: string
          updated_at: string
          updated_by: string | null
        }
        SetofOptions: {
          from: "*"
          to: "app_version_manifest"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_mp_force_test_mode: { Args: { _enabled: boolean }; Returns: boolean }
      sync_gestor_subscription_deadlines: { Args: never; Returns: Json }
      transfer_assistant_responsibility: {
        Args: { _note?: string; _roster_ids: string[]; _to_user_id: string }
        Returns: Json
      }
      verify_contract: {
        Args: { _token: string }
        Returns: {
          accepted_at: string
          accepted_ip: string
          contract_version: string
          document_hash: string
          is_reacceptance: boolean
          school_inep: string
          school_name: string
          signer_cpf_masked: string
          signer_name: string
          status: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
