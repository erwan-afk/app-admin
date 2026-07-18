export interface Transaction {
  transaction_id: number;
  user_id: number;
  user_email: string | null;
  user_name: string | null;
  node_id: number;
  node_name: string | null;
  node_code: string | null;
  amount_total: number;
  amount_share: number;
  effective_date: string | null;
  attribution_mode: "auto" | "manual" | string;
  locked: number;
  ancestry?: string[];
}

export interface TxModeStat {
  mode: string;
  count: number;
  total: number;
}

export interface TxLockedStat {
  locked: number;
  count: number;
  total: number;
}

export interface TxStats {
  count: number;
  total_amount: number;
  by_mode: TxModeStat[];
  by_locked: TxLockedStat[];
}
