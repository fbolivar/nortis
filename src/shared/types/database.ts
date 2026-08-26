/**
 * Tipos del esquema de Supabase.
 *
 * Regenerar tras cada migracion:
 *   npx supabase gen types typescript --project-id <REF> > src/shared/types/database.ts
 *   (el REF esta en Dashboard > Project Settings; no se versiona a proposito:
 *    en un repositorio publico solo sirve para indicarle a un atacante que
 *    proyecto sondear)
 *   (luego volver a añadir create_api_key si la version del generador no lo trae,
 *    y los alias de dominio del final del archivo)
 *
 * La forma de este archivo NO es decorativa: los helpers de tipos de supabase-js
 * dependen de la estructura exacta que produce el generador (Row/Insert/Update/
 * Relationships por tabla). Simplificarla rompe la inferencia de .from(), .rpc()
 * y .update() y deja todo tipado como `never`.
 *
 * Se omiten a proposito las tablas de particion (activity_events_2026_XX): son
 * mensuales y cambian solas, y el acceso directo a ellas esta denegado por
 * permisos y RLS. Toda lectura de telemetria pasa por `activity_events`.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '14.15'
  }
  public: {
    Tables: {
      agent_commands: {
        Row: {
          id: string
          organization_id: string
          endpoint_id: string
          kind: 'restore_file' | 'delete_quarantine'
          quarantine_id: string
          original_path: string
          status: 'pending' | 'sent' | 'done' | 'failed'
          error: string | null
          created_by: string | null
          created_at: string
          sent_at: string | null
          completed_at: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          endpoint_id: string
          kind: 'restore_file' | 'delete_quarantine'
          quarantine_id: string
          original_path: string
          status?: 'pending' | 'sent' | 'done' | 'failed'
          error?: string | null
          created_by?: string | null
          created_at?: string
          sent_at?: string | null
          completed_at?: string | null
        }
        Update: {
          status?: 'pending' | 'sent' | 'done' | 'failed'
          error?: string | null
          sent_at?: string | null
          completed_at?: string | null
        }
        Relationships: []
      }
      agent_tasks: {
        Row: {
          id: string
          organization_id: string
          endpoint_id: string
          kind: 'install_msi' | 'push_file' | 'restart'
          payload: string
          expires_at: string
          not_before: string
          signature: string
          status: 'pending' | 'sent' | 'running' | 'done' | 'failed'
          exit_code: number | null
          output: string | null
          error: string | null
          created_by: string | null
          created_at: string
          sent_at: string | null
          completed_at: string | null
        }
        Insert: {
          id?: string
          organization_id: string
          endpoint_id: string
          kind: 'install_msi' | 'push_file' | 'restart'
          payload: string
          expires_at: string
          not_before?: string
          signature: string
          status?: 'pending' | 'sent' | 'running' | 'done' | 'failed'
          exit_code?: number | null
          output?: string | null
          error?: string | null
          created_by?: string | null
          created_at?: string
          sent_at?: string | null
          completed_at?: string | null
        }
        Update: {
          status?: 'pending' | 'sent' | 'running' | 'done' | 'failed'
          exit_code?: number | null
          output?: string | null
          error?: string | null
          sent_at?: string | null
          completed_at?: string | null
        }
        Relationships: []
      }
      sites: {
        Row: {
          id: string
          organization_id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          organization_id: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          organization_id?: string
          name?: string
          created_at?: string
        }
        Relationships: []
      }
      agent_releases: {
        Row: {
          id: string
          version: string
          object_name: string
          sha256: string
          size_bytes: number | null
          download_url: string
          notes: string | null
          is_current: boolean
          published_by: string | null
          published_at: string
        }
        Insert: {
          id?: string
          version: string
          object_name: string
          sha256: string
          size_bytes?: number | null
          download_url: string
          notes?: string | null
          is_current?: boolean
          published_by?: string | null
          published_at?: string
        }
        Update: {
          id?: string
          version?: string
          object_name?: string
          sha256?: string
          size_bytes?: number | null
          download_url?: string
          notes?: string | null
          is_current?: boolean
          published_by?: string | null
          published_at?: string
        }
        Relationships: []
      }
      activity_daily_rollups: {
        Row: {
          day: string
          endpoint_id: string
          event_count: number
          event_type: Database['public']['Enums']['event_type']
          first_seen_at: string | null
          hourly_counts: number[]
          last_seen_at: string | null
          organization_id: string
        }
        Insert: {
          day: string
          endpoint_id: string
          event_count?: number
          event_type: Database['public']['Enums']['event_type']
          first_seen_at?: string | null
          hourly_counts?: number[]
          last_seen_at?: string | null
          organization_id: string
        }
        Update: {
          day?: string
          endpoint_id?: string
          event_count?: number
          event_type?: Database['public']['Enums']['event_type']
          first_seen_at?: string | null
          hourly_counts?: number[]
          last_seen_at?: string | null
          organization_id?: string
        }
        Relationships: []
      }
      activity_events: {
        Row: {
          /** Nulo en los datos sembrados; obligatorio para todo lo que entra por la API. */
          client_event_id: string | null
          endpoint_id: string
          event_type: Database['public']['Enums']['event_type']
          id: string
          ingested_at: string
          occurred_at: string
          organization_id: string
          payload: Json
        }
        Insert: {
          client_event_id?: string | null
          endpoint_id: string
          event_type: Database['public']['Enums']['event_type']
          id?: string
          ingested_at?: string
          occurred_at: string
          organization_id: string
          payload?: Json
        }
        Update: {
          client_event_id?: string | null
          endpoint_id?: string
          event_type?: Database['public']['Enums']['event_type']
          id?: string
          ingested_at?: string
          occurred_at?: string
          organization_id?: string
          payload?: Json
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          key_prefix: string
          last_used_at: string | null
          name: string
          organization_id: string
          revoked_at: string | null
          revoked_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_prefix: string
          last_used_at?: string | null
          name: string
          organization_id: string
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          key_prefix?: string
          last_used_at?: string | null
          name?: string
          organization_id?: string
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_user_id: string | null
          after_state: Json | null
          before_state: Json | null
          id: number
          ip_address: string | null
          occurred_at: string
          organization_id: string
          target_id: string | null
          target_table: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          id?: never
          ip_address?: string | null
          occurred_at?: string
          organization_id: string
          target_id?: string | null
          target_table?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_user_id?: string | null
          after_state?: Json | null
          before_state?: Json | null
          id?: never
          ip_address?: string | null
          occurred_at?: string
          organization_id?: string
          target_id?: string | null
          target_table?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      dlp_incidents: {
        Row: {
          created_at: string
          detected_at: string
          endpoint_id: string
          enforcement_action: string | null
          event_id: string | null
          event_occurred_at: string | null
          event_snapshot: Json
          id: string
          organization_id: string
          review_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          rule_channel: string | null
          rule_triggered: string
          severity: Database['public']['Enums']['incident_severity']
          status: Database['public']['Enums']['incident_status']
          updated_at: string
        }
        Insert: {
          created_at?: string
          detected_at?: string
          endpoint_id: string
          enforcement_action?: string | null
          event_id?: string | null
          event_occurred_at?: string | null
          event_snapshot?: Json
          id?: string
          organization_id: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_channel?: string | null
          rule_triggered: string
          severity?: Database['public']['Enums']['incident_severity']
          status?: Database['public']['Enums']['incident_status']
          updated_at?: string
        }
        Update: {
          created_at?: string
          detected_at?: string
          endpoint_id?: string
          enforcement_action?: string | null
          event_id?: string | null
          event_occurred_at?: string | null
          event_snapshot?: Json
          id?: string
          organization_id?: string
          review_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          rule_channel?: string | null
          rule_triggered?: string
          severity?: Database['public']['Enums']['incident_severity']
          status?: Database['public']['Enums']['incident_status']
          updated_at?: string
        }
        Relationships: []
      }
      encrypted_documents: {
        Row: {
          access_download_count: number
          wrapped_data_key: string | null
          external_wrapped_key: string | null
          external_wrap_salt: string | null
          share_token: string | null
          access_expires_at: string | null
          access_max_downloads: number | null
          content_hash: string | null
          created_at: string
          encryption_scheme: Database['public']['Enums']['encryption_scheme']
          external_recipient_email: string | null
          filename_encrypted: string | null
          filename_hash: string
          first_downloaded_at: string | null
          id: string
          mime_type: string | null
          organization_id: string
          owner_user_id: string | null
          recipient_type: Database['public']['Enums']['recipient_type']
          revoked_at: string | null
          size_bytes: number | null
          storage_path: string | null
          updated_at: string
          vault_key_id: string | null
        }
        Insert: {
          access_download_count?: number
          wrapped_data_key?: string | null
          external_wrapped_key?: string | null
          external_wrap_salt?: string | null
          share_token?: string | null
          access_expires_at?: string | null
          access_max_downloads?: number | null
          content_hash?: string | null
          created_at?: string
          encryption_scheme?: Database['public']['Enums']['encryption_scheme']
          external_recipient_email?: string | null
          filename_encrypted?: string | null
          filename_hash: string
          first_downloaded_at?: string | null
          id?: string
          mime_type?: string | null
          organization_id: string
          owner_user_id?: string | null
          recipient_type?: Database['public']['Enums']['recipient_type']
          revoked_at?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          updated_at?: string
          vault_key_id?: string | null
        }
        Update: {
          access_download_count?: number
          wrapped_data_key?: string | null
          external_wrapped_key?: string | null
          external_wrap_salt?: string | null
          share_token?: string | null
          access_expires_at?: string | null
          access_max_downloads?: number | null
          content_hash?: string | null
          created_at?: string
          encryption_scheme?: Database['public']['Enums']['encryption_scheme']
          external_recipient_email?: string | null
          filename_encrypted?: string | null
          filename_hash?: string
          first_downloaded_at?: string | null
          id?: string
          mime_type?: string | null
          organization_id?: string
          owner_user_id?: string | null
          recipient_type?: Database['public']['Enums']['recipient_type']
          revoked_at?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          updated_at?: string
          vault_key_id?: string | null
        }
        Relationships: []
      }
      endpoints: {
        Row: {
          /**
           * SHA-256 de la credencial del equipo. NUNCA se selecciona desde la
           * consola: no hace falta para nada de la interfaz, y una columna que
           * no se lee no se puede filtrar por accidente en un `select *`.
           */
          agent_credential_hash: string | null
          agent_credential_issued_at: string | null
          agent_version: string | null
          assigned_profile_id: string | null
          created_at: string
          /** Con que API key se dio de alta. Trazabilidad si una clave se filtra. */
          enrolled_with_api_key_id: string | null
          enrolled_at: string
          hostname: string
          id: string
          last_logged_user: string | null
          last_seen_at: string | null
          machine_fingerprint: string
          organization_id: string
          os_version: string | null
          policy_applied_at: string | null
          site_id: string | null
          status: Database['public']['Enums']['endpoint_status']
          updated_at: string
        }
        Insert: {
          agent_version?: string | null
          assigned_profile_id?: string | null
          created_at?: string
          enrolled_at?: string
          hostname: string
          id?: string
          last_logged_user?: string | null
          last_seen_at?: string | null
          machine_fingerprint: string
          organization_id: string
          os_version?: string | null
          policy_applied_at?: string | null
          site_id?: string | null
          status?: Database['public']['Enums']['endpoint_status']
          updated_at?: string
        }
        Update: {
          agent_version?: string | null
          assigned_profile_id?: string | null
          created_at?: string
          enrolled_at?: string
          hostname?: string
          id?: string
          last_logged_user?: string | null
          last_seen_at?: string | null
          machine_fingerprint?: string
          organization_id?: string
          os_version?: string | null
          policy_applied_at?: string | null
          site_id?: string | null
          status?: Database['public']['Enums']['endpoint_status']
          updated_at?: string
        }
        /**
         * Las relaciones NO son decorativas: son lo que permite a PostgREST
         * tipar un select anidado como `.select('*, security_profiles(name)')`.
         * Sin esta entrada, esa consulta funciona en runtime pero el tipo que
         * devuelve es un error de compilacion.
         *
         * El resto de tablas las deja vacias a proposito, porque hoy no se
         * incrusta nada desde ellas. Si se añade un embed, hay que declarar aqui
         * su relacion (o regenerar el archivo).
         */
        Relationships: [
          {
            foreignKeyName: 'endpoints_assigned_profile_id_fkey'
            columns: ['assigned_profile_id']
            isOneToOne: false
            referencedRelation: 'security_profiles'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'endpoints_organization_id_fkey'
            columns: ['organization_id']
            isOneToOne: false
            referencedRelation: 'organizations'
            referencedColumns: ['id']
          },
        ]
      }
      invitations: {
        Row: {
          id: string
          organization_id: string
          email: string
          role: Database['public']['Enums']['app_role']
          invited_by: string | null
          expires_at: string
          accepted_at: string | null
          accepted_by: string | null
          revoked_at: string | null
          revoked_by: string | null
          created_at: string
        }
        Insert: never
        Update: {
          revoked_at?: string | null
          revoked_by?: string | null
        }
        Relationships: []
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          monitoring_consent_document: string | null
          monitoring_consent_signed_at: string | null
          monitoring_consent_signed_by: string | null
          name: string
          plan_tier: Database['public']['Enums']['plan_tier']
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          monitoring_consent_document?: string | null
          monitoring_consent_signed_at?: string | null
          monitoring_consent_signed_by?: string | null
          name: string
          plan_tier?: Database['public']['Enums']['plan_tier']
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          monitoring_consent_document?: string | null
          monitoring_consent_signed_at?: string | null
          monitoring_consent_signed_by?: string | null
          name?: string
          plan_tier?: Database['public']['Enums']['plan_tier']
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      security_profiles: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean
          name: string
          organization_id: string
          schema_version: number
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          organization_id: string
          schema_version?: number
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string
          schema_version?: number
          updated_at?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          last_sign_in_at: string | null
          mfa_enabled: boolean
          organization_id: string
          role: Database['public']['Enums']['app_role']
          site_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          last_sign_in_at?: string | null
          mfa_enabled?: boolean
          organization_id: string
          role?: Database['public']['Enums']['app_role']
          site_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          last_sign_in_at?: string | null
          mfa_enabled?: boolean
          organization_id?: string
          role?: Database['public']['Enums']['app_role']
          site_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      agent_enroll: {
        Args: {
          p_api_key: string
          p_fingerprint: string
          p_hostname: string
          p_os_version?: string | null
          p_agent_version?: string | null
          p_user?: string | null
        }
        /**
         * `agent_credential` es la credencial propia del equipo y viaja en claro
         * UNA sola vez, aqui. Las otras tres funciones ya no aceptan la API key
         * de la organizacion.
         */
        Returns: {
          endpoint_id: string
          profile_id: string | null
          organization_id: string
          agent_credential: string
        }[]
      }
      agent_ingest: {
        Args: { p_credential: string; p_endpoint_id: string; p_events: Json }
        /** `duplicates` va incluido en `accepted`; se informa aparte para diagnostico. */
        Returns: { accepted: number; rejected: number; duplicates: number }[]
      }
      agent_policy: {
        Args: { p_credential: string; p_endpoint_id: string }
        Returns: {
          profile_id: string
          profile_name: string
          schema_version: number
          config: Json
          updated_at: string
          monitoring_allowed: boolean
        }[]
      }
      agent_heartbeat: {
        Args: {
          p_credential: string
          p_endpoint_id: string
          p_agent_version?: string | null
          p_user?: string | null
        }
        Returns: {
          acknowledged: boolean
          policy_updated_at: string | null
          quarantined: boolean
        }[]
      }
      /*
       * Administracion de usuarios de consola.
       *
       * Las cuatro escriben en el esquema `auth`, que es de GoTrue, y por eso
       * son SECURITY DEFINER en vez de operaciones de tabla: ver el encabezado
       * de supabase/migrations/20260807160000_user_administration.sql.
       *
       * Ninguna se llama sin pasar por los schemas de
       * src/features/tenant/types/schemas.ts — la base valida de nuevo, pero un
       * error de Postgres es peor mensaje que uno de zod.
       */
      admin_create_user: {
        Args: {
          p_email: string
          p_password: string
          p_full_name?: string | null
          p_role?: Database['public']['Enums']['app_role']
        }
        Returns: string
      }
      admin_update_user: {
        Args: {
          p_user_id: string
          /** `null` = no tocar el nombre. */
          p_full_name?: string | null
          /** `null` = no tocar el rol. */
          p_role?: Database['public']['Enums']['app_role'] | null
        }
        Returns: undefined
      }
      admin_set_user_password: {
        Args: { p_user_id: string; p_password: string }
        Returns: undefined
      }
      admin_delete_user: { Args: { p_user_id: string }; Returns: undefined }
      bootstrap_organization: {
        Args: { p_full_name?: string; p_org_name: string; p_org_slug: string }
        Returns: string
      }
      create_api_key: {
        Args: { p_expires_at?: string; p_name: string }
        Returns: {
          id: string
          api_key: string
          key_prefix: string
        }[]
      }
      // `Args: never` para funciones sin parametros: es lo que emite el
      // generador. Con Record<PropertyKey, never> la funcion deja de satisfacer
      // GenericSchema y supabase-js degrada el esquema ENTERO a `never` — todas
      // las consultas pierden el tipado a la vez, sin señalar la causa.
      current_app_role: {
        Args: never
        Returns: Database['public']['Enums']['app_role']
      }
      current_org_id: { Args: never; Returns: string }
      is_org_admin: { Args: never; Returns: boolean }
      is_org_owner: { Args: never; Returns: boolean }
      mfa_satisfied: { Args: never; Returns: boolean }
      report_activity_by_hour: {
        Args: { p_days?: number }
        Returns: { hour: number; event_count: number }[]
      }
      report_activity_by_day: {
        Args: { p_days?: number }
        Returns: { day: string; event_count: number }[]
      }
      report_usage_by_category: {
        Args: { p_days?: number }
        Returns: { category: string; event_count: number }[]
      }
      report_top_apps: {
        Args: { p_days?: number; p_limit?: number }
        Returns: { app: string; event_count: number }[]
      }
      report_top_domains: {
        Args: { p_days?: number; p_limit?: number }
        Returns: { domain: string; event_count: number; blocked_count: number }[]
      }
      report_connected_usb: {
        Args: { p_days?: number }
        Returns: {
          serial: string | null
          label: string | null
          vendor_id: string | null
          product_id: string | null
          capacity_bytes: number | null
          enforcement: string | null
          veces: number
          last_seen: string
        }[]
      }
      current_agent_release: {
        Args: never
        Returns: { version: string; sha256: string; download_url: string }[]
      }
      set_current_agent_release: {
        Args: {
          p_version: string
          p_object_name: string
          p_sha256: string
          p_download_url: string
          p_size_bytes?: number
          p_notes?: string
        }
        Returns: string
      }
      agent_poll_commands: {
        Args: { p_credential: string; p_endpoint_id: string }
        Returns: { id: string; kind: string; quarantine_id: string; original_path: string }[]
      }
      agent_report_command: {
        Args: {
          p_credential: string
          p_endpoint_id: string
          p_command_id: string
          p_status: string
          p_error?: string
        }
        Returns: undefined
      }
      create_quarantine_action: {
        Args: {
          p_endpoint_id: string
          p_kind: string
          p_quarantine_id: string
          p_original_path: string
        }
        Returns: string
      }
      issue_agent_task: {
        Args: {
          p_endpoint_id: string
          p_kind: string
          p_payload: string
          p_expires_at: string
          p_signature: string
          p_not_before?: string
        }
        Returns: string
      }
      set_user_site: {
        Args: { p_user_id: string; p_site_id: string | null }
        Returns: undefined
      }
      agent_poll_tasks: {
        Args: { p_credential: string; p_endpoint_id: string }
        Returns: {
          id: string
          kind: string
          payload: string
          expires_at: string
          signature: string
        }[]
      }
      agent_report_task: {
        Args: {
          p_credential: string
          p_endpoint_id: string
          p_task_id: string
          p_status: string
          p_exit_code?: number
          p_output?: string
          p_error?: string
        }
        Returns: undefined
      }
      tenant_key_id: { Args: never; Returns: string }
      wrap_data_key: {
        Args: { p_data_key: string }
        Returns: { wrapped_key: string; vault_key_id: string }[]
      }
      unwrap_data_key: { Args: { p_document_id: string }; Returns: string }
      open_shared_package: {
        Args: { p_token: string }
        Returns: {
          wrapped_key: string
          wrap_salt: string
          storage_path: string
          size_bytes: number | null
          expires_at: string | null
          downloads_remaining: number | null
        }[]
      }
      simulate_policy: {
        Args: { p_config: Json; p_endpoints?: string[] | null; p_days?: number }
        Returns: {
          rule_key: string
          channel: string
          action: string
          affected_events: number
          affected_endpoints: number
          sample: string | null
        }[]
      }
      search_file_activity: {
        Args: {
          p_query: string
          p_days?: number
          p_endpoint?: string | null
          p_user?: string | null
          p_limit?: number
        }
        Returns: {
          id: string
          endpoint_id: string
          hostname: string
          event_type: Database['public']['Enums']['event_type']
          path: string | null
          file_user: string | null
          process: string | null
          size_bytes: number | null
          occurred_at: string
        }[]
      }
    }
    Enums: {
      app_role: 'owner' | 'admin' | 'viewer'
      encryption_scheme: 'aes_256_gcm_tenant_key' | 'aes_256_gcm_ephemeral_rsa'
      endpoint_status: 'online' | 'offline' | 'quarantined'
      event_type:
        | 'app_open'
        | 'file_created'
        | 'file_modified'
        | 'file_deleted'
        | 'usb_connected'
        | 'web_visit'
        | 'clipboard_copy'
        | 'print_job'
        | 'window_focus'
        | 'logon'
        | 'logoff'
        | 'idle_start'
        | 'idle_end'
      incident_severity: 'low' | 'medium' | 'high' | 'critical'
      incident_status: 'open' | 'reviewed' | 'closed' | 'false_positive'
      plan_tier: 'trial' | 'starter' | 'business' | 'enterprise'
      recipient_type: 'internal' | 'external'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

/* ------------------------------------------------------------------------- */
/* Alias de dominio. Se conservan al regenerar.                              */
/* ------------------------------------------------------------------------- */

type PublicSchema = Database['public']

export type Tables<T extends keyof PublicSchema['Tables']> = PublicSchema['Tables'][T]['Row']
export type Enums<T extends keyof PublicSchema['Enums']> = PublicSchema['Enums'][T]

export type AppRole = Enums<'app_role'>
export type PlanTier = Enums<'plan_tier'>
export type EndpointStatus = Enums<'endpoint_status'>
export type EventType = Enums<'event_type'>
export type IncidentSeverity = Enums<'incident_severity'>
export type IncidentStatus = Enums<'incident_status'>
export type RecipientType = Enums<'recipient_type'>
export type EncryptionScheme = Enums<'encryption_scheme'>

export type Organization = Tables<'organizations'>
export type ConsoleUser = Tables<'users'>
export type SecurityProfile = Tables<'security_profiles'>
export type Endpoint = Tables<'endpoints'>
export type ActivityEvent = Tables<'activity_events'>

/**
 * Columnas de `endpoints` legibles desde la consola.
 *
 * `authenticated` NO tiene permiso sobre `agent_credential_hash`, asi que un
 * `select('*')` falla la consulta ENTERA con un error de permisos que no señala
 * la columna culpable. Se centraliza aqui para no repetir la lista en cada
 * pagina y para que añadir una columna nueva sea un solo cambio.
 *
 * Es el mismo patron que ya obliga `invitations.token_hash`: el material
 * criptografico no se entrega a la interfaz, ni siquiera hasheado.
 */
export const ENDPOINT_COLUMNS =
  'id, organization_id, hostname, machine_fingerprint, os_version, agent_version, ' +
  'last_logged_user, status, last_seen_at, assigned_profile_id, policy_applied_at, ' +
  'enrolled_at, created_at, updated_at, enrolled_with_api_key_id, agent_credential_issued_at'
export type DlpIncident = Tables<'dlp_incidents'>
export type EncryptedDocument = Tables<'encrypted_documents'>
export type AuditLogEntry = Tables<'audit_log'>

/**
 * key_hash existe en la tabla pero NO se expone aqui: `authenticated` no tiene
 * permiso de columna para leerlo, asi que un select que lo incluyera fallaria en
 * runtime. Dejarlo fuera del tipo convierte ese error en un error de compilacion.
 */
export type ApiKey = Tables<'api_keys'>
