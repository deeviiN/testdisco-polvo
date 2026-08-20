import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, AlertTriangle, Loader2, Trash2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

type Status =
  | { state: "loading" }
  | { state: "clean" }
  | {
      state: "linked";
      profileId: string;
      fullName: string;
      role: string;
      schoolId: string;
      schoolName: string | null;
    };

interface Props {
  userId: string;
}

export function AdminAccountStatusCard({ userId }: Props) {
  const [status, setStatus] = useState<Status>({ state: "loading" });
  const [removing, setRemoving] = useState(false);

  const load = async () => {
    setStatus({ state: "loading" });
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, role, school_id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!profile) {
      setStatus({ state: "clean" });
      return;
    }

    let schoolName: string | null = null;
    if (profile.school_id) {
      const { data: school } = await supabase
        .from("schools")
        .select("name")
        .eq("id", profile.school_id)
        .maybeSingle();
      schoolName = school?.name ?? null;
    }

    setStatus({
      state: "linked",
      profileId: profile.id,
      fullName: profile.full_name,
      role: profile.role,
      schoolId: profile.school_id,
      schoolName,
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const handleRemove = async () => {
    if (status.state !== "linked") return;
    if (!confirm(`Remover seu perfil "${status.fullName}" da escola ${status.schoolName ?? ""}?\n\nA ação será registrada na auditoria.`)) return;
    setRemoving(true);
    const { data, error } = await supabase.rpc("admin_unlink_self_profile");
    setRemoving(false);
    if (error) {
      toast.error("Falha ao remover perfil", { description: error.message });
      return;
    }
    const removedAt = (data as any)?.removed_at
      ? new Date((data as any).removed_at).toLocaleString("pt-BR")
      : new Date().toLocaleString("pt-BR");
    toast.success("Perfil removido e registrado na auditoria", {
      description: `Ação registrada em ${removedAt}`,
    });
    load();
  };

  if (status.state === "loading") {
    return (
      <Card className="border-0 shadow-card">
        <CardContent className="p-4 flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Verificando status da sua conta…</span>
        </CardContent>
      </Card>
    );
  }

  if (status.state === "clean") {
    return (
      <Card className="border-0 shadow-card bg-accent/5 border-accent/20">
        <CardContent className="p-4 flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-accent/15 flex items-center justify-center shrink-0">
            <ShieldCheck className="h-5 w-5 text-accent" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-foreground">Sua conta admin está limpa</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Nenhum perfil de gestor vinculado · não pertence a nenhuma escola.
            </p>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20">Sem escola</Badge>
              <Badge variant="outline" className="bg-accent/10 text-accent border-accent/20">Sem perfil de gestor</Badge>
            </div>
            <Button size="sm" variant="outline" className="mt-3 h-9" onClick={load}>
              <RefreshCw className="h-4 w-4 mr-1.5" />
              Recarregar status
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-card bg-warning/5 border-warning/30">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-warning/15 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5 text-warning" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm text-foreground">Sua conta admin está vinculada a uma escola</p>
            <p className="text-xs text-muted-foreground mt-0.5 break-words">
              {status.fullName} · {status.role} · {status.schoolName ?? "—"}
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Button
                size="sm"
                variant="destructive"
                className="h-9"
                onClick={handleRemove}
                disabled={removing}
              >
                {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                <span className="ml-1.5">Remover vínculo</span>
              </Button>
              <Button size="sm" variant="outline" className="h-9" onClick={load} disabled={removing}>
                <RefreshCw className="h-4 w-4 mr-1.5" />
                Recarregar status
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
