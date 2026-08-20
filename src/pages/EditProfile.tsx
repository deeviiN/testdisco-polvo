import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSmartBack } from "@/hooks/useSmartBack";
import { ArrowLeft, Save, User as UserIcon, Briefcase, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { addProfileHistoryEntry } from "@/lib/profileChangeHistory";

const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "teacher", label: "Professor(a)" },
  { value: "coord_pedagogico", label: "Coord. Pedagógico(a)" },
  { value: "supervisor", label: "Corpo de Alunos C.A" },
  { value: "secretario_escolar", label: "Assistente de Aluno" },
  { value: "gestor_pedagogico", label: "Gestor(a) Pedagógico(a)" },
  { value: "chef_projeto_vida", label: "Chef da Sala" },
];

export const SESSION_ROLE_OVERRIDE_KEY = "sala-vida:session-role-override";

export default function EditProfile() {
  const navigate = useNavigate();
  const goBack = useSmartBack("/sectors");
  const { user, profile, refreshProfile } = useAuth();
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("teacher");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? "");
      const sessionOverride = sessionStorage.getItem(SESSION_ROLE_OVERRIDE_KEY);
      setRole(sessionOverride || profile.role || "teacher");
    }
  }, [profile]);

  if (!user || !profile) {
    return (
      <div className="flex items-center justify-center h-dvh bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  const trimmedName = fullName.trim();
  const nameChanged = trimmedName !== (profile.full_name ?? "").trim();
  const roleChanged = role !== profile.role;
  const canSave = trimmedName.length >= 3 && (nameChanged || roleChanged) && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);

    try {
      if (nameChanged) {
        const { error } = await supabase
          .from("profiles")
          .update({ full_name: trimmedName })
          .eq("user_id", user.id);
        if (error) throw error;
        addProfileHistoryEntry(user.id, {
          field: "name",
          from: profile.full_name ?? "",
          to: trimmedName,
          status: "approved",
        });
      }

      if (roleChanged) {
        if (role === profile.role) {
          sessionStorage.removeItem(SESSION_ROLE_OVERRIDE_KEY);
        } else {
          sessionStorage.setItem(SESSION_ROLE_OVERRIDE_KEY, role);
        }
        window.dispatchEvent(new Event("session-role-override-changed"));
        addProfileHistoryEntry(user.id, {
          field: "role",
          from: profile.role,
          to: role,
          status: role === profile.role ? "approved" : "session",
        });
      }

      await refreshProfile();

      toast.success(
        roleChanged
          ? "Alterações salvas nesta sessão. A mudança de cargo precisa de aprovação para ser permanente."
          : "Perfil atualizado com sucesso!"
      );
      navigate(-1);
    } catch (err) {
      toast.error("Falha ao salvar: " + (err instanceof Error ? err.message : "erro desconhecido"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-dvh bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-primary text-primary-foreground px-5 pt-20 pb-4 flex items-center gap-3 shadow-lg">
        <Button
          variant="ghost"
          size="icon"
          onClick={goBack}
          className="text-primary-foreground hover:bg-white/15 h-10 w-10"
        >
          <ArrowLeft className="h-6 w-6" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] font-bold opacity-80 leading-none">
            Meu cadastro
          </p>
          <h1 className="text-xl font-extrabold leading-tight truncate mt-0.5">
            Editar perfil
          </h1>
        </div>
      </header>

      <div className="flex-1 px-5 py-6 space-y-6 max-w-2xl w-full mx-auto">
        {/* Avatar/identidade resumida */}
        <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="w-14 h-14 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center shrink-0">
            <UserIcon className="h-7 w-7 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-wider font-bold text-muted-foreground">
              Conectado como
            </p>
            <p className="text-lg font-bold text-foreground truncate mt-1.5">
              {profile.full_name}
            </p>
            <p className="text-base text-muted-foreground truncate mt-1">
              {ROLE_OPTIONS.find((r) => r.value === profile.role)?.label ?? profile.role}
            </p>
          </div>
        </div>

        {/* Card: Nome */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <Label
            htmlFor="full-name"
            className="flex items-center gap-2 text-lg font-bold text-foreground"
          >
            <UserIcon className="h-6 w-6 text-primary" /> Nome completo
          </Label>
          <p className="text-base text-muted-foreground leading-relaxed mt-1.5">
            Será exibido nos seus agendamentos e comunicados.
          </p>
          <Input
            id="full-name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Digite seu nome completo"
            className="h-14 text-lg font-medium border-2 focus-visible:ring-2 focus-visible:ring-primary/40 bg-background placeholder:text-lg placeholder:text-muted-foreground/60 placeholder:font-normal mt-3"
            disabled={saving}
          />
          <p className="text-sm text-muted-foreground font-medium mt-2">
            Mínimo 3 caracteres · {trimmedName.length} digitados
          </p>
        </section>

        {/* Card: Cargo */}
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <Label
            htmlFor="role"
            className="flex items-center gap-2 text-lg font-bold text-foreground"
          >
            <Briefcase className="h-6 w-6 text-primary" /> Cargo na escola
          </Label>
          <p className="text-base text-muted-foreground leading-relaxed mt-1.5">
            Determina suas permissões e o que você pode agendar.
          </p>
          <Select value={role} onValueChange={setRole} disabled={saving}>
            <SelectTrigger
              id="role"
              className="h-14 text-lg font-medium border-2 bg-background mt-3 [&>span]:text-lg [&>span[data-placeholder]]:text-muted-foreground/60 [&>span[data-placeholder]]:font-normal"
            >
              <SelectValue placeholder="Selecione o cargo" />
            </SelectTrigger>
            <SelectContent>
              {ROLE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-lg py-3">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {roleChanged && (
            <div className="flex gap-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 text-base text-foreground mt-3">
              <Info className="h-5 w-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
              <span className="leading-relaxed">
                A mudança de cargo será aplicada apenas <strong>nesta sessão</strong>.
                Para tornar permanente, é necessária aprovação do gestor.
              </span>
            </div>
          )}
        </section>
      </div>

      <footer className="sticky bottom-0 bg-gradient-to-t from-background via-background to-background/90 px-5 py-4 border-t-2 border-border">
        <div className="max-w-2xl mx-auto">
          <Button
            onClick={handleSave}
            disabled={!canSave}
            className="w-full h-14 text-base font-extrabold rounded-xl shadow-lg uppercase tracking-wide"
          >
            <Save className="h-5 w-5 mr-2" />
            {saving ? "Salvando..." : "Salvar alterações"}
          </Button>
        </div>
      </footer>
    </div>
  );
}
