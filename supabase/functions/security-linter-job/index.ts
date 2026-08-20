import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

  try {
    // 1. Obter funções SECURITY DEFINER atuais via RPC protegida
    const { data: currentFuncs, error: fetchErr } = await supabase.rpc('get_security_definer_functions');

    if (fetchErr) throw fetchErr;

    // 2. Buscar último relatório para comparação
    const { data: lastReport } = await supabase
      .from('security_linter_reports')
      .select('raw_output')
      .order('scan_date', { ascending: false })
      .limit(1)
      .maybeSingle();

    const lastFuncs = lastReport ? JSON.parse(lastReport.raw_output) : [];
    
    // 3. Gerar sumário de mudanças
    const added = currentFuncs.filter((f: any) => !lastFuncs.some((lf: any) => lf.name === f.name));
    const removed = lastFuncs.filter((lf: any) => !currentFuncs.some((f: any) => f.name === lf.name));
    const changed = currentFuncs.filter((f: any) => {
      const prev = lastFuncs.find((lf: any) => lf.name === f.name);
      return prev && (prev.anon !== f.anon || prev.auth !== f.auth);
    });

    let diffSummary = "Estado de segurança estável.";
    if (added.length > 0 || removed.length > 0 || changed.length > 0) {
      diffSummary = `
⚠️ MUDANÇAS DETECTADAS:
Novas funções: ${added.length}
Funções removidas: ${removed.length}
Permissões alteradas: ${changed.length}
      `.trim();
    }

    // 4. Salvar novo relatório
    await supabase.from('security_linter_reports').insert({
      issue_count: currentFuncs.length,
      raw_output: JSON.stringify(currentFuncs),
      diff_summary: diffSummary
    });

    // 5. Cleanup
    await supabase.rpc('cleanup_old_linter_reports');

    return new Response(JSON.stringify({ ok: true, summary: diffSummary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
