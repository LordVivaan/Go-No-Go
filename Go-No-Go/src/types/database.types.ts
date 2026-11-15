export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          callsign: string;
          agency_name: string;
          created_at: string;
        };
        Insert: {
          id: string;
          callsign?: string;
          agency_name?: string;
          created_at?: string;
        };
        Update: {
          callsign?: string;
          agency_name?: string;
        };
        Relationships: [];
      };
      missions: {
        Row: {
          id: string;
          code: string;
          title: string;
          celestial_body: 'EARTH' | 'MOON' | 'MARS' | 'ASTEROID';
          risk_class: 'A' | 'B' | 'C' | 'D';
          budget_cap_musd: number;
          design_life_years: number;
          config_json: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          title: string;
          celestial_body: 'EARTH' | 'MOON' | 'MARS' | 'ASTEROID';
          risk_class: 'A' | 'B' | 'C' | 'D';
          budget_cap_musd: number;
          design_life_years?: number;
          config_json?: Record<string, unknown>;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['missions']['Insert']>;
        Relationships: [];
      };
      leaderboard_entries: {
        Row: {
          id: string;
          user_id: string | null;
          player_key: string;
          player_alias: string;
          country_code: string | null;
          mission_code: string;
          difficulty: 'STANDARD' | 'HARD' | 'EXPERT';
          season_code: string;
          configuration_name: string;
          total_score: number;
          science_score: number;
          reliability_score: number;
          efficiency_score: number;
          comms_score: number;
          risk_collab_score: number;
          grade: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
          outcome: 'SUCCESS' | 'PARTIAL_SUCCESS';
          completion_duration_sec: number;
          data_downlinked_gb: number;
          regions_mapped_count: number;
          seed: number;
          config_signature: string;
          verification_hash: string;
          is_verified: boolean;
          verification_status: 'PROVISIONAL' | 'VERIFIED' | 'UNVERIFIED';
          achieved_at: string;
          updated_at: string;
        };
        Insert: Record<string, never>;
        Update: Record<string, never>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      submit_verified_mission_score: {
        Args: {
          p_player_token: string;
          p_player_alias: string;
          p_country_code?: string | null;
          p_mission_code?: string;
          p_difficulty?: string;
          p_season_code?: string;
          p_configuration_name?: string;
          p_telemetry?: Json;
        };
        Returns: Json;
      };
      get_mission_leaderboard: {
        Args: {
          p_mission_code?: string;
          p_difficulty?: string;
          p_season_code?: string;
          p_country_code?: string | null;
          p_player_token?: string | null;
          p_limit?: number;
          p_offset?: number;
        };
        Returns: Json;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
