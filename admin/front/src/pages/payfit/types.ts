export interface AccountingSyncSummary {
  company_id?: string;
  period?: string;
  fetched?: number;
  error?: string;
}

export interface SyncSummary {
  company_id?: string;
  fetched?: number;
  skipped_inactive?: number;
  created?: number;
  synced?: number;
  deactivated?: number;
  errors?: number;
  error?: string;
  accounting?: AccountingSyncSummary;
}

export interface PayfitCompany {
  id: number;
  label: string;
  api_key_masked: string;
  company_id: string | null;
  email_domain: string;
  active: number;
  last_synced_at: string | null;
  last_sync_summary: SyncSummary | null;
}

export interface PayfitCompanyFormValues {
  label: string;
  api_key: string;
  company_id: string;
  email_domain: string;
}

export interface DuplicateUser {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  payfit_id: string | null;
  active: number;
  created_at: string;
  node_name: string | null;
  assignment_count: number;
  role_count: number;
}

export interface DuplicateGroup {
  first_name: string;
  last_name: string;
  users: DuplicateUser[];
}
