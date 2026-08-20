import { useNavigate, useLocation } from "react-router-dom";
import { Shield, ListChecks, Sun, Moon, Tv, LogOut, Settings, Globe, Palette, Headphones, Trash2, School, Tags, RefreshCw, Phone, UserCog, FileSignature, Bell, BellOff, X, Activity, Scale } from "lucide-react";
import { useAdminPendingContracts } from "@/hooks/useAdminPendingContracts";
import GestorNotificationBell from "@/components/GestorNotificationBell";
import InboxBadge from "@/components/inbox/InboxBadge";
import { SESSION_ROLE_OVERRIDE_KEY } from "@/pages/EditProfile";
import AppearanceSettings from "@/components/AppearanceSettings";
import SubscriptionDeadlineMenuItem from "@/components/SubscriptionDeadlineMenuItem";
import { useInboxAlerts } from "@/hooks/useInboxAlerts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useLanguage } from "@/hooks/useLanguage";
import { useSupportContact, updateSupportCache } from "@/hooks/useSupportContact";
import { languageLabels, Language } from "@/lib/translations";
import { toast } from "sonner";
import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const HIDDEN_ROUTES = ["/", "/auth", "/reset-password", "/tv"];

const ROLE_LABELS: Record<string, string> = {
  admin: "Administrador(a)",
  teacher: "Professor(a)",
  coord_pedagogico: "Coord. Pedagógico(a)",
  supervisor: "Corpo de Alunos C.A",
  secretario_escolar: "Assistente de Aluno",
  gestor_pedagogico: "Gestor(a) Pedagógico(a)",
  chef_projeto_vida: "Chef da Sala",
};


export default function GlobalToolbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, signOut } = useAuth();
  const { resolvedTheme, setTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { contact, whatsappUrl } = useSupportContact();
  const { enabled: inboxAlerts, setEnabled: setInboxAlerts } = useInboxAlerts();
  const [isAdmin, setIsAdmin] = useState(false);
  const [pendingLang, setPendingLang] = useState<Language | null>(null);
  const [supportOpen, setSupportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [logoutOpen, setLogoutOpen] = useState(false);
  const [supportNumber, setSupportNumber] = useState("");
  const [supportLabel, setSupportLabel] = useState("");
  const [supportSaving, setSupportSaving] = useState(false);
  const [sessionRole, setSessionRole] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("");

  // Anuncia uma mensagem para leitores de tela sem mover foco nem fechar UI.
  // Limpa a mensagem após alguns segundos para permitir reanúncios futuros.
  const announce = useCallback((msg: string) => {
    setLiveMessage("");
    // próximo tick garante que a região seja atualizada e relida
    requestAnimationFrame(() => setLiveMessage(msg));
    window.setTimeout(() => setLiveMessage(""), 4000);
  }, []);

  const themeAnnouncement = useCallback(
    (mode: "light" | "dark") => {
      const label = mode === "dark" ? t("toolbar.darkMode") : t("toolbar.lightMode");
      if (language === "pt") return `Tema ${label} aplicado.`;
      if (language === "en") return `${label} theme applied.`;
      return `Tema ${label} aplicado.`;
    },
    [language, t]
  );

  const langAnnouncement = useCallback(
    (lang: Language) => {
      const label = languageLabels[lang];
      if (lang === "pt") return `Idioma alterado para ${label}.`;
      if (lang === "en") return `Language changed to ${label}.`;
      return `Idioma cambiado a ${label}.`;
    },
    []
  );

  useEffect(() => {
    const read = () => setSessionRole(sessionStorage.getItem(SESSION_ROLE_OVERRIDE_KEY));
    read();
    window.addEventListener("session-role-override-changed", read);
    return () => window.removeEventListener("session-role-override-changed", read);
  }, []);

  useEffect(() => {
    if (user) {
      supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }).then(({ data }) => {
        setIsAdmin(!!data);
      });
    }
  }, [user]);

  const { count: pendingContracts, lastNewSchoolId, lastEvent } = useAdminPendingContracts(isAdmin);
  const lastNotifiedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAdmin || !lastNewSchoolId) return;
    const key = `${lastEvent}:${lastNewSchoolId}`;
    if (lastNotifiedRef.current === key) return;
    lastNotifiedRef.current = key;
    const message =
      lastEvent === "gestor_signed"
        ? "Gestor assinou um contrato — abra o painel"
        : "Novo contrato aguardando sua assinatura";
    const target = lastEvent === "gestor_signed"
      ? "/admin/contracts?filter=gestor_signed"
      : "/admin/contracts?filter=awaiting_admin";
    toast.info(message, {
      action: { label: "Abrir", onClick: () => navigate(target) },
    });
  }, [isAdmin, lastNewSchoolId, lastEvent, navigate]);

  const rightBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = rightBarRef.current;
    if (!el) return;
    const FALLBACK = "9rem";
    const update = () => {
      const w = el.offsetWidth;
      document.documentElement.style.setProperty(
        "--gnav-right-w",
        w > 0 ? `${w}px` : FALLBACK,
      );
    };
    update();
    let ro: ResizeObserver | null = null;
    let onResize: (() => void) | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(update);
      ro.observe(el);
    } else {
      onResize = update;
      window.addEventListener("resize", onResize);
      window.addEventListener("orientationchange", onResize);
    }
    return () => {
      ro?.disconnect();
      if (onResize) {
        window.removeEventListener("resize", onResize);
        window.removeEventListener("orientationchange", onResize);
      }
      document.documentElement.style.setProperty("--gnav-right-w", FALLBACK);
    };
  }, [user, profile, location.pathname, isAdmin]);

  if (!user || !profile) return null;
  if (HIDDEN_ROUTES.includes(location.pathname)) return null;

  return (
    <div ref={rightBarRef} style={{ top: "var(--gnav-top, 0px)" }} className="fixed right-2 z-50 flex items-center gap-1 rounded-xl bg-black/40 backdrop-blur-md px-1 h-11 shadow-lg ring-1 ring-white/10 max-w-[calc(100vw-1rem)] animate-in fade-in slide-in-from-top-2 duration-500">


      {/* Botão Admin (acesso rápido) se for admin */}
      {isAdmin && (
        <Button 
          variant="ghost" 
          size="icon" 
          title="Painel Admin" 
          onClick={() => navigate("/admin")}
          className="rounded-lg h-8 w-8 shrink-0 bg-amber-500/20 text-amber-500 hover:bg-amber-500/30 hover:text-amber-400 transition-all border border-amber-500/30"
        >
          <Shield className="h-4 w-4" />
        </Button>
      )}

      {/* Sininho de contratos pendentes (apenas admin) */}
      {isAdmin && (
        <Button
          variant="ghost"
          size="icon"
          title="Contratos pendentes"
          onClick={() => navigate("/admin/contracts")}
          className="relative rounded-lg h-8 w-8 shrink-0 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 hover:text-amber-200 transition-all border border-amber-500/20"
        >
          <FileSignature className="h-4 w-4" />
          {pendingContracts > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center animate-pulse ring-2 ring-black/40">
              {pendingContracts > 9 ? "9+" : pendingContracts}
            </span>
          )}
        </Button>
      )}

      {/* Caixas de mensagens (Admin / Gestor / Usuário comum) */}
      <InboxBadge audience="admin" to="/admin/inbox" title="Caixa do administrador" enabled={isAdmin} />
      <InboxBadge
        audience="gestor"
        to="/gestor/inbox"
        title="Caixa do gestor"
        enabled={profile?.role === "gestor_pedagogico" || profile?.role === "chef_projeto_vida"}
      />
      {(profile?.role === "gestor_pedagogico" || profile?.role === "chef_projeto_vida") && (
        <Button
          variant="ghost"
          size="icon"
          title="Atividade da escola"
          onClick={() => navigate("/gestor/atividade")}
          className="rounded-lg h-8 w-8 shrink-0 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25 hover:text-emerald-200 transition-all border border-emerald-500/20"
        >
          <Activity className="h-4 w-4" />
        </Button>
      )}
      {/* Disciplina — usuário comum vê o próprio histórico; gestor/chef tem botão no painel */}
      {profile && profile.role !== "gestor_pedagogico" && profile.role !== "chef_projeto_vida" && profile.role !== "admin" && (
        <Button
          variant="ghost"
          size="icon"
          title="Minha disciplina"
          onClick={() => navigate("/disciplina")}
          className="rounded-lg h-8 w-8 shrink-0 bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 hover:text-amber-200 transition-all border border-amber-500/20"
        >
          <Scale className="h-4 w-4" />
        </Button>
      )}
      {/* Bate-papo do usuário comum agora vive como botão grande em /sectors */}


      {/* Settings dropdown — consolidates most actions */}
      <DropdownMenu open={settingsOpen} onOpenChange={setSettingsOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" title={t("toolbar.settings")} className="rounded-lg h-8 w-8 shrink-0 text-white/90 hover:bg-white/20 hover:text-white transition-all">
            <Settings className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="w-72 p-0 overflow-hidden rounded-2xl border-border/60 shadow-2xl"
        >

          {/* Conta */}
          <div className="px-1.5 pt-2">
            <DropdownMenuLabel className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              Conta
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => navigate("/profile/edit")} className="gap-2.5 rounded-lg cursor-pointer">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
                <UserCog className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1 text-sm">Editar perfil</span>
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem onClick={() => navigate("/admin")} className="gap-2.5 rounded-lg cursor-pointer">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                  <Shield className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1 text-sm">{t("toolbar.admin")}</span>
              </DropdownMenuItem>
            )}
            <SubscriptionDeadlineMenuItem dropdownOpen={settingsOpen} />
          </div>

          {/* Navegação */}
          <div className="px-1.5 pt-1">
            <DropdownMenuLabel className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              Navegação
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => navigate("/reports")} className="gap-2.5 rounded-lg cursor-pointer">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-500/10 text-violet-600 dark:text-violet-400">
                <ListChecks className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1 text-sm">{t("toolbar.reports")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => {
                if (profile?.school_id) {
                  window.open(`/tv?school=${profile.school_id}`, "_blank");
                } else {
                  toast.error("Esta conta não possui uma escola vinculada para o modo TV.");
                }
              }} 
              className="gap-2.5 rounded-lg cursor-pointer"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                <Tv className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1 text-sm">{t("toolbar.tvMode")}</span>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate("/school-status")} className="gap-2.5 rounded-lg cursor-pointer">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <School className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1 text-sm">Status de outra escola</span>
            </DropdownMenuItem>
            {profile?.role === "gestor_pedagogico" && (
              <DropdownMenuItem onClick={() => navigate("/settings/sector-labels")} className="gap-2.5 rounded-lg cursor-pointer">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-pink-500/10 text-pink-600 dark:text-pink-400">
                  <Tags className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1 text-sm">Renomear Setores</span>
              </DropdownMenuItem>
            )}
          </div>

          {/* Preferências */}
          <div className="px-1.5 pt-1">
            <DropdownMenuLabel className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              Preferências
            </DropdownMenuLabel>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                aria-label={`${t("toolbar.language")} (atual: ${languageLabels[language]})`}
                className="gap-2.5 rounded-lg cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background data-[state=open]:bg-accent"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                  <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span className="flex-1 text-sm">{t("toolbar.language")}</span>
                <span className="text-[10px] text-muted-foreground font-medium uppercase" aria-hidden="true">{language}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent
                  sideOffset={4}
                  alignOffset={-4}
                  collisionPadding={10}
                  avoidCollisions
                  aria-label={t("toolbar.language")}
                  className="w-40 max-w-[calc(100vw-20px)] rounded-xl z-[60]"
                >
                  {(Object.keys(languageLabels) as Language[]).map((lang) => {
                    const isActive = language === lang;
                    return (
                      <DropdownMenuItem
                        key={lang}
                        role="menuitemradio"
                        aria-checked={isActive}
                        aria-current={isActive ? "true" : undefined}
                        onClick={() => {
                          if (!isActive) setPendingLang(lang);
                        }}
                        className={`rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
                          isActive ? "bg-accent font-semibold" : ""
                        }`}
                      >
                        <span className="min-w-0 flex-1 text-wrap break-words">{languageLabels[lang]}</span>
                        {isActive && <span className="ml-2 text-primary" aria-hidden="true">●</span>}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger
                aria-label={`${t("toolbar.theme")} (atual: ${resolvedTheme === "dark" ? t("toolbar.darkMode") : t("toolbar.lightMode")})`}
                className="gap-2.5 rounded-lg cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background data-[state=open]:bg-accent"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-500/10 text-slate-600 dark:text-slate-300">
                  {resolvedTheme === "dark" ? <Moon className="h-3.5 w-3.5" aria-hidden="true" /> : <Sun className="h-3.5 w-3.5" aria-hidden="true" />}
                </span>
                <span className="flex-1 text-sm">{t("toolbar.theme")}</span>
                <span className="text-[10px] text-muted-foreground font-medium capitalize" aria-hidden="true">
                  {resolvedTheme === "dark" ? t("toolbar.darkMode") : t("toolbar.lightMode")}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuPortal>
                <DropdownMenuSubContent
                  sideOffset={4}
                  alignOffset={-4}
                  collisionPadding={10}
                  avoidCollisions
                  aria-label={t("toolbar.theme")}
                  className="w-40 max-w-[calc(100vw-20px)] rounded-xl z-[60]"
                >
                  <DropdownMenuItem
                    role="menuitemradio"
                    aria-checked={resolvedTheme === "light"}
                    aria-current={resolvedTheme === "light" ? "true" : undefined}
                    onClick={(e) => { e.preventDefault(); setTheme("light"); announce(themeAnnouncement("light")); }}
                    className={`rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
                      resolvedTheme === "light" ? "bg-accent font-semibold" : ""
                    }`}
                  >
                    <Sun className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-wrap break-words">{t("toolbar.lightMode")}</span>
                    {resolvedTheme === "light" && <span className="ml-2 text-primary" aria-hidden="true">●</span>}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    role="menuitemradio"
                    aria-checked={resolvedTheme === "dark"}
                    aria-current={resolvedTheme === "dark" ? "true" : undefined}
                    onClick={(e) => { e.preventDefault(); setTheme("dark"); announce(themeAnnouncement("dark")); }}
                    className={`rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background ${
                      resolvedTheme === "dark" ? "bg-accent font-semibold" : ""
                    }`}
                  >
                    <Moon className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1 text-wrap break-words">{t("toolbar.darkMode")}</span>
                    {resolvedTheme === "dark" && <span className="ml-2 text-primary" aria-hidden="true">●</span>}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuPortal>
            </DropdownMenuSub>
            <AppearanceSettings
              trigger={
                <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="gap-2.5 rounded-lg cursor-pointer">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400">
                    <Palette className="h-3.5 w-3.5" />
                  </span>
                  <span className="flex-1 text-sm">{t("settings.appearance")}</span>
                </DropdownMenuItem>
              }
            />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setInboxAlerts(!inboxAlerts);
              }}
              className="gap-2.5 rounded-lg cursor-pointer"
              role="menuitemcheckbox"
              aria-checked={inboxAlerts}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                {inboxAlerts ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
              </span>
              <span className="flex-1 text-sm">Som e vibração do Inbox</span>
              <span
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${inboxAlerts ? "bg-emerald-500" : "bg-muted-foreground/30"}`}
                aria-hidden="true"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${inboxAlerts ? "translate-x-4" : "translate-x-0.5"}`}
                />
              </span>
            </DropdownMenuItem>
          </div>

          {/* Suporte */}
          <div className="px-1.5 pt-1">
            <DropdownMenuLabel className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
              Suporte
            </DropdownMenuLabel>
            <DropdownMenuItem onClick={() => window.open(whatsappUrl, "_blank")} className="gap-2.5 rounded-lg cursor-pointer">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-green-500/10 text-green-600 dark:text-green-400">
                <Headphones className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1 text-sm">{t("settings.support")}</span>
              <span className="text-[10px] text-muted-foreground font-mono">{contact.display_label}</span>
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setSupportNumber(contact.whatsapp_number);
                  setSupportLabel(contact.display_label);
                  setSupportOpen(true);
                }}
                className="gap-2.5 rounded-lg cursor-pointer"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-500/10 text-teal-600 dark:text-teal-400">
                  <Phone className="h-3.5 w-3.5" />
                </span>
                <span className="flex-1 text-sm">Editar contato de suporte</span>
              </DropdownMenuItem>
            )}
          </div>

          {/* Zona de perigo */}
          <div className="px-1.5 pt-1 pb-1.5">
            <DropdownMenuSeparator className="my-1" />
            <DropdownMenuItem
              className="gap-2.5 rounded-lg cursor-pointer"
              onClick={() => setLogoutOpen(true)}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-500/10 text-orange-600 dark:text-orange-400">
                <LogOut className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1 text-sm font-medium">Deslogar</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="gap-2.5 rounded-lg cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
              onClick={async () => {
                if (!confirm(t("settings.deleteAccountConfirm"))) return;
                try {
                  const { error } = await supabase.functions.invoke("delete-user", {
                    body: { user_id: user.id },
                  });
                  if (error) throw error;
                  toast.success(t("settings.deleteAccountSuccess"));
                  await signOut();
                } catch {
                  toast.error(t("settings.deleteAccountError"));
                }
              }}
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-destructive/10 text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </span>
              <span className="flex-1 text-sm font-medium">{t("settings.deleteAccount")}</span>
            </DropdownMenuItem>
          </div>

          {/* Footer com versão */}
          <div className="px-4 py-2.5 border-t border-border/60 bg-muted/30 flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground/80 font-mono tracking-wide">
              v{__APP_VERSION__}
            </span>
            <button
              type="button"
              onClick={() => {
                const force = (window as unknown as { __forceAppUpdate?: () => Promise<void> }).__forceAppUpdate;
                if (force) force();
                else window.location.reload();
              }}
              className="inline-flex items-center gap-1 text-[10px] font-semibold text-primary hover:underline"
              title="Limpa cache e recarrega para a versão mais recente"
            >
              <RefreshCw className="h-3 w-3" /> Atualizar
            </button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Theme toggle — quick access */}
      <Button variant="ghost" size="icon" onClick={() => { const next = resolvedTheme === "dark" ? "light" : "dark"; setTheme(next); announce(themeAnnouncement(next)); }} title={resolvedTheme === "dark" ? t("toolbar.lightMode") : t("toolbar.darkMode")} className="rounded-lg h-8 w-8 shrink-0 text-white/90 hover:bg-white/20 hover:text-white transition-all">
        {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </Button>

      {/* Fechar — apenas volta para a tela inicial, mantém sessão */}
      <Button variant="ghost" size="icon" onClick={() => { navigate("/sectors"); toast.info("Sessão continua ativa", { description: "Você continua conectado. Use \"Deslogar\" nas Configurações para encerrar a sessão." }); }} title="Fechar" className="rounded-lg h-8 w-8 shrink-0 text-white/90 hover:bg-white/20 hover:text-white transition-all">
        <X className="h-4 w-4" />
      </Button>

      <AlertDialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <AlertDialogContent className="max-w-sm rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-base">
              <LogOut className="h-4 w-4 text-destructive" />
              Deslogar
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja sair da sua conta? Você precisará entrar com e-mail e senha novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-12 rounded-xl">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => { setLogoutOpen(false); await signOut(); }}
              className="h-12 rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bold"
            >
              Deslogar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Language confirmation dialog */}
      <Dialog open={!!pendingLang} onOpenChange={(o) => { if (!o) setPendingLang(null); }}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Globe className="h-5 w-5 text-primary" aria-hidden="true" />
              {language === "pt" ? "Alterar Idioma" : language === "en" ? "Change Language" : "Cambiar Idioma"}
            </DialogTitle>
            <DialogDescription className="leading-relaxed pt-1">
              {pendingLang && (language === "pt"
                ? `Deseja mudar o idioma do aplicativo de "${languageLabels[language]}" para "${languageLabels[pendingLang]}"?`
                : language === "en"
                ? `Do you want to change the app language from "${languageLabels[language]}" to "${languageLabels[pendingLang]}"?`
                : `¿Desea cambiar el idioma de la aplicación de "${languageLabels[language]}" a "${languageLabels[pendingLang]}"?`)}
            </DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground/80">
            {language === "pt"
              ? "Toda a interface será traduzida automaticamente."
              : language === "en"
              ? "The entire interface will be translated automatically."
              : "Toda la interfaz se traducirá automáticamente."}
          </p>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setPendingLang(null)} className="flex-1 rounded-xl">
              {language === "pt" ? "Cancelar" : language === "en" ? "Cancel" : "Cancelar"}
            </Button>
            <Button
              autoFocus
              onClick={() => {
                if (!pendingLang) return;
                const target = pendingLang;
                setLanguage(target);
                toast.success(
                  target === "pt" ? "Idioma alterado com sucesso!" :
                  target === "en" ? "Language changed successfully!" :
                  "¡Idioma cambiado con éxito!"
                );
                announce(langAnnouncement(target));
                setPendingLang(null);
              }}
              className="flex-1 rounded-xl font-bold"
            >
              {language === "pt" ? "Sim, Aplicar" : language === "en" ? "Yes, Apply" : "Sí, Aplicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Admin-only: edit support contact */}
      <Dialog open={supportOpen} onOpenChange={(o) => !supportSaving && setSupportOpen(o)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Contato de suporte</DialogTitle>
            <DialogDescription>
              Número WhatsApp que aparece em todo o aplicativo para suporte técnico.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="support-number">Número (apenas dígitos, com DDI)</Label>
              <Input
                id="support-number"
                inputMode="numeric"
                placeholder="5511925686565"
                value={supportNumber}
                onChange={(e) => setSupportNumber(e.target.value.replace(/\D/g, "").slice(0, 15))}
                disabled={supportSaving}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="support-label">Texto exibido</Label>
              <Input
                id="support-label"
                placeholder="(11) 92568-6565"
                value={supportLabel}
                onChange={(e) => setSupportLabel(e.target.value.slice(0, 40))}
                disabled={supportSaving}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupportOpen(false)} disabled={supportSaving}>
              Cancelar
            </Button>
            <Button
              disabled={supportSaving || supportNumber.length < 10 || supportLabel.trim().length < 3}
              onClick={async () => {
                setSupportSaving(true);
                const { error } = await supabase
                  .from("support_settings")
                  .update({
                    whatsapp_number: supportNumber,
                    display_label: supportLabel.trim(),
                    updated_by: user.id,
                  })
                  .eq("id", true);
                setSupportSaving(false);
                if (error) {
                  toast.error("Falha ao salvar: " + error.message);
                  return;
                }
                updateSupportCache({ whatsapp_number: supportNumber, display_label: supportLabel.trim() });
                toast.success("Contato de suporte atualizado");
                setSupportOpen(false);
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Região aria-live para anúncios não intrusivos (idioma/tema) */}
      <div
        aria-live="polite"
        aria-atomic="true"
        role="status"
        className="sr-only"
      >
        {liveMessage}
      </div>
    </div>
  );
}
