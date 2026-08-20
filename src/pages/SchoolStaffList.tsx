import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import GestorThemeShell, { GestorPremiumHeader } from "@/components/gestor/GestorThemeShell";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowLeft, Loader2, Users, Search, Mail, Phone, ShieldCheck, Clock,
  User as UserIcon, Calendar, Briefcase, Hash, School as SchoolIcon, MapPin,
  CalendarDays, Globe, Handshake, GraduationCap, Check, X,
} from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useSectorPreferences, type ColorOption } from "@/hooks/useSectorPreferences";
import PanelColorSlider from "@/components/gestor/PanelColorSlider";
import {
  ALLOWED_ROLE_VALUES,
  ALLOWED_ROLE_LABELS,
  ALLOWED_ROLE_SHORT_LABELS,
} from "@/lib/allowedRoles";

// Estilo de botão idêntico aos setores (copiado de QuadraBooking)
function sectorButtonStyle(c: ColorOption, isSelected: boolean): React.CSSProperties {
  const background = isSelected
    ? `radial-gradient(circle at 30% 25%, hsla(${c.hueA}, ${c.satA + 10}%, ${c.lightA + 12}%, 1) 0%, hsla(${c.hueB}, ${c.satB + 5}%, ${c.lightB + 6}%, 1) 60%, hsla(${c.hueC}, ${c.satC + 10}%, ${c.lightC + 4}%, 1) 100%)`
    : `linear-gradient(145deg, hsla(${c.hueA}, ${c.satA}%, ${c.lightA}%, 1), hsla(${c.hueB}, ${c.satB}%, ${c.lightB}%, 1))`;
  const boxShadow = isSelected
    ? `0 0 0 3px hsla(${c.hueA}, 95%, 75%, 1), 0 0 30px hsla(${c.hueA}, 90%, 60%, 0.85), 0 0 60px hsla(${c.hueA}, 85%, 55%, 0.6), 0 6px 20px hsla(${c.hueC}, 70%, 10%, 0.6)`
    : `inset 0 1.5px 5px hsla(${c.hueA}, 90%, 75%, 0.35), inset 0 -2px 8px hsla(${c.hueC}, 85%, 5%, 0.55), 0 0 14px hsla(${c.hueA}, 80%, 50%, 0.35), 0 6px 18px hsla(${c.hueC}, 80%, 5%, 0.7)`;
  const border = isSelected
    ? `2.5px solid hsla(${c.hueA}, 95%, 75%, 0.9)`
    : `1.5px solid hsla(${c.hueA}, 90%, 70%, 0.55)`;
  return { background, boxShadow, border, color: "white", textShadow: "0 1px 3px hsla(220, 90%, 5%, 0.8)" };
}

const cadastrosEventTypes = [
  { key: "outros", label: "Evento Escolar", icon: CalendarDays },
  { key: "evento_externo", label: "Evento Externo", icon: Globe },
  { key: "reuniao", label: "Reuniões", icon: Handshake },
  { key: "aula", label: "Aula", icon: GraduationCap },
  { key: "palestra", label: "Palestra", icon: Users },
];

function CadastrosButtonsCluster() {
  const { color } = useSectorPreferences();
  return (
    <div className="space-y-1.5">
      <p className="text-amber-200/70 text-[10px] uppercase tracking-[0.2em] font-bold">Modelo de botões</p>
      <div className="relative">
        <div className="grid grid-cols-2 gap-2">
          {[cadastrosEventTypes[0], cadastrosEventTypes[1], cadastrosEventTypes[3], cadastrosEventTypes[4]].map((evt, idx) => {
            const Icon = evt.icon;
            const cutRadius = 56;
            const maskPositions = [
              `at calc(100% + 4px) calc(100% + 4px)`,
              `at calc(0% - 4px) calc(100% + 4px)`,
              `at calc(100% + 4px) calc(0% - 4px)`,
              `at calc(0% - 4px) calc(0% - 4px)`,
            ];
            const maskStyle = {
              WebkitMask: `radial-gradient(circle ${cutRadius}px ${maskPositions[idx]}, transparent 100%, black 100%)`,
              mask: `radial-gradient(circle ${cutRadius}px ${maskPositions[idx]}, transparent 100%, black 100%)`,
            };
            return (
              <button
                key={evt.key}
                type="button"
                onClick={() => { /* desativado: apenas visual */ }}
                style={{ ...maskStyle, ...sectorButtonStyle(color, false), borderRadius: 18 }}
                className="flex flex-col items-center justify-center gap-1 p-2 min-h-[72px] transition-all active:scale-95 hover:brightness-125 overflow-hidden"
              >
                <Icon className="h-6 w-6" style={{ filter: `drop-shadow(0 0 6px hsla(${color.hueA}, 95%, 70%, 0.65))` }} />
                <span
                  className="text-[10px] font-bold uppercase tracking-wider text-center leading-tight"
                  style={{ transform: idx === 0 ? "translateX(-14px)" : idx === 1 ? "translateX(14px)" : undefined }}
                >
                  {evt.label}
                </span>
              </button>
            );
          })}
        </div>
        {(() => {
          const evt = cadastrosEventTypes[2];
          const Icon = evt.icon;
          return (
            <button
              type="button"
              onClick={() => { /* desativado: apenas visual */ }}
              style={{ ...sectorButtonStyle(color, false), borderRadius: 9999 }}
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 flex flex-col items-center justify-center gap-1 w-[96px] h-[96px] transition-all active:scale-95 hover:brightness-125"
            >
              <Icon className="h-6 w-6" style={{ filter: `drop-shadow(0 0 6px hsla(${color.hueA}, 95%, 70%, 0.65))` }} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-center leading-none">{evt.label}</span>
            </button>
          );
        })()}
      </div>
    </div>
  );
}

// Fonte única de rótulos: @/lib/allowedRoles (mesmos 11 setores do cadastro).
const ROLE_LABELS: Record<string, string> = { ...ALLOWED_ROLE_LABELS };

// Aliases legados de role → papel canônico do grid.
// Ex.: perfis antigos gravados como "assistente" devem cair no botão "Assistente de Aluno" (secretario_escolar).
const ROLE_ALIASES: Record<string, string> = {
  assistente: "secretario_escolar",
  assistente_aluno: "secretario_escolar",
  assistente_de_aluno: "secretario_escolar",
};
const normalizeRole = (r: string | null | undefined): string =>
  (r && ROLE_ALIASES[r]) || r || "";
const normalizeStaffRow = <T extends { role: string }>(p: T): T => ({
  ...p,
  role: normalizeRole(p.role) || p.role,
});

interface StaffRow {
  id: string;
  user_id: string;
  full_name: string;
  role: string;
  intended_role: string | null;
  is_approved: boolean;
  phone: string | null;
  gender: string | null;
  created_at: string;
  email?: string | null;
}

export default function SchoolStaffList() {
  const navigate = useNavigate();
  const { profile, user, loading: authLoading } = useAuth();
  const [params] = useSearchParams();
  const querySchoolId = params.get("school_id");

  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [schoolName, setSchoolName] = useState<string>("");
  const [schoolCity, setSchoolCity] = useState<string>("");
  const [schoolState, setSchoolState] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"flat" | "by_sector">("flat");

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: ok } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      setIsAdmin(!!ok);
    })();
  }, [user]);

  // Determine which schoolId to load
  const targetSchoolId = useMemo(() => {
    if (querySchoolId) return querySchoolId;
    return profile?.school_id ?? null;
  }, [querySchoolId, profile?.school_id]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth", { replace: true });
      return;
    }
    if (!targetSchoolId) return;

    (async () => {
      setLoading(true);

      // Admin com school_id na URL → usa edge function (inclui email)
      if (isAdmin && querySchoolId) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/admin-school-overview?school_id=${querySchoolId}`;
          const r = await fetch(url, {
            headers: {
              Authorization: `Bearer ${session?.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            },
          });
          const j = await r.json();
          if (r.ok) {
            setSchoolName(j.school?.name ?? "");
            setSchoolCity(j.school?.city ?? "");
            setSchoolState(j.school?.state ?? "");
            setStaff(((j.profiles ?? []) as StaffRow[]).map(normalizeStaffRow));
          }
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
        return;
      }

      // Gestor (ou usuário comum) → consulta direta via RLS + edge function p/ emails
      const [schoolRes, profilesRes] = await Promise.all([
        supabase.from("schools").select("name,city,state").eq("id", targetSchoolId).maybeSingle(),
        supabase
          .from("profiles")
          .select("id,user_id,full_name,role,intended_role,is_approved,phone,gender,created_at")
          .eq("school_id", targetSchoolId)
          .order("full_name", { ascending: true }),
      ]);
      if (schoolRes.data) {
        setSchoolName(schoolRes.data.name);
        setSchoolCity(schoolRes.data.city ?? "");
        setSchoolState(schoolRes.data.state ?? "");
      }
      let rows = ((profilesRes.data ?? []) as StaffRow[]).map(normalizeStaffRow);

      // Buscar e-mails via edge function (apenas admin/gestor/chef autorizados)
      const staffSchoolId = typeof targetSchoolId === "string" ? targetSchoolId.trim() : "";
      const canFetchEmails =
        !!staffSchoolId &&
        (isAdmin || profile?.role === "gestor_pedagogico" || profile?.role === "chef_projeto_vida");
      if (canFetchEmails) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.access_token) {
            const r = await fetch(
              `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/school-staff-emails?school_id=${encodeURIComponent(staffSchoolId)}`,
              {
                headers: {
                  Authorization: `Bearer ${session.access_token}`,
                  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
                },
              },
            );
            if (r.ok) {
              const j = await r.json();
              const emails: Record<string, string | null> = j.emails ?? {};
              rows = rows.map((p) => ({ ...p, email: emails[p.user_id] ?? null }));
            } else {
              console.warn("school-staff-emails: sem permissão (", r.status, ")");
            }
          }
        } catch (e) {
          console.error("Falha ao buscar e-mails:", e);
        }
      }


      setStaff(rows);
      setLoading(false);
    })();
  }, [authLoading, user, isAdmin, querySchoolId, targetSchoolId, navigate]);

  // Permissão: admin OU gestor da escola
  const canView = isAdmin || profile?.role === "gestor_pedagogico" || profile?.role === "chef_projeto_vida";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = staff;
    if (sectorFilter !== "all") {
      list = list.filter((s) => (s.role ?? "") === sectorFilter);
    }
    if (!q) return list;
    return list.filter((s) =>
      s.full_name.toLowerCase().includes(q) ||
      (s.email ?? "").toLowerCase().includes(q) ||
      (s.phone ?? "").toLowerCase().includes(q) ||
      (ROLE_LABELS[s.role] ?? s.role).toLowerCase().includes(q)
    );
  }, [staff, search, sectorFilter]);

  const sectorCounts = useMemo(() => {
    const map = new Map<string, number>();
    staff.forEach((s) => {
      const k = s.role ?? "outros";
      map.set(k, (map.get(k) ?? 0) + 1);
    });
    return map;
  }, [staff]);

  const grouped = useMemo(() => {
    const approved = filtered.filter((p) => p.is_approved);
    const pending = filtered.filter((p) => !p.is_approved);
    return { approved, pending };
  }, [filtered]);

  const bySector = useMemo(() => {
    const groups: Record<string, StaffRow[]> = {};
    filtered.forEach((p) => {
      const k = p.role ?? "outros";
      (groups[k] ??= []).push(p);
    });
    // Ordena cada setor: aprovados primeiro, depois nome A-Z
    Object.values(groups).forEach((list) => {
      list.sort((a, b) => {
        if (a.is_approved !== b.is_approved) return a.is_approved ? -1 : 1;
        return a.full_name.localeCompare(b.full_name, "pt-BR", { sensitivity: "base" });
      });
    });
    return Object.entries(groups).sort((a, b) =>
      (ROLE_LABELS[a[0]] ?? a[0]).localeCompare(ROLE_LABELS[b[0]] ?? b[0])
    );
  }, [filtered]);

  if (authLoading || loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background p-6 text-center">
        <p className="text-foreground">Você não tem permissão para visualizar esta página.</p>
      </div>
    );
  }

  // Mesma ordem/rotulagem do cadastro — derivada de @/lib/allowedRoles.
  const SECTOR_KEYS = [...ALLOWED_ROLE_VALUES];
  // Botões do grid: Todos + papéis (APM substituído por "Outros" no mesmo lugar).
  const outerSectorOptions: Array<{ key: string; label: string; short: string }> = [
    { key: "all", label: "Todos", short: "Todos" },
    ...ALLOWED_ROLE_VALUES
      .filter((key) => key !== "presidente_apm")
      .map((key) => ({
        key,
        label: ALLOWED_ROLE_LABELS[key],
        short: ALLOWED_ROLE_SHORT_LABELS[key],
      })),
    { key: "outros", label: "Outros", short: "Outros" },
  ];


  return (
    <GestorThemeShell enabled={canView}>
      <div className="max-w-3xl mx-auto px-4 pt-16 pb-24 space-y-4">
        <GestorPremiumHeader
          title={schoolName || "—"}
          subtitle="Cadastros da escola"
          right={
            <Badge className="bg-amber-500 text-amber-950 hover:bg-amber-500 font-bold">
              {staff.length}
            </Badge>
          }
        />


        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-300/70" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, função, telefone..."
            className="pl-9 bg-white/5 border-amber-400/20 text-white placeholder:text-amber-100/40"
          />
        </div>

        

        {/* Toggle de visualização */}
        <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-white/5 border border-amber-400/20 p-1">
          <button
            type="button"
            onClick={() => setViewMode("flat")}
            className={`h-9 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
              viewMode === "flat"
                ? "bg-amber-500 text-amber-950"
                : "text-amber-200/70 hover:text-amber-100"
            }`}
          >
            Lista geral
          </button>
          <button
            type="button"
            onClick={() => setViewMode("by_sector")}
            className={`h-9 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
              viewMode === "by_sector"
                ? "bg-amber-500 text-amber-950"
                : "text-amber-200/70 hover:text-amber-100"
            }`}
          >
            Por setor
          </button>
        </div>

        {/* Filtros de setor — grid 3 colunas (APM removida, "Outros" no mesmo lugar) */}
        <div className="grid grid-cols-3 gap-1.5">
          {outerSectorOptions.map((opt) => {
            const count =
              opt.key === "all" ? staff.length : sectorCounts.get(opt.key) ?? 0;
            const active = sectorFilter === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => setSectorFilter(opt.key)}
                className={`h-14 rounded-lg border flex flex-col items-center justify-center gap-0.5 text-center transition-colors px-1 ${
                  active
                    ? "bg-amber-500 text-amber-950 border-amber-300"
                    : "bg-white/5 text-amber-100/80 border-amber-400/20 hover:bg-white/10"
                }`}
                title={opt.label}
              >
                <span className="text-[13px] font-bold leading-tight break-words">
                  {opt.short}
                </span>
                <span className="text-[11px] opacity-70 font-semibold">({count})</span>
              </button>
            );
          })}
        </div>



        {viewMode === "by_sector" ? (
          bySector.length === 0 ? (
            <Card className="p-4 bg-white/5 border-amber-400/20 text-amber-100/70 text-sm text-center">
              Nenhum cadastro encontrado.
            </Card>
          ) : (
            bySector.map(([sectorKey, list]) => (
              <section key={sectorKey} className="space-y-2">
                <p className="text-amber-200/70 text-[10px] uppercase tracking-[0.2em] font-bold px-1 flex items-center gap-2">
                  <Briefcase className="h-3 w-3" /> {ROLE_LABELS[sectorKey] ?? sectorKey} ({list.length})
                </p>
                {list.map((p) => (
                  <StaffCard
                    key={p.id}
                    p={p}
                    schoolName={schoolName}
                    schoolCity={schoolCity}
                    schoolState={schoolState}
                    onReview={!p.is_approved ? () => navigate(`/gestor/aprovacoes${querySchoolId ? `?school_id=${querySchoolId}` : ""}`) : undefined}
                  />
                ))}
              </section>
            ))
          )
        ) : (
          <>
            {grouped.pending.length > 0 && (
              <section className="space-y-2">
                <p className="text-amber-200/70 text-[10px] uppercase tracking-[0.2em] font-bold px-1 flex items-center gap-2">
                  <Clock className="h-3 w-3" /> Aguardando aprovação ({grouped.pending.length})
                </p>
                {grouped.pending.map((p) => (
                  <StaffCard
                    key={p.id}
                    p={p}
                    schoolName={schoolName}
                    schoolCity={schoolCity}
                    schoolState={schoolState}
                    onReview={() => navigate(`/gestor/aprovacoes${querySchoolId ? `?school_id=${querySchoolId}` : ""}`)}
                  />
                ))}
              </section>
            )}

            <section className="space-y-2">
              <p className="text-amber-200/70 text-[10px] uppercase tracking-[0.2em] font-bold px-1 flex items-center gap-2">
                <ShieldCheck className="h-3 w-3" /> Aprovados ({grouped.approved.length})
              </p>
              {grouped.approved.length === 0 ? (
                <Card className="p-4 bg-white/5 border-amber-400/20 text-amber-100/70 text-sm text-center">
                  Nenhum profissional aprovado encontrado.
                </Card>
              ) : (
                grouped.approved.map((p) => <StaffCard key={p.id} p={p} schoolName={schoolName} schoolCity={schoolCity} schoolState={schoolState} />)
              )}
            </section>
          </>
        )}
      </div>
    </GestorThemeShell>
  );
}

function StaffCard({
  p, schoolName, schoolCity, schoolState, onReview,
}: {
  p: StaffRow; schoolName: string; schoolCity: string; schoolState: string;
  onReview?: () => void;
}) {
  const cityState = [schoolCity, schoolState].filter(Boolean).join(" / ");
  const roleLabel = ROLE_LABELS[p.role] ?? p.role;
  const intendedLabel = p.intended_role ? ROLE_LABELS[p.intended_role] ?? p.intended_role : null;
  const genderLabel =
    p.gender === "M" ? "Masculino" :
    p.gender === "F" ? "Feminino" :
    p.gender ?? null;
  const createdLabel = p.created_at
    ? format(new Date(p.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
    : null;

  return (
    <Card className="p-2 pl-1.5 bg-white/5 border-amber-400/20 backdrop-blur-md">
      <div className="flex items-start gap-1.5">
        <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center shrink-0">
          <Users className="h-3.5 w-3.5 text-amber-300" />
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <p className="text-white font-extrabold text-lg sm:text-2xl md:text-3xl leading-tight break-words hyphens-auto flex-1 min-w-0">{p.full_name}</p>
            <Badge
              className={
                p.is_approved
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 shrink-0"
                  : "bg-amber-500/20 text-amber-300 border border-amber-400/30 shrink-0"
              }
            >
              {p.is_approved ? "Ativo" : "Pendente"}
            </Badge>
          </div>

          <div className="grid grid-cols-1 gap-1 text-[13px]">
            <InfoLine icon={Briefcase} label="Função" value={roleLabel} />
            {intendedLabel && !p.is_approved && (
              <InfoLine icon={Briefcase} label="Função pretendida" value={intendedLabel} accent />
            )}
            {p.email && <InfoLine icon={Mail} label="E-mail" value={p.email} breakAll />}
            {p.phone && <InfoLine icon={Phone} label="Telefone" value={p.phone} />}
            {genderLabel && <InfoLine icon={UserIcon} label="Sexo" value={genderLabel} />}
            {schoolName && <InfoLine icon={SchoolIcon} label="Escola" value={schoolName} />}
            {cityState && <InfoLine icon={MapPin} label="Local" value={cityState} />}
            {createdLabel && <InfoLine icon={Calendar} label="Cadastrado em" value={createdLabel} />}
            <InfoLine icon={Hash} label="ID" value={p.user_id} mono />
          </div>

          {!p.is_approved && onReview && (
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                onClick={onReview}
                className="flex-1 h-9 bg-emerald-500/90 hover:bg-emerald-500 text-white font-bold text-xs gap-1"
              >
                <Check className="h-4 w-4" /> Aprovar
              </Button>
              <Button
                type="button"
                onClick={onReview}
                className="flex-1 h-9 bg-red-500/90 hover:bg-red-500 text-white font-bold text-xs gap-1"
              >
                <X className="h-4 w-4" /> Rejeitar
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function InfoLine({
  icon: Icon, label, value, accent, breakAll, mono,
}: {
  icon: typeof Users; label: string; value: string;
  accent?: boolean; breakAll?: boolean; mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-1">
      <Icon className="h-3 w-3 mt-0.5 shrink-0 text-amber-300/70" />
      <span className="text-amber-200/60 shrink-0">{label}:</span>
      <span
        className={[
          "flex-1 min-w-0",
          accent ? "text-amber-300 font-semibold" : "text-amber-50",
          breakAll ? "break-all" : "break-words",
          mono ? "font-mono text-[10px] opacity-70" : "",
        ].join(" ")}
      >
        {value}
      </span>
    </div>
  );
}
