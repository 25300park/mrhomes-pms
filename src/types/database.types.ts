// ============================================================
// mrhomes PMS — database.types.ts
// Supabase 스키마와 1:1 대응하는 TypeScript 타입
// ============================================================

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ── ENUM 타입 ─────────────────────────────────────────────────
export type UserRole = 'admin' | 'agent' | 'landlord' | 'tenant'
export type PaymentType = 'PDC' | 'FULL_ADVANCE' | 'HALF_ADVANCE' | 'MONTHLY_TRANSFER'
export type PaymentStatus = 'PENDING' | 'AWAITING_APPROVAL' | 'PAID' | 'OVERDUE'
export type CareServiceType = 'AIRCON' | 'CLEANING' | 'REPAIR' | 'HANDYMAN'
export type CareStatus = 'PENDING' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED'
export type ContractStatus = 'ACTIVE' | 'EXPIRING_SOON' | 'EXPIRED' | 'TERMINATED'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          role: UserRole
          full_name: string
          email: string
          phone: string | null
          viber_id: string | null
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          role?: UserRole
          full_name: string
          email: string
          phone?: string | null
          viber_id?: string | null
          avatar_url?: string | null
        }
        Update: {
          role?: UserRole
          full_name?: string
          email?: string
          phone?: string | null
          viber_id?: string | null
          avatar_url?: string | null
        }
      }
      condo_masters: {
        Row: {
          id: number
          condo_name: string
          address: string | null
          default_bill_notification_day: number
          created_at: string
        }
        Insert: {
          condo_name: string
          address?: string | null
          default_bill_notification_day?: number
        }
        Update: {
          condo_name?: string
          address?: string | null
          default_bill_notification_day?: number
        }
      }
      properties: {
        Row: {
          id: string
          condo_id: number | null
          landlord_id: string
          unit_number: string
          floor_area_sqm: number | null
          bedrooms: number | null
          bathrooms: number | null
          monthly_price: number | null
          is_listed: boolean
          listed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          condo_id?: number | null
          landlord_id: string
          unit_number: string
          floor_area_sqm?: number | null
          bedrooms?: number | null
          bathrooms?: number | null
          monthly_price?: number | null
          is_listed?: boolean
        }
        Update: {
          condo_id?: number | null
          unit_number?: string
          floor_area_sqm?: number | null
          bedrooms?: number | null
          bathrooms?: number | null
          monthly_price?: number | null
          is_listed?: boolean
          listed_at?: string | null
        }
      }
      lease_contracts: {
        Row: {
          id: string
          property_id: string
          landlord_id: string
          tenant_id: string
          condo_id: number | null
          start_date: string
          end_date: string
          monthly_rent: number
          payment_type: PaymentType
          status: ContractStatus
          notes: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          property_id: string
          landlord_id: string
          tenant_id: string
          condo_id?: number | null
          start_date: string
          end_date: string
          monthly_rent: number
          payment_type?: PaymentType
          status?: ContractStatus
          notes?: string | null
          created_by?: string | null
        }
        Update: {
          start_date?: string
          end_date?: string
          monthly_rent?: number
          payment_type?: PaymentType
          status?: ContractStatus
          notes?: string | null
        }
      }
      payment_schedules: {
        Row: {
          id: string
          contract_id: string
          due_date: string
          amount_due: number
          status: PaymentStatus
          pdc_number: string | null
          receipt_image_url: string | null
          receipt_notes: string | null
          verified_at: string | null
          verified_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          contract_id: string
          due_date: string
          amount_due: number
          status?: PaymentStatus
          pdc_number?: string | null
        }
        Update: {
          status?: PaymentStatus
          pdc_number?: string | null
          receipt_image_url?: string | null
          receipt_notes?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
      }
      care_service_requests: {
        Row: {
          id: string
          contract_id: string
          service_type: CareServiceType
          preferred_date: string
          status: CareStatus
          price: number | null
          description: string | null
          report_image_url: string | null
          scheduled_at: string | null
          completed_at: string | null
          assigned_to: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          contract_id: string
          service_type: CareServiceType
          preferred_date: string
          status?: CareStatus
          price?: number | null
          description?: string | null
        }
        Update: {
          status?: CareStatus
          price?: number | null
          description?: string | null
          report_image_url?: string | null
          scheduled_at?: string | null
          completed_at?: string | null
          assigned_to?: string | null
        }
      }
      community_posts: {
        Row: {
          id: string
          condo_id: number
          author_id: string
          is_notice: boolean
          title: string
          body: string
          created_at: string
        }
        Insert: {
          id?: string
          condo_id: number
          author_id: string
          is_notice?: boolean
          title: string
          body: string
        }
        Update: {
          title?: string
          body?: string
        }
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          title: string
          body: string
          is_read: boolean
          related_type: string | null
          related_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          body: string
          is_read?: boolean
          related_type?: string | null
          related_id?: string | null
        }
        Update: {
          is_read?: boolean
        }
      }
    }
    Functions: {
      get_my_role: {
        Args: Record<string, never>
        Returns: UserRole
      }
      is_crm_user: {
        Args: Record<string, never>
        Returns: boolean
      }
    }
  }
}

// ── 편의용 Row 타입 alias ─────────────────────────────────────
export type Profile = Database['public']['Tables']['profiles']['Row']
export type CondoMaster = Database['public']['Tables']['condo_masters']['Row']
export type Property = Database['public']['Tables']['properties']['Row']
export type LeaseContract = Database['public']['Tables']['lease_contracts']['Row']
export type PaymentSchedule = Database['public']['Tables']['payment_schedules']['Row']
export type CareServiceRequest = Database['public']['Tables']['care_service_requests']['Row']
export type CommunityPost = Database['public']['Tables']['community_posts']['Row']
export type Notification = Database['public']['Tables']['notifications']['Row']

// ── JOIN 포함 확장 타입 (UI에서 자주 사용) ──────────────────
export type ContractWithDetails = LeaseContract & {
  property: Property & { condo: CondoMaster | null }
  tenant: Profile
  landlord: Profile
}

export type PaymentWithContract = PaymentSchedule & {
  contract: Pick<LeaseContract, 'id' | 'monthly_rent' | 'payment_type'>
}

export type CareWithContract = CareServiceRequest & {
  contract: Pick<LeaseContract, 'id'> & {
    property: Pick<Property, 'unit_number' | 'condo_id'>
  }
}
