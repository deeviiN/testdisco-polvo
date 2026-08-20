import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, BellRing, Send, Loader2, CheckCircle2, XCircle, Check, ChevronsUpDown, User, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { cn } from "@/lib/utils";

type UserOption = {
  user_id: string;
  full_name: string;
  role: string;
  school_name: string | null;
  device_count: number;
};

type SendResult = {
  sent: number;
  failed: number;
  removed?: number;
  results: Array<{ endpoint: string; ok: boolean; statusCode?: number; error?: string; removed?: boolean }>;
  note?: string;
};

export default function PushTest() {
  const navigate = useNavigate();
  const { status, supported, loading, error, subscribe, unsubscribe } = usePushSubscription();

  const [targetUserId, setTargetUserId] = useState("");
  const [title, setTitle] = useState("Teste de notificação");
  const [body, setBody] = useState("Se você recebeu isso, o push está funcionando!");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);


  const [users, setUsers] = useState<UserOption[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [onlyWithDevice, setOnlyWithDevice] = useState(true);

  const loadUsers = async (silent = false) => {
    setLoadingUsers(true);
    try {
      const [profilesRes, subsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, full_name, role, schools(name)")
          .order("full_name", { ascending: true })
          .limit(1000),
        supabase.from("push_subscriptions").select("user_id"),
      ]);
      if (profilesRes.error) throw profilesRes.error;
      if (subsRes.error) throw subsRes.error;
      const counts = new Map<string, number>();
      (subsRes.data || []).forEach((s: any) => {
        counts.set(s.user_id, (counts.get(s.user_id) || 0) + 1);
      });
      const list: UserOption[] = (profilesRes.data || []).map((p: any) => ({
        user_id: p.user_id,
        full_name: p.full_name || "(sem nome)",
        role: p.role || "",
        school_name: p.schools?.name ?? null,
        device_count: counts.get(p.user_id) || 0,
      }));
      setUsers(list);
      if (!silent) toast.success(`Lista atualizada (${list.length} usuários)`);
    } catch (e: any) {
      toast.error("Falha ao carregar usuários: " + (e?.message || String(e)));
    } finally {
      setLoadingUsers(false);
    }
  };

  useEffect(() => {
    loadUsers(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredUsers = useMemo(
    () => (onlyWithDevice ? users.filter((u) => u.device_count > 0) : users),
    [users, onlyWithDevice]
  );
  const selectedUser = useMemo(
    () => users.find((u) => u.user_id === targetUserId) || null,
    [users, targetUserId]
  );

  const totalDevices = useMemo(
    () => users.reduce((sum, u) => sum + u.device_count, 0),
    [users]
  );

  const sendTest = async () => {
    setSending(true);
    setResult(null);
    try {
      const payload: Record<string, unknown> = { title, body };
      if (targetUserId.trim()) payload.user_id = targetUserId.trim();
      const { data, error: invErr } = await supabase.functions.invoke("send-push-test", {
        body: payload,
      });
      if (invErr) throw invErr;
      setResult(data as SendResult);
      const r = data as SendResult;
      if (r.note) toast.warning(r.note);
      else if (r.sent > 0)
        toast.success(
          `Enviado para ${r.sent} dispositivo(s)` +
            (r.removed ? ` · ${r.removed} dispositivo(s) expirado(s) removido(s)` : ""),
        );
      else if (r.removed && !r.failed)
        toast.warning(`${r.removed} dispositivo(s) expirado(s) removido(s). Ative o push novamente no aparelho.`);
      else toast.error(`Falhou em ${r.failed} dispositivo(s)`);
      if ((r.sent > 0 || r.failed > 0 || (r.removed ?? 0) > 0) && !r.note) {
        loadUsers(true);
      }
    } catch (e: any) {
      toast.error(e?.message || String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="h-[100dvh] bg-background flex flex-col overflow-hidden">
      <header className="shrink-0 bg-primary text-primary-foreground pt-14 p-3 flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin")} className="text-primary-foreground hover:bg-white/10">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <BellRing className="h-5 w-5" />
        <h1 className="text-lg font-bold">Teste de Push</h1>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto max-w-2xl w-full mx-auto p-4 space-y-4 pb-24">
        {!loadingUsers && totalDevices === 0 && (
          <Alert variant="destructive">
            <BellRing className="h-4 w-4" />
            <AlertTitle>Nenhum dispositivo cadastrado</AlertTitle>
            <AlertDescription>
              Não há dispositivos com push ativo. Para receber notificações, ative o push neste dispositivo
              ou peça para outros usuários ativarem no app publicado.
            </AlertDescription>
          </Alert>
        )}
        <Alert>
          <BellRing className="h-4 w-4" />
          <AlertTitle>LEMBRETE: Push pendente — voltar depois!</AlertTitle>
          <AlertDescription>
            Quando retornar aqui: 1) Abrir o app pelo link PUBLICADO (não preview), 2) Ativar notificações neste dispositivo, 3) Enviar teste e confirmar recebimento.
          </AlertDescription>
        </Alert>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">1. Este dispositivo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm">
              Status: <span className="font-semibold">{status}</span>
            </div>
            {!supported && (
              <p className="text-sm text-destructive">
                Este navegador não suporta Web Push (ou está em modo anônimo).
              </p>
            )}
            {error && <p className="text-sm text-destructive break-words">{error}</p>}
            <div className="flex gap-2">
              {status !== "subscribed" ? (
                <Button onClick={subscribe} disabled={!supported || loading} className="h-12 font-bold shadow-[0_0_18px_hsl(var(--primary)/0.55)] hover:shadow-[0_0_28px_hsl(var(--primary)/0.85)] transition-shadow">
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ativar push neste dispositivo"}
                </Button>
              ) : (
                <Button onClick={unsubscribe} variant="outline" disabled={loading} className="h-12 font-bold shadow-[0_0_14px_hsl(var(--foreground)/0.25)] hover:shadow-[0_0_22px_hsl(var(--foreground)/0.4)] transition-shadow">
                  Desativar neste dispositivo
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Enviar push de teste</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label>Usuário alvo</Label>
                <div className="flex items-center gap-3">
                  <label className="text-xs flex items-center gap-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={onlyWithDevice}
                      onChange={(e) => setOnlyWithDevice(e.target.checked)}
                    />
                    só com dispositivo
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => loadUsers(false)}
                    disabled={loadingUsers}
                    className="h-7 px-2 text-xs"
                  >
                    {loadingUsers ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    <span className="ml-1">Atualizar</span>
                  </Button>
                </div>
              </div>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between h-auto min-h-12 py-2"
                    disabled={loadingUsers}
                  >
                    {loadingUsers ? (
                      <span className="flex items-center gap-2 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
                      </span>
                    ) : selectedUser ? (
                      <span className="flex items-center gap-2 text-left flex-1 min-w-0">
                        <User className="h-4 w-4 shrink-0" />
                        <span className="flex flex-col min-w-0">
                          <span className="font-semibold truncate">{selectedUser.full_name}</span>
                          <span className="text-xs text-muted-foreground truncate">
                            {selectedUser.role} · {selectedUser.school_name || "—"} · {selectedUser.device_count} disp.
                          </span>
                        </span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Você mesmo (deixar vazio)</span>
                    )}
                    <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar por nome, e-mail ou escola..." />
                    <CommandList>
                      <CommandEmpty>Nenhum usuário encontrado.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="__self__ você mesmo"
                          onSelect={() => {
                            setTargetUserId("");
                            setPickerOpen(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", !targetUserId ? "opacity-100" : "opacity-0")} />
                          <span className="italic text-muted-foreground">Você mesmo (vazio)</span>
                        </CommandItem>
                        {filteredUsers.map((u) => (
                          <CommandItem
                            key={u.user_id}
                            value={`${u.full_name} ${u.role} ${u.school_name ?? ""} ${u.user_id}`}
                            onSelect={() => {
                              setTargetUserId(u.user_id);
                              setPickerOpen(false);
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                targetUserId === u.user_id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <div className="flex flex-col flex-1 min-w-0">
                              <span className="font-medium truncate">{u.full_name}</span>
                              <span className="text-xs text-muted-foreground truncate">
                                {u.role} · {u.school_name || "—"}
                              </span>
                            </div>
                            <Badge
                              variant={u.device_count > 0 ? "default" : "secondary"}
                              className="ml-2 shrink-0"
                            >
                              {u.device_count}
                            </Badge>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {selectedUser && (
                <p className="text-xs text-muted-foreground break-all">
                  ID: {selectedUser.user_id}
                </p>
              )}
            </div>
            <div>
              <Label htmlFor="title">Título</Label>
              <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="body">Mensagem</Label>
              <Textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
            </div>
            <Button onClick={sendTest} disabled={sending} className="w-full h-14 font-bold shadow-[0_0_24px_hsl(var(--primary)/0.7)] hover:shadow-[0_0_36px_hsl(var(--primary)/0.95)] transition-shadow">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-2" /> Enviar push</>}
            </Button>
          </CardContent>
        </Card>

        {result && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Resultado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                Enviados: <strong>{result.sent}</strong> · Falhas: <strong>{result.failed}</strong>
                {(result.removed ?? 0) > 0 && (
                  <> · Expirados removidos: <strong>{result.removed}</strong></>
                )}
              </div>
              {result.note && <div className="text-amber-600">{result.note}</div>}
              <div className="space-y-2">
                {result.results.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded border">
                    {r.ok ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
                    ) : r.removed ? (
                      <RefreshCw className="h-4 w-4 text-amber-500 mt-0.5" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs break-all opacity-70">{r.endpoint}</div>
                      {!r.ok && (
                        <div className={`text-xs break-words ${r.removed ? "text-amber-600" : "text-destructive"}`}>
                          {r.removed
                            ? "Assinatura expirada — dispositivo removido da lista. Basta reativar o push nele."
                            : `${r.statusCode ? `HTTP ${r.statusCode} — ` : ""}${r.error}`}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
}
