import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { PanZoom } from "@/components/PanZoom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { AppConnection, AppConnectionType, AppDetail, AppListItem } from "./types";

/**
 * Reproduit la mise en page/couleurs/animation du prototype de design
 * `Codebase/auth_global/design/Organigramme IT.dc.html` (référence visuelle,
 * pas de code porté — juste les coordonnées, couleurs OKLCH, et la logique
 * de ligne bord-à-bord + surbrillance par voisinage).
 */

const CANVAS_W = 1600;
const CANVAS_H = 820;
const APP_W = 188;
const APP_H = 88;

// Couleurs par « kind » — reprises telles quelles du prototype (OKLCH, supporté nativement par les navigateurs cibles).
const KIND_DOT: Record<string, string> = {
  core: "#3b82f6", // bleu primaire — Auth Global
  app: "#10b981", // vert primaire — apps standards
  data: "#a855f7", // violet primaire — kind data
};

// Design "Header typé" (Design/nodeDiagramIt/Node Design.dc.html, variante 1b) —
// header teinté avec pastille de forme + libellé de type, appliqué à toutes
// les cartes réelles (le hub Auth Global garde son style spécifique).
const KIND_META: Record<string, { color: string; tint: string; label: string; shape: "circle" | "ring" }> = {
  app: { color: "#0d9f6e", tint: "#eafaf2", label: "Application", shape: "circle" },
  data: { color: "#9b51e0", tint: "#f6eefd", label: "Donnée / matching", shape: "ring" },
};

function kindMarkStyle(kind: string, size: number): React.CSSProperties {
  const m = KIND_META[kind] ?? KIND_META.app;
  const base: React.CSSProperties = { width: size, height: size, flex: "0 0 auto", boxSizing: "border-box" };
  if (m.shape === "ring") return { ...base, borderRadius: "50%", background: "#fff", border: `2px solid ${m.color}` };
  return { ...base, borderRadius: "50%", background: m.color };
}

const ENV_BADGE_CLASS = "shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-wide";

function envBadgeStyle(env: "prod" | "preprod"): React.CSSProperties {
  const pre = env === "preprod";
  return {
    color: pre ? "#b45309" : "#5b6572",
    background: pre ? "#fdf1de" : "#f0f2f5",
    border: `1px solid ${pre ? "#f0d9ad" : "#e4e7eb"}`,
  };
}

/** Domaine affichable, sans protocole ni slash final (cf. design : "auth.media-start.fr"). */
function displayLink(url: string | null | undefined): string | null {
  if (!url) return null;
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "") || null;
}

const TYPE_STYLE: Record<AppConnectionType, { stroke: string; width: number; dash: string; base: number; label: string; animated: boolean }> = {
  auth: { stroke: "oklch(0.55 0.16 255)", width: 2.4, dash: "2 9", base: 0.85, label: "Authentification", animated: true },
  data: { stroke: "oklch(0.6 0.11 195)", width: 2.4, dash: "2 9", base: 0.85, label: "Flux de données", animated: true },
  navigation: { stroke: "oklch(0.7 0.1 65)", width: 1.8, dash: "2 10", base: 0.18, label: "Navigation", animated: true },
  mirror: { stroke: "oklch(0.72 0.02 262)", width: 1.6, dash: "5 6", base: 0.16, label: "Miroir prod/préprod", animated: false },
};

// Nœuds hors-oauth_clients référencés par leur `to_external_label` — position,
// dimension et « kind » calqués sur le prototype (auth = serveur IdP, ext =
// HubSpot, le reste = kind « app » comme dans le design original).
const EXTERNAL_LAYOUT: Record<string, { x: number; y: number; w: number; h: number; kind: string; role: string; core?: boolean; link?: string }> = {
  "Serveur Auth Global": {
    x: 433,
    y: 51,
    w: 214,
    h: 118,
    kind: "core",
    role: "SSO · Authentification",
    core: true,
    link: "https://admin.groupebenoitboitard.com/",
  },
  Portail: { x: 716, y: 251, w: APP_W, h: APP_H, kind: "app", role: "Accès aux services" },
  HubSpot: { x: 726, y: 455, w: APP_W, h: APP_H, kind: "ext", role: "CRM" },
  "Admin (Préprod)": { x: -14, y: 251, w: 190, h: 74, kind: "app", role: "Administration" },
  "Digicertif Admin (Préprod)": { x: 934, y: 663, w: 190, h: 74, kind: "app", role: "Administration" },
};

const REAL_LAYOUT: Record<string, { x: number; y: number; role: string; kind: string }> = {
  admin: { x: 206, y: 251, role: "Administration", kind: "app" },
  marketing: { x: 74, y: 455, role: "LeadGen", kind: "app" },
  report: { x: 446, y: 455, role: "Reporting transactions", kind: "app" },
  data: { x: 126, y: 663, role: "Blacklist / Matching", kind: "data" },
  "digi-certif-login": { x: 716, y: 663, role: "Administration", kind: "app" },
  "digicertif-saas": { x: 436, y: 663, role: "Application", kind: "app" },
};
const REAL_FALLBACK = { x: 1006, y: 455 };

const EXTERNAL_NEW = "__external__";

function getPanZoomScale(el: HTMLElement): number {
  let cur: HTMLElement | null = el.parentElement;
  while (cur && cur !== document.body) {
    if (cur.style.transform?.includes("scale")) {
      return new DOMMatrix(cur.style.transform).a;
    }
    cur = cur.parentElement;
  }
  return 1;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Point d'intersection du rayon (centre de `box` → cible) avec son contour, marge 7px (cf. prototype). */
function borderPoint(box: Box, tx: number, ty: number): [number, number] {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  const hw = box.w / 2 + 7;
  const hh = box.h / 2 + 7;
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return [cx, cy];
  const sx = dx !== 0 ? hw / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? hh / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy);
  return [cx + dx * s, cy + dy * s];
}

export function AppArchitectureChart({
  apps,
  onChanged,
}: {
  apps: AppListItem[];
  onChanged: () => void;
}) {
  const [connections, setConnections] = useState<AppConnection[]>([]);
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<AppDetail | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [legendType, setLegendType] = useState<AppConnectionType | null>(null);

  const dragRef = useRef<{
    id: string;
    startX: number;
    startY: number;
    origin: { x: number; y: number };
    moved: boolean;
  } | null>(null);

  const loadConnections = () => {
    api
      .get<AppConnection[]>("app_connections")
      .then(setConnections)
      .catch(() => setConnections([]));
  };

  useEffect(loadConnections, []);

  useEffect(() => {
    setPositions((prev) => {
      const next = { ...prev };
      apps.forEach((a, i) => {
        if (next[a.id]) return;
        if (a.position_x != null && a.position_y != null) {
          next[a.id] = { x: a.position_x, y: a.position_y };
        } else if (REAL_LAYOUT[a.id]) {
          next[a.id] = { x: REAL_LAYOUT[a.id].x, y: REAL_LAYOUT[a.id].y };
        } else {
          // Grille pour les apps sans layout dédié (ex: clients service Payfit/KPI)
          // — un simple décalage linéaire (40px) les empilait, la carte fait 188px de large.
          const col = i % 3;
          const row = Math.floor(i / 3);
          next[a.id] = {
            x: REAL_FALLBACK.x + col * (APP_W + 24),
            y: REAL_FALLBACK.y + row * (APP_H + 32),
          };
        }
      });
      return next;
    });
  }, [apps]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedDetail(null);
      return;
    }
    if (EXTERNAL_LAYOUT[selectedId]) return; // node externe : pas de fiche `oauth_clients`
    api
      .get<AppDetail>(`app&id=${selectedId}`)
      .then(setSelectedDetail)
      .catch(() => setSelectedDetail(null));
  }, [selectedId]);

  function kindOf(id: string): string {
    if (EXTERNAL_LAYOUT[id]) return EXTERNAL_LAYOUT[id].kind;
    return REAL_LAYOUT[id]?.kind ?? "app";
  }

  function boxOf(id: string): Box | null {
    if (EXTERNAL_LAYOUT[id]) {
      const l = EXTERNAL_LAYOUT[id];
      return { x: l.x, y: l.y, w: l.w, h: l.h };
    }
    const p = positions[id];
    if (!p) return null;
    return { x: p.x, y: p.y, w: APP_W, h: APP_H };
  }

  // Toute paire (app réelle, node externe) référencée par une connexion.
  const externalIds = useMemo(
    () => Array.from(new Set(connections.filter((c) => !c.to_client_id && c.to_external_label).map((c) => c.to_external_label!))),
    [connections],
  );

  const focus = hoveredId || selectedId;
  const neighbors = useMemo(() => {
    const set = new Set<string>();
    if (!focus) return set;
    set.add(focus);
    connections.forEach((c) => {
      const to = c.to_client_id ?? c.to_external_label ?? "";
      if (c.from_client_id === focus) set.add(to);
      if (to === focus) set.add(c.from_client_id);
    });
    return set;
  }, [connections, focus]);

  function onCardPointerDown(e: React.PointerEvent, id: string) {
    if (e.button !== 0 || EXTERNAL_LAYOUT[id]) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    dragRef.current = { id, startX: e.clientX, startY: e.clientY, origin: positions[id], moved: false };
  }

  function onCardPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    const scale = getPanZoomScale(e.currentTarget as HTMLElement);
    const dx = (e.clientX - d.startX) / scale;
    const dy = (e.clientY - d.startY) / scale;
    if (Math.abs(dx) > 4 || Math.abs(dy) > 4) d.moved = true;
    if (!d.moved) return;
    setPositions((prev) => ({ ...prev, [d.id]: { x: d.origin.x + dx, y: d.origin.y + dy } }));
  }

  function onCardPointerUp(e: React.PointerEvent, id: string) {
    const d = dragRef.current;
    dragRef.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    if (!d) return;
    if (!d.moved) {
      setSelectedId(id);
      return;
    }
    const pos = positions[id];
    api
      .put("update_app_position", { id, position_x: Math.round(pos.x), position_y: Math.round(pos.y) })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Erreur"));
  }

  async function deleteConnection(id: number) {
    try {
      await api.del("delete_app_connection", { id });
      loadConnections();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    }
  }

  const outgoing = connections.filter((c) => c.from_client_id === selectedId);
  const incoming = connections.filter((c) => (c.to_client_id ?? c.to_external_label) === selectedId);
  const selectedExternal = selectedId ? EXTERNAL_LAYOUT[selectedId] : null;

  return (
    <div className="relative h-full">
      <style>
        {"@keyframes dc-dashmove{to{stroke-dashoffset:-12;}} @keyframes dc-dashmove-rev{to{stroke-dashoffset:12;}}"}
      </style>

      {/* Légende + action */}
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          {(Object.keys(TYPE_STYLE) as AppConnectionType[]).map((t) => (
            <div
              key={t}
              className="flex cursor-default items-center gap-1.5"
              onMouseEnter={() => setLegendType(t)}
              onMouseLeave={() => setLegendType((v) => (v === t ? null : v))}
            >
              <span className="inline-block h-0 w-6" style={{ borderTop: `2.5px dotted ${TYPE_STYLE[t].stroke}` }} />
              <span className="text-muted-foreground">{TYPE_STYLE[t].label}</span>
            </div>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
          <Plus className="size-4" /> Connexion
        </Button>
      </div>

      <PanZoom className="h-[calc(100%-4.25rem)] w-full rounded-md border" storageKey="apps-architecture">
        <div style={{ position: "relative", width: CANVAS_W, height: CANVAS_H }}>
          <svg
            width={CANVAS_W}
            height={CANVAS_H}
            style={{ position: "absolute", top: 0, left: 0, overflow: "visible", pointerEvents: "none" }}
          >
            <defs>
              <marker id="arch-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
              </marker>
            </defs>
            {connections.map((c) => {
              const toId = c.to_client_id ?? c.to_external_label ?? "";
              const fromBox = boxOf(c.from_client_id);
              const toBox = boxOf(toId);
              if (!fromBox || !toBox) return null;
              const t = TYPE_STYLE[c.type];
              const [sx, sy] = borderPoint(fromBox, toBox.x + toBox.w / 2, toBox.y + toBox.h / 2);
              const [ex, ey] = borderPoint(toBox, fromBox.x + fromBox.w / 2, fromBox.y + fromBox.h / 2);
              const connected = !focus || (neighbors.has(c.from_client_id) && neighbors.has(toId));
              let opacity = focus ? (connected ? 1 : 0.05) : t.base;
              let width = focus && connected ? t.width + 0.9 : t.width;
              if (legendType) {
                const match = c.type === legendType;
                opacity = match ? 1 : 0.05;
                width = match ? t.width + 0.9 : t.width;
              }
              return (
                <line
                  key={c.id}
                  x1={sx}
                  y1={sy}
                  x2={ex}
                  y2={ey}
                  stroke={t.stroke}
                  strokeWidth={width}
                  strokeDasharray={t.dash}
                  strokeLinecap="round"
                  markerEnd={c.type === "mirror" || c.type === "data" ? undefined : "url(#arch-arrow)"}
                  markerStart={c.type === "data" ? "url(#arch-arrow)" : undefined}
                  style={{
                    opacity,
                    animation: t.animated
                      ? `${c.type === "data" ? "dc-dashmove-rev" : "dc-dashmove"} 0.7s linear infinite`
                      : undefined,
                    transition: "opacity .18s, stroke-width .18s",
                  }}
                />
              );
            })}
          </svg>

          {apps.map((a) => {
            const pos = positions[a.id];
            if (!pos) return null;
            const kind = kindOf(a.id);
            const meta = KIND_META[kind] ?? KIND_META.app;
            const dimmed = legendType ? false : !!focus && !neighbors.has(a.id);
            const isFocus = a.id === focus;
            const href = a.public_url;
            const link = displayLink(href);
            return (
              <div
                key={a.id}
                data-orgcard
                onPointerDown={(e) => onCardPointerDown(e, a.id)}
                onPointerMove={onCardPointerMove}
                onPointerUp={(e) => onCardPointerUp(e, a.id)}
                onMouseEnter={() => setHoveredId(a.id)}
                onMouseLeave={() => setHoveredId((h) => (h === a.id ? null : h))}
                className="bg-background absolute flex cursor-grab flex-col overflow-hidden rounded-xl border shadow-sm select-none active:cursor-grabbing"
                style={{
                  left: pos.x,
                  top: pos.y,
                  width: APP_W,
                  height: APP_H,
                  opacity: dimmed ? 0.28 : 1,
                  boxShadow: isFocus ? "0 0 0 3px oklch(0.55 0.16 255 / 0.28)" : undefined,
                  transition: "opacity .18s, box-shadow .18s",
                }}
              >
                <div
                  className="flex items-center gap-1.5 px-3 py-[5px]"
                  style={{ background: meta.tint, borderBottom: "1px solid rgba(0,0,0,.05)" }}
                >
                  <span style={kindMarkStyle(kind, 9)} />
                  <span
                    className="truncate text-[9px] font-semibold tracking-wide uppercase"
                    style={{ color: meta.color }}
                  >
                    {meta.label}
                  </span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 px-3 pt-[6px] pb-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] font-bold">{a.name}</span>
                    {a.environment && (
                      <span className={ENV_BADGE_CLASS} style={envBadgeStyle(a.environment)}>
                        {a.environment === "preprod" ? "PRÉPROD" : "PROD"}
                      </span>
                    )}
                  </div>
                  {link && href && (
                    <div
                      role="link"
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(href, "_blank", "noopener,noreferrer");
                      }}
                      className="bg-muted/40 hover:bg-muted flex min-w-0 cursor-pointer items-center gap-1 rounded-md border px-1.5 py-[3px]"
                    >
                      <span className="text-muted-foreground min-w-0 flex-1 truncate font-mono text-[9px]">
                        {link}
                      </span>
                      <span className="shrink-0 text-[9px] text-blue-600">↗</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {externalIds.map((label) => {
            const l = EXTERNAL_LAYOUT[label];
            if (!l) return null;
            const dimmed = legendType ? false : !!focus && !neighbors.has(label);
            const isFocus = label === focus;
            const isPreprod = label.includes("Préprod");
            return (
              <div
                key={label}
                data-orgcard
                onClick={() => setSelectedId(label)}
                onMouseEnter={() => setHoveredId(label)}
                onMouseLeave={() => setHoveredId((h) => (h === label ? null : h))}
                className="absolute flex cursor-pointer flex-col justify-center gap-1 rounded-[13px] px-4 py-3 select-none"
                style={{
                  left: l.x,
                  top: l.y,
                  width: l.w,
                  height: l.h,
                  opacity: dimmed ? 0.28 : 1,
                  background: l.core
                    ? "linear-gradient(158deg, oklch(0.37 0.1 262), oklch(0.3 0.09 264))"
                    : isPreprod
                      ? "oklch(0.975 0.006 262)"
                      : "#fff",
                  color: l.core ? "#fff" : isPreprod ? "oklch(0.44 0.02 262)" : "oklch(0.28 0.02 262)",
                  border: l.core
                    ? "1px solid oklch(0.44 0.09 262)"
                    : isPreprod
                      ? "1.5px dashed oklch(0.78 0.02 262)"
                      : "1px solid oklch(0.9 0.012 262)",
                  boxShadow: l.core
                    ? isFocus
                      ? "0 12px 34px -14px oklch(0.4 0.14 262 / 0.6), 0 0 0 3px oklch(0.55 0.16 255 / 0.28)"
                      : "0 12px 34px -14px oklch(0.4 0.14 262 / 0.6)"
                    : isFocus
                      ? "0 1px 2px rgba(16,24,40,.05), 0 0 0 3px oklch(0.55 0.16 255 / 0.28)"
                      : "0 1px 2px rgba(16,24,40,.05), 0 16px 32px -24px rgba(16,24,40,.5)",
                  transition: "opacity .18s, box-shadow .18s",
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ background: l.core ? KIND_DOT.core : KIND_DOT[l.kind] }}
                  />
                  <span className="truncate text-[14.5px] font-semibold">{label}</span>
                </div>
                <div className="ml-[19px] text-[11.5px]" style={{ opacity: 0.75 }}>
                  {l.role}
                </div>
                {l.link && (
                  <div
                    role="link"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      window.open(l.link, "_blank", "noopener,noreferrer");
                    }}
                    className="mt-1.5 ml-[19px] flex min-w-0 cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 hover:bg-white/[.14]"
                    style={{ background: "rgba(255,255,255,.08)", borderColor: "rgba(255,255,255,.12)" }}
                  >
                    <span className="min-w-0 flex-1 truncate font-mono text-[10.5px]" style={{ color: "#cdd8ec" }}>
                      {displayLink(l.link)}
                    </span>
                    <span className="shrink-0 text-[11px]" style={{ color: "#7fa8f5" }}>
                      ↗
                    </span>
                  </div>
                )}
                {isPreprod && (
                  <span className="absolute right-2 top-2 rounded border px-1 py-0.5 font-mono text-[9px] tracking-wide opacity-70">
                    PRÉPROD
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </PanZoom>

      {/* Panneau de détail flottant — calqué sur le prototype (top-right, hors du contenu pan/zoom) */}
      {selectedId && (selectedDetail || selectedExternal) && (
        <div className="bg-background absolute right-4 top-14 z-10 max-h-[calc(100%-4rem)] w-[344px] overflow-auto rounded-2xl border p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">{selectedDetail?.name ?? selectedId}</div>
              <div className="text-muted-foreground mt-0.5 text-xs">
                {selectedExternal?.role ?? REAL_LAYOUT[selectedId]?.role ?? ""}
              </div>
            </div>
            <button
              onClick={() => setSelectedId(null)}
              className="bg-muted text-muted-foreground flex size-7 shrink-0 items-center justify-center rounded-md"
            >
              ×
            </button>
          </div>

          {selectedDetail?.environment && (
            <span className="mt-3 inline-block rounded-md border px-2 py-0.5 font-mono text-[10.5px] tracking-wide">
              {selectedDetail.environment === "prod" ? "Production" : "Préproduction"}
            </span>
          )}
          {selectedDetail?.description && (
            <p className="text-muted-foreground mt-3.5 text-[13.5px] leading-relaxed">{selectedDetail.description}</p>
          )}
          {selectedExternal && !selectedDetail && (
            <p className="text-muted-foreground mt-3.5 text-[13.5px] italic">Système hors auth_global (pas de client OAuth2).</p>
          )}

          {outgoing.length > 0 && (
            <div className="mt-4">
              <p className="text-muted-foreground mb-2 text-[11px] font-semibold uppercase tracking-wide">Communique vers</p>
              <ul className="space-y-1">
                {outgoing.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 py-1 text-sm">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: TYPE_STYLE[c.type].stroke }} />
                    <span className="font-medium">{c.to_name ?? c.to_external_label}</span>
                    <span className="text-muted-foreground text-xs">· {c.label || TYPE_STYLE[c.type].label}</span>
                    {REAL_LAYOUT[selectedId] && (
                      <button onClick={() => deleteConnection(c.id)} className="text-muted-foreground ml-auto hover:text-red-600">
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {incoming.length > 0 && (
            <div className="mt-4">
              <p className="text-muted-foreground mb-2 text-[11px] font-semibold uppercase tracking-wide">Reçoit de</p>
              <ul className="space-y-1">
                {incoming.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 py-1 text-sm">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: TYPE_STYLE[c.type].stroke }} />
                    <span className="font-medium">{c.from_name}</span>
                    <span className="text-muted-foreground text-xs">· {c.label || TYPE_STYLE[c.type].label}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <AddConnectionDialog
        open={addOpen}
        apps={apps}
        onClose={() => setAddOpen(false)}
        onCreated={() => {
          setAddOpen(false);
          loadConnections();
          onChanged();
        }}
      />
    </div>
  );
}

function AddConnectionDialog({
  open,
  apps,
  onClose,
  onCreated,
}: {
  open: boolean;
  apps: AppListItem[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [externalLabel, setExternalLabel] = useState("");
  const [type, setType] = useState<AppConnectionType>("data");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setFrom("");
      setTo("");
      setExternalLabel("");
      setType("data");
      setLabel("");
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!from || (!to && !externalLabel)) {
      toast.error("Choisissez une app source et une cible");
      return;
    }
    setSaving(true);
    try {
      await api.post("create_app_connection", {
        from_client_id: from,
        to_client_id: to === EXTERNAL_NEW ? undefined : to || undefined,
        to_external_label: to === EXTERNAL_NEW ? externalLabel : undefined,
        type,
        label,
      });
      toast.success("Connexion créée");
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Nouvelle connexion</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>De</Label>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger><SelectValue placeholder="— App source —" /></SelectTrigger>
              <SelectContent>
                {apps.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Vers</Label>
            <Select value={to} onValueChange={setTo}>
              <SelectTrigger><SelectValue placeholder="— App ou externe —" /></SelectTrigger>
              <SelectContent>
                {apps.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
                <SelectItem value={EXTERNAL_NEW}>Système externe…</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {to === EXTERNAL_NEW && (
            <div className="space-y-1.5">
              <Label htmlFor="conn-external">Nom du système externe</Label>
              <Input
                id="conn-external"
                placeholder="ex: HubSpot"
                value={externalLabel}
                onChange={(e) => setExternalLabel(e.target.value)}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as AppConnectionType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_STYLE) as AppConnectionType[]).map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_STYLE[t].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="conn-label">Description (optionnel)</Label>
            <Input
              id="conn-label"
              placeholder="ex: Envoie les leads"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={saving}>Créer</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
