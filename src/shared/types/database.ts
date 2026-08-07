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
          endpoint_id: string
          event_type: Database['public']['Enums']['event_type']
          id: string
          ingested_at: string
          occurred_at: string
          organization_id: string
          payload: Json
        }
        Insert: {
          endpoint_id: string
          event_type: Database['public']['Enums']['event_type']
          id?: string
          ingested_at?: string
          occurred_at: string
          organization_id: string
          payload?: Json
        }
        Update: {
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
          agent_version: string | null
          assigned_profile_id: string | null
          created_at: string
          enrolled_at: string
          hostname: string
          id: string
          last_logged_user: string | null
          last_seen_at: string | null
          machine_fingerprint: string
          organization_id: string
          os_version: string | null
          policy_applied_at: string | null
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
        Returns: { endpoint_id: string; profile_id: string | null; organization_id: string }[]
      }
      agent_ingest: {
        Args: { p_api_key: string; p_endpoint_id: string; p_events: Json }
        Returns: { accepted: number; rejected: number }[]
      }
      agent_policy: {
        Args: { p_api_key: string; p_endpoint_id: string }
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
          p_api_key: string
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
export type DlpIncident = Tables<'dlp_incidents'>
export type EncryptedDocument = Tables<'encrypted_documents'>
export type AuditLogEntry = Tables<'audit_log'>

/**
 * key_hash existe en la tabla pero NO se expone aqui: `authenticated` no tiene
 * permiso de columna para leerlo, asi que un select que lo incluyera fallaria en
 * runtime. Dejarlo fuera del tipo convierte ese error en un error de compilacion.
 */
export type ApiKey = Tables<'api_keys'>
