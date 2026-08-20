import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { claimSirenFire } from "@/lib/sirenDedupe";
import silvoLongoAsset from "@/assets/sirens/silvo-longo.mp3.asset.json";
import silvoCurtoAsset from "@/assets/sirens/silvo-curto.mp3.asset.json";
import campainhaLongoAsset from "@/assets/sirens/campainha-longo.mp3.asset.json";
import campainhaCurtoAsset from "@/assets/sirens/campainha-curto.mp3.asset.json";

/**
 * Toca a sirene configurada pela coordenação em qualquer aparelho onde
 * o usuário esteja logado e vinculado à escola (assistentes, coordenação,
 * gestor, etc.). Respeita os mesmos horários e o "tempo reduzido do dia".
 *
 * Rotas que já tocam a sirene localmente são puladas para evitar duplo som:
 *  - /assistente/quadro  (AssistenteQuadro)
 *  - /painel-tv          (PainelTv)
 *  - /tv-professores     (TvProfessores)
 *  - /tv                 (TvMode)
 */
type SirenKind = "alarme" | "campainha";
type SirenAt = "none" | "short" | "long";
type Shift = "manha" | "tarde" | "noite";
type Period = {
  id: string;
  shift: Shift;
  period_number: number;
  label: string;
  start_time: string;
  end_time: string;
  start_siren?: SirenAt;
  end_siren?: SirenAt;
};

const SIREN_SRC: Record<SirenKind, { short: string | null; long: string | null }> = {
  alarme: { short: (silvoCurtoAsset as any).url ?? null, long: (silvoLongoAsset as any).url ?? null },
  campainha: { short: (campainhaCurtoAsset as any).url ?? null, long: (campainhaLongoAsset as any).url ?? null },
};
const normalizeSirenKind = (v: any): SirenKind => (v === "campainha" ? "campainha" : "alarme");
const time5 = (v: string | null | undefined) => (v ?? "").slice(0, 5);

const LOCAL_SIREN_ROUTES = ["/assistente/quadro", "/painel-tv", "/tv-professores", "/tv"];

export default function SchoolSirenBridge() {
  const { profile } = useAuth();
  const location = useLocation();
  const schoolId = profile?.school_id ?? null;

  const [now, setNow] = useState(new Date());
  const [periods, setPeriods] = useState<Period[]>([]);
  const [siren, setSiren] = useState<{ enabled: boolean; siren_kind: SirenKind; short_seconds: number; long_seconds: number } | null>(null);

  const today = format(now, "yyyy-MM-dd");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const firedRef = useRef<Set<string>>(new Set());
  const firedDateRef = useRef<string>(today);
  const userInteractedRef = useRef(false);

  // Marca interação para permitir autoplay
  useEffect(() => {
    const mark = () => { userInteractedRef.current = true; };
    window.addEventListener("pointerdown", mark, { once: true });
    window.addEventListener("keydown", mark, { once: true });
    window.addEventListener("touchstart", mark, { once: true });
    return () => {
      window.removeEventListener("pointerdown", mark);
      window.removeEventListener("keydown", mark);
      window.removeEventListener("touchstart", mark);
    };
  }, []);

  // Relógio
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  // Carrega config + periodos + reduzido
  const load = useCallback(async () => {
    if (!schoolId) return;
    const day = format(new Date(), "yyyy-MM-dd");
    const [s, pr, red] = await Promise.all([
      supabase.from("school_siren_settings").select("*").eq("school_id", schoolId).maybeSingle(),
      supabase.from("schedule_periods").select("*").eq("school_id", schoolId),
      supabase.from("schedule_reduced_days").select("*").eq("school_id", schoolId).eq("reduced_date", day),
    ]);
    if (s.data) {
      setSiren({
        enabled: !!s.data.enabled,
        siren_kind: normalizeSirenKind(s.data.siren_kind),
        short_seconds: s.data.short_seconds,
        long_seconds: s.data.long_seconds,
      });
    } else {
      setSiren(null);
    }
    let plist = (pr.data ?? []) as Period[];
    if (red.data && red.data.length > 0) {
      const key = (sh: string, n: number) => `${sh}-${n}`;
      const ov = new Map<string, any>();
      red.data.forEach((x: any) => ov.set(key(x.shift, x.period_number), x));
      plist = plist.map((pp) => {
        const o = ov.get(key(pp.shift, pp.period_number));
        return o ? { ...pp, start_time: o.start_time, end_time: o.end_time, label: o.label } : pp;
      });
    }
    setPeriods(plist);
  }, [schoolId]);

  useEffect(() => { load(); }, [load]);

  // Realtime
  useEffect(() => {
    if (!schoolId) return;
    const ch = supabase.channel(`siren-bridge-${schoolId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "school_siren_settings", filter: `school_id=eq.${schoolId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_periods", filter: `school_id=eq.${schoolId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_reduced_days", filter: `school_id=eq.${schoolId}` }, load)
      .subscribe((st) => { if (st === "SUBSCRIBED") load(); });
    return () => { supabase.removeChannel(ch); };
  }, [schoolId, load]);

  const events = useMemo(() => {
    const evts: { time: string; kind: "short" | "long"; key: string }[] = [];
    (["manha", "tarde", "noite"] as Shift[]).forEach((sh) => {
      const ps = periods.filter((p) => p.shift === sh).sort((a, b) => a.period_number - b.period_number);
      ps.forEach((p) => {
        const s = (p.start_siren ?? "short") as SirenAt;
        const e = (p.end_siren ?? "short") as SirenAt;
        if (s !== "none") evts.push({ time: time5(p.start_time), kind: s, key: `${sh}-${p.period_number}-start` });
        if (e !== "none") evts.push({ time: time5(p.end_time), kind: e, key: `${sh}-${p.period_number}-end` });
      });
    });
    return evts;
  }, [periods]);

  const play = useCallback((src: string) => {
    if (!userInteractedRef.current) {
      // Sem interação prévia, browser bloqueia. Vibra como fallback.
      try { navigator.vibrate?.([400, 150, 400, 150, 400]); } catch { /* noop */ }
      return;
    }
    let a = audioRef.current;
    if (!a) { a = new Audio(); audioRef.current = a; }
    try {
      a.src = src; a.loop = false; a.currentTime = 0; a.volume = 1;
      a.play().catch(() => {});
      try { navigator.vibrate?.([400, 150, 400]); } catch { /* noop */ }
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    if (firedDateRef.current !== today) {
      firedRef.current.clear();
      firedDateRef.current = today;
    }
    if (!schoolId || !siren?.enabled) return;
    if (document.visibilityState !== "visible") return;
    // Pula rotas que já tocam localmente
    if (LOCAL_SIREN_ROUTES.some((r) => location.pathname.startsWith(r))) return;
    const pack = SIREN_SRC[siren.siren_kind];
    if (!pack) return;
    const nowHM = format(now, "HH:mm");
    const nowSec = Number(format(now, "ss"));
    if (nowSec > 4) return;
    for (const ev of events) {
      const fireKey = `${schoolId}-${today}-${ev.key}-${ev.time}`;
      if (ev.time === nowHM && !firedRef.current.has(fireKey)) {
        if (!claimSirenFire(fireKey)) continue;
        firedRef.current.add(fireKey);
        const src = ev.kind === "long" ? pack.long : pack.short;
        if (src) play(src);
      }
    }
  }, [now, today, events, siren, schoolId, location.pathname, play]);

  return null;
}
