import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, UserCheck } from "lucide-react";
import { toast } from "sonner";

type Servidor = {
  user_id: string;
  full_name: string | null;
  phone: string | null;
  role: string;
};

const ROLE_LABELS: Record<string, string> = {
  gestor_pedagogico: "Gestor Pedagógico",
  chef_projeto_vida: "Chef Projeto de Vida",
  coord_pedagogico: "Coordenador Pedagógico",
  coord_biblioteca: "Coordenador Biblioteca",
  secretario_escolar: "Secretário Escolar",
  teacher: "Professor",
  assistente: "Assistente",
  admin: "Administrador",
};

const roleLabel = (r: string) => ROLE_LABELS[r] ?? r;

function routeForRole(role: string): string {
  if (role === "gestor_pedagogico" || role === "chef_projeto_vida") return "/gestor";
  if (role === "teacher" || role === "professor") return "/sectors";
  if (role === "assistente") return "/assistente";
  return "/home";
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schoolId: string | null;
  schoolName: string;
}

export function ServidorPickerModal({ open, onOpenChange, schoolId, schoolName }: Props) {
  const [loading, setLoading] = useState(false);
  const [allServidores, setAllServidores] = useState<Servidor[]>([]);
  const [roleFilter, setRoleFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string>("");
  const [entering, setEntering] = useState(false);
  const [rpcError, setRpcError] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setRoleFilter("");
    setSearch("");
    setSelectedId("");
    setRpcError(null);
    setSelectionError(null);
    if (!schoolId) {
      setAllServidores([]);
      return;
    }
    setLoading(true);
    (async () => {
      // Admin vê TODOS os servidores da escola (aprovados ou não)
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, phone, role")
        .eq("school_id", schoolId)
        .order("full_name", { ascending: true })
        .limit(2000);
      if (error) {
        toast.error("Falha ao carregar servidores", {
          description: error.message || "Verifique a conexão com o backend e tente novamente.",
        });
        setAllServidores([]);
      } else {
        setAllServidores((data ?? []) as Servidor[]);
      }
      setLoading(false);
    })();
  }, [open, schoolId]);

  const availableRoles = useMemo(() => {
    const set = new Set(allServidores.map((s) => s.role).filter(Boolean));
    return Array.from(set).sort();
  }, [allServidores]);

  const filtered = useMemo(() => {
    let list = allServidores;
    if (roleFilter) list = list.filter((s) => s.role === roleFilter);
    const term = search.trim().toLowerCase();
    if (term.length >= 3) {
      list = list.filter(
        (s) =>
          (s.full_name ?? "").toLowerCase().includes(term) ||
          (s.phone ?? "").toLowerCase().includes(term),
      );
    }
    return list.slice(0, 100);
  }, [allServidores, roleFilter, search]);

  const selected = filtered.find((s) => s.user_id === selectedId) ?? null;
  const canEnter = !!roleFilter && !!selected && !entering && !!schoolId;

  const validateSelection = (): boolean => {
    setSelectionError(null);
    if (!schoolId) {
      setSelectionError("Escola não foi selecionada. Feche e escolha uma escola primeiro.");
      return false;
    }
    if (!roleFilter) {
      setSelectionError("Selecione o cargo do servidor antes de continuar.");
      return false;
    }
    if (!selected) {
      setSelectionError("Selecione um servidor da lista antes de continuar.");
      return false;
    }
    return true;
  };

  const handleEnter = () => {
    if (!validateSelection()) return;
    if (!selected || !schoolId) return;
    setEntering(true);
    setRpcError(null);
    try {
      sessionStorage.setItem("lovable:as_school", schoolId);
      sessionStorage.setItem(
        "lovable:as_user",
        JSON.stringify({
          user_id: selected.user_id,
          full_name: selected.full_name,
          phone: selected.phone,
          role: selected.role,
        }),
      );
    } catch (e) {
      toast.error("Não foi possível iniciar a sessão de impersonação", {
        description: e instanceof Error ? e.message : "Erro desconhecido",
      });
      setEntering(false);
      return;
    }
    // Log em segundo plano — não bloqueia navegação se o backend estiver lento
    try {
      supabase
        .rpc("admin_log_impersonation", {
          _school_id: schoolId,
          _phase: "start",
          _reason: `as_user:${selected.user_id}:${selected.role}`,
        })
        .then(({ error }) => {
          if (error) {
            setRpcError(error.message || "Falha ao registrar log de impersonação.");
            toast.error("Registro de auditoria falhou", {
              description: error.message || "A navegação continuará, mas o log não foi salvo.",
            });
          }
        })
        .then(undefined, (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Erro de rede ao registrar auditoria.";
          setRpcError(msg);
          toast.error("Registro de auditoria falhou", {
            description: msg,
          });
        });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erro inesperado ao registrar auditoria.";
      setRpcError(msg);
      toast.error("Registro de auditoria falhou", { description: msg });
    }
    onOpenChange(false);
    // Redireciona imediatamente para o painel apropriado ao cargo escolhido
    window.location.href = routeForRole(selected.role);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base leading-snug break-words">
            Selecionar Servidor da Escola: {schoolName}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {!schoolId && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
              Escola não identificada. Feche este modal e selecione uma escola antes de escolher o servidor.
            </div>
          )}

          {rpcError && (
            <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
              <strong className="block mb-0.5">Erro no backend:</strong>
              {rpcError}
              <span className="block mt-1 text-xs opacity-90">
                A navegação prosseguirá, mas o registro de auditoria pode não ter sido salvo.
              </span>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Tipo de Servidor / Cargo
            </label>
            <Select value={roleFilter || "__none__"} onValueChange={(v) => { setRoleFilter(v === "__none__" ? "" : v); setSelectedId(""); setSelectionError(null); }}>
              <SelectTrigger className="h-10">
                <SelectValue placeholder={loading ? "Carregando..." : "Selecione o cargo"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Selecione o cargo</SelectItem>
                {availableRoles.map((r) => (
                  <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Nome do Servidor
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou telefone (mín. 3 letras)..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-10"
                disabled={!roleFilter}
              />
            </div>

            {roleFilter && (
              <div className="mt-2 rounded-md border max-h-60 overflow-y-auto divide-y">
                {loading && (
                  <div className="p-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando...
                  </div>
                )}
                {!loading && filtered.length === 0 && (
                  <p className="p-3 text-center text-xs text-muted-foreground">
                    {search.trim().length > 0 && search.trim().length < 3
                      ? "Digite ao menos 3 letras para filtrar"
                      : "Nenhum servidor encontrado com esse nome"}
                  </p>
                )}
                {!loading && filtered.map((s) => (
                  <button
                    key={s.user_id}
                    type="button"
                    onClick={() => { setSelectedId(s.user_id); setSelectionError(null); }}
                    className={`w-full text-left px-3 py-2 hover:bg-accent/40 flex items-start gap-2 ${
                      selectedId === s.user_id ? "bg-primary/10" : ""
                    }`}
                  >
                    {selectedId === s.user_id ? (
                      <UserCheck className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                    ) : (
                      <div className="h-4 w-4 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium break-words">
                        {s.full_name || "(sem nome)"}
                      </p>
                      <p className="text-[11px] text-muted-foreground break-all">
                        {s.phone ?? "—"} · {roleLabel(s.role)}
                      </p>
                    </div>
                  </button>
                ))}
                {!loading && allServidores.filter((s) => !roleFilter || s.role === roleFilter).length > 100 && (
                  <p className="p-2 text-center text-[10px] text-muted-foreground">
                    Mostrando 100 primeiros — refine a busca
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {selectionError && (
          <div className="rounded-md bg-destructive/10 border border-destructive/30 p-3 text-sm text-destructive">
            {selectionError}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleEnter} disabled={!canEnter} className="gap-1.5">
            {entering && <Loader2 className="h-4 w-4 animate-spin" />}
            Entrar como este Servidor
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
