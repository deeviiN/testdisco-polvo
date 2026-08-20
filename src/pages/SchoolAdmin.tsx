import { useState, useEffect } from "react";
import { useParams, Navigate, useNavigate } from "react-router-dom";
import { useSmartBack } from "@/hooks/useSmartBack";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ArrowLeft, School, CalendarDays, Users, Clock, Search,
  CheckCircle, AlertTriangle, Ban, Link2, Copy, MapPin,
  Monitor, Tv, Volume2, Mic, Laptop, Laptop2, Sparkles,
  Eye, Mail, Phone, KeyRound, Loader2,
} from "lucide-react";
import { Tables } from "@/integrations/supabase/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

type SchoolRow = Tables<"schools">;
type Booking = Tables<"bookings">;

const RESOURCE_LABELS: Record<string, { label: string; icon: any }> = {
  data_show: { label: "Data Show", icon: Monitor },
  tv: { label: "TV", icon: Tv },
  caixa_som: { label: "Caixa de Som", icon: Volume2 },
  microfone: { label: "Microfone", icon: Mic },
  notebook_escola: { label: "Notebook da Escola", icon: Laptop },
  notebook_professor: { label: "Notebook do Professor", icon: Laptop2 },
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  aula: "Aula",
  palestra: "Palestra",
  reuniao: "Reunião",
  evento_externo: "Evento Externo",
};

const ROLE_LABELS: Record<string, string> = {
  teacher: "Professor(a)",
  coord_pedagogico: "Coord. Pedagógico(a)",
  supervisor: "Corpo de Alunos C.A",
  gestor_pedagogico: "Gestor(a) Pedagógico(a)",
  secretario_escolar: "Assistente de Aluno",
  chef_projeto_vida: "Chef da Sala de Vídeo",
};
const roleLabel = (r?: string | null) => (r ? ROLE_LABELS[r] || r.replace(/_/g, " ") : "—");

// Roles a chef CANNOT promote to (RLS blocks chef from approving manager-level roles).
const CHEF_BLOCKED_ROLES = new Set(["chef_projeto_vida", "gestor_pedagogico"]);

export default function SchoolAdmin() {
  const { id } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const goBack = useSmartBack("/admin");
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [school, setSchool] = useState<SchoolRow | null>(null);
  const [bookings, setBookings] = useState<(Booking & { profile_name?: string })[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; user_id: string; full_name: string; role: string; is_approved: boolean; intended_role: string | null }[]>([]);
  const [searchBookings, setSearchBookings] = useState("");
  const [stats, setStats] = useState({ totalBookings: 0, totalUsers: 0, approvedUsers: 0 });
  const [loadingData, setLoadingData] = useState(true);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [detailsUser, setDetailsUser] = useState<{ profile: typeof profiles[number]; auth: any } | null>(null);

  const openDetails = async (profile: typeof profiles[number]) => {
    setDetailsOpen(true);
    setDetailsLoading(true);
    setDetailsUser({ profile, auth: null });
    const { data, error } = await supabase.functions.invoke("admin-user-details", {
      body: { user_id: profile.user_id },
    });
    setDetailsLoading(false);
    if (error || data?.error) {
      toast.error("Erro ao carregar: " + (data?.error || error?.message));
      setDetailsOpen(false);
      return;
    }
    setDetailsUser({ profile, auth: data });
  };

  const sendPasswordReset = async () => {
    if (!detailsUser) return;
    setResetLoading(true);
    const { data, error } = await supabase.functions.invoke("admin-user-details", {
      body: {
        user_id: detailsUser.profile.user_id,
        action: "send_password_reset",
        redirect_to: `${window.location.origin}/reset-password`,
      },
    });
    setResetLoading(false);
    if (error || data?.error) {
      toast.error("Erro: " + (data?.error || error?.message));
    } else {
      toast.success(`Email de redefinição enviado para ${data.email}`);
    }
  };

  useEffect(() => {
    if (user) {
      supabase.rpc("has_role", { _user_id: user.id, _role: "admin" }).then(({ data }) => {
        setIsAdmin(!!data);
      });
    }
  }, [user]);

  useEffect(() => {
    if (isAdmin && id) {
      loadAll();
    }
  }, [isAdmin, id]);

  const loadAll = async () => {
    setLoadingData(true);
    await Promise.all([loadSchool(), loadBookings(), loadProfiles()]);
    setLoadingData(false);
  };

  const loadSchool = async () => {
    const { data } = await supabase
      .from("schools")
      .select("id, name, city, state, inep_code, network, is_active, logo_url, address, created_at")
      .eq("id", id!)
      .single();
    const { data: sub } = await supabase.rpc("get_school_subscription_admin", { _school_id: id! });
    const subRow = Array.isArray(sub) ? sub[0] : sub;
    if (data) setSchool({ ...data, ...(subRow || {}) } as any);
  };

  const loadBookings = async () => {
    const { data, count } = await supabase
      .from("bookings")
      .select("*", { count: "exact" })
      .eq("school_id", id!)
      .eq("status", "confirmed")
      .order("booking_date", { ascending: true })
      .order("start_time", { ascending: true });

    if (data) {
      const userIds = [...new Set(data.map((b) => b.user_id))];
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);

      const nameMap = new Map(profs?.map((p) => [p.user_id, p.full_name]) || []);
      setBookings(data.map((b) => ({ ...b, profile_name: nameMap.get(b.user_id) || "—" })));
      setStats((s) => ({ ...s, totalBookings: count || data.length }));
    }
  };

  const loadProfiles = async () => {
    const { data, count } = await supabase
      .from("profiles")
      .select("id, user_id, full_name, role, is_approved, intended_role", { count: "exact" })
      .eq("school_id", id!);

    if (data) {
      setProfiles(data as any);
      setStats((s) => ({
        ...s,
        totalUsers: count || data.length,
        approvedUsers: data.filter((p) => p.is_approved).length,
      }));
    }
  };

  const approveAsIntended = async (profileId: string, intendedRole: string) => {
    // Admin can promote to anything; chef cannot promote to chef/gestor (blocked by RLS trigger).
    const { error } = await supabase
      .from("profiles")
      .update({ is_approved: true, role: intendedRole, intended_role: null })
      .eq("id", profileId);
    if (error) {
      toast.error("Erro ao promover: " + error.message);
    } else {
      toast.success(`Aprovado como ${roleLabel(intendedRole)}`);
      loadProfiles();
    }
  };

  const approveAsTeacher = async (profileId: string) => {
    const { error } = await supabase
      .from("profiles")
      .update({ is_approved: true })
      .eq("id", profileId);
    if (error) {
      toast.error("Erro: " + error.message);
    } else {
      toast.success("Usuário aprovado");
      loadProfiles();
    }
  };

  const copyLink = () => {
    const url = `${window.location.origin}/admin/school/${id}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado!");
  };

  if (authLoading || isAdmin === null) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="animate-pulse text-muted-foreground">Verificando permissões...</div>
      </div>
    );
  }

  if (!isAdmin) return <Navigate to="/home" replace />;

  const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
    active: { label: "Ativa", color: "bg-accent/10 text-accent border-accent/20", icon: CheckCircle },
    grace_period: { label: "Carência", color: "bg-warning/10 text-warning border-warning/20", icon: AlertTriangle },
    blocked: { label: "Bloqueada", color: "bg-destructive/10 text-destructive border-destructive/20", icon: Ban },
  };

  const current = school ? (statusConfig[school.subscription_status] || statusConfig.active) : statusConfig.active;
  const StatusIcon = current.icon;

  // Group bookings by date
  const groupedBookings: Record<string, typeof bookings> = {};
  const filtered = bookings.filter(
    (b) =>
      b.profile_name?.toLowerCase().includes(searchBookings.toLowerCase()) ||
      b.discipline?.toLowerCase().includes(searchBookings.toLowerCase()) ||
      b.topic?.toLowerCase().includes(searchBookings.toLowerCase()) ||
      b.booking_date.includes(searchBookings)
  );

  filtered.forEach((b) => {
    if (!groupedBookings[b.booking_date]) groupedBookings[b.booking_date] = [];
    groupedBookings[b.booking_date].push(b);
  });

  const sortedDates = Object.keys(groupedBookings).sort((a, b) => a.localeCompare(b));

  return (
    <div className="h-dvh bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="sticky top-0 z-40 glass border-b">
        <div className="max-w-5xl mx-auto px-4 pt-12 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {school?.logo_url ? (
              <div className="w-10 h-10 rounded-2xl overflow-hidden shadow-glow shrink-0">
                <img src={school.logo_url} alt={school?.name || "Escola"} className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-glow">
                <School className="h-5 w-5 text-primary-foreground" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl gap-2"
              onClick={copyLink}
            >
              <Copy className="h-4 w-4" />
              <span className="hidden sm:inline">Copiar link</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6 flex-1 overflow-y-auto overscroll-contain">
        {loadingData ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-pulse text-muted-foreground">Carregando dados da escola...</div>
          </div>
        ) : (
          <>
            {/* School info card - Reorganized for better clarity */}
            <Card className="border-0 shadow-card bg-gradient-to-br from-primary/5 via-transparent to-transparent overflow-hidden">
              <CardContent className="p-0">
                <div className="p-5 space-y-4">
                  <div className="flex justify-between items-start gap-4">
                    <div className="space-y-1 flex-1">
                      <p className="text-[10px] uppercase tracking-widest font-black text-primary/60">
                        Identificação da Escola
                      </p>
                      <h2 className="text-xl font-black leading-tight text-foreground">
                        {school?.name || "—"}
                      </h2>
                    </div>
                    <div className="bg-primary/10 p-2.5 rounded-2xl shrink-0">
                      <School className="h-6 w-6 text-primary" />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-muted/30 p-2.5 rounded-xl border border-border/50">
                      <p className="text-[9px] uppercase font-bold text-muted-foreground mb-0.5">Código INEP</p>
                      <p className="text-xs font-mono font-bold">{school?.inep_code || "—"}</p>
                    </div>
                    <div className="bg-muted/30 p-2.5 rounded-xl border border-border/50">
                      <p className="text-[9px] uppercase font-bold text-muted-foreground mb-0.5">Rede de Ensino</p>
                      <p className="text-xs font-bold text-primary/80">
                        {school?.network ? school.network.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ') : "—"}
                      </p>
                    </div>
                    <div className="bg-muted/30 p-2.5 rounded-xl border border-border/50">
                      <p className="text-[9px] uppercase font-bold text-muted-foreground mb-0.5">Localidade</p>
                      <p className="text-xs font-bold truncate">{school?.city}, {school?.state}</p>
                    </div>
                    <div className="bg-muted/30 p-2.5 rounded-xl border border-border/50">
                      <p className="text-[9px] uppercase font-bold text-muted-foreground mb-0.5">Tipo de Unidade</p>
                      <p className="text-xs font-bold text-primary">Educacional</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/50">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={`text-xs font-bold rounded-lg shadow-sm ${current.color}`}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {current.label}
                      </Badge>
                      {school?.subscription_end_date && (
                        <div className="flex flex-col">
                          <span className="text-[8px] uppercase font-black text-muted-foreground">Vencimento</span>
                          <span className="text-[11px] font-bold">
                            {format(parseISO(school.subscription_end_date), "dd/MM/yyyy")}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Link2 className="h-3.5 w-3.5 text-muted-foreground opacity-50" />
                      <span className="text-[10px] text-muted-foreground font-mono bg-muted/50 px-2 py-1 rounded">
                        ID: {id?.slice(0, 8)}...
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Agendamentos", value: stats.totalBookings, icon: CalendarDays, color: "primary" },
                { label: "Usuários", value: stats.totalUsers, icon: Users, color: "accent" },
                { label: "Aprovados", value: stats.approvedUsers, icon: CheckCircle, color: "warning" },
              ].map(({ label, value, icon: Icon, color }) => (
                <Card key={label} className="border-0 shadow-card">
                  <CardContent className="p-3">
                    <div className="flex flex-col items-center text-center gap-1.5">
                      <div className={`w-9 h-9 rounded-xl bg-${color}/10 flex items-center justify-center shrink-0`}>
                        <Icon className={`h-4 w-4 text-${color}`} />
                      </div>
                      <p className="text-xl font-bold font-display leading-none">{value}</p>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider break-words">{label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Card className="border-0 shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
                    <Monitor className="h-4 w-4 text-accent" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Cód. Unidade</p>
                    <p className="text-base font-bold font-display leading-tight text-accent break-all">#{id?.split('-')[0] || "—"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Bookings list */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold font-display">Agendamentos</h2>
              </div>

              <div className="relative">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por professor, disciplina, data..."
                  value={searchBookings}
                  onChange={(e) => setSearchBookings(e.target.value)}
                  className="pl-10 h-11 rounded-xl bg-secondary/50 border-0"
                />
              </div>

              {sortedDates.length === 0 ? (
                <Card className="border-0 shadow-card">
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <CalendarDays className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Nenhum agendamento encontrado</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-6">
                  {sortedDates.map((date) => (
                    <div key={date} className="space-y-2">
                      <div className="flex items-center gap-2 sticky top-16 z-10 bg-background/90 backdrop-blur-sm py-2">
                        <CalendarDays className="h-4 w-4 text-primary" />
                        <h3 className="text-sm font-bold font-display text-primary">
                          {format(parseISO(date), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
                        </h3>
                        <Badge variant="secondary" className="text-[10px] rounded-lg">
                          {groupedBookings[date].length} agendamento{groupedBookings[date].length !== 1 ? "s" : ""}
                        </Badge>
                      </div>

                      <div className="space-y-2 pl-2 border-l-2 border-primary/20">
                        {groupedBookings[date].map((booking) => (
                          <Card key={booking.id} className="border-0 shadow-card hover:shadow-card-hover transition-all ml-4">
                            <CardContent className="p-4">
                              <div className="flex items-start gap-3">
                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                  <Clock className="h-5 w-5 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0 space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-sm">
                                      {booking.start_time.slice(0, 5)} — {booking.end_time.slice(0, 5)}
                                    </span>
                                    <Badge variant="outline" className="text-[10px] rounded-lg">
                                      {EVENT_TYPE_LABELS[booking.event_type] || booking.event_type}
                                    </Badge>
                                  </div>
                                  <p className="text-sm font-medium">{booking.profile_name}</p>
                                  {booking.discipline && (
                                    <p className="text-xs text-muted-foreground">
                                      📚 {booking.discipline}
                                      {booking.topic && ` — ${booking.topic}`}
                                    </p>
                                  )}
                                  {booking.description && (
                                    <p className="text-xs text-muted-foreground">{booking.description}</p>
                                  )}
                                  {booking.visitor_name && (
                                    <p className="text-xs text-accent">
                                      👤 Visitante: {booking.visitor_name}
                                      {booking.visitor_info && ` (${booking.visitor_info})`}
                                    </p>
                                  )}
                                  {booking.resources && booking.resources.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                      {booking.resources.map((r) => {
                                        const res = RESOURCE_LABELS[r];
                                        if (!res) return null;
                                        const ResIcon = res.icon;
                                        return (
                                          <Badge key={r} variant="secondary" className="text-[10px] rounded-lg gap-1">
                                            <ResIcon className="h-3 w-3" />
                                            {res.label}
                                          </Badge>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Users of this school */}
            <div className="space-y-4">
              <h2 className="text-xl font-bold font-display">Usuários da escola</h2>
              <div className="space-y-2">
                {profiles.map((p) => {
                  const intended = p.intended_role && p.intended_role !== p.role ? p.intended_role : null;
                  const canChefPromote = intended && !CHEF_BLOCKED_ROLES.has(intended);
                  return (
                  <Card key={p.user_id} className="border-0 shadow-card">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                          p.is_approved ? "bg-accent/10" : "bg-warning/10"
                        }`}>
                          <Users className={`h-4 w-4 ${p.is_approved ? "text-accent" : "text-warning"}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold break-words">{p.full_name}</p>
                          <p className="text-xs text-muted-foreground">{roleLabel(p.role)}</p>
                          {intended && (
                            <p className="text-xs font-semibold text-primary flex items-center gap-1 mt-0.5">
                              <Sparkles className="h-3 w-3" />
                              Quer ser: {roleLabel(intended)}
                            </p>
                          )}
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] rounded-lg shrink-0 ${
                            p.is_approved
                              ? "bg-accent/10 text-accent border-accent/20"
                              : "bg-warning/10 text-warning border-warning/20"
                          }`}
                        >
                          {p.is_approved ? "Aprovado" : "Pendente"}
                        </Badge>
                      </div>
                      {!p.is_approved && (
                        <div className="flex flex-col gap-2 pt-2 border-t border-border/50">
                          {intended && canChefPromote && (
                            <Button
                              size="sm"
                              className="w-full rounded-xl gap-2 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground"
                              onClick={() => approveAsIntended(p.id, intended)}
                            >
                              <Sparkles className="h-4 w-4" />
                              Aprovar como {roleLabel(intended)}
                            </Button>
                          )}
                          {intended && !canChefPromote && (
                            <p className="text-[11px] text-muted-foreground italic">
                              Apenas o admin central pode promover para {roleLabel(intended)}.
                            </p>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="w-full rounded-xl gap-2 text-xs font-semibold border-accent/30 text-accent hover:bg-accent/10"
                            onClick={() => approveAsTeacher(p.id)}
                          >
                            <CheckCircle className="h-4 w-4" />
                            Aprovar como Professor(a)
                          </Button>
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full rounded-xl gap-2 text-xs font-semibold"
                        onClick={() => openDetails(p)}
                      >
                        <Eye className="h-4 w-4" />
                        Ver detalhes
                      </Button>
                    </CardContent>
                  </Card>
                  );
                })}
                {profiles.length === 0 && (
                  <Card className="border-0 shadow-card">
                    <CardContent className="py-8 text-center text-muted-foreground">
                      <p className="text-sm">Nenhum usuário registrado nesta escola</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          </>
        )}
      </main>

      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Detalhes do usuário</DialogTitle>
          </DialogHeader>
          {detailsLoading || !detailsUser?.auth ? (
            <div className="py-8 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Carregando...
            </div>
          ) : (
            <div className="space-y-4 text-sm">
              <div className="bg-primary/5 p-4 rounded-2xl border border-primary/10 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] uppercase font-black text-primary/60 tracking-widest">Informações do Gestor</p>
                  <p className="text-base font-black truncate text-foreground">{detailsUser.profile.full_name}</p>
                  <p className="text-xs font-bold text-muted-foreground">{roleLabel(detailsUser.profile.role)}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <DetailRow icon={Mail} label="E-mail de Acesso" value={detailsUser.auth.email || "—"} />
                <DetailRow icon={Phone} label="Telefone / Contato" value={(detailsUser.profile as any).phone || "—"} />
                
                <div className="grid grid-cols-2 gap-3">
                  <DetailRow icon={Sparkles} label="Gênero" value={(detailsUser.profile as any).gender || "—"} />
                  <DetailRow icon={CheckCircle} label="Status" value={detailsUser.profile.is_approved ? "Aprovado" : "Pendente"} />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <DetailRow
                    icon={CalendarDays}
                    label="Data de Cadastro"
                    value={detailsUser.auth.created_at ? format(parseISO(detailsUser.auth.created_at), "dd/MM/yyyy", { locale: ptBR }) : "—"}
                  />
                  <DetailRow
                    icon={Clock}
                    label="Último Acesso"
                    value={detailsUser.auth.last_sign_in_at ? format(parseISO(detailsUser.auth.last_sign_in_at), "dd/MM/yyyy", { locale: ptBR }) : "Nunca"}
                  />
                </div>
              </div>

              {detailsUser.profile.intended_role && (
                <div className="bg-amber-50 p-3 rounded-xl border border-amber-200 flex items-center gap-3">
                  <Sparkles className="h-4 w-4 text-amber-600 shrink-0" />
                  <div>
                    <p className="text-[9px] uppercase font-black text-amber-700 leading-none mb-1">Função Pretendida</p>
                    <p className="text-xs font-bold text-amber-900">{roleLabel(detailsUser.profile.intended_role)}</p>
                  </div>
                </div>
              )}
              <div className="pt-2 mt-2 border-t border-border/50 space-y-2">
                <p className="text-[11px] text-muted-foreground italic">
                  Por segurança, senhas nunca são exibidas (são criptografadas). Use o botão abaixo para enviar um link de redefinição.
                </p>
                <Button
                  className="w-full rounded-xl gap-2"
                  onClick={sendPasswordReset}
                  disabled={resetLoading}
                >
                  {resetLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  Enviar email de redefinição de senha
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0 mt-0.5">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm font-medium break-words">{value}</p>
      </div>
    </div>
  );
}
