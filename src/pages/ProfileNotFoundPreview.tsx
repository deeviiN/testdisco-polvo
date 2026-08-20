import { useSearchParams } from "react-router-dom";
import { ProfileNotFound } from "@/pages/Index";
import type { RoleKey } from "@/lib/profileNotFoundI18n";

const VALID_ROLES: RoleKey[] = [
  "admin",
  "gestor_pedagogico",
  "chef_projeto_vida",
  "coord_pedagogico",
  "supervisor",
  "secretario_escolar",
  "teacher",
  "default",
];

/**
 * Preview público da tela "Perfil não encontrado" — sem autenticação.
 * Útil para conferir layout e posicionamento do botão Sair.
 * URL: /preview/profile-not-found?role=teacher
 */
export default function ProfileNotFoundPreview() {
  const [params] = useSearchParams();
  const roleParam = (params.get("role") || "default") as RoleKey;
  const role: RoleKey = VALID_ROLES.includes(roleParam) ? roleParam : "default";
  const userId = params.get("userId") || "preview-user-00000000";
  const userEmail = params.get("email") || "preview@exemplo.com";
  const autoRetryParam = params.get("autoRetry");
  const initialAutoRetry = autoRetryParam === "true" || autoRetryParam === "1";

  return (
    <div className="relative">
      <div className="fixed top-2 left-2 z-50 text-[10px] uppercase tracking-wider font-bold bg-warning text-warning-foreground px-2 py-1 rounded-md shadow">
        Preview · sem autenticação{initialAutoRetry ? " · autoRetry ON" : ""}
      </div>
      <ProfileNotFound
        key={`${role}-${initialAutoRetry}`}
        userId={userId}
        userEmail={userEmail}
        role={role}
        initialAutoRetry={initialAutoRetry}
      />
    </div>
  );
}
