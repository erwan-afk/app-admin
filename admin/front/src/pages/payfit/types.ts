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
  /**
   * Adresses DEVINÉES depuis le nom, faute d'email professionnel dans Payfit —
   * provisoires et non vérifiées. C'est le cas le plus fréquent : Payfit n'avait
   * aucun email professionnel pour 50 collaborateurs sur 57 au 2026-08-05.
   */
  derived?: number;
  /**
   * Collaborateurs sans email exploitable (nom vide) : provisionnés avec une
   * adresse technique `@non-renseigne.invalid`. Ils ne peuvent pas se connecter.
   */
  placeholders?: number;
  /** Adresses devinées ou techniques remplacées par la vraie adresse Payfit. */
  promoted?: number;
  /**
   * Adresse Payfit déjà portée par un AUTRE compte : non écrite, c'est le
   * symptôme d'un doublon à fusionner (cf. la section Doublons ci-dessous).
   */
  email_conflicts?: number;
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
