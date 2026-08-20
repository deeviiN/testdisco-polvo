import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * WebRTC P2P call provider.
 * Signaling rides on Supabase Realtime broadcast channels (no DB writes).
 *
 * Channels:
 *  - user:{userId}        -> 1:1 (DM) ring + offer/answer/ice/bye
 *  - call:school:{schoolId} -> group call presence + mesh signaling
 *
 * Mode "dm"    = 1:1 (offerer/answerer, 1 RTCPeerConnection)
 * Mode "group" = mesh (1 RTCPeerConnection per remote peer)
 */

type CallKind = "audio" | "video";
type CallMode = "dm" | "group";
type CallStatus = "idle" | "outgoing" | "incoming" | "active";

export type RemotePeer = {
  userId: string;
  name: string;
  stream: MediaStream | null;
  connState: RTCPeerConnectionState;
  retriesLeft: number;
  nextRetryInMs: number | null;
  reconnecting: boolean;
  reconnectFailed: boolean;
};

type IncomingCall = {
  kind: CallKind;
  fromUserId: string;
  fromName: string;
  // for DM: offer SDP; for group: invite (no offer yet, mesh negotiates after accept)
  offer?: RTCSessionDescriptionInit;
  mode: CallMode;
  schoolId?: string;
};

export type ReconnectLogEntry = {
  id: string;
  ts: number;
  userId: string;
  name: string;
  type: "attempt" | "success" | "failure" | "give-up" | "manual";
  attempt?: number;
  detail?: string;
};

type CallContextValue = {
  status: CallStatus;
  mode: CallMode | null;
  kind: CallKind | null;
  localStream: MediaStream | null;
  remotes: RemotePeer[];
  incoming: IncomingCall | null;
  micOn: boolean;
  camOn: boolean;
  startDmCall: (otherUserId: string, otherName: string, kind: CallKind) => Promise<void>;
  startGroupCall: (kind: CallKind) => Promise<void>;
  acceptIncoming: () => Promise<void>;
  rejectIncoming: () => void;
  toggleMic: () => void;
  toggleCam: () => void;
  endCall: () => void;
  reconnectNow: () => void;
  reconnectPeerNow: (userId: string) => void;
  reconnectLog: ReconnectLogEntry[];
  clearReconnectLog: () => void;
};

const CallContext = createContext<CallContextValue | null>(null);

const ICE: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],
};

const MAX_RECONNECT_ATTEMPTS = 5;
// delays: 1s, 2s, 4s, 8s, 16s
const backoffMs = (attempt: number) => Math.min(16000, 1000 * 2 ** attempt);
const MANUAL_RECONNECT_TIMEOUT_MS = 15000;

export function useCall() {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be inside <CallProvider>");
  return ctx;
}

type PeerEntry = {
  pc: RTCPeerConnection;
  name: string;
  stream: MediaStream;
  connState: RTCPeerConnectionState;
};

export default function CallProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const myId = user?.id ?? null;
  const myName = profile?.full_name ?? "Usuário";
  const schoolId = profile?.school_id ?? null;

  const [status, setStatus] = useState<CallStatus>("idle");
  const [mode, setMode] = useState<CallMode | null>(null);
  const [kind, setKind] = useState<CallKind | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [, force] = useState(0);
  const [incoming, setIncoming] = useState<IncomingCall | null>(null);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const userChannelRef = useRef<RealtimeChannel | null>(null);
  const schoolChannelRef = useRef<RealtimeChannel | null>(null);
  const peersRef = useRef<Map<string, PeerEntry>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const ringtoneRef = useRef<{ ctx: AudioContext; stop: () => void } | null>(null);
  const reconnectAttemptsRef = useRef<Map<string, number>>(new Map());
  const reconnectTimersRef = useRef<Map<string, number>>(new Map());
  const nextRetryAtRef = useRef<Map<string, number>>(new Map());
  const manualReconnectingRef = useRef<Set<string>>(new Set());
  const manualReconnectTimeoutsRef = useRef<Map<string, number>>(new Map());
  const manualReconnectFailedRef = useRef<Set<string>>(new Set());
  const [tick, setTick] = useState(0);
  const [reconnectLog, setReconnectLog] = useState<ReconnectLogEntry[]>([]);
  const logCounterRef = useRef(0);

  const pushLog = useCallback(
    (entry: Omit<ReconnectLogEntry, "id" | "ts">) => {
      const id = `${Date.now()}-${++logCounterRef.current}`;
      const full: ReconnectLogEntry = { id, ts: Date.now(), ...entry };
      // eslint-disable-next-line no-console
      console.log("[call/reconnect]", full);
      setReconnectLog((prev) => {
        const next = [...prev, full];
        return next.length > 200 ? next.slice(next.length - 200) : next;
      });
    },
    [],
  );

  const clearReconnectLog = useCallback(() => setReconnectLog([]), []);

  const remotes: RemotePeer[] = useMemo(() => {
    const now = Date.now();
    return Array.from(peersRef.current.entries()).map(([uid, p]) => {
      const attempts = reconnectAttemptsRef.current.get(uid) ?? 0;
      const retriesLeft = Math.max(0, MAX_RECONNECT_ATTEMPTS - attempts);
      const nextAt = nextRetryAtRef.current.get(uid);
      const nextRetryInMs = nextAt ? Math.max(0, nextAt - now) : null;
      return {
        userId: uid,
        name: p.name,
        stream: p.stream,
        connState: p.connState,
        retriesLeft,
        nextRetryInMs,
        reconnecting: manualReconnectingRef.current.has(uid),
        reconnectFailed: manualReconnectFailedRef.current.has(uid),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peersRef.current.size, status, tick]);

  // 1s ticker while any retry is scheduled, so the countdown badge updates.
  useEffect(() => {
    if (nextRetryAtRef.current.size === 0) return;
    const id = window.setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, [tick, status]);

  /* ----------------------------- helpers ----------------------------- */

  const startRingtone = useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      let stopped = false;
      const beep = () => {
        if (stopped) return;
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = "sine";
        o.frequency.value = 520;
        g.gain.setValueAtTime(0.0001, ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.05);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
        o.connect(g).connect(ctx.destination);
        o.start();
        o.stop(ctx.currentTime + 0.5);
        setTimeout(beep, 1200);
      };
      beep();
      ringtoneRef.current = {
        ctx,
        stop: () => {
          stopped = true;
          setTimeout(() => ctx.close().catch(() => {}), 600);
        },
      };
    } catch {}
  }, []);

  const stopRingtone = useCallback(() => {
    ringtoneRef.current?.stop();
    ringtoneRef.current = null;
  }, []);

  const sendToUser = useCallback(
    async (targetUserId: string, type: string, payload: any) => {
      const ch = supabase.channel(`user:${targetUserId}`, { config: { broadcast: { ack: false } } });
      await new Promise<void>((resolve) => {
        ch.subscribe((s) => {
          if (s === "SUBSCRIBED") resolve();
        });
      });
      await ch.send({ type: "broadcast", event: type, payload });
      setTimeout(() => supabase.removeChannel(ch), 300);
    },
    [],
  );

  const broadcastSchool = useCallback(
    (type: string, payload: any) => {
      schoolChannelRef.current?.send({ type: "broadcast", event: type, payload });
    },
    [],
  );

  const acquireLocalStream = useCallback(async (k: CallKind): Promise<MediaStream> => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: k === "video" ? { width: { ideal: 640 }, height: { ideal: 480 } } : false,
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  const createPeer = useCallback(
    (remoteUserId: string, remoteName: string, isInitiator: boolean, callMode: CallMode): RTCPeerConnection => {
      const pc = new RTCPeerConnection(ICE);
      const remoteStream = new MediaStream();
      peersRef.current.set(remoteUserId, { pc, name: remoteName, stream: remoteStream, connState: "new" });

      pc.ontrack = (ev) => {
        ev.streams[0].getTracks().forEach((t) => remoteStream.addTrack(t));
        force((x) => x + 1);
      };
      pc.onicecandidate = (ev) => {
        if (!ev.candidate) return;
        if (callMode === "dm") {
          sendToUser(remoteUserId, "webrtc-ice", { from: myId, candidate: ev.candidate });
        } else {
          broadcastSchool("webrtc-ice", { from: myId, to: remoteUserId, candidate: ev.candidate });
        }
      };
      pc.onconnectionstatechange = () => {
        const entry = peersRef.current.get(remoteUserId);
        const prev = entry?.connState;
        if (entry) entry.connState = pc.connectionState;
        force((x) => x + 1);
        if (pc.connectionState === "connected" && prev !== "connected") {
          manualReconnectingRef.current.delete(remoteUserId);
          manualReconnectFailedRef.current.delete(remoteUserId);
          const t = manualReconnectTimeoutsRef.current.get(remoteUserId);
          if (t) { clearTimeout(t); manualReconnectTimeoutsRef.current.delete(remoteUserId); }
          pushLog({ userId: remoteUserId, name: entry?.name ?? remoteUserId, type: "success", detail: "peer connected" });
        }
        if (pc.connectionState === "failed" || pc.connectionState === "closed") {
          manualReconnectingRef.current.delete(remoteUserId);
          const t = manualReconnectTimeoutsRef.current.get(remoteUserId);
          if (t) { clearTimeout(t); manualReconnectTimeoutsRef.current.delete(remoteUserId); }
          pushLog({
            userId: remoteUserId,
            name: entry?.name ?? remoteUserId,
            type: "failure",
            detail: `connectionState=${pc.connectionState}`,
          });
          if (callMode === "dm") {
            endCall();
          } else {
            removePeer(remoteUserId);
          }
        }
      };

      const ls = localStreamRef.current;
      if (ls) ls.getTracks().forEach((t) => pc.addTrack(t, ls));

      force((x) => x + 1);
      return pc;
    },
    [myId, sendToUser, broadcastSchool],
  );

  const removePeer = (uid: string) => {
    const p = peersRef.current.get(uid);
    if (!p) return;
    try {
      p.pc.close();
    } catch {}
    peersRef.current.delete(uid);
    force((x) => x + 1);
  };

  const cleanupAll = useCallback(() => {
    peersRef.current.forEach((p) => {
      try {
        p.pc.close();
      } catch {}
    });
    peersRef.current.clear();
    manualReconnectingRef.current.clear();
    manualReconnectFailedRef.current.clear();
    manualReconnectTimeoutsRef.current.forEach((t) => clearTimeout(t));
    manualReconnectTimeoutsRef.current.clear();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setLocalStream(null);
    setStatus("idle");
    setMode(null);
    setKind(null);
    setIncoming(null);
    setMicOn(true);
    setCamOn(true);
    stopRingtone();
    force((x) => x + 1);
  }, [stopRingtone]);

  /* ----------------------- end call (broadcast bye) ----------------------- */

  const endCall = useCallback(() => {
    const curMode = mode;
    const targets = Array.from(peersRef.current.keys());
    if (curMode === "dm") {
      targets.forEach((uid) => sendToUser(uid, "webrtc-bye", { from: myId }));
    } else if (curMode === "group") {
      broadcastSchool("webrtc-bye", { from: myId });
    }
    cleanupAll();
  }, [mode, myId, sendToUser, broadcastSchool, cleanupAll]);

  /* ----------------------- 1-1 DM call: outgoing ----------------------- */

  const startDmCall = useCallback(
    async (otherUserId: string, otherName: string, k: CallKind) => {
      if (!myId) return;
      if (status !== "idle") {
        toast.error("Você já está em uma chamada");
        return;
      }
      try {
        setMode("dm");
        setKind(k);
        setStatus("outgoing");
        await acquireLocalStream(k);
        const pc = createPeer(otherUserId, otherName, true, "dm");
        const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: k === "video" });
        await pc.setLocalDescription(offer);
        await sendToUser(otherUserId, "webrtc-ring", {
          from: myId,
          fromName: myName,
          kind: k,
          offer,
        });
        toast.message(`Chamando ${otherName}…`);
      } catch (err: any) {
        console.error(err);
        toast.error(err?.message ?? "Não foi possível iniciar a chamada");
        cleanupAll();
      }
    },
    [myId, myName, status, acquireLocalStream, createPeer, sendToUser, cleanupAll],
  );

  /* ----------------------- group call: outgoing ----------------------- */

  const startGroupCall = useCallback(
    async (k: CallKind) => {
      if (!myId || !schoolId) return;
      if (status !== "idle") {
        toast.error("Você já está em uma chamada");
        return;
      }
      try {
        setMode("group");
        setKind(k);
        setStatus("active");
        await acquireLocalStream(k);
        broadcastSchool("group-join", { from: myId, fromName: myName, kind: k });
        toast.message("Chamada em grupo iniciada");
      } catch (err: any) {
        console.error(err);
        toast.error(err?.message ?? "Não foi possível iniciar a chamada em grupo");
        cleanupAll();
      }
    },
    [myId, myName, schoolId, status, acquireLocalStream, broadcastSchool, cleanupAll],
  );

  /* ----------------------- accept / reject incoming ----------------------- */

  const acceptIncoming = useCallback(async () => {
    if (!incoming || !myId) return;
    stopRingtone();
    try {
      setMode(incoming.mode);
      setKind(incoming.kind);
      await acquireLocalStream(incoming.kind);
      if (incoming.mode === "dm" && incoming.offer) {
        const pc = createPeer(incoming.fromUserId, incoming.fromName, false, "dm");
        await pc.setRemoteDescription(incoming.offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendToUser(incoming.fromUserId, "webrtc-answer", { from: myId, answer });
      } else if (incoming.mode === "group") {
        broadcastSchool("group-join", { from: myId, fromName: myName, kind: incoming.kind });
      }
      setStatus("active");
      setIncoming(null);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message ?? "Falha ao atender");
      cleanupAll();
    }
  }, [incoming, myId, myName, acquireLocalStream, createPeer, sendToUser, broadcastSchool, cleanupAll, stopRingtone]);

  const rejectIncoming = useCallback(() => {
    if (!incoming) return;
    stopRingtone();
    sendToUser(incoming.fromUserId, "webrtc-bye", { from: myId });
    setIncoming(null);
  }, [incoming, myId, sendToUser, stopRingtone]);

  /* ----------------------- reconnect (manual + auto) ----------------------- */

  const cancelReconnectTimer = useCallback((key: string) => {
    const t = reconnectTimersRef.current.get(key);
    if (t) {
      clearTimeout(t);
      reconnectTimersRef.current.delete(key);
    }
    nextRetryAtRef.current.delete(key);
  }, []);

  const scheduleManualTimeout = useCallback(
    (uid: string, name: string) => {
      const prev = manualReconnectTimeoutsRef.current.get(uid);
      if (prev) clearTimeout(prev);
      const timer = window.setTimeout(() => {
        manualReconnectTimeoutsRef.current.delete(uid);
        if (!manualReconnectingRef.current.has(uid)) return;
        const entry = peersRef.current.get(uid);
        if (entry?.connState === "connected") return;
        manualReconnectingRef.current.delete(uid);
        manualReconnectFailedRef.current.add(uid);
        pushLog({
          userId: uid,
          name,
          type: "failure",
          detail: `manual reconnect timeout (${MANUAL_RECONNECT_TIMEOUT_MS}ms)`,
        });
        toast.error(`Falha ao reconectar ${name}`);
        setTick((x) => x + 1);
      }, MANUAL_RECONNECT_TIMEOUT_MS);
      manualReconnectTimeoutsRef.current.set(uid, timer);
    },
    [pushLog],
  );

  const reconnectPeer = useCallback(
    async (remoteId: string) => {
      if (!myId) return;
      try {
        if (mode === "dm") {
          const remoteName = peersRef.current.get(remoteId)?.name ?? "Contato";
          const old = peersRef.current.get(remoteId);
          if (old) {
            try { old.pc.close(); } catch {}
            peersRef.current.delete(remoteId);
          }
          const pc = createPeer(remoteId, remoteName, true, "dm");
          const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: kind === "video" });
          await pc.setLocalDescription(offer);
          await sendToUser(remoteId, "webrtc-reconnect-offer", { from: myId, fromName: myName, kind, offer });
        } else if (mode === "group") {
          broadcastSchool("group-join", { from: myId, fromName: myName, kind });
        }
      } catch (err: any) {
        console.error("reconnectPeer failed", err);
      }
    },
    [myId, mode, kind, myName, createPeer, sendToUser, broadcastSchool],
  );

  const reconnectNow = useCallback(() => {
    // manual reset of backoff for all peers
    reconnectAttemptsRef.current.clear();
    Array.from(reconnectTimersRef.current.keys()).forEach((k) => cancelReconnectTimer(k));
    nextRetryAtRef.current.clear();
    const ids = Array.from(peersRef.current.keys());
    if (ids.length === 0) return;
    toast.message(mode === "group" ? "Tentando reconectar ao grupo\u2026" : "Tentando reconectar\u2026");
    ids.forEach((uid) => {
      const name = peersRef.current.get(uid)?.name ?? uid;
      manualReconnectingRef.current.add(uid);
      manualReconnectFailedRef.current.delete(uid);
      pushLog({ userId: uid, name, type: "manual", detail: "manual reconnect requested" });
      scheduleManualTimeout(uid, name);
      reconnectPeer(uid);
    });
    setTick((x) => x + 1);
  }, [mode, reconnectPeer, cancelReconnectTimer, pushLog, scheduleManualTimeout]);

  const reconnectPeerNow = useCallback(
    (uid: string) => {
      const entry = peersRef.current.get(uid);
      if (!entry) return;
      reconnectAttemptsRef.current.delete(uid);
      cancelReconnectTimer(uid);
      manualReconnectingRef.current.add(uid);
      manualReconnectFailedRef.current.delete(uid);
      pushLog({ userId: uid, name: entry.name, type: "manual", detail: "manual reconnect (peer)" });
      toast.message(`Tentando reconectar ${entry.name}\u2026`);
      scheduleManualTimeout(uid, entry.name);
      reconnectPeer(uid);
      setTick((x) => x + 1);
    },
    [reconnectPeer, cancelReconnectTimer, pushLog, scheduleManualTimeout],
  );

  // Auto-reconnect with exponential backoff when any peer drops.
  useEffect(() => {
    if (status !== "active") return;
    remotes.forEach((r) => {
      const key = r.userId;
      if (r.connState === "connected") {
        reconnectAttemptsRef.current.delete(key);
        cancelReconnectTimer(key);
        return;
      }
      if (r.connState === "disconnected" || r.connState === "failed") {
        if (reconnectTimersRef.current.has(key)) return;
        const attempt = reconnectAttemptsRef.current.get(key) ?? 0;
        if (attempt >= MAX_RECONNECT_ATTEMPTS) {
          if (attempt === MAX_RECONNECT_ATTEMPTS) {
            reconnectAttemptsRef.current.set(key, attempt + 1);
            pushLog({
              userId: key,
              name: r.name,
              type: "give-up",
              attempt,
              detail: `exhausted ${MAX_RECONNECT_ATTEMPTS} attempts`,
            });
            toast.error(`Não foi possível restabelecer a conexão com ${r.name}. Toque em Reconectar para tentar de novo.`);
          }
          return;
        }
        const delay = backoffMs(attempt);
        nextRetryAtRef.current.set(key, Date.now() + delay);
        const timer = window.setTimeout(() => {
          reconnectTimersRef.current.delete(key);
          nextRetryAtRef.current.delete(key);
          reconnectAttemptsRef.current.set(key, attempt + 1);
          pushLog({
            userId: key,
            name: r.name,
            type: "attempt",
            attempt: attempt + 1,
            detail: `auto retry after ${delay}ms`,
          });
          toast.message(`Reconectando ${r.name}\u2026 (tentativa ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS})`);
          reconnectPeer(key);
          setTick((x) => x + 1);
        }, delay);
        reconnectTimersRef.current.set(key, timer);
        setTick((x) => x + 1);
      }
    });
  }, [remotes, status, reconnectPeer, cancelReconnectTimer, pushLog]);

  // Cleanup all retry timers when call ends.
  useEffect(() => {
    if (status === "idle") {
      Array.from(reconnectTimersRef.current.keys()).forEach((k) => cancelReconnectTimer(k));
      reconnectAttemptsRef.current.clear();
      nextRetryAtRef.current.clear();
    }
  }, [status, cancelReconnectTimer]);



  /* ----------------------- mic / cam toggles ----------------------- */

  const toggleMic = useCallback(() => {
    const s = localStreamRef.current;
    if (!s) return;
    const next = !micOn;
    s.getAudioTracks().forEach((t) => (t.enabled = next));
    setMicOn(next);
  }, [micOn]);

  const toggleCam = useCallback(() => {
    const s = localStreamRef.current;
    if (!s) return;
    const next = !camOn;
    s.getVideoTracks().forEach((t) => (t.enabled = next));
    setCamOn(next);
  }, [camOn]);

  /* ----------------------- USER channel (DM ring + signaling) ----------------------- */

  useEffect(() => {
    if (!myId) return;
    const ch = supabase.channel(`user:${myId}`, { config: { broadcast: { ack: false } } });
    userChannelRef.current = ch;

    ch.on("broadcast", { event: "webrtc-ring" }, ({ payload }: any) => {
      if (status !== "idle") {
        sendToUser(payload.from, "webrtc-busy", { from: myId });
        return;
      }
      setIncoming({
        mode: "dm",
        kind: payload.kind,
        fromUserId: payload.from,
        fromName: payload.fromName ?? "Contato",
        offer: payload.offer,
      });
      setStatus("incoming");
      startRingtone();
    });

    ch.on("broadcast", { event: "webrtc-answer" }, async ({ payload }: any) => {
      const p = peersRef.current.get(payload.from);
      if (!p) return;
      try {
        await p.pc.setRemoteDescription(payload.answer);
        setStatus("active");
      } catch (e) {
        console.error(e);
      }
    });

    ch.on("broadcast", { event: "webrtc-reconnect-offer" }, async ({ payload }: any) => {
      if (status !== "active" || mode !== "dm") return;
      const targetId = payload.from;
      const existing = peersRef.current.get(targetId);
      if (existing) {
        try { existing.pc.close(); } catch {}
        peersRef.current.delete(targetId);
      }
      try {
        const pc = createPeer(targetId, payload.fromName ?? "Contato", false, "dm");
        await pc.setRemoteDescription(payload.offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendToUser(targetId, "webrtc-reconnect-answer", { from: myId, answer });
      } catch (e) {
        console.error(e);
      }
    });

    ch.on("broadcast", { event: "webrtc-reconnect-answer" }, async ({ payload }: any) => {
      const p = peersRef.current.get(payload.from);
      if (!p) return;
      try {
        await p.pc.setRemoteDescription(payload.answer);
      } catch (e) {
        console.error(e);
      }
    });

    ch.on("broadcast", { event: "webrtc-ice" }, async ({ payload }: any) => {
      const p = peersRef.current.get(payload.from);
      if (!p || !payload.candidate) return;
      try {
        await p.pc.addIceCandidate(payload.candidate);
      } catch (e) {
        console.warn("ICE add fail", e);
      }
    });

    ch.on("broadcast", { event: "webrtc-bye" }, () => {
      cleanupAll();
    });

    ch.on("broadcast", { event: "webrtc-busy" }, ({ payload }: any) => {
      toast.message("Contato ocupado");
      cleanupAll();
    });

    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
      userChannelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId, status]);

  /* ----------------------- SCHOOL channel (group mesh) ----------------------- */

  useEffect(() => {
    if (!schoolId || !myId) return;
    const ch = supabase.channel(`call:school:${schoolId}`, { config: { broadcast: { ack: false } } });
    schoolChannelRef.current = ch;

    ch.on("broadcast", { event: "group-join" }, async ({ payload }: any) => {
      if (payload.from === myId) return;
      if (status === "active" && mode === "group") {
        try {
          const pc = createPeer(payload.from, payload.fromName ?? "Colega", true, "group");
          const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: kind === "video" });
          await pc.setLocalDescription(offer);
          broadcastSchool("group-offer", { from: myId, to: payload.from, offer, fromName: myName });
        } catch (e) {
          console.error(e);
        }
      } else if (status === "idle") {
        setIncoming({
          mode: "group",
          kind: payload.kind ?? "audio",
          fromUserId: payload.from,
          fromName: payload.fromName ?? "Colega",
          schoolId,
        });
        setStatus("incoming");
        startRingtone();
      }
    });

    ch.on("broadcast", { event: "group-offer" }, async ({ payload }: any) => {
      if (payload.to !== myId) return;
      if (status !== "active" || mode !== "group") return;
      try {
        const pc = createPeer(payload.from, payload.fromName ?? "Colega", false, "group");
        await pc.setRemoteDescription(payload.offer);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        broadcastSchool("group-answer", { from: myId, to: payload.from, answer });
      } catch (e) {
        console.error(e);
      }
    });

    ch.on("broadcast", { event: "group-answer" }, async ({ payload }: any) => {
      if (payload.to !== myId) return;
      const p = peersRef.current.get(payload.from);
      if (!p) return;
      try {
        await p.pc.setRemoteDescription(payload.answer);
      } catch (e) {
        console.error(e);
      }
    });

    ch.on("broadcast", { event: "webrtc-ice" }, async ({ payload }: any) => {
      if (payload.to !== myId) return;
      const p = peersRef.current.get(payload.from);
      if (!p || !payload.candidate) return;
      try {
        await p.pc.addIceCandidate(payload.candidate);
      } catch (e) {
        console.warn("group ICE add fail", e);
      }
    });

    ch.on("broadcast", { event: "webrtc-bye" }, ({ payload }: any) => {
      if (payload.from === myId) return;
      removePeer(payload.from);
    });

    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
      schoolChannelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, myId, status, mode, kind]);

  /* ----------------------- cleanup on unmount ----------------------- */
  useEffect(() => {
    return () => {
      cleanupAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value: CallContextValue = {
    status,
    mode,
    kind,
    localStream,
    remotes,
    incoming,
    micOn,
    camOn,
    startDmCall,
    startGroupCall,
    acceptIncoming,
    rejectIncoming,
    toggleMic,
    toggleCam,
    endCall,
    reconnectNow,
    reconnectPeerNow,
    reconnectLog,
    clearReconnectLog,
  };

  return <CallContext.Provider value={value}>{children}</CallContext.Provider>;
}
