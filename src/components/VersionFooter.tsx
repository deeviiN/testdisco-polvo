import { RefreshCw, ShieldCheck } from "lucide-react";
import LastUpdateBadge from "@/components/LastUpdateBadge";
import { useNavigate } from "react-router-dom";

/**
 * Discreet version footer with a "force update" button.
 * Use on auth/welcome screens so users can unstick cached PWAs before logging in.
 */
export default function VersionFooter({ className = "" }: { className?: string }) {
  const navigate = useNavigate();

  const handleForceUpdate = () => {
    const force = (window as unknown as { __forceAppUpdate?: () => Promise<void> }).__forceAppUpdate;
    if (force) force();
    else window.location.reload();
  };

  return (
    <div className={`flex flex-col items-center justify-center gap-2 ${className}`}>
      <div className="flex items-center justify-center gap-2 text-[10px] text-white/40 font-mono tracking-wide">
        <span>v{__APP_VERSION__}</span>
        <span className="opacity-50">•</span>
        <button
          type="button"
          onClick={handleForceUpdate}
          className="inline-flex items-center gap-1 text-white/60 hover:text-white/90 transition-colors font-semibold"
          title="Limpa cache e recarrega para a versão mais recente"
        >
          <RefreshCw className="h-3 w-3" /> Atualizar
        </button>
      </div>
      
      <button
        type="button"
        onClick={() => navigate("/admin/login")}
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] text-white/40 hover:text-white/80 hover:bg-white/10 transition-all group"
      >
        <ShieldCheck className="h-3 w-3 group-hover:text-amber-400 transition-colors" />
        Acesso Restrito
      </button>

      <LastUpdateBadge location="footer" className="text-white/40" />
    </div>
  );
}
