import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ShieldCheck, ShieldAlert, Loader2, ArrowLeft } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type VerifyResult = {
  school_name: string;
  school_inep: string | null;
  signer_name: string;
  signer_cpf_masked: string | null;
  accepted_at: string;
  accepted_ip: string | null;
  contract_version: string | null;
  document_hash: string | null;
  status: string;
  is_reacceptance: boolean;
};

export default function VerifyContract() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setError("Token ausente."); setLoading(false); return; }
    (async () => {
      const { data: rows, error } = await supabase.rpc("verify_contract", { _token: token });
      if (error) setError(error.message);
      else if (!rows || (rows as any[]).length === 0) setError("Contrato não encontrado ou token inválido.");
      else setData((rows as any[])[0] as VerifyResult);
      setLoading(false);
    })();
  }, [token]);

  return (
    <div className="min-h-dvh bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className={`p-6 text-white text-center ${data ? "bg-emerald-600" : error ? "bg-red-600" : "bg-slate-600"}`}>
          {loading ? (
            <Loader2 className="h-12 w-12 mx-auto animate-spin" />
          ) : data ? (
            <ShieldCheck className="h-14 w-14 mx-auto" strokeWidth={2.2} />
          ) : (
            <ShieldAlert className="h-14 w-14 mx-auto" strokeWidth={2.2} />
          )}
          <h1 className="text-2xl font-extrabold mt-2">
            {loading ? "Verificando..." : data ? "Contrato Autêntico" : "Não Verificado"}
          </h1>
          <p className="text-sm opacity-90 mt-1">
            {loading ? "Consultando registros" : data ? "Documento eletronicamente assinado" : "Documento inválido ou não localizado"}
          </p>
        </div>

        <div className="p-6 space-y-4 text-slate-800">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
          )}
          {data && (
            <>
              <Row label="Escola (CONTRATADA)" value={data.school_name} />
              {data.school_inep && <Row label="Código INEP" value={data.school_inep} />}
              <Row label="Assinado por" value={data.signer_name} bold />
              {data.signer_cpf_masked && <Row label="CPF" value={data.signer_cpf_masked} />}
              <Row label="Data/hora do aceite" value={format(new Date(data.accepted_at), "dd 'de' MMMM 'de' yyyy 'às' HH:mm:ss", { locale: ptBR })} />
              {data.accepted_ip && <Row label="Endereço IP" value={data.accepted_ip} mono />}
              {data.contract_version && <Row label="Versão do contrato" value={data.contract_version} mono />}
              {data.document_hash && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Hash SHA-256 do documento</p>
                  <p className="text-[10px] font-mono break-all bg-slate-100 p-2 rounded mt-1">{data.document_hash}</p>
                </div>
              )}
              <Row label="Status" value={data.status?.toUpperCase()} />
              {data.is_reacceptance && <Row label="Tipo" value="Reaceite (nova versão)" />}

              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900 leading-snug">
                Este documento possui validade jurídica nos termos da <strong>Lei 14.063/2020</strong>{" "}
                (assinatura eletrônica simples) e do <strong>art. 10, §2º da MP 2.200-2/2001</strong>.
                As evidências aqui apresentadas são suficientes para comprovar a manifestação de vontade
                da parte signatária.
              </div>
            </>
          )}
          <Link to="/" className="flex items-center justify-center gap-2 text-xs text-slate-500 hover:text-slate-700 pt-2">
            <ArrowLeft className="h-3 w-3" /> Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className={`${mono ? "font-mono text-xs" : "text-sm"} ${bold ? "font-extrabold" : ""} break-words`}>{value}</p>
    </div>
  );
}
