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
      bank_accounts: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      cheques: {
        Row: {
          amount: number
          bank_account_id: string
          cheque_date: string
          cheque_number: string
          created_at: string
          id: string
          source: Database["public"]["Enums"]["cheque_source"]
          status: Database["public"]["Enums"]["cheque_status"]
          status_updated_at: string | null
          status_updated_by: string | null
          supplier_id: string
        }
        Insert: {
          amount: number
          bank_account_id: string
          cheque_date: string
          cheque_number: string
          created_at?: string
          id?: string
          source: Database["public"]["Enums"]["cheque_source"]
          status?: Database["public"]["Enums"]["cheque_status"]
          status_updated_at?: string | null
          status_updated_by?: string | null
          supplier_id: string
        }
        Update: {
          amount?: number
          bank_account_id?: string
          cheque_date?: string
          cheque_number?: string
          created_at?: string
          id?: string
          source?: Database["public"]["Enums"]["cheque_source"]
          status?: Database["public"]["Enums"]["cheque_status"]
          status_updated_at?: string | null
          status_updated_by?: string | null
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cheques_bank_account_id_fkey"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_status_updated_by_fkey"
            columns: ["status_updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cheques_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credits: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          customer_id: string
          date: string
          id: string
          notes: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          date?: string
          id?: string
          notes?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          date?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_credits_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_financials: {
        Row: {
          customer_id: string
          opening_balance: number
          updated_at: string
        }
        Insert: {
          customer_id: string
          opening_balance?: number
          updated_at?: string
        }
        Update: {
          customer_id?: string
          opening_balance?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_financials_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: true
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          customer_id: string
          date: string
          id: string
          notes: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          date?: string
          id?: string
          notes?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          date?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          active: boolean
          code: string
          contact: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          code: string
          contact?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          code?: string
          contact?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      item_units: {
        Row: {
          conversion_factor_to_base: number
          id: string
          item_id: string
          unit_name: string
        }
        Insert: {
          conversion_factor_to_base: number
          id?: string
          item_id: string
          unit_name: string
        }
        Update: {
          conversion_factor_to_base?: number
          id?: string
          item_id?: string
          unit_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_units_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          active: boolean
          base_unit: string
          batch_tracked: boolean
          category_id: string | null
          code: string
          created_at: string
          created_by: string | null
          id: string
          last_purchase_cost: number | null
          name: string
          reorder_level: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          base_unit: string
          batch_tracked?: boolean
          category_id?: string | null
          code: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_purchase_cost?: number | null
          name: string
          reorder_level?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          base_unit?: string
          batch_tracked?: boolean
          category_id?: string | null
          code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_purchase_cost?: number | null
          name?: string
          reorder_level?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          attempt_count: number
          id: string
          ip: string
          window_start: string
        }
        Insert: {
          attempt_count?: number
          id?: string
          ip: string
          window_start?: string
        }
        Update: {
          attempt_count?: number
          id?: string
          ip?: string
          window_start?: string
        }
        Relationships: []
      }
      opening_stock_entries: {
        Row: {
          base_quantity: number
          batch_number: string | null
          conversion_factor: number
          cost_price: number
          created_at: string
          created_by: string | null
          expiry_date: string | null
          id: string
          item_id: string
          notes: string | null
          quantity: number
          stock_batch_id: string
          unit_name: string
        }
        Insert: {
          base_quantity: number
          batch_number?: string | null
          conversion_factor: number
          cost_price: number
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          item_id: string
          notes?: string | null
          quantity: number
          stock_batch_id: string
          unit_name: string
        }
        Update: {
          base_quantity?: number
          batch_number?: string | null
          conversion_factor?: number
          cost_price?: number
          created_at?: string
          created_by?: string | null
          expiry_date?: string | null
          id?: string
          item_id?: string
          notes?: string | null
          quantity?: number
          stock_batch_id?: string
          unit_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "opening_stock_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opening_stock_entries_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opening_stock_entries_stock_batch_id_fkey"
            columns: ["stock_batch_id"]
            isOneToOne: false
            referencedRelation: "stock_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_credentials: {
        Row: {
          pin_hash: string
          pin_lookup_hash: string
          profile_id: string
          updated_at: string
        }
        Insert: {
          pin_hash: string
          pin_lookup_hash: string
          profile_id: string
          updated_at?: string
        }
        Update: {
          pin_hash?: string
          pin_lookup_hash?: string
          profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_credentials_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          active?: boolean
          created_at?: string
          full_name?: string
          id: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          active?: boolean
          created_at?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      purchase_items: {
        Row: {
          base_quantity: number
          batch_number: string | null
          conversion_factor: number
          created_at: string
          expiry_date: string | null
          id: string
          item_id: string
          line_total: number
          purchase_id: string
          quantity: number
          stock_batch_id: string
          unit_cost: number
          unit_name: string
        }
        Insert: {
          base_quantity: number
          batch_number?: string | null
          conversion_factor: number
          created_at?: string
          expiry_date?: string | null
          id?: string
          item_id: string
          line_total: number
          purchase_id: string
          quantity: number
          stock_batch_id: string
          unit_cost: number
          unit_name: string
        }
        Update: {
          base_quantity?: number
          batch_number?: string | null
          conversion_factor?: number
          created_at?: string
          expiry_date?: string | null
          id?: string
          item_id?: string
          line_total?: number
          purchase_id?: string
          quantity?: number
          stock_batch_id?: string
          unit_cost?: number
          unit_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_stock_batch_id_fkey"
            columns: ["stock_batch_id"]
            isOneToOne: false
            referencedRelation: "stock_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          cheque_id: string | null
          created_at: string
          created_by: string | null
          date: string
          id: string
          notes: string | null
          payment_type: Database["public"]["Enums"]["purchase_payment_type"]
          purchase_no: number
          reference_no: string | null
          supplier_id: string
          total_amount: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cheque_id?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          notes?: string | null
          payment_type: Database["public"]["Enums"]["purchase_payment_type"]
          purchase_no?: never
          reference_no?: string | null
          supplier_id: string
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cheque_id?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          notes?: string | null
          payment_type?: Database["public"]["Enums"]["purchase_payment_type"]
          purchase_no?: never
          reference_no?: string | null
          supplier_id?: string
          total_amount?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchases_cheque_id_fkey"
            columns: ["cheque_id"]
            isOneToOne: false
            referencedRelation: "cheques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustments: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          id: string
          item_id: string
          quantity_change: number
          reason: string
          stock_batch_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          item_id: string
          quantity_change: number
          reason: string
          stock_batch_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          item_id?: string
          quantity_change?: number
          reason?: string
          stock_batch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_stock_batch_id_fkey"
            columns: ["stock_batch_id"]
            isOneToOne: false
            referencedRelation: "stock_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_batches: {
        Row: {
          batch_number: string | null
          created_at: string
          expiry_date: string | null
          id: string
          item_id: string
          quantity_remaining: number
          unit_cost: number
        }
        Insert: {
          batch_number?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          item_id: string
          quantity_remaining?: number
          unit_cost: number
        }
        Update: {
          batch_number?: string | null
          created_at?: string
          expiry_date?: string | null
          id?: string
          item_id?: string
          quantity_remaining?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_batches_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_out: {
        Row: {
          base_quantity: number
          conversion_factor: number
          created_at: string
          created_by: string | null
          date: string
          id: string
          item_id: string
          quantity: number
          unit_name: string
        }
        Insert: {
          base_quantity: number
          conversion_factor: number
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          item_id: string
          quantity: number
          unit_name: string
        }
        Update: {
          base_quantity?: number
          conversion_factor?: number
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          item_id?: string
          quantity?: number
          unit_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_out_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_out_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_out_batches: {
        Row: {
          created_at: string
          id: string
          quantity_deducted: number
          stock_batch_id: string
          stock_out_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          quantity_deducted: number
          stock_batch_id: string
          stock_out_id: string
        }
        Update: {
          created_at?: string
          id?: string
          quantity_deducted?: number
          stock_batch_id?: string
          stock_out_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_out_batches_stock_batch_id_fkey"
            columns: ["stock_batch_id"]
            isOneToOne: false
            referencedRelation: "stock_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_out_batches_stock_out_id_fkey"
            columns: ["stock_out_id"]
            isOneToOne: false
            referencedRelation: "stock_out"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_financials: {
        Row: {
          opening_balance: number
          supplier_id: string
          updated_at: string
        }
        Insert: {
          opening_balance?: number
          supplier_id: string
          updated_at?: string
        }
        Update: {
          opening_balance?: number
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_financials_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: true
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_payments: {
        Row: {
          amount: number
          cheque_id: string | null
          created_at: string
          created_by: string | null
          date: string
          id: string
          notes: string | null
          payment_type: Database["public"]["Enums"]["payment_method"]
          supplier_id: string
        }
        Insert: {
          amount: number
          cheque_id?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          notes?: string | null
          payment_type: Database["public"]["Enums"]["payment_method"]
          supplier_id: string
        }
        Update: {
          amount?: number
          cheque_id?: string | null
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          notes?: string | null
          payment_type?: Database["public"]["Enums"]["payment_method"]
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_payments_cheque_id_fkey"
            columns: ["cheque_id"]
            isOneToOne: false
            referencedRelation: "cheques"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supplier_payments_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          address: string | null
          code: string
          contact: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          address?: string | null
          code: string
          contact?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          address?: string | null
          code?: string
          contact?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      item_stock_summary: {
        Row: {
          item_id: string | null
          total_quantity: number | null
          total_value: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_batches_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_customer_credit: {
        Args: {
          p_amount: number
          p_customer_id: string
          p_date: string
          p_notes: string
        }
        Returns: string
      }
      create_customer_payment: {
        Args: {
          p_amount: number
          p_customer_id: string
          p_date: string
          p_notes: string
        }
        Returns: string
      }
      create_opening_stock: {
        Args: {
          p_batch_number: string
          p_cost_price: number
          p_expiry_date: string
          p_item_id: string
          p_notes: string
          p_quantity: number
          p_unit_name: string
        }
        Returns: string
      }
      create_purchase: {
        Args: {
          p_cheque: Json
          p_date: string
          p_line_items: Json
          p_notes: string
          p_payment_type: Database["public"]["Enums"]["purchase_payment_type"]
          p_reference_no: string
          p_supplier_id: string
        }
        Returns: string
      }
      create_stock_adjustment: {
        Args: {
          p_date: string
          p_item_id: string
          p_quantity_change: number
          p_reason: string
          p_stock_batch_id: string
        }
        Returns: string
      }
      create_stock_out: {
        Args: {
          p_date: string
          p_item_id: string
          p_quantity: number
          p_unit_name: string
        }
        Returns: string
      }
      create_supplier_payment: {
        Args: {
          p_amount: number
          p_cheque: Json
          p_date: string
          p_notes: string
          p_payment_type: Database["public"]["Enums"]["payment_method"]
          p_supplier_id: string
        }
        Returns: string
      }
      current_role_or_raise: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      delete_customer_credit: {
        Args: { p_credit_id: string }
        Returns: undefined
      }
      delete_customer_payment: {
        Args: { p_payment_id: string }
        Returns: undefined
      }
      delete_opening_stock: { Args: { p_entry_id: string }; Returns: undefined }
      delete_purchase: { Args: { p_purchase_id: string }; Returns: undefined }
      delete_stock_adjustment: {
        Args: { p_adjustment_id: string }
        Returns: undefined
      }
      delete_stock_out: { Args: { p_stock_out_id: string }; Returns: undefined }
      delete_supplier_payment: {
        Args: { p_payment_id: string }
        Returns: undefined
      }
      get_customer_balance: { Args: { p_customer_id: string }; Returns: number }
      get_customer_balances: {
        Args: never
        Returns: {
          code: string
          current_balance: number
          customer_id: string
          name: string
          opening_balance: number
        }[]
      }
      get_customer_ledger: {
        Args: { p_customer_id: string; p_from: string; p_to: string }
        Returns: {
          credit: number
          debit: number
          entry_date: string
          entry_id: string
          entry_type: string
          reference: string
          running_balance: number
        }[]
      }
      get_own_profile: {
        Args: never
        Returns: {
          active: boolean
          created_at: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
        }[]
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_supplier_balance: { Args: { p_supplier_id: string }; Returns: number }
      get_supplier_balances: {
        Args: never
        Returns: {
          code: string
          current_balance: number
          name: string
          opening_balance: number
          supplier_id: string
        }[]
      }
      get_supplier_ledger: {
        Args: { p_from: string; p_supplier_id: string; p_to: string }
        Returns: {
          credit: number
          debit: number
          entry_date: string
          entry_id: string
          entry_type: string
          reference: string
          running_balance: number
        }[]
      }
      get_suppliers_period_summary: {
        Args: { p_from: string; p_to: string }
        Returns: {
          code: string
          ending_balance: number
          name: string
          payments_total: number
          purchases_total: number
          supplier_id: string
        }[]
      }
      is_owner: { Args: never; Returns: boolean }
      stock_out_apply_fefo: {
        Args: { p_base_qty: number; p_item_id: string; p_stock_out_id: string }
        Returns: undefined
      }
      stock_out_reverse: {
        Args: { p_stock_out_id: string }
        Returns: undefined
      }
      update_cheque_status: {
        Args: {
          p_cheque_id: string
          p_status: Database["public"]["Enums"]["cheque_status"]
        }
        Returns: undefined
      }
      update_customer_credit: {
        Args: {
          p_amount: number
          p_credit_id: string
          p_date: string
          p_notes: string
        }
        Returns: undefined
      }
      update_customer_payment: {
        Args: {
          p_amount: number
          p_date: string
          p_notes: string
          p_payment_id: string
        }
        Returns: undefined
      }
      update_opening_stock: {
        Args: {
          p_batch_number: string
          p_cost_price: number
          p_entry_id: string
          p_expiry_date: string
          p_notes: string
          p_quantity: number
          p_unit_name: string
        }
        Returns: undefined
      }
      update_purchase_header: {
        Args: {
          p_date: string
          p_notes: string
          p_purchase_id: string
          p_reference_no: string
        }
        Returns: undefined
      }
      update_stock_adjustment: {
        Args: {
          p_adjustment_id: string
          p_date: string
          p_quantity_change: number
          p_reason: string
        }
        Returns: undefined
      }
      update_stock_out: {
        Args: {
          p_date: string
          p_quantity: number
          p_stock_out_id: string
          p_unit_name: string
        }
        Returns: undefined
      }
      update_supplier_payment: {
        Args: {
          p_amount: number
          p_cheque: Json
          p_date: string
          p_notes: string
          p_payment_id: string
          p_payment_type: Database["public"]["Enums"]["payment_method"]
        }
        Returns: undefined
      }
    }
    Enums: {
      cheque_source: "purchase" | "payment"
      cheque_status: "pending" | "cleared" | "bounced"
      payment_method: "cash" | "cheque"
      purchase_payment_type: "cash" | "credit" | "cheque"
      user_role: "owner" | "store_keeper"
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
  public: {
    Enums: {
      cheque_source: ["purchase", "payment"],
      cheque_status: ["pending", "cleared", "bounced"],
      payment_method: ["cash", "cheque"],
      purchase_payment_type: ["cash", "credit", "cheque"],
      user_role: ["owner", "store_keeper"],
    },
  },
} as const
