import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

/**
 * Endpoint de verificação do Painel TV.
 * Rota: /painel-tv/verify?school=<id>&tv=<marca>
 *
 * Faz checagens mínimas que uma Smart TV consegue fazer no navegador:
 *  - rota responde (HTTP 200)
 *  - parâmetro school presente
 *  - escola existe e está ativa (RPC pública get_school_public_info)
 *  - dados do painel carregam (RPC pública get_painel_tv_data)
 *  - marca de TV reconhecida
 *
 * Retorna JSON na URL ?format=json, ou uma página visual (default) com
 * checks em verde/vermelho — basta abrir na TV ou no navegador da rede.
 */
const BRANDS = ["android", "vidaa", "tizen", "webos", "roku", "linux", "web"] as const;

type Check = { label: string; ok: boolean; detail?: string };

export default function PainelTvVerify() {
  const [params] = useSearchParams();
  const school = params.get("school") || "";
  const tv = (params.get("tv") || "").toLowerCase();
  const format = params.get("format");
  const [checks, setChecks] = useState<Check[]>([]);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const out: Check[] = [];
      out.push({ label: "Rota /painel-tv/verify responde", ok: true });
      out.push({
        label: "Parâmetro 'school' informado",
        ok: !!school,
        detail: school || "ausente",
      });
      out.push({
        label: "Marca de TV reconhecida",
        ok: !tv || (BRANDS as readonly string[]).includes(tv),
        detail: tv || "não informada (web genérico)",
      });

      if (school) {
        try {
          const { data, error } = await supabase.rpc("get_school_public_info", {
            _school_id: school,
          });
          const row = Array.isArray(data) ? data[0] : data;
          out.push({
            label: "Escola encontrada (RPC pública)",
            ok: !error && !!row,
            detail: row?.name || error?.message || "sem retorno",
          });
          out.push({
            label: "Escola ativa",
            ok: !!row?.is_active,
            detail: row?.is_active ? "sim" : "não / bloqueada",
          });
        } catch (e: any) {
          out.push({ label: "Escola encontrada (RPC pública)", ok: false, detail: e?.message });
        }

        try {
          const { data, error } = await supabase.rpc("get_painel_tv_data", {
            _school_id: school,
          });
          const periods = (data as any)?.periods?.length ?? 0;
          const roster = (data as any)?.roster?.length ?? 0;
          out.push({
            label: "Dados do painel carregam (RPC pública)",
            ok: !error && !!data,
            detail: error ? error.message : `${periods} períodos, ${roster} escalas`,
          });
        } catch (e: any) {
          out.push({ label: "Dados do painel carregam (RPC pública)", ok: false, detail: e?.message });
        }
      }

      if (!cancelled) {
        setChecks(out);
        setDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [school, tv]);

  const allOk = done && checks.every((c) => c.ok);

  if (format === "json") {
    return (
      <pre style={{ background: "#000", color: "#0f0", padding: 16, minHeight: "100vh", margin: 0, fontSize: 14 }}>
        {JSON.stringify({ status: done ? (allOk ? "ok" : "fail") : "loading", school, tv, checks }, null, 2)}
      </pre>
    );
  }

  return (
    <main style={{ background: "#000", color: "#fff", minHeight: "100vh", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 6 }}>Verificação Painel TV</h1>
      <p style={{ opacity: 0.7, marginBottom: 18, fontSize: 14 }}>
        school=<b>{school || "—"}</b> · tv=<b>{tv || "—"}</b>
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 720 }}>
        {checks.map((c, i) => (
          <div
            key={i}
            style={{
              border: `2px solid ${c.ok ? "#16a34a" : "#dc2626"}`,
              background: c.ok ? "rgba(22,163,74,0.12)" : "rgba(220,38,38,0.12)",
              padding: "10px 14px",
              borderRadius: 10,
            }}
          >
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {c.ok ? "✅" : "❌"} {c.label}
            </div>
            {c.detail && <div style={{ opacity: 0.75, fontSize: 13, marginTop: 2 }}>{c.detail}</div>}
          </div>
        ))}
        {!done && <div style={{ opacity: 0.6 }}>Verificando…</div>}
      </div>

      {done && (
        <div
          style={{
            marginTop: 22,
            padding: "14px 18px",
            borderRadius: 12,
            background: allOk ? "#16a34a" : "#dc2626",
            fontWeight: 800,
            fontSize: 18,
            display: "inline-block",
          }}
        >
          {allOk ? "TUDO OK — o link compatível deve funcionar nesta TV" : "FALHA — corrija os itens vermelhos acima"}
        </div>
      )}

      {done && school && (
        <p style={{ marginTop: 16, fontSize: 13, opacity: 0.7 }}>
          Dica: abra <code>?format=json</code> para ver o resultado em JSON, ou abra esta mesma URL no navegador da TV
          para confirmar que ela consegue alcançar a rede.
        </p>
      )}
    </main>
  );
}
