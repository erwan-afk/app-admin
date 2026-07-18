import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

const MIN = 0.3;
const MAX = 2;
const clampScale = (s: number) => Math.min(MAX, Math.max(MIN, Math.round(s * 100) / 100));

interface T {
  scale: number;
  tx: number;
  ty: number;
}
const INITIAL: T = { scale: 1, tx: 24, ty: 24 };

function loadStored(key?: string): T {
  if (!key) return INITIAL;
  try {
    const raw = sessionStorage.getItem(`panzoom:${key}`);
    if (!raw) return INITIAL;
    const parsed = JSON.parse(raw);
    if (typeof parsed.scale === "number" && typeof parsed.tx === "number" && typeof parsed.ty === "number") {
      return parsed;
    }
  } catch {
    /* ignore — stockage corrompu ou indisponible */
  }
  return INITIAL;
}

/**
 * Conteneur pan & zoom (style Figma) :
 *  - pan : clic molette, clic gauche sur le fond, ou barre espace + glisser
 *  - zoom : boutons +/− fixes, ou molette (centrée sur le curseur)
 * Transform translate()+scale(), origine 0,0. État unique {scale,tx,ty} pour
 * que le zoom-sous-curseur reste correct (pas de setState imbriqué).
 * Les éléments cliquables portent [data-orgcard] (clic = sélection, pas pan).
 *
 * `storageKey` (optionnel) persiste la position en sessionStorage pour
 * survivre aux remounts (fermeture de modale, changement de vue) — sans
 * lui, le composant revient à INITIAL à chaque remount comme avant.
 */
export function PanZoom({
  children,
  className,
  storageKey,
}: {
  children: React.ReactNode;
  className?: string;
  storageKey?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [t, setT] = useState<T>(() => loadStored(storageKey));
  const [space, setSpace] = useState(false);
  const [grabbing, setGrabbing] = useState(false);

  useEffect(() => {
    if (!storageKey) return;
    try {
      sessionStorage.setItem(`panzoom:${storageKey}`, JSON.stringify(t));
    } catch {
      /* quota dépassé ou stockage indisponible — pas bloquant */
    }
  }, [storageKey, t]);

  const pan = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  const movedRef = useRef(false);

  // Barre espace → mode pan (sauf si on tape dans un champ)
  useEffect(() => {
    const editable = (el: Element | null) =>
      !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || (el as HTMLElement).isContentEditable);
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space" && !editable(document.activeElement)) {
        setSpace(true);
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => e.code === "Space" && setSpace(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // Zoom centré sur un point écran (cx,cy relatifs au conteneur)
  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const cx = clientX - rect.left;
    const cy = clientY - rect.top;
    setT((prev) => {
      const scale = clampScale(prev.scale * factor);
      if (scale === prev.scale) return prev;
      const ratio = scale / prev.scale;
      // Garde le point du contenu sous le curseur fixe
      return { scale, tx: cx - (cx - prev.tx) * ratio, ty: cy - (cy - prev.ty) * ratio };
    });
  }, []);

  // Molette = zoom (listener natif non-passif pour preventDefault)
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.1 : 0.9);
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  const zoomCenter = (factor: number) => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const onCard = (e.target as Element).closest?.("[data-orgcard]");
    // Ne pas paner si un drag&drop de carte démarre (laisse l'HTML5 DnD agir)
    const wantPan = e.button === 1 || (e.button === 0 && (space || !onCard));
    if (!wantPan) return;
    if (e.button === 1 || space) e.preventDefault();
    pan.current = { x: e.clientX, y: e.clientY, tx: t.tx, ty: t.ty, moved: false };
    setGrabbing(true);
    wrapRef.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pan.current) return;
    const dx = e.clientX - pan.current.x;
    const dy = e.clientY - pan.current.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) pan.current.moved = true;
    const { tx, ty } = pan.current;
    setT((prev) => ({ ...prev, tx: tx + dx, ty: ty + dy }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (pan.current) {
      movedRef.current = pan.current.moved;
      try {
        wrapRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
    pan.current = null;
    setGrabbing(false);
  };

  // Annule tout scroll parasite dû au scroll anchoring du navigateur.
  // overflow:hidden n'empêche pas le navigateur d'ajuster scrollLeft/scrollTop
  // lors de mutations DOM à l'intérieur (ex : réordonnancement de nœuds après resync).
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    if (el.scrollLeft !== 0) el.scrollLeft = 0;
    if (el.scrollTop !== 0) el.scrollTop = 0;
  });

  // Empêche la sélection d'une carte si on vient de paner (glisser)
  const onClickCapture = (e: React.MouseEvent) => {
    if (movedRef.current) {
      e.stopPropagation();
      e.preventDefault();
      movedRef.current = false;
    }
  };

  return (
    <div
      ref={wrapRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onClickCapture={onClickCapture}
      className={cn(
        "relative overflow-hidden select-none",
        grabbing ? "cursor-grabbing" : space ? "cursor-grab" : "",
        className,
      )}
      style={{ touchAction: "none", overflowAnchor: "none" } as React.CSSProperties}
    >
      <div style={{ transform: `translate(${t.tx}px, ${t.ty}px) scale(${t.scale})`, transformOrigin: "0 0" }}>
        {children}
      </div>

      {/* Contrôles de zoom — fixes en bas à droite */}
      <div className="bg-background absolute bottom-4 right-4 flex flex-col overflow-hidden rounded-md border shadow-sm">
        <button className="hover:bg-muted flex size-8 items-center justify-center" title="Zoom avant" onClick={() => zoomCenter(1.1)}>
          <Plus className="size-4" />
        </button>
        <button
          className="hover:bg-muted border-y px-1 py-1 text-[10px] font-medium tabular-nums"
          title="Réinitialiser"
          onClick={() => setT(INITIAL)}
        >
          {Math.round(t.scale * 100)}%
        </button>
        <button className="hover:bg-muted flex size-8 items-center justify-center" title="Zoom arrière" onClick={() => zoomCenter(0.9)}>
          <Minus className="size-4" />
        </button>
      </div>
    </div>
  );
}
