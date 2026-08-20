import { useEffect, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSectorLabels } from "@/hooks/useSectorLabels";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Clock, RefreshCw, Loader2, Radio, CheckCircle2, CircleDashed, UserX, PlayCircle, StopCircle, Download } from "lucide-react";
import { toast } from "sonner";

type BookingRow = {
  id: string;
  user_id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  sector: string;
  topic: string | null;
  discipline: string | null;
  event_type: string;
};

type UsageRow = {
  booking_id: string;
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number | null;
};

type ProfileRow = { user_id: string; full_name: string };

function timeToMs(date: string, t: string): number {
  return new Date(`${date}T${t}`).getTime();
}

function fmtClock(ms: number): string {
  if (ms < 0) ms = 0;
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

const GestorUsoReal = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { getLabel } = useSectorLabels();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [usages, setUsages] = useState<Record<string, UsageRow>>({});
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    if (!profile?.school_id) return;
    setRefreshing(true);
    const today = new Date().toISOString().slice(0, 10);
    const { data: bs } = await supabase
      .from("bookings")
      .select("id,user_id,booking_date,start_time,end_time,sector,topic,discipline,event_type")
      .eq("school_id", profile.school_id)
      .eq("booking_date", today)
      .eq("status", "confirmed")
      .order("start_time");
    const bks = (bs as BookingRow[]) || [];
    setBookings(bks);

    if (bks.length > 0) {
      const ids = bks.map((b) => b.id);
      const userIds = Array.from(new Set(bks.map((b) => b.user_id)));
      const [{ data: us }, { data: ps }] = await Promise.all([
        supabase
          .from("booking_usage")
          .select("booking_id,started_at,ended_at,duration_minutes")
          .in("booking_id", ids),
        supabase
          .from("profiles")
          .select("user_id,full_name")
          .in("user_id", userIds),
      ]);
      const umap: Record<string, UsageRow> = {};
      (us as UsageRow[] | null)?.forEach((u) => (umap[u.booking_id] = u));
      setUsages(umap);
      const pmap: Record<string, ProfileRow> = {};
      (ps as ProfileRow[] | null)?.forEach((p) => (pmap[p.user_id] = p));
      setProfiles(pmap);
    } else {
      setUsages({});
      setProfiles({});
    }
    setLoading(false);
    setRefreshing(false);
  }, [profile?.school_id]);

  useEffect(() => { load(); }, [load]);

  const [exporting, setExporting] = useState(false);
  const exportCsv = useCallback(async () => {
    if (!profile?.school_id) return;
    setExporting(true);
    try {
      const { data: us, error } = await supabase
        .from("booking_usage")
        .select("booking_id,user_id,started_at,ended_at,duration_minutes,start_source,end_source")
        .eq("school_id", profile.school_id)
        .order("started_at", { ascending: false });
      if (error) throw error;
      const rows = (us as any[]) || [];
      if (rows.length === 0) {
        toast.info("Nenhum check-in registrado ainda.");
        setExporting(false);
        return;
      }
      const bIds = Array.from(new Set(rows.map((r) => r.booking_id)));
      const uIds = Array.from(new Set(rows.map((r) => r.user_id)));
      const [{ data: bs }, { data: ps }] = await Promise.all([
        supabase.from("bookings").select("id,booking_date,start_time,end_time,sector,topic,discipline,event_type").in("id", bIds),
        supabase.from("profiles").select("user_id,full_name").in("user_id", uIds),
      ]);
      const bmap: Record<string, any> = {};
      (bs as any[] | null)?.forEach((b) => (bmap[b.id] = b));
      const pmap: Record<string, string> = {};
      (ps as any[] | null)?.forEach((p) => (pmap[p.user_id] = p.full_name));

      const headers = [
        "Data agendada","Início agendado","Fim agendado","Setor","Disciplina","Tópico",
        "Professor","Check-in","Check-out","Duração (min)","Origem check-in","Origem check-out",
      ];
      const esc = (v: any) => {
        const s = v == null ? "" : String(v);
        return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString("pt-BR") : "";
      const lines = [headers.join(";")];
      for (const r of rows) {
        const b = bmap[r.booking_id] || {};
        lines.push([
          b.booking_date || "", (b.start_time || "").slice(0,5), (b.end_time || "").slice(0,5),
          getLabel(b.sector || ""), b.discipline || "", b.topic || "",
          pmap[r.user_id] || "", fmt(r.started_at), fmt(r.ended_at),
          r.duration_minutes ?? "", r.start_source || "", r.end_source || "",
        ].map(esc).join(";"));
      }
      const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `checkins-${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`${rows.length} registro(s) exportado(s).`);
    } catch (e: any) {
      toast.error(e?.message || "Falha ao exportar");
    } finally {
      setExporting(false);
    }
  }, [profile?.school_id, getLabel]);

  // Tick a cada 1s para barra ao vivo
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Realtime para refletir scans
  useEffect(() => {
    if (!profile?.school_id) return;
    const ch = supabase
      .channel("uso_real_realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "booking_usage", filter: `school_id=eq.${profile.school_id}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `school_id=eq.${profile.school_id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [profile?.school_id, load]);

  const counts = useMemo(() => {
    const nowMs = now;
    let inUse = 0, ended = 0, waiting = 0, absent = 0;
    bookings.forEach((b) => {
      const u = usages[b.id];
      const schedStart = timeToMs(b.booking_date, b.start_time);
      const schedEnd = timeToMs(b.booking_date, b.end_time);
      if (u?.ended_at) ended++;
      else if (u?.started_at) nowMs > schedEnd ? ended++ : inUse++;
      else if (nowMs >= schedStart) absent++;
      else waiting++;
    });
    return { inUse, ended, waiting, absent };
  }, [bookings, usages, now]);

  return (
    <main className="min-h-dvh bg-[hsl(220,50%,14%)] text-white">
      <div className="sticky top-0 z-10 backdrop-blur-md bg-[hsl(220,50%,14%)]/85 border-b border-white/10">
        <div className="flex items-center gap-2 px-3 py-3 max-w-2xl mx-auto">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="h-9 w-9 text-white/85 hover:bg-white/10 hover:text-white" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-300">
              <Clock className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h1 className="text-base font-bold leading-tight truncate">Uso real do ambiente</h1>
              <p className="text-[11px] text-white/60 leading-tight">Acompanhamento ao vivo via QR Code</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={exportCsv} disabled={exporting} className="h-9 w-9 text-white/85 hover:bg-white/10 hover:text-white" aria-label="Exportar CSV" title="Exportar histórico (CSV)">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" onClick={load} disabled={refreshing} className="h-9 w-9 text-white/85 hover:bg-white/10 hover:text-white" aria-label="Atualizar">
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-3 pb-24">
        {/* Resumo */}
        <div className="grid grid-cols-4 gap-2 mb-3">
          <div className="rounded-xl bg-emerald-500/15 border border-emerald-400/30 p-2.5 text-center">
            <div className="text-[10px] uppercase tracking-wide text-emerald-200/80 font-bold">Em curso</div>
            <div className="text-2xl font-extrabold text-emerald-200 leading-none mt-1">{counts.inUse}</div>
          </div>
          <div className="rounded-xl bg-red-500/15 border border-red-400/30 p-2.5 text-center">
            <div className="text-[10px] uppercase tracking-wide text-red-200/80 font-bold">Ausente</div>
            <div className="text-2xl font-extrabold text-red-200 leading-none mt-1">{counts.absent}</div>
          </div>
          <div className="rounded-xl bg-amber-500/15 border border-amber-400/30 p-2.5 text-center">
            <div className="text-[10px] uppercase tracking-wide text-amber-200/80 font-bold">Aguardando</div>
            <div className="text-2xl font-extrabold text-amber-200 leading-none mt-1">{counts.waiting}</div>
          </div>
          <div className="rounded-xl bg-white/10 border border-white/15 p-2.5 text-center">
            <div className="text-[10px] uppercase tracking-wide text-white/70 font-bold">Finalizados</div>
            <div className="text-2xl font-extrabold text-white leading-none mt-1">{counts.ended}</div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-white/60">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando…
          </div>
        ) : bookings.length === 0 ? (
          <div className="text-center py-16 text-white/60 text-sm">
            <Clock className="h-10 w-10 mx-auto mb-3 opacity-50" />
            Nenhum agendamento para hoje.
          </div>
        ) : (
          <ul className="space-y-2">
            {bookings.map((b) => {
              const u = usages[b.id];
              const sched_start = timeToMs(b.booking_date, b.start_time);
              const sched_end = timeToMs(b.booking_date, b.end_time);
              const sched_dur = Math.max(sched_end - sched_start, 1);
              const started = u?.started_at ? new Date(u.started_at).getTime() : null;
              const ended = u?.ended_at ? new Date(u.ended_at).getTime() : null;

              let status: "ended" | "in_use" | "absent" | "waiting" | "overdue" = "waiting";
              if (ended) status = "ended";
              else if (started) status = now > sched_end ? "overdue" : "in_use";
              else if (now >= sched_start) status = now > sched_end ? "absent" : "absent";

              // barra de progresso baseada no horário agendado (cap em 100%)
              const elapsed = status === "ended"
                ? (ended! - sched_start)
                : status === "in_use"
                  ? (now - sched_start)
                  : status === "overdue"
                    ? sched_dur
                    : status === "absent"
                      ? Math.min(now, sched_end) - sched_start
                      : 0;
              const pct = Math.max(0, Math.min(100, (elapsed / sched_dur) * 100));

              const liveDur = status === "in_use" && started
                ? Math.min(now, sched_end) - started
                : status === "overdue" && started
                  ? sched_end - started
                  : status === "ended" && started && ended
                    ? ended - started
                    : status === "absent"
                      ? Math.min(now, sched_end) - sched_start
                      : 0;

              const owner = profiles[b.user_id]?.full_name || "—";
              const sectorLabel = getLabel(b.sector);

              const statusMeta = status === "in_use"
                ? { label: "PROFESSOR EM CURSO", bg: "bg-emerald-500", text: "text-white", barFrom: "from-emerald-400", barTo: "to-emerald-600", Icon: Radio, pulse: true }
                : status === "overdue"
                  ? { label: "ENCERRADO SEM CHECK-OUT", bg: "bg-orange-600", text: "text-white", barFrom: "from-orange-400", barTo: "to-orange-600", Icon: StopCircle, pulse: false }
                  : status === "ended"
                    ? { label: "FINALIZADO", bg: "bg-slate-500", text: "text-white", barFrom: "from-slate-400", barTo: "to-slate-600", Icon: CheckCircle2, pulse: false }
                    : status === "absent"
                      ? { label: "PROFESSOR AUSENTE", bg: "bg-red-600", text: "text-white", barFrom: "from-red-400", barTo: "to-red-600", Icon: UserX, pulse: true }
                      : { label: "AGUARDANDO", bg: "bg-amber-500", text: "text-white", barFrom: "from-amber-300", barTo: "to-amber-500", Icon: CircleDashed, pulse: false };
              const StatusIcon = statusMeta.Icon;

              return (
                <li key={b.id} className="rounded-xl bg-white/[0.06] border border-white/10 p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-extrabold text-white break-words leading-tight">{sectorLabel}</p>
                      <p className="text-xs text-white/75 break-words leading-tight mt-0.5">{owner}</p>
                      {(b.topic || b.discipline) && (
                        <p className="text-[11px] text-white/55 break-words leading-tight mt-0.5">
                          {[b.discipline, b.topic].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-extrabold tracking-wide shrink-0 ${statusMeta.bg} ${statusMeta.text} ${statusMeta.pulse ? "animate-pulse" : ""}`}>
                      <StatusIcon className="h-3 w-3" /> {statusMeta.label}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-white/70 mb-1 font-bold">
                    <span>{b.start_time.slice(0, 5)}</span>
                    <span className={status === "absent" ? "text-red-300" : status === "overdue" ? "text-orange-300" : "text-white/85"}>
                      {status === "in_use" && started
                        ? `⏱ ${fmtClock(liveDur)} em curso`
                        : status === "overdue" && started
                          ? `⏹ ${fmtClock(liveDur)} (sem check-out)`
                          : status === "ended" && liveDur > 0
                            ? `✓ ${fmtClock(liveDur)} de uso`
                            : status === "absent"
                              ? `⚠ ${fmtClock(liveDur)} sem check-in`
                              : "—"}
                    </span>
                    <span>{b.end_time.slice(0, 5)}</span>
                  </div>

                  {/* Barra/régua */}
                  <div className="relative h-3 w-full rounded-full bg-white/10 overflow-hidden border border-white/10">
                    <div
                      className={`absolute inset-y-0 left-0 bg-gradient-to-r ${statusMeta.barFrom} ${statusMeta.barTo} transition-[width] duration-700 ease-linear`}
                      style={{ width: `${pct}%` }}
                    />
                    {status === "in_use" && (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full bg-white shadow-[0_0_8px_rgba(16,185,129,0.9)] border-2 border-emerald-500 transition-[left] duration-700 ease-linear"
                        style={{ left: `calc(${pct}% - 8px)` }}
                      />
                    )}
                  </div>

                  {/* Histórico de check-in / check-out via QR */}
                  {(started || ended) && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                      {started && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-200 border border-emerald-400/30">
                          <PlayCircle className="h-3 w-3" />
                          Check-in {new Date(started).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                      {ended && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-200 border border-blue-400/30">
                          <StopCircle className="h-3 w-3" />
                          Check-out {new Date(ended).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      )}
                      {ended && u?.duration_minutes != null && (
                        <span className="ml-auto text-white/60">
                          {u.duration_minutes} min de uso
                        </span>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
};

export default GestorUsoReal;
