import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export interface RefValue {
  id: number;
  code: string;
  label: string;
}

/** Charge un domaine de ref_values (ex: 'period', 'kr_type'). */
export function useRefValues(domain: string) {
  const [values, setValues] = useState<RefValue[]>([]);

  useEffect(() => {
    api
      .get<RefValue[]>(`ref_values&domain=${domain}`)
      .then(setValues)
      .catch(() => setValues([]));
  }, [domain]);

  return values;
}
