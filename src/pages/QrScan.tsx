import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { ArrowLeft, CheckCircle2, PlayCircle, StopCircle, Camera, AlertCircle, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import OctopusMascot from "@/components/OctopusMascot";

interface BookingRow {
  id: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  sector: string;
  topic: string | null;
  discipline: string | null;
  event_type: string;
  user_id: string;
  owner_name?: string;
}


interface UsageRow {
  booking_id: string;
  started_at: string | null;
  ended_at: string | null;
  duration_minutes: number | null;
}

const QrScan = () => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [params] = useSearchParams();
  const targetSchool = params.get("s");

  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  const [scanned, setScanned] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [usages, setUsages] = useState<Record<string, UsageRow>>({});
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);

  // Se o QR ainda não foi escaneado e a URL já trouxe ?s=, considera escaneado
  useEffect(() => {
    if (targetSchool && profile?.school_id && targetSchool === profile.school_id) {
      setScanned(true);
    }
  }, [targetSchool, profile?.school_id]);

  // Carrega agendamentos de hoje do usuário
  const loadToday = useCallback(async () => {
    if (!profile?.user_id || !profile?.school_id) return;
    setLoading(true);
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const { data: bs } = await supabase
      .from("bookings")
      .select("id,booking_date,start_time,end_time,sector,topic,discipline,event_type,user_id")
      .eq("school_id", profile.school_id)
      .eq("booking_date", today)
      .eq("status", "confirmed")
      .order("start_time");
    const rows = (bs as BookingRow[]) || [];
    const userIds = Array.from(new Set(rows.map((b) => b.user_id)));
    const bookingIds = rows.map((b) => b.id);
    const [{ data: profs }, { data: us }] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("user_id,full_name").in("user_id", userIds)
        : Promise.resolve({ data: [] as any[] }),
      bookingIds.length
        ? supabase
            .from("booking_usage")
            .select("booking_id,started_at,ended_at,duration_minutes")
            .in("booking_id", bookingIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const nameMap: Record<string, string> = {};
    (profs as any[] | null)?.forEach((p) => (nameMap[p.user_id] = p.full_name));
    setBookings(rows.map((b) => ({ ...b, owner_name: nameMap[b.user_id] })));
    const map: Record<string, UsageRow> = {};
    (us as UsageRow[] | null)?.forEach((u) => (map[u.booking_id] = u));
    setUsages(map);
    setLoading(false);
  }, [profile?.user_id, profile?.school_id]);


  useEffect(() => {
    if (scanned) loadToday();
  }, [scanned, loadToday]);

  // Câmera
  const startCamera = useCallback(async () => {
    if (!videoRef.current) return;
    setCameraError(null);
    try {
      const reader = new BrowserMultiFormatReader();
      readerRef.current = reader;
      const controls = await reader.decodeFromVideoDevice(
        undefined,
        videoRef.current,
        (result, err, ctrl) => {
          if (result) {
            const text = result.getText();
            try {
              const url = new URL(text);
              const s = url.searchParams.get("s");
              if (s && profile?.school_id && s === profile.school_id) {
                ctrl.stop();
                setScanned(true);
                if (navigator.vibrate) navigator.vibrate(80);
              } else {
                toast.error("QR Code de outra escola");
              }
            } catch {
              toast.error("QR Code inválido");
            }
          }
        }
      );
      controlsRef.current = controls;
    } catch (e: any) {
      setCameraError(
        e?.message?.includes("Permission")
          ? "Permissão de câmera negada. Habilite nas configurações do navegador."
          : "Não foi possível acessar a câmera."
      );
    }
  }, [profile?.school_id]);

  useEffect(() => {
    if (!scanned) startCamera();
    return () => {
      controlsRef.current?.stop();
    };
  }, [scanned, startCamera]);

  const handleCheckpoint = async (bookingId: string, kind: "start" | "end") => {
    setSubmitting(bookingId + kind);
    const { data, error } = await supabase.rpc("register_booking_checkpoint", {
      _booking_id: bookingId,
      _kind: kind,
    });
    setSubmitting(null);
    if (error) {
      const raw = error.message || "";
      if (raw.startsWith("booking_taken")) {
        const taker = raw.split(":")[1] || "outro usuário";
        toast.error(`Horário já assumido por ${taker}. Sala indisponível.`, { duration: 8000 });
        loadToday();
        return;
      }
      const map: Record<string, string> = {
        already_started: "Já iniciado",
        already_ended: "Já encerrado",
        not_started: "Inicie antes de encerrar",
        not_today: "Agendamento não é de hoje",
        not_owner: "Agendamento não é seu",
        wrong_school: "Escola incorreta",
      };
      toast.error(map[raw] || "Não foi possível registrar");
      return;
    }
    if (navigator.vibrate) navigator.vibrate(kind === "start" ? 60 : [60, 50, 60]);
    toast.success(kind === "start" ? "Uso iniciado!" : "Uso encerrado!");
    setUsages((prev) => ({ ...prev, [bookingId]: data as UsageRow }));
  };

  return (
    <div className="h-[100dvh] bg-background flex flex-col overflow-hidden">
      <div className="sticky top-0 z-10 bg-primary text-primary-foreground px-3 py-2 flex items-center gap-2 relative after:content-[''] after:absolute after:left-0 after:right-0 after:-bottom-3 after:h-3 after:bg-primary after:pointer-events-none">
        <Button
          variant="ghost"
          size="icon"
          className="text-primary-foreground hover:bg-white/10"
          onClick={() => navigate("/sectors")}
        >
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <span className="font-bold text-base">Check-in do ambiente</span>
      </div>

      {!scanned ? (
        <div className="flex-1 flex flex-col items-center justify-start pt-0 px-4 pb-4 gap-4">
          <div className="w-full max-w-sm bg-black rounded-2xl overflow-hidden">
            <div className="px-3 pt-1 pb-1 text-white flex flex-col items-center justify-center gap-0">
              <OctopusMascot
                className="w-52 h-52 object-contain -mt-6 -mb-12"
              />
              <div className="text-center">
                <div className="font-extrabold tracking-wide text-4xl leading-tight">AgenSchool</div>
                <div className="text-sm leading-tight opacity-90">Sistema de Agendamento Inteligente de Ambiente Escolar</div>
              </div>
            </div>
            <div className="relative w-full aspect-square">
              <video
                ref={videoRef}
                className="w-full h-full object-cover"
                autoPlay
                playsInline
                muted
              />
              <div className="absolute inset-8 border-4 border-white/70 rounded-2xl pointer-events-none" />
            </div>
            <div className="px-3 pt-2 pb-3 text-white text-center">
              <div className="text-lg font-bold leading-snug">
                Escaneie o QR Code do ambiente para registrar seu check-in
              </div>
              <div className="text-base font-medium leading-snug opacity-90 mt-1.5">
                Os horários de entrada e saída ficam registrados no sistema da administração escolar.
              </div>
            </div>
          </div>
          {cameraError && (
            <div className="flex items-start gap-2 text-destructive bg-destructive/10 p-3 rounded-lg max-w-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span className="text-sm">{cameraError}</span>
            </div>
          )}
          <Button
            onClick={() => navigate("/disciplina")}
            variant="outline"
            className="w-full max-w-sm h-14 font-bold border-2 border-amber-500/40 hover:bg-amber-500/10"
          >
            <Scale className="w-5 h-5 mr-2 text-amber-500" />
            Minhas advertências
          </Button>
        </div>



      ) : (
        <div className="flex-1 p-4 space-y-3 overflow-y-auto">
          <div className="flex items-center gap-2 bg-green-500/10 text-green-700 dark:text-green-400 p-3 rounded-lg">
            <CheckCircle2 className="w-5 h-5" />
            <span className="font-semibold">
              {bookings.length > 1
                ? "QR validado — confirme seu check-in"
                : "QR validado — confira e confirme seu check-in"}
            </span>
          </div>

          {loading && (
            <div className="text-center text-muted-foreground py-8">Carregando…</div>
          )}

          {!loading && bookings.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              Nenhum agendamento encontrado para hoje neste ambiente.
            </div>
          )}

          {bookings.map((b) => {
            const u = usages[b.id];
            const started = !!u?.started_at;
            const ended = !!u?.ended_at;
            const isOwner = b.user_id === profile?.user_id;
            const nowMs = Date.now();
            const endMs = new Date(`${b.booking_date}T${b.end_time}`).getTime();
            const isPast = endMs < nowMs;
            const expiredUnused = isPast && !started;
            const checkinTime = u?.started_at
              ? new Date(u.started_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
              : null;
            const endTime = u?.ended_at
              ? new Date(u.ended_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
              : null;

            const handleNotOwnerClick = () => {
              const mine = bookings.find(
                (x) => x.user_id === profile?.user_id && !usages[x.id]?.ended_at,
              );
              if (mine) {
                toast.error(
                  `Este agendamento não é seu. O seu é: "${mine.topic || mine.discipline || mine.event_type}" às ${mine.start_time.slice(0, 5)}.`,
                  { duration: 6000 },
                );
              } else {
                toast.error("Este agendamento não é seu e você não tem agendamentos pendentes hoje.", { duration: 6000 });
              }
            };

            return (
              <div
                key={b.id}
                className={`rounded-2xl border-2 border-dashed overflow-hidden shadow-lg ${
                  isOwner ? "border-primary/40 bg-card" : "border-muted bg-muted/30 opacity-90"
                }`}
              >
                <div className={`px-4 py-2 flex items-center justify-between ${isOwner ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  <span className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-90">
                    {isOwner ? "Seu check-in" : `De: ${b.owner_name || "outro usuário"}`}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider font-bold opacity-90">
                    {b.sector}
                  </span>
                </div>

                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 border-b border-dashed border-border pb-3">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Horário</div>
                      <div className="text-2xl font-extrabold tabular-nums leading-tight">
                        {b.start_time.slice(0, 5)}<span className="text-muted-foreground mx-1">→</span>{b.end_time.slice(0, 5)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Data</div>
                      <div className="text-base font-bold tabular-nums">
                        {new Date(b.booking_date + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Assunto</div>
                    <p className="text-base font-bold break-words leading-snug">
                      {b.topic || b.discipline || b.event_type}
                    </p>
                  </div>

                  {(checkinTime || endTime) && (
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-dashed border-border">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Entrada</div>
                        <div className="text-base font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                          {checkinTime || "—"}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Saída</div>
                        <div className="text-base font-bold tabular-nums text-blue-600 dark:text-blue-400">
                          {endTime || "—"}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="px-4 pb-4">
                  {ended ? (
                    <div className="bg-blue-500/10 text-blue-700 dark:text-blue-400 rounded-lg p-3 text-center font-bold">
                      <CheckCircle2 className="inline w-5 h-5 mr-1" />
                      Check-in encerrado • {u.duration_minutes} min de uso
                    </div>
                  ) : expiredUnused ? (
                    <div className="bg-muted text-muted-foreground rounded-lg p-3 text-center font-bold">
                      <AlertCircle className="inline w-5 h-5 mr-1" />
                      Encerrado sem uso
                    </div>
                  ) : !isOwner ? (
                    <Button
                      onClick={handleNotOwnerClick}
                      variant="outline"
                      className="w-full h-14 font-bold text-base"
                    >
                      Este não é o seu agendamento
                    </Button>
                  ) : started ? (
                    <Button
                      onClick={() => handleCheckpoint(b.id, "end")}
                      disabled={submitting === b.id + "end"}
                      className="w-full h-14 font-bold text-base bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      <StopCircle className="w-5 h-5 mr-2" />
                      Confirmar saída (check-out)
                    </Button>
                  ) : (
                    <Button
                      onClick={() => handleCheckpoint(b.id, "start")}
                      disabled={submitting === b.id + "start"}
                      className="w-full h-14 font-bold text-base bg-green-600 hover:bg-green-700 text-white"
                    >
                      <PlayCircle className="w-5 h-5 mr-2" />
                      Confirmar check-in
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

      )}
    </div>
  );
};

export default QrScan;
