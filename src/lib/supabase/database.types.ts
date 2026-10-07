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
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      contributions: {
        Row: {
          created_at: string
          id: string
          machine_id: string
          proposed_by: string
          reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          safety: boolean
          section: string | null
          source_label: string | null
          source_ref: string | null
          source_type: Database["public"]["Enums"]["contribution_source_type"]
          status: Database["public"]["Enums"]["contribution_status"]
          text: string
        }
        Insert: {
          created_at?: string
          id?: string
          machine_id: string
          proposed_by?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          safety?: boolean
          section?: string | null
          source_label?: string | null
          source_ref?: string | null
          source_type?: Database["public"]["Enums"]["contribution_source_type"]
          status?: Database["public"]["Enums"]["contribution_status"]
          text: string
        }
        Update: {
          created_at?: string
          id?: string
          machine_id?: string
          proposed_by?: string
          reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          safety?: boolean
          section?: string | null
          source_label?: string | null
          source_ref?: string | null
          source_type?: Database["public"]["Enums"]["contribution_source_type"]
          status?: Database["public"]["Enums"]["contribution_status"]
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "contributions_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      machines: {
        Row: {
          brand: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          model: string
          pack: Json
          type: string
        }
        Insert: {
          brand: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id: string
          model: string
          pack: Json
          type?: string
        }
        Update: {
          brand?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          model?: string
          pack?: Json
          type?: string
        }
        Relationships: []
      }
      memberships: {
        Row: {
          machine_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          machine_id: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          machine_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
          username: string | null
        }
        Insert: {
          created_at?: string
          display_name: string
          id: string
          username?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          username?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_machine: {
        Args: {
          p_brand: string
          p_description: string
          p_model: string
          p_pack: Json
          p_type: string
        }
        Returns: string
      }
    }
    Enums: {
      contribution_source_type: "contributor" | "manual" | "document"
      contribution_status: "proposed" | "approved" | "rejected"
      member_role: "reader" | "contributor" | "maintainer"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      contribution_source_type: ["contributor", "manual", "document"],
      contribution_status: ["proposed", "approved", "rejected"],
      member_role: ["reader", "contributor", "maintainer"],
    },
  },
} as const
