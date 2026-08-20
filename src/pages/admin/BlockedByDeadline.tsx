import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Search, ShieldAlert, Unlock, Phone, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Row = {
  user_id: string;
  full_name: string | null;
  role: string | null;
  phone: string | null;
  school_id: string | null;
  school_name: string | null;
  city: string | null;
  state: string | null;
  network: string | null;
  subscription_blocked_at: string | null;
  subscription_deadline: string | null;
  approved_until: string | null;
  days_blocked: number | null;
};

export default function BlockedByDeadline() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [graceDays, setGraceDays] = useState(7);
  const [reactivating, setReactivating] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_list_blocked_by_deadline" as any);
    if (error) toast.error("Falha ao carregar: " + error.message);
    else setRows((data as Row[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const reactivate = async () => {
    if (!selected) return;
    setReactivating(true);
    const { error } = await supabase.rpc("admin_reactivate_blocked_user" as any, {
      _user_id: selected.user_id,
      _grace_days: graceDays,
    });
    if (error) {
      toast.error("Falha ao reativar: " + error.message);
    } else {
      toast.success(`Acesso reativado por ${graceDays} dias`);
      setSelected(null);
      await load();
    }
    setReactivating(false);
  };

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      r.full_name?.toLowerCase().includes(q) ||
      r.school_name?.toLowerCase().includes(q) ||
      r.city?.toLowerCase().includes(q) ||
      r.role?.toLowerCase().includes(q)
    );
  });

  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" })
      : "—";

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 bg-primary text-primary-foreground px-4 py-3 flex items-center gap-2 shadow-md">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/admin")}
          className="text-primary-foreground hover:bg-white/15 h-9 w-9"
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] font-bold opacity-80 leading-none">
            Painel Admin
          </p>
          <h1 className="text-lg font-extrabold leading-tight truncate mt-0.5 flex items-center gap-1.5">
            <ShieldAlert className="h-4 w-4" /> Bloqueados por vencimento
          </h1>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={load}
          disabled={loading}
          className="text-primary-foreground hover:bg-white/15 h-9 w-9"
        >
          <RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </header>

      <div className="p-4 space-y-3 max-w-5xl mx-auto">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar usuário, escola, cidade ou perfil…"
            className="pl-9 h-11"
          />
        </div>

        <p className="text-xs text-muted-foreground">
          {loading ? "Carregando…" : `${filtered.length} usuário(s) bloqueado(s) por vencimento de assinatura`}
        </p>

        {!loading && filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Nenhum usuário bloqueado por vencimento.
          </div>
        )}

        <div className="space-y-2">
          {filtered.map((r) => (
            <div
              key={r.user_id}
              className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm break-words">{r.full_name ?? "Sem nome"}</p>
                  <p className="text-xs text-muted-foreground break-words">
                    {r.role ?? "—"} · {r.school_name ?? "—"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {[r.city, r.state, r.network].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className="bg-destructive/15 text-destructive border-destructive/40 text-[10px] font-extrabold uppercase tracking-wider shrink-0"
                >
                  Bloqueado
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                    Bloqueado em
                  </p>
                  <p className="font-semibold">{fmt(r.subscription_blocked_at)}</p>
                  {r.days_blocked !== null && r.days_blocked > 0 && (
                    <p className="text-[11px] text-destructive font-bold">
                      há {r.days_blocked} dia{r.days_blocked === 1 ? "" : "s"}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                    Prazo original
                  </p>
                  <p className="font-semibold">{fmt(r.subscription_deadline)}</p>
                  {r.phone && (
                    <a
                      href={`https://wa.me/55${r.phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-emerald-600 hover:underline text-[11px]"
                    >
                      <Phone className="h-3 w-3 shrink-0" />
                      {r.phone}
                    </a>
                  )}
                </div>
              </div>

              <Button
                onClick={() => {
                  setGraceDays(7);
                  setSelected(r);
                }}
                className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-2"
              >
                <Unlock className="h-4 w-4" /> Reativar acesso
              </Button>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reativar acesso</DialogTitle>
            <DialogDescription>
              Conceder carência a <b>{selected?.full_name}</b> ({selected?.school_name}). O usuário
              volta a ter acesso pelo número de dias abaixo.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Dias de carência
            </label>
            <div className="flex gap-1.5 flex-wrap">
              {[3, 7, 15, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setGraceDays(d)}
                  className={`h-10 px-3 rounded-lg font-bold text-sm border ${
                    graceDays === d
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border hover:bg-muted"
                  }`}
                >
                  {d} dias
                </button>
              ))}
              <Input
                type="number"
                min={1}
                max={365}
                value={graceDays}
                onChange={(e) => setGraceDays(Math.max(1, Math.min(365, Number(e.target.value) || 7)))}
                className="h-10 w-24"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)} disabled={reactivating}>
              Cancelar
            </Button>
            <Button
              onClick={reactivate}
              disabled={reactivating}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              {reactivating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Unlock className="h-4 w-4" />
              )}
              Confirmar reativação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
