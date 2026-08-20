import { useEffect, useState } from "react";
import { useAuth, clearAdminAsSchool } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const ROLE_LABELS: Record<string, string> = {
  gestor_pedagogico: "Gestor",
  chef_projeto_vida: "Chef PV",
  coord_pedagogico: "Coord. Ped.",
  coord_biblioteca: "Coord. Bib.",
  secretario_escolar: "Secretário",
  teacher: "Prof.",
  assistente: "Assistente",
};

type AsUser = { user_id: string; full_name: string | null; role: string };

export default function ImpersonationBanner() {
  const { profile } = useAuth();
  const [asSchool, setAsSchool] = useState<string | null>(null);
  const [asUser, setAsUser] = useState<AsUser | null>(null);
  const [schoolName, setSchoolName] = useState<string>("");

  useEffect(() => {
    const read = () => {
      try { setAsSchool(sessionStorage.getItem("lovable:as_school")); } catch {}
      try {
        const raw = sessionStorage.getItem("lovable:as_user");
        setAsUser(raw ? JSON.parse(raw) : null);
      } catch { setAsUser(null); }
    };
    read();
    const t = setInterval(read, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!asSchool) return;
    supabase.from("schools").select("name").eq("id", asSchool).maybeSingle()
      .then(({ data }) => setSchoolName(data?.name ?? ""));
    supabase.rpc("admin_log_impersonation", { _school_id: asSchool, _phase: "start", _reason: null }).then(() => {});
    return () => {
      supabase.rpc("admin_log_impersonation", { _school_id: asSchool, _phase: "end", _reason: null }).then(() => {});
    };
  }, [asSchool]);

  if (!asSchool || !profile) return null;

  const isServidor = !!asUser;
  const roleLbl = asUser ? (ROLE_LABELS[asUser.role] ?? asUser.role) : "";
  const label = isServidor
    ? `Modo Suporte: você está como ${roleLbl} ${asUser?.full_name ?? ""}`.trim()
    : `Acessar como: ${schoolName || asSchool.slice(0, 8)}`;

  return (
    <div className="w-full flex justify-center pointer-events-none pt-1 px-2">
      <div className={`pointer-events-auto inline-flex items-center gap-1.5 ${isServidor ? "bg-orange-500 text-white" : "bg-amber-500 text-amber-950"} text-[10px] font-bold py-0.5 px-2 rounded-full shadow max-w-full`}>
        <Eye className="h-3 w-3 shrink-0" />
        <span className="truncate">{label}</span>
        <Button
          size="sm"
          variant="ghost"
          className={`h-4 w-4 p-0 ml-0.5 ${isServidor ? "hover:bg-orange-600/40" : "hover:bg-amber-600/30"} shrink-0`}
          onClick={() => { clearAdminAsSchool(); window.location.href = "/admin/console"; }}
          aria-label={isServidor ? "Sair do modo servidor" : "Sair do modo gestor"}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}
