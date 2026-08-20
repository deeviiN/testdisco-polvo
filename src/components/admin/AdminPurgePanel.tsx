import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Loader2, Trash2, AlertTriangle, FileX, UserX, Search } from "lucide-react";
import { toast } from "sonner";

type School = { id: string; name: string };

const ALL = "__ALL__";

export default function AdminPurgePanel() {
  const [schools, setSchools] = useState<School[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string>(ALL);
  const [busy, setBusy] = useState<null | "contracts" | "profiles">(null);
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    (async () => {
      // Carrega apenas escolas que já têm gestores cadastrados
      const { data: profs } = await supabase
        .from("profiles")
        .select("school_id")
        .in("role", ["gestor_pedagogico", "chef_projeto_vida"])
        .not("school_id", "is", null);
      const ids = Array.from(new Set((profs || []).map((p: any) => p.school_id))).filter(Boolean);
      if (!ids.length) return;
      const { data: ss } = await supabase
        .from("schools")
        .select("id,name")
        .in("id", ids)
        .order("name");
      setSchools((ss || []) as School[]);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return schools;
    return schools.filter((s) => s.name.toLowerCase().includes(q));
  }, [schools, search]);

  const selectedLabel =
    selected === ALL
      ? "TODAS as escolas"
      : schools.find((s) => s.id === selected)?.name || "—";

  const requireConfirm = "ZERAR";

  const run = async (kind: "contracts" | "profiles") => {
    if (confirmText.trim().toUpperCase() !== requireConfirm) {
      toast.error(`Digite ${requireConfirm} para confirmar.`);
      return;
    }
    setBusy(kind);
    try {
      const _school_id = selected === ALL ? null : selected;
      const rpc = kind === "contracts" ? "admin_purge_contracts" : "admin_purge_profiles";
      const { data, error } = await supabase.rpc(rpc as any, { _school_id });
      if (error) throw error;
      const res = data as any;
      toast.success(
        kind === "contracts"
          ? `Contratos zerados: ${res?.contracts_deleted ?? 0} · Gestores em trial: ${res?.gestores_reset ?? 0}`
          : `Cadastros apagados: ${res?.profiles_deleted ?? 0}`
      );
      setConfirmText("");
    } catch (e: any) {
      toast.error("Falha: " + (e?.message || "erro desconhecido"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="border-destructive/40">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-sm">Zona perigosa — zerar dados</p>
            <p className="text-[11px] text-muted-foreground">
              Use para limpar contratos ou cadastros de teste. A escola permanece. Admins nunca são apagados.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-semibold uppercase text-muted-foreground">Escola</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar escola"
              className="pl-9 h-9"
            />
          </div>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full h-10 rounded-md border bg-background px-3 text-sm"
          >
            <option value={ALL}>— TODAS as escolas —</option>
            {filtered.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <p className="text-[11px] text-muted-foreground">
            Alvo selecionado: <span className="font-semibold text-foreground">{selectedLabel}</span>
          </p>
        </div>

        <div className="space-y-2">
          <label className="text-[11px] font-semibold uppercase text-muted-foreground">
            Confirmação — digite {requireConfirm}
          </label>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={requireConfirm}
            className="h-9 font-mono"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
          <Button
            variant="outline"
            className="h-12 gap-2 border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => run("contracts")}
            disabled={busy !== null}
          >
            {busy === "contracts" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileX className="h-4 w-4" />}
            Apagar contratos
          </Button>
          <Button
            variant="destructive"
            className="h-12 gap-2"
            onClick={() => run("profiles")}
            disabled={busy !== null}
          >
            {busy === "profiles" ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserX className="h-4 w-4" />}
            Apagar cadastros
          </Button>
        </div>

        <p className="text-[10px] text-muted-foreground leading-snug">
          <Trash2 className="h-3 w-3 inline mr-1" />
          <b>Apagar contratos</b> remove assinaturas/contratos/pagamentos e recoloca os gestores em trial de 10 dias.
          <br />
          <b>Apagar cadastros</b> remove perfis (não-admin) e dados ligados (agendamentos, presenças, mensagens). A escola fica.
        </p>
      </CardContent>
    </Card>
  );
}
