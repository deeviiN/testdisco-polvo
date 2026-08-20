import { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Download, Loader2, Search, RefreshCw, CheckCircle2, FileText } from "lucide-react";
import { toast } from "sonner";
import { CURRENT_CONTRACT_VERSION } from "@/lib/contractVersion";
import AdminSignatureUploader from "@/components/admin/AdminSignatureUploader";
import AdminPurgePanel from "@/components/admin/AdminPurgePanel";

type Row = {
  id: string;
  school_id: string;
  uploaded_by: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  accepted_at: string | null;
  uploaded_at: string;
  accepted_ip: string | null;
  accepted_user_agent: string | null;
  contract_version: string | null;
  reacceptance: boolean;
};

type Enriched = Row & {
  school_name?: string;
  school_city?: string;
  school_state?: string;
  inep_code?: string | null;
  signer_name?: string;
};

export default function AdminContracts() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Enriched[]>([]);
  const [search, setSearch] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("signed_contracts")
        .select("*")
        .eq("signer_role", "gestor")
        .not("accepted_at", "is", null)
        .order("accepted_at", { ascending: false });
      if (error) throw error;

      const list = (data || []) as Row[];
      const schoolIds = Array.from(new Set(list.map((r) => r.school_id)));
      const userIds = Array.from(new Set(list.map((r) => r.uploaded_by)));

      const [schoolsRes, profilesRes] = await Promise.all([
        schoolIds.length
          ? supabase.from("schools").select("id, name, city, state, inep_code").in("id", schoolIds)
          : Promise.resolve({ data: [] as any[] } as any),
        userIds.length
          ? supabase.from("profiles").select("user_id, full_name").in("user_id", userIds)
          : Promise.resolve({ data: [] as any[] } as any),
      ]);

      const schoolMap = new Map<string, any>();
      ((schoolsRes.data as any[]) || []).forEach((s) => schoolMap.set(s.id, s));
      const profileMap = new Map<string, string>();
      ((profilesRes.data as any[]) || []).forEach((p) => profileMap.set(p.user_id, p.full_name || "—"));

      setRows(
        list.map((r) => ({
          ...r,
          school_name: schoolMap.get(r.school_id)?.name,
          school_city: schoolMap.get(r.school_id)?.city,
          school_state: schoolMap.get(r.school_id)?.state,
          inep_code: schoolMap.get(r.school_id)?.inep_code,
          signer_name: profileMap.get(r.uploaded_by),
        })),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao carregar aceites.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const ch = supabase
      .channel("admin-contracts-readonly")
      .on("postgres_changes", { event: "*", schema: "public", table: "signed_contracts" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.school_name?.toLowerCase().includes(q) ||
        r.signer_name?.toLowerCase().includes(q) ||
        (r.inep_code || "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const handleDownload = async (r: Enriched) => {
    setDownloadingId(r.id);
    try {
      const { data, error } = await supabase.storage.from("signed-contracts").createSignedUrl(r.file_path, 60);
      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao baixar PDF.");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b">
        <div className="max-w-5xl mx-auto px-3 pt-16 pb-3 flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-bold truncate">Contratos aceitos</h1>
            <p className="text-[11px] text-muted-foreground">
              Histórico de aceites eletrônicos · versão atual <code>{CURRENT_CONTRACT_VERSION}</code>
            </p>
          </div>
          <Button variant="outline" size="icon" onClick={load} disabled={loading} title="Recarregar">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
        <div className="max-w-5xl mx-auto px-3 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por escola, gestor ou INEP"
              className="pl-9 h-10"
            />
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-3 py-4 space-y-3">
        <AdminSignatureUploader />
        <AdminPurgePanel />
        {loading ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhum aceite eletrônico registrado.</p>
            </CardContent>
          </Card>
        ) : (
          filtered.map((r) => {
            const outdated = !!r.contract_version && r.contract_version !== CURRENT_CONTRACT_VERSION;
            return (
              <Card key={r.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start gap-2 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm break-words">{r.school_name || "—"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {[r.school_city, r.school_state].filter(Boolean).join("/")} · INEP {r.inep_code || "—"}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white gap-1">
                        <CheckCircle2 className="h-3 w-3" /> Aceito
                      </Badge>
                      {r.reacceptance && (
                        <Badge variant="outline" className="text-[10px]">Re-aceite</Badge>
                      )}
                      {outdated && (
                        <Badge variant="destructive" className="text-[10px]">Versão antiga</Badge>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <div><span className="font-semibold text-foreground">Gestor:</span> {r.signer_name || "—"}</div>
                    <div>
                      <span className="font-semibold text-foreground">Aceito em:</span>{" "}
                      {r.accepted_at ? new Date(r.accepted_at).toLocaleString("pt-BR") : "—"}
                    </div>
                    <div><span className="font-semibold text-foreground">IP:</span> {r.accepted_ip || "—"}</div>
                    <div className="truncate"><span className="font-semibold text-foreground">Versão:</span> {r.contract_version || "—"}</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full h-9 gap-2"
                    onClick={() => handleDownload(r)}
                    disabled={downloadingId === r.id}
                  >
                    {downloadingId === r.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    Baixar PDF assinado
                  </Button>
                </CardContent>
              </Card>
            );
          })
        )}
      </main>
    </div>
  );
}
