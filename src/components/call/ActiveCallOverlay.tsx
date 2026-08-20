import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, Wifi, WifiOff, Loader2, RefreshCw, History, CheckCircle2, XCircle, AlertTriangle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCall, type RemotePeer, type ReconnectLogEntry } from "./CallProvider";

type ConnLabel = { text: string; cls: string; Icon: typeof Wifi };

function labelFor(state: RTCPeerConnectionState): ConnLabel {
  switch (state) {
    case "connected":
      return { text: "Conectado", cls: "bg-emerald-500/90 text-white", Icon: Wifi };
    case "disconnected":
      return { text: "Conexão perdida", cls: "bg-amber-500/90 text-white", Icon: WifiOff };
    case "failed":
    case "closed":
      return { text: "Desconectado", cls: "bg-destructive text-destructive-foreground", Icon: WifiOff };
    case "new":
    case "connecting":
    default:
      return { text: "Conectando…", cls: "bg-muted text-foreground", Icon: Loader2 };
  }
}

function ConnBadge({
  state,
  retriesLeft,
  nextRetryInMs,
  className = "",
  onReconnect,
  peerName,
  reconnecting,
  reconnectFailed,
}: {
  state: RTCPeerConnectionState;
  retriesLeft?: number;
  nextRetryInMs?: number | null;
  className?: string;
  onReconnect?: () => void;
  peerName?: string;
  reconnecting?: boolean;
  reconnectFailed?: boolean;
}) {
  const base = labelFor(state);
  const { text, cls, Icon } = reconnecting
    ? { text: "Reconectando\u2026", cls: "bg-primary text-primary-foreground", Icon: Loader2 }
    : reconnectFailed
      ? { text: "Falha na reconexão", cls: "bg-destructive text-destructive-foreground", Icon: AlertTriangle }
      : base;
  const spin = reconnecting || state === "new" || state === "connecting";
  const showRetry =
    !reconnecting &&
    !reconnectFailed &&
    (state === "disconnected" || state === "failed") &&
    typeof retriesLeft === "number";
  const seconds = nextRetryInMs != null ? Math.ceil(nextRetryInMs / 1000) : null;
  const clickable =
    !reconnecting &&
    !!onReconnect &&
    (reconnectFailed || state === "disconnected" || state === "failed" || state === "closed");
  const Tag: any = clickable ? "button" : "span";
  return (
    <Tag
      type={clickable ? "button" : undefined}
      onClick={clickable ? onReconnect : undefined}
      disabled={reconnecting}
      title={clickable ? `Reconectar ${peerName ?? ""}`.trim() : undefined}
      aria-label={clickable ? `Reconectar ${peerName ?? "peer"}` : undefined}
      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cls} ${className} ${clickable ? "cursor-pointer hover:brightness-110 active:scale-95 transition" : ""} ${reconnecting ? "animate-pulse" : ""}`}
    >
      <Icon className={`h-3 w-3 ${spin ? "animate-spin" : ""}`} />
      {text}
      {showRetry && retriesLeft > 0 && (
        <span className="ml-1 opacity-90">
          • {retriesLeft} tent.{seconds != null && seconds > 0 ? ` em ${seconds}s` : ""}
        </span>
      )}
      {showRetry && retriesLeft === 0 && <span className="ml-1 opacity-90">• sem tentativas</span>}
      {clickable && <RefreshCw className="h-3 w-3 ml-1" />}
    </Tag>
  );
}

function overallState(remotes: RemotePeer[]): RTCPeerConnectionState {
  if (remotes.length === 0) return "connecting";
  if (remotes.some((r) => r.connState === "failed" || r.connState === "closed")) return "failed";
  if (remotes.some((r) => r.connState === "disconnected")) return "disconnected";
  if (remotes.every((r) => r.connState === "connected")) return "connected";
  return "connecting";
}

function VideoTile({
  stream,
  label,
  muted,
  mirror,
  peer,
  onRequestReconnect,
}: {
  stream: MediaStream | null;
  label: string;
  muted?: boolean;
  mirror?: boolean;
  peer?: RemotePeer;
  onRequestReconnect?: (uid: string, name: string) => void;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);
  return (
    <div className="relative rounded-xl overflow-hidden bg-black aspect-video w-full">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={muted}
        className={`w-full h-full object-cover ${mirror ? "scale-x-[-1]" : ""}`}
      />
      <span className="absolute bottom-1 left-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-black/60 text-white">
        {label}
      </span>
      {peer && (
        <ConnBadge
          state={peer.connState}
          retriesLeft={peer.retriesLeft}
          nextRetryInMs={peer.nextRetryInMs}
          className="absolute top-1 right-1"
          peerName={peer.name}
          reconnecting={peer.reconnecting}
          reconnectFailed={peer.reconnectFailed}
          onReconnect={onRequestReconnect ? () => onRequestReconnect(peer.userId, peer.name) : undefined}
        />
      )}
    </div>
  );
}

function AudioOnlyTile({
  peer,
  onRequestReconnect,
}: {
  peer: RemotePeer;
  onRequestReconnect?: (uid: string, name: string) => void;
}) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    if (ref.current && peer.stream) ref.current.srcObject = peer.stream;
  }, [peer.stream]);
  return (
    <div className="relative flex flex-col items-center gap-2 p-3 rounded-xl bg-card border">
      <div className="h-16 w-16 rounded-full bg-primary/15 text-primary flex items-center justify-center text-2xl font-bold">
        {(peer.name?.[0] ?? "?").toUpperCase()}
      </div>
      <p className="text-sm font-medium text-center break-words">{peer.name}</p>
      <ConnBadge
        state={peer.connState}
        retriesLeft={peer.retriesLeft}
        nextRetryInMs={peer.nextRetryInMs}
        className="absolute top-1 right-1"
        peerName={peer.name}
        reconnecting={peer.reconnecting}
        reconnectFailed={peer.reconnectFailed}
        onReconnect={onRequestReconnect ? () => onRequestReconnect(peer.userId, peer.name) : undefined}
      />
      <audio ref={ref} autoPlay />
    </div>
  );
}

function logIconFor(type: ReconnectLogEntry["type"]) {
  switch (type) {
    case "success":
      return { Icon: CheckCircle2, cls: "text-emerald-500" };
    case "failure":
      return { Icon: XCircle, cls: "text-destructive" };
    case "give-up":
      return { Icon: AlertTriangle, cls: "text-amber-500" };
    case "manual":
      return { Icon: RefreshCw, cls: "text-primary" };
    case "attempt":
    default:
      return { Icon: Loader2, cls: "text-muted-foreground" };
  }
}

function ReconnectLogPanel({ onClose }: { onClose: () => void }) {
  const { reconnectLog, clearReconnectLog } = useCall();
  const entries = [...reconnectLog].reverse();
  return (
    <div className="fixed inset-0 z-[110] bg-background/95 backdrop-blur flex flex-col">
      <header className="px-4 py-3 border-b flex items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase font-semibold text-muted-foreground">Diagnóstico</p>
          <p className="text-sm font-bold">Histórico de reconexão ({reconnectLog.length})</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={clearReconnectLog} className="gap-1">
            <Trash2 className="h-3.5 w-3.5" />
            Limpar
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </header>
      <div className="flex-1 overflow-auto p-3">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nenhum evento de reconexão ainda.</p>
        ) : (
          <ul className="space-y-1.5">
            {entries.map((e) => {
              const { Icon, cls } = logIconFor(e.type);
              const time = new Date(e.ts).toLocaleTimeString();
              return (
                <li key={e.id} className="flex items-start gap-2 text-xs p-2 rounded-lg bg-card border break-words">
                  <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${cls}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold uppercase">{e.type}</span>
                      <span className="text-muted-foreground">{time}</span>
                      {e.attempt != null && <span className="text-muted-foreground">#{e.attempt}</span>}
                    </div>
                    <p className="font-medium break-words">{e.name}</p>
                    {e.detail && <p className="text-muted-foreground break-words">{e.detail}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function ActiveCallOverlay() {
  const { status, kind, mode, localStream, remotes, micOn, camOn, toggleMic, toggleCam, endCall, reconnectNow, reconnectPeerNow, reconnectLog } = useCall();
  const [showLog, setShowLog] = useState(false);
  const [confirmPeerId, setConfirmPeerId] = useState<string | null>(null);
  const [confirmPeerName, setConfirmPeerName] = useState("");

  if (status !== "active" && status !== "outgoing") return null;

  const isVideo = kind === "video";
  const overall = overallState(remotes);
  const needsReconnect = overall === "disconnected" || overall === "failed";

  const handleRequestReconnect = (uid: string, name: string) => {
    setConfirmPeerId(uid);
    setConfirmPeerName(name);
  };

  const handleConfirmReconnect = () => {
    if (confirmPeerId) reconnectPeerNow(confirmPeerId);
    setConfirmPeerId(null);
    setConfirmPeerName("");
  };

  const handleCancelReconnect = () => {
    setConfirmPeerId(null);
    setConfirmPeerName("");
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background flex flex-col">
      <header className="px-4 py-3 border-b bg-card/95 backdrop-blur flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs uppercase font-semibold text-muted-foreground">
            {mode === "group" ? "Chamada em grupo" : "Chamada"}
            {status === "outgoing" && " • chamando…"}
          </p>
          <p className="text-sm font-bold truncate">
            {remotes.length === 0 ? "Aguardando…" : remotes.map((r) => r.name).join(", ")}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setShowLog(true)}
            className="gap-1 relative"
            aria-label="Histórico de reconexão"
            title="Histórico de reconexão"
          >
            <History className="h-4 w-4" />
            {reconnectLog.length > 0 && (
              <span className="text-[10px] font-bold">{reconnectLog.length}</span>
            )}
          </Button>
          {needsReconnect ? (
            <Button
              type="button"
              onClick={reconnectNow}
              variant="outline"
              size="sm"
              className="gap-1 border-amber-500 text-amber-600 hover:bg-amber-500/10"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reconectar
            </Button>
          ) : (
            <ConnBadge state={overall} />
          )}
        </div>
      </header>
      {showLog && <ReconnectLogPanel onClose={() => setShowLog(false)} />}

      <div className="flex-1 overflow-auto p-3">
        {isVideo ? (
          <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 auto-rows-min">
            <VideoTile stream={localStream} label={`Você${!camOn ? " (cam off)" : ""}`} muted mirror />
            {remotes.map((r) => (
              <VideoTile key={r.userId} stream={r.stream} label={r.name} peer={r} onRequestReconnect={handleRequestReconnect} />
            ))}
            {remotes.length === 0 && (
              <div className="flex items-center justify-center rounded-xl bg-muted aspect-video text-sm text-muted-foreground">
                Aguardando outros participantes…
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="flex flex-col items-center gap-2 p-3 rounded-xl bg-primary/10 border border-primary/30">
              <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold">
                Eu
              </div>
              <p className="text-sm font-medium">Você</p>
            </div>
            {remotes.map((r) => (
              <AudioOnlyTile key={r.userId} peer={r} onRequestReconnect={handleRequestReconnect} />
            ))}
            {remotes.length === 0 && (
              <div className="col-span-full text-center text-sm text-muted-foreground py-8">
                Aguardando outros participantes…
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="border-t bg-card/95 backdrop-blur p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] flex items-center justify-center gap-4">
        <Button
          type="button"
          onClick={toggleMic}
          variant={micOn ? "secondary" : "destructive"}
          className="h-14 w-14 rounded-full p-0"
          aria-label={micOn ? "Silenciar microfone" : "Ativar microfone"}
        >
          {micOn ? <Mic className="h-6 w-6" /> : <MicOff className="h-6 w-6" />}
        </Button>
        {isVideo && (
          <Button
            type="button"
            onClick={toggleCam}
            variant={camOn ? "secondary" : "destructive"}
            className="h-14 w-14 rounded-full p-0"
            aria-label={camOn ? "Desligar câmera" : "Ligar câmera"}
          >
            {camOn ? <VideoIcon className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
          </Button>
        )}
        <Button
          type="button"
          onClick={endCall}
          className="h-14 w-14 rounded-full p-0 bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          aria-label="Encerrar chamada"
        >
          <PhoneOff className="h-6 w-6" />
        </Button>
      </footer>

      <AlertDialog open={!!confirmPeerId} onOpenChange={(open) => { if (!open) handleCancelReconnect(); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reconectar participante?</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja tentar reconectar manualmente <strong>{confirmPeerName}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelReconnect}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmReconnect}>Reconectar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
