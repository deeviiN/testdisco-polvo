import { useEffect, useMemo, useState, useCallback, useRef, useLayoutEffect, type CSSProperties } from "react";
import { useNavigate, useSearchParams, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import {
  Crown, CalendarDays, ClipboardList, AlertTriangle, Users, MapPin,
  ArrowRight, FileText, Sparkles, Tag, Loader2, BarChart3, PlusSquare,
  UserCheck, Monitor, Trophy, TreePine, Lightbulb, BookOpen, FlaskConical,
  Clock, ArrowUp, Check, MessageCircle, Download, RefreshCw, Inbox, LifeBuoy,
  ImageIcon, Maximize2, Upload as UploadIcon, X, Eye, Info, QrCode, Scale, Tv, Settings as SettingsIcon, UserCheck as UserCheck2, UserX, Link2, Cake,
} from "lucide-react";
import { useSupportContact } from "@/hooks/useSupportContact";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import SubscriptionDeadlineBanner from "@/components/SubscriptionDeadlineBanner";
import GestorTrialPhaseCard from "@/components/gestor/GestorTrialPhaseCard";
import GestorNotificationBell from "@/components/GestorNotificationBell";
import MsnChatIcon from "@/components/MsnChatIcon";
import PainelTvLinkDialog from "@/components/PainelTvLinkDialog";
import ReacceptanceBanner from "@/components/ReacceptanceBanner";
import { useHasUnseenDocuments } from "@/hooks/useHasUnseenDocuments";

const ROLE_PANEL_LABELS: Record<string, string> = {
  admin: "Painel Administrador",
  gestor_pedagogico: "Painel Gestor",
  chef_projeto_vida: "Painel Coord. da Sala de Vídeo",
  teacher: "Painel Professor",
  coord_pedagogico: "Painel Coordenador Pedagógico",
  supervisor: "Painel Corpo de Alunos C.A.",
  secretario_escolar: "Painel Assistente de Aluno",
};

function MarqueeTitle({ text, className = "" }: { text: string; className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);

  useLayoutEffect(() => {
    const check = () => {
      const c = containerRef.current;
      const i = innerRef.current;
      if (!c || !i) return;
      setOverflow(i.scrollWidth > c.clientWidth + 1);
    };
    check();
    const ro = new ResizeObserver(check);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [text]);

  return (
    <div ref={containerRef} tabIndex={0} className={`panel-title-marquee overflow-hidden outline-none ${className}`}>
      <div className="panel-title-marquee-track">
        <span ref={innerRef}>{text}</span>
        <span aria-hidden>{text}</span>
      </div>
    </div>
  );
}

interface PendingProfile {
  id: string;
  user_id: string;
  full_name: string;
  role: string;
  intended_role: string | null;
  phone: string | null;
  gender: string | null;
  created_at: string;
}

interface Kpis {
  today: number;
  week: number;
  pendingExternal: number;
  pendingExternalToday: number;
  pendingProfiles: number;
  totalProfiles: number;
}

const FONT_SCALE_KEY = "gestor.fontScale";
const PANEL_COLOR_KEY = "gestor.panelColorIdx";
const BLINK_HZ_KEY = "gestor.blinkHz";

/**
 * Duração total do ciclo de animação do botão "Atualizar"
 * (acelera → turvo → desacelera → para).
 *
 * Os keyframes em `index.css` são definidos em PORCENTAGENS, então mudar
 * apenas este valor reescala todas as fases proporcionalmente — o efeito
 * visual (blur no auge, simetria de aceleração/desaceleração) continua
 * funcionando do mesmo jeito. Mantém também sincronia com o `setTimeout`
 * que libera o reload.
 *
 * Ex.: aumente para 6400 para um ciclo de 6,4s.
 */
const REFRESH_ANIMATION_MS = 2400;

// Cores do painel (índice = posição no slider)
const PANEL_COLORS = [
  { name: "Azul",     from: "hsl(220, 85%, 50%)", to: "hsl(225, 80%, 38%)", glow: "hsl(220, 100%, 60%)", border: "hsl(220, 90%, 70%)" },
  { name: "Vermelho", from: "hsl(0, 82%, 52%)",   to: "hsl(355, 80%, 40%)", glow: "hsl(0, 100%, 60%)",   border: "hsl(0, 90%, 75%)" },
  { name: "Verde",    from: "hsl(142, 72%, 42%)", to: "hsl(150, 75%, 30%)", glow: "hsl(142, 100%, 50%)", border: "hsl(142, 90%, 70%)" },
  { name: "Amarelo",  from: "hsl(50, 98%, 55%)",  to: "hsl(45, 95%, 45%)",  glow: "hsl(50, 100%, 60%)",  border: "hsl(50, 100%, 75%)" },
  { name: "Dourado",  from: "hsl(40, 90%, 52%)",  to: "hsl(30, 88%, 40%)",  glow: "hsl(38, 100%, 60%)",  border: "hsl(45, 100%, 75%)" },
  { name: "Ouro",     from: "hsl(46, 100%, 55%)", to: "hsl(38, 95%, 45%)",  glow: "hsl(45, 100%, 58%)",  border: "hsl(48, 100%, 78%)" },
  { name: "Cinza",    from: "hsl(220, 10%, 55%)", to: "hsl(220, 12%, 35%)", glow: "hsl(220, 15%, 65%)",  border: "hsl(220, 15%, 80%)" },
  { name: "Bege",      from: "hsl(38, 45%, 72%)",  to: "hsl(34, 40%, 55%)",  glow: "hsl(38, 60%, 75%)",   border: "hsl(38, 55%, 85%)" },
  { name: "Roxo",      from: "hsl(265, 75%, 50%)", to: "hsl(270, 75%, 35%)", glow: "hsl(265, 90%, 60%)",  border: "hsl(265, 85%, 78%)" },
  { name: "Marrom",    from: "hsl(25, 55%, 38%)",  to: "hsl(20, 60%, 24%)",  glow: "hsl(25, 70%, 45%)",   border: "hsl(28, 50%, 65%)" },
  { name: "Azul Escuro", from: "hsl(225, 80%, 28%)", to: "hsl(230, 85%, 16%)", glow: "hsl(225, 90%, 40%)", border: "hsl(225, 70%, 65%)" },
  { name: "Rosa",      from: "hsl(335, 85%, 62%)", to: "hsl(340, 80%, 48%)", glow: "hsl(335, 100%, 70%)", border: "hsl(335, 90%, 82%)" },
  { name: "Lilás",     from: "hsl(285, 70%, 70%)", to: "hsl(280, 65%, 55%)", glow: "hsl(285, 85%, 75%)",  border: "hsl(285, 80%, 85%)" },
  { name: "Laranja",   from: "hsl(25, 95%, 55%)",  to: "hsl(18, 90%, 42%)",  glow: "hsl(25, 100%, 60%)",  border: "hsl(28, 100%, 75%)" },
];

type PanelColor = { from: string; to: string; glow: string; border: string; name?: string };

const panelButtonStyle = (color: PanelColor): CSSProperties => ({
  color: "white",
  borderColor: color.border,
  background: color.glow,
  boxShadow: `0 0 0 1.5px ${color.border}cc, 0 0 8px ${color.glow}, 0 0 18px ${color.glow}cc, 0 0 32px ${color.glow}88, inset 0 0 10px ${color.border}66`,
});

const PanelButtonGlow = ({ rounded = "rounded-2xl", color }: { rounded?: string; color: PanelColor }) => (
  <>
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-0 ${rounded} animate-kpi-glow`}
      style={{
        background: `radial-gradient(circle at 50% 100%, ${color.glow}55 0%, transparent 70%)`,
        mixBlendMode: "screen",
      }}
    />
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-0 ${rounded}`}
      style={{
        background: "linear-gradient(160deg, hsla(0,0%,100%,0.28) 0%, hsla(0,0%,100%,0.06) 38%, transparent 55%)",
      }}
    />
  </>
);

const GestorPanel = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { profile, loading } = useAuth();
  const { toast } = useToast();
  const { buildWhatsappUrl, contact: supportContact } = useSupportContact();
  const [school, setSchool] = useState<{ 
    id: string; 
    name: string; 
    logo_url: string | null; 
    subscription_status?: string | null;
    subscription_end_date?: string | null;
    inep_code?: string | null;
    city?: string | null;
    state?: string | null;
    address?: string | null;
    network?: string | null;
    is_active?: boolean | null;
    grace_period_days?: number | null;
  } | null>(null);
  const [showSchoolDetails, setShowSchoolDetails] = useState(false);
  const [showExpirationConfig, setShowExpirationConfig] = useState(false);
  const [gracePeriodDays, setGracePeriodDays] = useState<string>("7");
  const [isUpdatingGracePeriod, setIsUpdatingGracePeriod] = useState(false);
  const [kpis, setKpis] = useState<Kpis>({ today: 0, week: 0, pendingExternal: 0, pendingExternalToday: 0, pendingProfiles: 0, totalProfiles: 0 });
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [hasDocuments, setHasDocuments] = useState(false);
  const { anyUnseen: anyUnseenDocs } = useHasUnseenDocuments();
  const [loadingData, setLoadingData] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState<boolean>(() => {
    try {
      return !!(window as unknown as { __appUpdateAvailable?: boolean }).__appUpdateAvailable;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    const onUpdate = () => setUpdateAvailable(true);
    window.addEventListener("app:update-available", onUpdate);
    return () => window.removeEventListener("app:update-available", onUpdate);
  }, []);
  const [supportPreviewOpen, setSupportPreviewOpen] = useState(false);
  const [previewMode, setPreviewMode] = useState(() => {
    if (searchParams.get("preview") === "1") return true;
    if (searchParams.get("preview") === "0") return false;
    try { return localStorage.getItem("gestor:previewMode") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("gestor:previewMode", previewMode ? "1" : "0"); } catch {}
  }, [previewMode]);
  // Quando ativo, substitui nome/cidade/UF/logo da escola por placeholders
  // neutros, sem alterar dados reais. Útil para o gestor visualizar como o
  // layout padrão aparece antes de aplicar identidade local.
  const displaySchoolName = previewMode ? "Escola Modelo (pré-visualização)" : (school?.name ?? "—");
  const displaySchoolCity = previewMode ? "Cidade" : (school?.city ?? "");
  const displaySchoolState = previewMode ? "UF" : (school?.state ?? "");
  const displaySchoolLogo = previewMode ? null : (school?.logo_url ?? null);

  const supportMessage = useMemo(() => {
    const cargo = profile?.gender === "feminino" ? "gestora" : "gestor";
    const nome = profile?.full_name || "—";
    const escola = school?.name || "—";
    const inep = school?.inep_code || "—";
    const cidade = school?.city || "—";
    const uf = school?.state || "—";
    return `Olá, meu nome é ${nome}, sou ${cargo} da escola ${escola}, de código INEP ${inep}, localizada em ${cidade}/${uf}, e gostaria de ter mais informações.`;
  }, [profile?.gender, profile?.full_name, school?.name, school?.inep_code, school?.city, school?.state]);

  const handleForceRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setUpdateAvailable(false);
    try { (window as unknown as { __appUpdateAvailable?: boolean }).__appUpdateAvailable = false; } catch {}
    // Aguarda o ciclo de animação (acelera → turvo → desacelera → para)
    const animationDelay = new Promise<void>((r) => setTimeout(r, REFRESH_ANIMATION_MS));
    try {
      const force = (window as unknown as { __forceAppUpdate?: () => Promise<void> }).__forceAppUpdate;
      if (force) {
        await Promise.all([force(), animationDelay]);
      } else {
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        await animationDelay;
        window.location.reload();
      }
    } catch {
      await animationDelay;
      window.location.reload();
    }
  }, [refreshing]);
  const [fontScale, setFontScale] = useState<number>(() => {
    const saved = Number(localStorage.getItem(FONT_SCALE_KEY));
    return saved >= 90 && saved <= 120 ? saved : 100;
  });
  const [panelColorIdx, setPanelColorIdx] = useState<number>(() => {
    const saved = Number(localStorage.getItem(PANEL_COLOR_KEY));
    return saved >= 0 && saved < PANEL_COLORS.length ? saved : 4; // Dourado padrão
  });
  const panelColor = PANEL_COLORS[panelColorIdx];

  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [showColorSlider, setShowColorSlider] = useState(false);
  const [showBlinkSlider, setShowBlinkSlider] = useState(false);
  const [blinkHz, setBlinkHz] = useState<number>(() => {
    const saved = Number(localStorage.getItem(BLINK_HZ_KEY));
    return saved >= 0.5 && saved <= 2 ? saved : 1;
  });
  const [showLogoConfig, setShowLogoConfig] = useState(false);
  const [showTvDialog, setShowTvDialog] = useState(false);
  const logoInputId = "gestor-logo-upload-input";

  // Configurações da marca d'água da logo (por escola, salvas no localStorage)
  const logoCfgKey = (sid?: string | null) => `gestor.logoWatermark.${sid ?? "default"}`;
  type LogoFit = "contain" | "cover" | "tile";
  const [logoSize, setLogoSize] = useState<number>(85);       // 30-130 (%)
  const [logoOpacity, setLogoOpacity] = useState<number>(14); // 4-60 (%)
  const [logoFit, setLogoFit] = useState<LogoFit>("contain");
  const [logoPosX, setLogoPosX] = useState<number>(50);       // 0-100
  const [logoPosY, setLogoPosY] = useState<number>(50);       // 0-100

  useEffect(() => {
    localStorage.setItem(FONT_SCALE_KEY, String(fontScale));
  }, [fontScale]);

  useEffect(() => {
    localStorage.setItem(PANEL_COLOR_KEY, String(panelColorIdx));
  }, [panelColorIdx]);

  useEffect(() => {
    localStorage.setItem(BLINK_HZ_KEY, String(blinkHz));
  }, [blinkHz]);

  // Admin override: ?as_school=<schoolId>
  const overrideSchoolId = searchParams.get("as_school");

  // Detecta se o usuário logado é admin global
  useEffect(() => {
    if (loading) return;
    if (!profile) { setIsAdmin(null); return; }
    (async () => {
      const { data } = await supabase.rpc("has_role", { _user_id: profile.user_id, _role: "admin" });
      setIsAdmin(!!data);
    })();
  }, [profile, loading]);

  const isAdminView = !!overrideSchoolId && isAdmin === true;
  const effectiveSchoolId = isAdminView ? overrideSchoolId! : profile?.school_id;

  // Carrega config da marca d'água quando a escola é definida
  useEffect(() => {
    if (!effectiveSchoolId) return;
    try {
      const raw = localStorage.getItem(logoCfgKey(effectiveSchoolId));
      if (raw) {
        const c = JSON.parse(raw);
        if (typeof c.size === "number") setLogoSize(c.size);
        if (typeof c.opacity === "number") setLogoOpacity(c.opacity);
        if (c.fit === "contain" || c.fit === "cover" || c.fit === "tile") setLogoFit(c.fit);
        if (typeof c.posX === "number") setLogoPosX(c.posX);
        if (typeof c.posY === "number") setLogoPosY(c.posY);
      }
    } catch { /* noop */ }
  }, [effectiveSchoolId]);

  useEffect(() => {
    if (!effectiveSchoolId) return;
    localStorage.setItem(
      logoCfgKey(effectiveSchoolId),
      JSON.stringify({ size: logoSize, opacity: logoOpacity, fit: logoFit, posX: logoPosX, posY: logoPosY }),
    );
  }, [effectiveSchoolId, logoSize, logoOpacity, logoFit, logoPosX, logoPosY]);

  const handleLogoUpload = useCallback(async (file: File) => {
    if (!effectiveSchoolId) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Arquivo inválido", description: "Selecione uma imagem (PNG, JPG).", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Imagem muito grande", description: "Máximo 5MB.", variant: "destructive" });
      return;
    }
    setUploadingLogo(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${effectiveSchoolId}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("school-logos")
        .upload(path, file, { upsert: true, cacheControl: "3600", contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("school-logos").getPublicUrl(path);
      const { error: updErr } = await supabase
        .from("schools")
        .update({ logo_url: pub.publicUrl })
        .eq("id", effectiveSchoolId);
      if (updErr) throw updErr;
      setSchool((s) => (s ? { ...s, logo_url: pub.publicUrl } : s));
      toast({ title: "Logo enviada!", description: "A logo da escola foi atualizada." });
    } catch (e: any) {
      toast({ title: "Falha ao enviar logo", description: e?.message || "Tente novamente.", variant: "destructive" });
    } finally {
      setUploadingLogo(false);
    }
  }, [effectiveSchoolId, toast]);

  // Guard: só gestor_pedagogico OU admin (com override) podem ver este painel
  useEffect(() => {
    if (loading) return;
    if (!profile) {
      navigate("/auth", { replace: true });
      return;
    }
    if (isAdmin === null) return; // aguarda detecção
    if (overrideSchoolId && !isAdmin) {
      navigate("/sectors", { replace: true });
      return;
    }
    if (!overrideSchoolId && profile.role !== "gestor_pedagogico") {
      navigate("/sectors", { replace: true });
    }
  }, [profile, loading, navigate, overrideSchoolId, isAdmin]);

  const [pendingList, setPendingList] = useState<PendingProfile[]>([]);

  const load = useCallback(async () => {
    if (!effectiveSchoolId) return;
    setLoadingData(true);
    const today = format(new Date(), "yyyy-MM-dd");
    const weekStart = format(new Date(Date.now() - 6 * 86400000), "yyyy-MM-dd");
    const weekEnd = format(new Date(Date.now() + 7 * 86400000), "yyyy-MM-dd");

    const [schoolRes, todayRes, weekRes, externalRes, externalTodayRes, profilesRes, countdownRes, contratosCountRes, pagamentosCountRes] = await Promise.all([
      supabase.from("schools").select("*").eq("id", effectiveSchoolId).maybeSingle(),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("school_id", effectiveSchoolId).eq("booking_date", today).neq("status", "cancelled"),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("school_id", effectiveSchoolId).gte("booking_date", weekStart).lte("booking_date", weekEnd).neq("status", "cancelled"),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("school_id", effectiveSchoolId).eq("event_type", "evento_externo").eq("gestor_status", "pending"),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("school_id", effectiveSchoolId).eq("event_type", "evento_externo").eq("gestor_status", "pending").eq("booking_date", today),
      supabase.from("profiles").select("id,user_id,full_name,role,intended_role,phone,gender,is_approved,rejection_reason,created_at").eq("school_id", effectiveSchoolId),
      supabase.rpc("get_school_subscription_countdown", { _school_id: effectiveSchoolId }),
      supabase.from("signed_contracts").select("id", { count: "exact", head: true }).eq("school_id", effectiveSchoolId),
      supabase.from("pagamentos").select("id", { count: "exact", head: true }).eq("school_id", effectiveSchoolId),
    ]);
    setHasDocuments(((contratosCountRes.count ?? 0) + (pagamentosCountRes.count ?? 0)) > 0);

    if (schoolRes.data) {
      setSchool(schoolRes.data);
      setGracePeriodDays(String(schoolRes.data.grace_period_days ?? 7));
    }
    setDaysRemaining(countdownRes.data ?? 0);
    const allProfiles = profilesRes.data ?? [];
    const pending = allProfiles
      .filter((p: any) => {
        if (p.is_approved) return false;
        if (p.rejection_reason) return false;
        const effective = p.intended_role || p.role;
        return effective !== "gestor_pedagogico";
      })
      .sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1));
    setPendingList(pending as PendingProfile[]);
    setKpis({
      today: todayRes.count ?? 0,
      week: weekRes.count ?? 0,
      pendingExternal: externalRes.count ?? 0,
      pendingExternalToday: externalTodayRes.count ?? 0,
      pendingProfiles: pending.length,
      totalProfiles: allProfiles.length,
    });
    setLoadingData(false);
  }, [effectiveSchoolId]);

  useEffect(() => {
    load();
  }, [load]);

  // Refresh imediato ao voltar para a aba/janela (ex.: após aprovar/reprovar evento externo)
  useEffect(() => {
    const onFocus = () => load();
    const onVisibility = () => {
      if (document.visibilityState === "visible") load();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

  // Realtime: qualquer mudança em bookings desta escola atualiza os KPIs
  useEffect(() => {
    if (!effectiveSchoolId) return;
    const channel = supabase
      .channel(`gestor-panel-bookings-${effectiveSchoolId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `school_id=eq.${effectiveSchoolId}` },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles", filter: `school_id=eq.${effectiveSchoolId}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [effectiveSchoolId, load]);

  // Refresh quando a rota retorna para o painel (SPA nav)
  useEffect(() => {
    load();
  }, [location.pathname, load]);

  const handleUpdateGracePeriod = async () => {
    if (!effectiveSchoolId) return;
    setIsUpdatingGracePeriod(true);
    try {
      const days = parseInt(gracePeriodDays);
      if (isNaN(days) || days < 0) {
        toast({
          title: "Valor inválido",
          description: "Por favor, insira um número válido de dias.",
          variant: "destructive",
        });
        return;
      }

      const { error } = await supabase
        .from("schools")
        .update({ grace_period_days: days })
        .eq("id", effectiveSchoolId);

      if (error) throw error;

      toast({
        title: "Sucesso!",
        description: "Configuração de expiração atualizada.",
      });
      setShowExpirationConfig(false);
      load();
    } catch (error) {
      console.error("Error updating grace period:", error);
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível salvar a nova configuração.",
        variant: "destructive",
      });
    } finally {
      setIsUpdatingGracePeriod(false);
    }
  };


  const today = useMemo(() => format(new Date(), "EEEE, d 'de' MMMM 'de' yyyy", { locale: ptBR }), []);

  const allowed = isAdminView || profile?.role === "gestor_pedagogico";
  const isSubscribed = !!school?.subscription_status && ["active", "paid"].includes(school.subscription_status) && !!school?.subscription_end_date;
  // Pagamento iniciado mas não concluído: detecta método salvo no localStorage da página /subscription
  const hasPendingPayment = !isSubscribed && (() => {
    try { return !!localStorage.getItem("subscription:paymentMethod"); } catch { return false; }
  })();
  if (loading || !profile || (overrideSchoolId && isAdmin === null) || !allowed) {
    return (
      <div className="flex items-center justify-center h-dvh bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const goAgendar = () => {
    navigate("/sectors");
  };

  // Preserva ?as_school=<id> em links internos quando admin está navegando
  const withSchool = (path: string) => {
    if (!isAdminView) return path;
    const sep = path.includes("?") ? "&" : "?";
    return `${path}${sep}as_school=${overrideSchoolId}`;
  };

  return (
    <div
      className="fixed inset-0 overflow-hidden bg-gradient-to-br from-[hsl(220,70%,10%)] via-[hsl(222,65%,14%)] to-[hsl(225,75%,7%)]"
      style={{ ["--gfs" as any]: fontScale / 100 }}
    >
      {/* Ambient blue glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-blue-500/15 blur-3xl" />
        <div className="absolute -bottom-40 -left-32 w-[28rem] h-[28rem] rounded-full bg-blue-700/15 blur-3xl" />
      </div>
      <ReacceptanceBanner />
      <div className="relative z-10 w-full px-1 pt-1 pb-6 space-y-2">
        {/* Header — Premium Gold */}
        <header className="rounded-2xl pl-2 pr-2.5 pt-3 pb-8 sm:pt-4 sm:pb-9 border border-amber-400/30 shadow-2xl relative overflow-hidden"
          style={{ background: "linear-gradient(180deg, hsl(222, 95%, 22%) 0%, hsl(215, 90%, 28%) 60%, hsl(220, 85%, 32%) 100%)", backdropFilter: "blur(12px)" }}
        >

          {/* Marca d'água — logo da escola, com tamanho/opacidade/encaixe ajustáveis */}
          {displaySchoolLogo && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 z-0"
              style={{
                backgroundImage: `url(${displaySchoolLogo})`,
                backgroundRepeat: logoFit === "tile" ? "repeat" : "no-repeat",
                backgroundPosition: `${logoPosX}% ${logoPosY}%`,
                backgroundSize:
                  logoFit === "tile"
                    ? `${Math.max(60, logoSize * 1.2)}px auto`
                    : logoFit === "cover"
                      ? "cover"
                      : `auto ${logoSize}%`,
                opacity: logoOpacity / 100,
              }}
            />
          )}
          <div className="relative z-10 flex items-start gap-2">
            <div className="flex-1 min-w-0 pl-0">
              <h1 className="text-white text-lg sm:text-xl font-extrabold leading-tight text-left">
                {isAdminView ? ROLE_PANEL_LABELS.admin : (ROLE_PANEL_LABELS[profile?.role ?? ""] ?? "Painel")}
              </h1>


              <p className="text-amber-100/90 text-base sm:text-lg font-semibold break-words leading-snug text-left mt-2">
                {displaySchoolName}
              </p>
              <p className="text-amber-100/90 text-sm font-semibold capitalize text-left mt-1">{today}</p>
              {(displaySchoolCity || displaySchoolState) && (
                <p className="text-amber-100/70 text-xs font-medium uppercase tracking-wide text-left">
                  {displaySchoolCity}{displaySchoolCity && displaySchoolState ? " - " : ""}{displaySchoolState}
                </p>
              )}
              {daysRemaining !== null && daysRemaining <= 7 && (
                <div className="flex flex-col gap-2 mt-2">
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-black/40 rounded-lg border border-white/10 w-fit">
                    <Clock className="h-3.5 w-3.5 text-amber-400" />
                    <p className="text-white text-xs font-black uppercase tracking-tight leading-none">
                      Expira em: <span className="text-amber-400 animate-pulse">{daysRemaining === 0 ? "HOJE" : `${daysRemaining} ${daysRemaining === 1 ? 'DIA' : 'DIAS'}`}</span>
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div data-panel-color-locked className="shrink-0 grid grid-cols-3 gap-1.5 mt-14">

              {/* Botão de upload da logo da escola — turquesa */}
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      data-glow-keep
                      onClick={() => {
                        if (school?.logo_url) setShowLogoConfig(true);
                        else document.getElementById(logoInputId)?.click();
                      }}
                      disabled={uploadingLogo}
                      aria-label={school?.logo_url ? "Logo da escola carregada — toque para substituir" : "Enviar logo da escola"}
                      className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl border-2 border-cyan-200/70 flex items-center justify-center text-white shadow-lg transition-transform disabled:opacity-70 relative overflow-hidden"
                      style={{
                        background: "linear-gradient(135deg, hsl(180, 65%, 42%), hsl(190, 70%, 32%))",
                        boxShadow: "0 0 10px hsla(185, 80%, 55%, 0.55), inset 0 0 8px hsla(180, 100%, 80%, 0.25)",
                      }}
                    >
                      {displaySchoolLogo && !uploadingLogo && (
                        <img
                          src={displaySchoolLogo}
                          alt="Logo"
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      )}
                      {displaySchoolLogo && !uploadingLogo && (
                        <span
                          aria-hidden
                          className="absolute inset-0 pointer-events-none"
                          style={{
                            boxShadow: "inset 0 1px 0 hsla(0,0%,100%,0.45), inset 0 -1px 0 hsla(0,0%,0%,0.1)",
                          }}
                        />
                      )}
                      <span className="relative z-10 flex items-center justify-center">
                        {uploadingLogo ? (
                          <Loader2 className="h-6 w-6 animate-spin opacity-80" />
                        ) : school?.logo_url ? (
                          <Check className="h-6 w-6 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" strokeWidth={3} />
                        ) : (
                          <ArrowUp className="h-6 w-6" strokeWidth={3} />
                        )}
                      </span>
                      {school?.logo_url && !uploadingLogo && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-cyan-900 flex items-center justify-center z-20">
                          <Check className="h-2.5 w-2.5 text-emerald-950" strokeWidth={4} />
                        </span>
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="end" className="max-w-[260px] text-sm leading-snug">
                    {school?.logo_url
                      ? "Logo carregada — toque para ajustar tamanho, posição e opacidade ou substituir."
                      : "Enviar a logo da escola. Será usada em cabeçalhos e marca d'água de comunicados e solicitações."}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <input
                id={logoInputId}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleLogoUpload(f);
                  e.target.value = "";
                }}
              />

              {/* Dialog de configuração da logo (marca d'água) */}
              <Dialog open={showLogoConfig} onOpenChange={setShowLogoConfig}>
                <DialogContent className="max-w-md bg-slate-900 border border-amber-400/30 text-white">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-amber-200">
                      <ImageIcon className="h-5 w-5" /> Logo da escola
                    </DialogTitle>
                  </DialogHeader>

                  {/* Pré-visualização */}
                  <div
                    className="relative h-36 rounded-xl overflow-hidden border border-amber-400/20"
                    style={{ background: "linear-gradient(180deg, hsl(222, 95%, 22%) 0%, hsl(215, 90%, 28%) 75%, hsl(140, 75%, 32%) 100%)" }}
                  >
                    {school?.logo_url && (
                      <div
                        aria-hidden
                        className="absolute inset-0"
                        style={{
                          backgroundImage: `url(${school.logo_url})`,
                          backgroundRepeat: logoFit === "tile" ? "repeat" : "no-repeat",
                          backgroundPosition: `${logoPosX}% ${logoPosY}%`,
                          backgroundSize:
                            logoFit === "tile"
                              ? `${Math.max(40, logoSize * 0.7)}px auto`
                              : logoFit === "cover"
                                ? "cover"
                                : `auto ${logoSize}%`,
                          opacity: logoOpacity / 100,
                        }}
                      />
                    )}
                    <div className="absolute bottom-1 right-2 text-[10px] text-amber-100/70 font-bold uppercase tracking-wider">prévia</div>
                  </div>

                  {/* Modo de encaixe */}
                  <div className="space-y-1.5">
                    <p className="text-amber-100/80 text-xs font-bold uppercase tracking-wider">Encaixe</p>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([
                        { k: "contain", label: "Conter" },
                        { k: "cover", label: "Cobrir" },
                        { k: "tile", label: "Repetir" },
                      ] as const).map((o) => (
                        <button
                          key={o.k}
                          type="button"
                          onClick={() => setLogoFit(o.k)}
                          className={`h-9 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
                            logoFit === o.k
                              ? "bg-amber-500 text-amber-950"
                              : "bg-white/5 text-amber-200/80 border border-amber-400/20 hover:bg-white/10"
                          }`}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Tamanho */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-amber-100/80">
                      <span>Tamanho</span>
                      <span className="text-amber-300">{logoSize}%</span>
                    </div>
                    <Slider min={30} max={130} step={1} value={[logoSize]} onValueChange={(v) => setLogoSize(v[0])} />
                  </div>

                  {/* Opacidade */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-amber-100/80">
                      <span>Opacidade</span>
                      <span className="text-amber-300">{logoOpacity}%</span>
                    </div>
                    <Slider min={4} max={100} step={1} value={[logoOpacity]} onValueChange={(v) => setLogoOpacity(v[0])} />
                  </div>

                  {/* Posição (apenas quando não está em "cover" nem "tile") */}
                  {logoFit === "contain" && (
                    <>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-amber-100/80">
                          <span>Posição horizontal</span>
                          <span className="text-amber-300">{logoPosX}%</span>
                        </div>
                        <Slider min={0} max={100} step={1} value={[logoPosX]} onValueChange={(v) => setLogoPosX(v[0])} />
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex justify-between text-xs font-bold uppercase tracking-wider text-amber-100/80">
                          <span>Posição vertical</span>
                          <span className="text-amber-300">{logoPosY}%</span>
                        </div>
                        <Slider min={0} max={100} step={1} value={[logoPosY]} onValueChange={(v) => setLogoPosY(v[0])} />
                      </div>
                    </>
                  )}

                  <DialogFooter className="flex-col gap-2 sm:flex-col">
                    <Button
                      type="button"
                      onClick={() => {
                        setLogoSize(85); setLogoOpacity(14); setLogoFit("contain");
                        setLogoPosX(50); setLogoPosY(50);
                      }}
                      variant="outline"
                      className="w-full h-10 bg-transparent border-amber-400/30 text-amber-100 hover:bg-amber-400/10"
                    >
                      <Maximize2 className="h-4 w-4 mr-2" /> Restaurar padrão
                    </Button>
                    <Button
                      type="button"
                      onClick={() => { setShowLogoConfig(false); document.getElementById(logoInputId)?.click(); }}
                      className="w-full h-11 bg-cyan-600 hover:bg-cyan-500 text-white font-bold"
                    >
                      <UploadIcon className="h-4 w-4 mr-2" /> Substituir imagem
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setShowLogoConfig(false)}
                      className="w-full h-11 bg-amber-500 hover:bg-amber-400 text-amber-950 font-bold"
                    >
                      <Check className="h-4 w-4 mr-2" /> Aplicar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Botão atualizar app — gira ao clicar e força refresh */}
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      data-glow-keep
                      onClick={handleForceRefresh}
                      disabled={refreshing}
                      aria-label="Atualizar aplicativo"
                      className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl border-2 flex items-center justify-center text-white shadow-lg transition-all disabled:opacity-100 relative overflow-hidden ${
                        refreshing
                          ? "border-amber-300 ring-4 ring-amber-300/70 animate-pulse scale-95"
                          : updateAvailable
                            ? "border-amber-300 ring-4 ring-amber-300/70 animate-pulse"
                            : "border-emerald-200/70 active:border-amber-300 active:ring-4 active:ring-amber-300/70 active:scale-95"
                      }`}
                      style={{
                        background: updateAvailable && !refreshing
                          ? "linear-gradient(135deg, hsl(35, 95%, 55%), hsl(20, 92%, 45%))"
                          : "linear-gradient(135deg, hsl(150, 70%, 42%), hsl(160, 75%, 30%))",
                        boxShadow: refreshing || updateAvailable
                          ? "0 0 22px hsla(45, 100%, 60%, 0.95), inset 0 0 12px hsla(45, 100%, 80%, 0.5)"
                          : "0 0 10px hsla(150, 80%, 55%, 0.55), inset 0 0 8px hsla(150, 100%, 80%, 0.25)",
                      }}
                    >
                      <RefreshCw
                        className={`h-6 w-6 ${refreshing ? "animate-refresh-cycle" : ""} drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]`}
                        strokeWidth={3}
                        style={refreshing ? { animationDuration: `${REFRESH_ANIMATION_MS}ms` } : undefined}
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="end" className="max-w-[240px] text-sm leading-snug">
                    {updateAvailable
                      ? "Nova versão disponível — toque para limpar o cache e atualizar agora."
                      : "Atualizar aplicativo — limpa o cache e carrega a versão mais recente."}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              {/* Botão Suporte via WhatsApp — chat com o suporte técnico */}
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      data-glow-keep
                      onClick={() => setSupportPreviewOpen(true)}
                      aria-label={`Suporte via WhatsApp ${supportContact.display_label}`}
                      className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl border-2 border-green-200/70 flex items-center justify-center text-white shadow-lg transition-transform relative overflow-hidden"
                      style={{
                        background: "linear-gradient(135deg, hsl(142, 70%, 42%), hsl(150, 75%, 30%))",
                        boxShadow: "0 0 10px hsla(142, 80%, 55%, 0.55), inset 0 0 8px hsla(142, 100%, 80%, 0.25)",
                      }}
                    >
                      <LifeBuoy className="h-6 w-6 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" strokeWidth={3} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="end" className="max-w-[240px] text-sm leading-snug">
                    Suporte técnico — abrir conversa no WhatsApp {supportContact.display_label}.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      data-glow-keep
                      onClick={() => navigate(withSchool(hasPendingPayment ? "/subscription?step=payment" : "/subscription"))}
                      aria-label={isSubscribed ? "Assinatura ativa" : (hasPendingPayment ? "Pagamento pendente — toque para continuar de onde parou" : "Assinatura da escola — toque para contratar um plano")}
                      className={`${isSubscribed ? "btn-assinar-active" : (hasPendingPayment ? "btn-assinar-pulse-red" : "btn-assinar-pulse")} w-12 h-12 sm:w-14 sm:h-14 rounded-xl border-2 flex items-center justify-center text-white shadow-lg transition-transform relative overflow-hidden`}
                    >
                      <Crown className="h-6 w-6 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" strokeWidth={3} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="end" className="max-w-[240px] text-sm leading-snug">
                    {isSubscribed
                      ? "Assinatura ativa. Toque para ver os detalhes."
                      : hasPendingPayment
                        ? "Você iniciou um pagamento mas ainda não foi concluído. Toque para continuar de onde parou."
                        : "A escola ainda não possui um plano contratado. Toque para escolher um plano e assinar."}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <GestorNotificationBell variant="amber" />
              {/* Botão Gaveta de Documentos — boletos, extratos PIX, contratos, etc. */}
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      data-glow-keep
                      onClick={() => navigate(withSchool("/gestor/documentos"))}
                      aria-label="Gaveta de documentos da escola"
                      className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl border-2 border-purple-200/70 flex items-center justify-center text-white shadow-lg transition-transform relative overflow-hidden ${hasDocuments || anyUnseenDocs ? "btn-docs-pulse-red" : ""}`}
                      style={{
                        background: "linear-gradient(135deg, hsl(270, 65%, 50%), hsl(280, 70%, 36%))",
                        boxShadow: "0 0 10px hsla(275, 80%, 60%, 0.55), inset 0 0 8px hsla(275, 100%, 80%, 0.25)",
                      }}
                    >
                      <Inbox className="h-6 w-6 drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]" strokeWidth={3} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="end" className="max-w-[240px] text-sm leading-snug">
                    Gaveta de documentos — boletos, extratos PIX, contratos e outros arquivos enviados pela administração.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          {/* Banner de prazo da assinatura — colocado dentro da faixa verde do header */}
          <div className="relative z-10 -mt-8 -mx-3 -mb-8">
            {/* Banner removido do painel — info movida para o dropdown de Configurações (SubscriptionDeadlineMenuItem) */}
          </div>
        </header>

        {/* Banner — Atalhos de Gestão */}
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            <div
              className="relative overflow-hidden flex-1 h-10 rounded-2xl text-white font-extrabold text-base flex items-center justify-center gap-2 border-2 transition-transform duration-200 ease-out animate-kpi-attention"
              style={panelButtonStyle(panelColor)}
            >
              <PanelButtonGlow color={panelColor} />
              <span className="absolute left-2 top-1/2 -translate-y-1/2 z-10 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-black text-white text-[10px] font-extrabold uppercase tracking-[0.14em] border border-white/20 shadow-sm">
                <Sparkles className="h-3 w-3" />
                Atalhos
              </span>
              <div className="absolute inset-y-0 right-2 flex items-center gap-2 z-10">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); navigate(withSchool("/gestor/aniversariantes")); }}
                  className="inline-flex items-center justify-center h-7 w-11 rounded-lg bg-black text-white border border-white/20 hover:bg-black/80 transition"
                  style={{ boxShadow: `0 0 8px ${panelColor.glow}, 0 0 16px ${panelColor.glow}aa, inset 0 0 6px ${panelColor.border}66` }}
                  aria-label="Aniversariantes dos servidores"
                  title="Aniversariantes dos servidores"
                >
                  <Cake className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); navigate(withSchool("/gestor/qr-code")); }}
                  className="inline-flex items-center justify-center h-7 w-11 rounded-lg bg-black text-white border border-white/20 hover:bg-black/80 transition"
                  style={{ boxShadow: `0 0 8px ${panelColor.glow}, 0 0 16px ${panelColor.glow}aa, inset 0 0 6px ${panelColor.border}66` }}
                  aria-label="Gerar QR Code do ambiente"
                >
                  <QrCode className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); navigate(withSchool("/messages")); }}
                  className="inline-flex items-center justify-center h-7 w-11 rounded-lg bg-black text-white border border-white/20 hover:bg-black/80 transition"
                  style={{ boxShadow: `0 0 8px ${panelColor.glow}, 0 0 16px ${panelColor.glow}aa, inset 0 0 6px ${panelColor.border}66` }}
                  aria-label="Abrir mensagens"
                >
                  <MsnChatIcon size={28} spinSeconds={4} />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setShowColorSlider((v) => !v); setShowBlinkSlider(false); }}
                  className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg bg-black text-white text-[10px] font-extrabold uppercase tracking-[0.14em] border border-white/20 hover:bg-black/80 transition"
                  style={{ boxShadow: `0 0 8px ${panelColor.glow}, 0 0 16px ${panelColor.glow}aa, inset 0 0 6px ${panelColor.border}66` }}
                  aria-label="Alterar cor do painel"
                  aria-expanded={showColorSlider}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full border border-white/60"
                    style={{ background: panelColor.from }}
                  />
                  Cor
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                const sid = effectiveSchoolId;
                if (!sid) return;
                const url = `${window.location.origin}/auth?mode=signup&school=${sid}&role=teacher`;
                navigator.clipboard.writeText(url).then(
                  () => toast({ title: "Link copiado!", description: "Cadastro exclusivo de Professor(a). Envie para os professores da sua escola." }),
                  () => toast({ title: "Link de cadastro", description: url }),
                );
              }}
              className="relative overflow-hidden w-10 h-10 rounded-2xl border-2 flex items-center justify-center text-white transition-transform duration-200 shadow-lg shrink-0"
              style={panelButtonStyle(panelColor)}
              aria-label="Copiar link de cadastro de Professor"
              title="Link de cadastro (Professor)"
            >
              <PanelButtonGlow color={panelColor} />
              <Link2 className="relative z-10 h-4 w-4" />
            </button>



            {isAdminView && (
              <button
                onClick={() => setShowExpirationConfig(true)}
                className="relative overflow-hidden w-14 h-14 rounded-2xl border-2 flex items-center justify-center text-white transition-transform duration-200 shadow-lg animate-kpi-attention"
                style={panelButtonStyle(panelColor)}
                aria-label="Configurar expiração"
              >
                <PanelButtonGlow color={panelColor} />
                <Clock className="relative z-10 h-6 w-6" />
              </button>
            )}
          </div>

          {showColorSlider && (
            <div
              className="flex items-center gap-2 rounded-xl border bg-black/30 backdrop-blur-md px-3 py-1.5 w-full shadow-lg animate-in fade-in slide-in-from-top-1 duration-200"
              style={{ borderColor: `${panelColor.border}66` }}
            >
              <span className="text-[10px] uppercase tracking-[0.14em] font-extrabold shrink-0" style={{ color: panelColor.border }}>Cor</span>
              <div
                className="relative flex-1 h-2 rounded-full overflow-hidden"
                style={{ background: `linear-gradient(to right, ${PANEL_COLORS.map((c) => c.from).join(", ")})` }}
              >
                <input
                  type="range"
                  min={0}
                  max={PANEL_COLORS.length - 1}
                  step={1}
                  value={panelColorIdx}
                  onChange={(e) => setPanelColorIdx(Number(e.target.value))}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  aria-label="Cor dos botões do painel"
                />
                <div
                  className="pointer-events-none absolute top-1/2 -translate-y-1/2 h-4 w-4 rounded-full border-2 border-white shadow-md transition-[left] duration-200 ease-out"
                  style={{
                    left: `calc(${(panelColorIdx / (PANEL_COLORS.length - 1)) * 100}% - 8px)`,
                    background: panelColor.from,
                  }}
                />
              </div>
              <span className="text-xs font-black min-w-[58px] text-right" style={{ color: panelColor.border }}>{panelColor.name}</span>
              <button
                type="button"
                onClick={() => setShowColorSlider(false)}
                aria-label="Fechar paleta de cores"
                className="shrink-0 h-6 w-6 rounded-full bg-white/10 hover:bg-white/20 border border-white/30 flex items-center justify-center text-white"
              >
                <X className="h-3.5 w-3.5" strokeWidth={3} />
              </button>
            </div>
          )}

          {showBlinkSlider && (
            <div
              className="flex items-center gap-2 rounded-xl border bg-black/30 backdrop-blur-md px-3 py-1.5 w-full shadow-lg animate-in fade-in slide-in-from-top-1 duration-200"
              style={{ borderColor: `${panelColor.border}66` }}
            >
              <span className="text-[10px] uppercase tracking-[0.14em] font-extrabold shrink-0" style={{ color: panelColor.border }}>Piscar</span>
              <input
                type="range"
                min={0.5}
                max={2}
                step={0.1}
                value={blinkHz}
                onChange={(e) => setBlinkHz(Number(e.target.value))}
                className="flex-1 h-2 cursor-pointer accent-white"
                aria-label="Frequência do piscar (Hz)"
              />
              <span className="text-xs font-black min-w-[58px] text-right" style={{ color: panelColor.border }}>{blinkHz.toFixed(1)} Hz</span>
            </div>
          )}
        </div>


        {/* KPIs — 4 cards principais com card central circular sobreposto. */}
        <section className="relative">
          <div className="grid grid-cols-2 gap-1.5">
            <KpiShortcut color={panelColor} icon={CalendarDays} label={"Agendamento\nhoje"} value={kpis.today} loading={loadingData} onClick={() => navigate(withSchool("/today-bookings"))} cornerCut="br" pulseRed={kpis.today > 0} pulseSeconds={1 / blinkHz} labelClassName="-translate-x-3 -translate-y-0.5 pr-3" />
            <KpiShortcut color={panelColor} icon={AlertTriangle} label={"Eventos\nexternos"} value={kpis.pendingExternal} loading={loadingData} onClick={() => navigate(withSchool("/gestor/external-requests"))} cornerCut="bl" pulseRed={kpis.pendingExternal > 0} pulseBadge={kpis.pendingExternal} pulseSeconds={1 / blinkHz} labelClassName="translate-x-1.5 pl-2" />
            <KpiShortcut color={panelColor} icon={Clock} label={"Ajuste\ndos tempos"} value={kpis.week} loading={loadingData} onClick={() => navigate(withSchool("/gestor/horarios"))} cornerCut="tr" labelClassName="-translate-x-1.5 pr-2" />
            <KpiShortcut color={panelColor} icon={ArrowRight} label="Transferências" value={0} loading={loadingData} onClick={() => navigate(withSchool("/gestor/transfer-requests"))} cornerCut="tl" />
          </div>

          {/* Card central circular sobreposto. */}
          <button
            data-no-premium
            onClick={() => navigate(withSchool("/gestor/aprovacoes"))}
            className={`absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[104px] h-[104px] rounded-full border-2 flex flex-col items-center justify-center gap-0.5 z-10 overflow-hidden ${kpis.pendingProfiles > 0 ? "animate-pulse" : "animate-kpi-attention"}`}
            style={
              kpis.pendingProfiles > 0
                ? {
                    background: "#ef4444",
                    borderColor: "#fecaca",
                    boxShadow: "0 0 24px rgba(239,68,68,0.85), inset 0 0 12px rgba(255,255,255,0.25)",
                    animationDuration: `${1 / blinkHz}s`,
                    animationTimingFunction: "ease-in-out",
                  }
                : panelButtonStyle(panelColor)
            }
          >
            {kpis.pendingProfiles > 0 ? null : <PanelButtonGlow rounded="rounded-full" color={panelColor} />}
            <UserCheck className="relative z-10 h-6 w-6 text-white" strokeWidth={2.2} />
            <span
              className="relative z-10 text-white font-extrabold tracking-[0.04em] uppercase leading-tight text-center px-1"
              style={{ fontSize: "11px" }}
            >
              Novos<br/>cadastros
            </span>
            {!loadingData && kpis.pendingProfiles > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1 rounded-full bg-white text-red-600 text-[10px] font-extrabold flex items-center justify-center border-2 border-red-700">
                {kpis.pendingProfiles}
              </span>
            )}
          </button>
        </section>


        {/* Atalhos de gestão */}
        <section className="relative !mt-1.5">
          <div className="grid grid-cols-2 gap-1.5">
            <KpiShortcut
              color={panelColor}
              icon={FileText}
              label={"Dados da\nEscola"}
              value={0}
              onClick={() => setShowSchoolDetails(true)}
              cornerCut="br"
              labelClassName="-translate-x-1.5 pr-2"
            />
            <KpiShortcut color={panelColor} icon={Users} label="Funcionários" value={kpis.totalProfiles} onClick={() => navigate(withSchool("/gestor/cadastros"))} cornerCut="bl" labelClassName="translate-x-3 pl-3" />
            <KpiShortcut color={panelColor} icon={Tag} label="Renomear setores" value={0} onClick={() => navigate(withSchool("/settings/sector-labels"))} cornerCut="tr" />
            <KpiShortcut color={panelColor} icon={BarChart3} label="Relatórios" value={0} onClick={() => navigate(withSchool("/reports"))} cornerCut="tl" labelClassName="translate-x-1.5 pl-2" />
            <KpiShortcut color={panelColor} icon={Scale} label={"Disciplina\nadvertências"} value={0} onClick={() => navigate(withSchool("/gestor/disciplina"))} cornerCut="br" labelClassName="-translate-x-1.5 pr-2" />
            <KpiShortcut color={panelColor} icon={Clock} label={"Uso real\ndo ambiente"} value={0} onClick={() => navigate(withSchool("/gestor/uso-real"))} cornerCut="bl" labelClassName="translate-x-3 pl-3" />
            <KpiShortcut color={panelColor} icon={UserX} label={"Ausências\nde hoje"} value={0} onClick={() => navigate(withSchool("/gestor/ausencias-hoje"))} cornerCut="tr" labelClassName="-translate-x-1.5 pr-2" />
            <KpiShortcut color={panelColor} icon={Users} label={"Sala do\nProfessor"} value={0} onClick={() => navigate(withSchool("/gestor/sala-do-professor"))} cornerCut="tl" labelClassName="translate-x-3 pl-3" />



          </div>
          {/* Botão central — Agendar agora */}
          <button
            data-no-premium
            onClick={() => navigate(withSchool("/sectors"))}
            className="absolute left-1/2 top-1/4 -translate-x-1/2 -translate-y-1/2 w-[104px] h-[104px] rounded-full border-2 flex flex-col items-center justify-center gap-0.5 z-10 overflow-hidden animate-kpi-attention"
            style={panelButtonStyle(panelColor)}
          >
            <PanelButtonGlow rounded="rounded-full" color={panelColor} />
            <Sparkles className="relative z-10 h-7 w-7 text-white" strokeWidth={2.2} />
            <span
              className="relative z-10 text-white font-extrabold tracking-[0.06em] uppercase leading-tight px-1 text-center"
              style={{ fontSize: "13px" }}
            >
              Agendar agora
            </span>
          </button>
          <button
            data-no-premium
            onClick={() => setShowTvDialog(true)}
            className="absolute left-1/2 top-3/4 -translate-x-1/2 -translate-y-1/2 w-[104px] h-[104px] rounded-full border-2 flex flex-col items-center justify-center gap-0.5 z-10 overflow-hidden animate-kpi-attention"
            style={panelButtonStyle(panelColor)}
            aria-label="Abrir Painel TV"
          >
            <PanelButtonGlow rounded="rounded-full" color={panelColor} />
            <Tv className="relative z-10 h-6 w-6 text-white" strokeWidth={2.4} />
            <span
              className="relative z-10 text-white font-extrabold tracking-[0.06em] uppercase leading-tight px-1 text-center"
              style={{ fontSize: "11px" }}
            >
              Painel TV
            </span>
          </button>
        </section>
        <PainelTvLinkDialog
          open={showTvDialog}
          onOpenChange={setShowTvDialog}
          schoolId={profile?.school_id}
          accent="amber"
        />

        {/* Aviso de assinatura — maior e na parte de baixo do painel */}
        <div className="pt-1 [&_p:first-child]:!text-base [&_p:last-child]:!text-sm">
          <SubscriptionDeadlineBanner />
        </div>

        {/* Card de fases trial (0-10 livre, 10-20 restrito, 20+ bloqueado) */}
        <GestorTrialPhaseCard />

        {/* Footer brand */}
        <div className="pt-2 text-center">
          <p className="text-amber-100/40 text-[10px] tracking-widest uppercase font-semibold">Gestão Premium · Agendamento Escolar</p>
        </div>

      </div>
      <Dialog open={showSchoolDetails} onOpenChange={setShowSchoolDetails}>
        <DialogContent className="max-w-md bg-[hsl(222,65%,10%)] border-amber-400/20 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <FileText className="h-5 w-5" />
              Dados da Escola
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* Nome em linha cheia para nunca cortar */}
            <div className="space-y-1 rounded-xl bg-white/5 border border-amber-400/10 p-3">
              <p className="text-[10px] uppercase tracking-wider text-amber-200/60 font-bold">Nome da Unidade</p>
              <p className="text-base font-bold leading-snug break-words">{school?.name || "—"}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-amber-200/60 font-bold">Código INEP</p>
                <p className="text-sm font-semibold break-words">{school?.inep_code || "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-amber-200/60 font-bold">Status</p>
                <Badge variant={school?.is_active !== false ? "default" : "destructive"} className={`text-[10px] font-bold ${school?.is_active !== false ? "bg-emerald-500 hover:bg-emerald-600" : ""}`}>
                  {school?.is_active !== false ? "ATIVA" : "INATIVA"}
                </Badge>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-amber-200/60 font-bold">Endereço</p>
              <p className="text-sm font-semibold break-words">{school?.address || "—"}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-amber-200/60 font-bold">Cidade</p>
                <p className="text-sm font-semibold break-words">{school?.city || "—"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-amber-200/60 font-bold">Estado</p>
                <p className="text-sm font-semibold break-words">{school?.state || "—"}</p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-[10px] uppercase tracking-wider text-amber-200/60 font-bold">Rede de Ensino</p>
              <p className="text-sm font-semibold break-words">{school?.network || "—"}</p>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <div className="grid grid-cols-2 gap-2 w-full">
              <Button
                onClick={() => {
                  const txt = [
                    `*Dados da Escola*`,
                    `Nome: ${school?.name || "—"}`,
                    `INEP: ${school?.inep_code || "—"}`,
                    `Endereço: ${school?.address || "—"}`,
                    `Cidade/UF: ${school?.city || "—"} - ${school?.state || "—"}`,
                    `Rede: ${school?.network || "—"}`,
                    `Status: ${school?.is_active !== false ? "ATIVA" : "INATIVA"}`,
                  ].join("\n");
                  window.open(`https://wa.me/?text=${encodeURIComponent(txt)}`, "_blank");
                }}
                className="relative overflow-hidden w-full border font-bold transition-transform duration-200 animate-kpi-attention"
                style={panelButtonStyle(panelColor)}
              >
                <PanelButtonGlow rounded="rounded-md" color={panelColor} />
                <MessageCircle className="relative z-10 h-4 w-4 mr-1" />
                <span className="relative z-10">WhatsApp</span>
              </Button>
              <Button
                onClick={async () => {
                  const { default: jsPDF } = await import("jspdf");
                  const doc = new jsPDF();
                  let y = 20;
                  doc.setFontSize(16);
                  doc.text("Dados da Escola", 14, y); y += 10;
                  doc.setFontSize(11);
                  const lines: [string, string][] = [
                    ["Nome", school?.name || "—"],
                    ["INEP", school?.inep_code || "—"],
                    ["Endereço", school?.address || "—"],
                    ["Cidade", school?.city || "—"],
                    ["Estado", school?.state || "—"],
                    ["Rede", school?.network || "—"],
                    ["Status", school?.is_active !== false ? "ATIVA" : "INATIVA"],
                  ];
                  lines.forEach(([k, v]) => {
                    const wrapped = doc.splitTextToSize(`${k}: ${v}`, 180);
                    doc.text(wrapped, 14, y);
                    y += wrapped.length * 6 + 2;
                  });
                  // Marca d'água "PRÉ-VISUALIZAÇÃO" quando o modo está ativo
                  if (previewMode) {
                    const pageCount = doc.getNumberOfPages();
                    const pageW = doc.internal.pageSize.getWidth();
                    const pageH = doc.internal.pageSize.getHeight();
                    for (let i = 1; i <= pageCount; i++) {
                      doc.setPage(i);
                      doc.saveGraphicsState();
                      doc.setGState(doc.GState({ opacity: 0.18 }));
                      doc.setTextColor(120, 120, 120);
                      doc.setFontSize(70);
                      doc.text("PRÉ-VISUALIZAÇÃO", pageW / 2, pageH / 2, {
                        align: "center",
                        angle: 45,
                      });
                      doc.restoreGraphicsState();
                    }
                    doc.setTextColor(0, 0, 0);
                  }
                  doc.save(`dados-escola-${(school?.inep_code || "escola")}.pdf`);
                }}
                className="relative overflow-hidden w-full border font-bold transition-transform duration-200 animate-kpi-attention"
                style={panelButtonStyle(panelColor)}
              >
                <PanelButtonGlow rounded="rounded-md" color={panelColor} />
                <Download className="relative z-10 h-4 w-4 mr-1" />
                <span className="relative z-10">PDF</span>
              </Button>
            </div>
            <Button
              onClick={() => setShowSchoolDetails(false)}
              variant="outline"
              className="relative overflow-hidden w-full border font-bold transition-transform duration-200 animate-kpi-attention"
              style={panelButtonStyle(panelColor)}
            >
              <PanelButtonGlow rounded="rounded-md" color={panelColor} />
              <span className="relative z-10">Fechar</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showExpirationConfig} onOpenChange={setShowExpirationConfig}>
        <DialogContent className="max-w-md bg-[hsl(222,65%,10%)] border-amber-400/20 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-400">
              <Clock className="h-5 w-5" />
              Configurar Expiração
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-amber-100/80">
                Determine em quantos dias o aplicativo expira para casos de carência:
              </p>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min="0"
                  value={gracePeriodDays}
                  onChange={(e) => setGracePeriodDays(e.target.value)}
                  className="bg-white/5 border-amber-400/30 text-white font-bold text-lg"
                />
                <span className="text-amber-200/60 font-bold uppercase tracking-wider text-xs shrink-0">Dias</span>
              </div>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="outline"
              onClick={() => setShowExpirationConfig(false)}
              className="relative overflow-hidden border font-bold transition-transform duration-200 animate-kpi-attention"
              style={panelButtonStyle(panelColor)}
            >
              <PanelButtonGlow rounded="rounded-md" color={panelColor} />
              <span className="relative z-10">Cancelar</span>
            </Button>
            <Button 
              onClick={handleUpdateGracePeriod}
              disabled={isUpdatingGracePeriod}
              className="relative overflow-hidden border font-bold transition-transform duration-200 animate-kpi-attention"
              style={panelButtonStyle(panelColor)}
            >
              <PanelButtonGlow rounded="rounded-md" color={panelColor} />
              <span className="relative z-10">{isUpdatingGracePeriod ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar Configuração"}</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={supportPreviewOpen} onOpenChange={setSupportPreviewOpen}>
        <DialogContent className="max-w-md bg-[hsl(222,65%,10%)] border-green-400/30 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-400">
              <LifeBuoy className="h-5 w-5" />
              Confirmar mensagem de suporte
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-wide text-white/60 font-semibold">
              Pré-visualização da mensagem
            </p>
            <div className="rounded-lg border border-green-400/20 bg-green-500/10 p-3 text-sm leading-relaxed text-white whitespace-pre-wrap break-words">
              {supportMessage}
            </div>
            <p className="text-xs text-white/60">
              Será enviada para o WhatsApp {supportContact.display_label}.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setSupportPreviewOpen(false)}
              className="h-12 bg-transparent border-white/30 text-white hover:bg-white/10"
            >
              Cancelar
            </Button>
            <Button
              onClick={() => {
                window.open(buildWhatsappUrl(supportMessage), "_blank", "noopener,noreferrer");
                setSupportPreviewOpen(false);
              }}
              className="h-12 font-bold bg-green-600 hover:bg-green-500 text-white gap-2"
            >
              <MessageCircle className="h-5 w-5" />
              Abrir WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const KpiShortcut = ({
  icon: Icon, label, value, loading, onClick, cornerCut, labelAlign = "center", color, pulseRed, pulseBadge, pulseSeconds, pulseSiren, labelClassName,
}: {
  icon: typeof Crown; label: string; value: number; hint?: string; loading?: boolean; onClick?: () => void;
  cornerCut?: "tl" | "tr" | "bl" | "br" | "t" | "b" | "l" | "r";
  labelAlign?: "center" | "bottom" | "top";
  color?: { from: string; to: string; glow: string; border: string };
  pulseRed?: boolean;
  pulseBadge?: number;
  pulseSeconds?: number;
  pulseSiren?: boolean;
  labelClassName?: string;
}) => {
  // Mask radial: recorta um círculo no canto/lado que fica voltado para o centro do grid
  const cornerPos: Record<string, string> = {
    tl: "0% 0%",
    tr: "100% 0%",
    bl: "0% 100%",
    br: "100% 100%",
    t: "50% 0%",
    b: "50% 100%",
    l: "0% 50%",
    r: "100% 50%",
  };
  const maskStyle = cornerCut
    ? {
        WebkitMaskImage: `radial-gradient(circle 60px at ${cornerPos[cornerCut]}, transparent 99%, #000 100%)`,
        maskImage: `radial-gradient(circle 60px at ${cornerPos[cornerCut]}, transparent 99%, #000 100%)`,
      }
    : {};
  const justifyClass =
    labelAlign === "bottom" ? "justify-end pb-1.5" :
    labelAlign === "top" ? "justify-start pt-1.5" :
    "justify-center";
  const baseColor = color ?? { from: "hsl(32, 95%, 58%)", to: "hsl(20, 92%, 45%)", glow: "hsl(35, 100%, 60%)", border: "hsl(45, 100%, 75%)" };
  const redColor = { from: "hsl(0, 85%, 55%)", to: "hsl(355, 80%, 42%)", glow: "hsl(0, 100%, 60%)", border: "hsl(0, 90%, 75%)" };
  const c = pulseRed ? redColor : baseColor;
  const pulseDur = pulseSeconds && pulseSeconds > 0 ? pulseSeconds : 1;
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`relative w-full h-[78px] rounded-2xl px-2 py-1 border-[3px] flex flex-col items-center ${justifyClass} gap-1 text-center transition-transform duration-200 ease-out disabled:cursor-default ${pulseSiren ? "animate-police-siren" : pulseRed ? "animate-pulse" : "animate-kpi-attention"}`}
      style={{
        ...panelButtonStyle(c),
        ...maskStyle,
        ...(pulseSiren ? {} : pulseRed ? { animationDuration: `${pulseDur}s`, animationTimingFunction: "ease-in-out" } : {}),
      }}
    >

      {/* Brilho fluorescente animado — sincronizado em todos os botões */}
      <PanelButtonGlow color={c} />
      <span
        aria-hidden
        className="pointer-events-none absolute -top-2 left-3 right-8 h-3 rounded-full blur-md"
        style={{ background: "hsla(0,0%,100%,0.55)" }}
      />
      {labelAlign === "top" ? (
        <>
          <span
            className={`relative z-10 text-white font-extrabold tracking-wide uppercase leading-[1.05] break-words whitespace-pre-line px-0.5 max-w-full drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] ${labelClassName ?? ""}`}
            style={{ fontSize: "13px" }}
          >
            {label}
          </span>
          <Icon className={`relative z-10 h-9 w-9 text-white shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)] ${labelClassName ?? ""}`} strokeWidth={2} />
        </>
      ) : (
        <>
          <Icon className={`relative z-10 h-9 w-9 text-white shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)] ${labelClassName ?? ""}`} strokeWidth={2} />
          <span
            className={`relative z-10 text-white font-extrabold tracking-wide uppercase leading-[1.05] break-words whitespace-pre-line px-0.5 max-w-full drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)] ${labelClassName ?? ""}`}
            style={{ fontSize: "13px" }}
          >
            {label}
          </span>
        </>
      )}
      {pulseRed && pulseBadge && pulseBadge > 0 ? (
        <span className="absolute top-1.5 right-1.5 min-w-[20px] h-[20px] px-1 rounded-full text-white text-[10px] font-extrabold flex items-center justify-center border border-white/80 animate-pulse" style={{ background: "hsl(0, 95%, 50%)" }}>
          {pulseBadge}
        </span>
      ) : !loading && value > 0 && (
        <span className="absolute top-1.5 right-1.5 min-w-[20px] h-[20px] px-1 rounded-full text-white text-[10px] font-extrabold flex items-center justify-center border border-white/60" style={{ background: c.glow }}>
          {value}
        </span>
      )}
      {loading && (
        <Loader2 className="absolute top-1.5 right-1.5 h-4 w-4 animate-spin text-white" />
      )}
    </button>
  );
};

export default GestorPanel;
