import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { euros, MONTHS_FR } from "@/lib/format";
import type { Transaction, TxStats } from "./types";

const FILTERS = [
  { value: "", label: "Tous" },
  { value: "auto", label: "Auto" },
  { value: "manual", label: "Manuelle" },
];

function bounds(year: number, month: number) {
  const mm = String(month).padStart(2, "0");
  const last = new Date(year, month, 0).getDate();
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(last).padStart(2, "0")}` };
}

export function TransactionsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [status, setStatus] = useState("");
  const [list, setList] = useState<Transaction[]>([]);
  const [stats, setStats] = useState<TxStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { start, end } = bounds(year, month);
    try {
      const [tx, st] = await Promise.all([
        api.get<Transaction[]>(`transactions&start=${start}&end=${end}&status=${status}`),
        api.get<TxStats>(`transaction_stats&start=${start}&end=${end}`),
      ]);
      setList(tx);
      setStats(st);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [year, month, status]);

  useEffect(() => {
    load();
  }, [load]);

  const prevMonth = () =>
    month === 1 ? (setMonth(12), setYear((y) => y - 1)) : setMonth((m) => m - 1);
  const nextMonth = () =>
    month === 12 ? (setMonth(1), setYear((y) => y + 1)) : setMonth((m) => m + 1);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Transactions</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="w-36 text-center text-sm font-medium">
            {MONTHS_FR[month - 1]} {year}
          </span>
          <Button variant="outline" size="icon" onClick={nextMonth}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{stats?.count ?? "—"}</div>
            <div className="text-muted-foreground text-xs">transactions</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{euros(stats?.total_amount)}</div>
            <div className="text-muted-foreground text-xs">montant total</div>
          </CardContent>
        </Card>
        {stats?.by_mode.map((m) => (
          <Card key={m.mode}>
            <CardContent className="p-4">
              <div className="text-lg font-semibold">{euros(m.total)}</div>
              <div className="text-muted-foreground text-xs">
                {m.mode === "auto" ? "Auto" : "Manuelles"} · {m.count}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filtres */}
      <div className="mb-4 flex gap-1.5">
        {FILTERS.map((f) => (
          <Button
            key={f.value}
            size="sm"
            variant={status === f.value ? "default" : "outline"}
            onClick={() => setStatus(f.value)}
          >
            {f.label}
          </Button>
        ))}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead># Deal</TableHead>
              <TableHead>Commercial</TableHead>
              <TableHead>BU</TableHead>
              <TableHead className="text-right">Montant</TableHead>
              <TableHead>Attribution</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-center">Verrou</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-8 text-center">
                  Chargement…
                </TableCell>
              </TableRow>
            ) : list.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground py-8 text-center">
                  Aucune transaction sur cette période.
                </TableCell>
              </TableRow>
            ) : (
              list.map((t) => (
                <TableRow key={`${t.transaction_id}-${t.node_id}-${t.user_id}`}>
                  <TableCell className="text-muted-foreground font-mono text-xs">
                    {t.transaction_id}
                  </TableCell>
                  <TableCell title={t.user_email || ""}>{t.user_name || "—"}</TableCell>
                  <TableCell className="text-sm">
                    {t.node_name || "—"}
                    {t.ancestry && t.ancestry.length > 0 && (
                      <div
                        className="text-muted-foreground mt-0.5 text-[10px]"
                        title="Appartenance à la date du deal"
                      >
                        {t.ancestry.join(" › ")} › <strong>{t.user_name}</strong>
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">{euros(t.amount_share, 2)}</TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "text-xs font-medium",
                        t.attribution_mode === "auto" ? "text-emerald-600" : "text-amber-600",
                      )}
                    >
                      {t.attribution_mode === "auto" ? "Auto" : "Manuelle"}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{t.effective_date || "—"}</TableCell>
                  <TableCell className="text-center">
                    {t.locked === 1 && <Lock className="text-muted-foreground inline size-3.5" />}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {stats && stats.by_locked.length > 0 && (
        <div className="text-muted-foreground mt-3 flex gap-4 text-xs">
          {stats.by_locked.map((l) => (
            <span key={l.locked}>
              {l.locked === 1 ? "🔒 Gelés" : "✅ Actifs"} : {l.count} · {euros(l.total)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
