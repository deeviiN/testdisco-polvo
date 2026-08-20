import { useEffect } from "react";

// Rota de conveniência: redireciona para a Edge Function que serve o
// Painel TV em HTML puro (sem JS), com <meta refresh> a cada 30s.
// Alvo: TV Box antiga que não roda o bundle moderno.
export default function PainelTvLegacy() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const school = params.get("school") ?? "";
    const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID ?? "";
    const target = `https://${projectId}.supabase.co/functions/v1/painel-tv-legacy?school=${encodeURIComponent(school)}`;
    window.location.replace(target);
  }, []);

  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const school = params.get("school") ?? "";
  const projectId = (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID ?? "";
  const target = `https://${projectId}.supabase.co/functions/v1/painel-tv-legacy?school=${encodeURIComponent(school)}`;

  return (
    <div style={{ padding: 24, fontFamily: "Arial, sans-serif", color: "#e5e7eb", background: "#0b1220", minHeight: "100dvh" }}>
      <p>Abrindo Painel TV (modo compatível)...</p>
      <p>
        Se não abrir, use este endereço direto na TV:
        <br />
        <a href={target} style={{ color: "#93c5fd", wordBreak: "break-all" }}>{target}</a>
      </p>
    </div>
  );
}
