import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCheck, Inbox as InboxIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useInbox, type InboxAudience, type InboxItem } from "@/hooks/useInbox";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export type InboxFolder = {
  key: string;
  label: string;
  /** types that belong to this folder. Use ["*"] to catch everything not handled. */
  types: string[];
};

type Props = {
  audience: InboxAudience;
  title: string;
  folders: InboxFolder[];
  enabled?: boolean;
  onItemAction?: (item: InboxItem) => void;
};

export default function InboxPage({ audience, title, folders, enabled = true, onItemAction }: Props) {
  const navigate = useNavigate();
  const { items, loading, unreadCount, markAllRead, markRead, setStatus } = useInbox(audience, enabled);
  const [tab, setTab] = useState(folders[0]?.key);

  const grouped = useMemo(() => {
    const map = new Map<string, InboxItem[]>();
    folders.forEach((f) => map.set(f.key, []));
    const knownTypes = new Set(folders.flatMap((f) => f.types));
    items.forEach((item) => {
      const folder = folders.find((f) => f.types.includes(item.type)) ??
        folders.find((f) => f.types.includes("*") && !knownTypes.has(item.type));
      if (folder) map.get(folder.key)!.push(item);
    });
    return map;
  }, [items, folders]);

  return (
    <div className="min-h-dvh bg-background pb-24">
      <header
        data-testid="inbox-header"
        className="sticky top-0 z-10 bg-card/90 backdrop-blur border-b px-3 pt-24 pb-3 sm:pl-16 sm:pr-36 sm:pt-20 flex flex-col gap-1"
      >
        <h1 className="text-base sm:text-lg font-bold flex items-center gap-2 leading-tight min-w-0">
          <InboxIcon className="h-5 w-5 shrink-0" />
          <span className="break-words min-w-0 flex-1">{title}</span>
        </h1>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs text-muted-foreground break-words">
            {unreadCount > 0 ? `${unreadCount} não lida(s)` : "Tudo em dia"}
          </p>
          {unreadCount > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead} className="h-7 text-xs">
              <CheckCheck className="h-3.5 w-3.5 mr-1" />
              Marcar lidas
            </Button>
          )}
        </div>
      </header>

      <Tabs value={tab} onValueChange={setTab} className="px-3 pt-3">
        <div className="grid grid-cols-2 gap-2">
          {folders.map((f) => {
            const list = grouped.get(f.key) ?? [];
            const unread = list.filter((i) => !i.is_read).length;
            const active = tab === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => {
                  setTab(f.key);
                  list.filter((i) => !i.is_read).forEach((i) => markRead(i.id));
                }}
                className={`relative flex items-center justify-between gap-2 rounded-lg border px-3 h-11 text-sm font-semibold transition ${
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-card hover:bg-secondary/40 text-foreground"
                }`}
              >
                <span className="truncate">{f.label}</span>
                {unread > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full text-white text-[12px] font-extrabold ring-2 ring-white/80 animate-siren-red-badge">
                    {unread > 9 ? "9+" : unread}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {folders.map((f) => {
          const list = grouped.get(f.key) ?? [];
          return (
            <TabsContent key={f.key} value={f.key} className="mt-3 space-y-2">
              {loading && <p className="text-sm text-muted-foreground p-4">Carregando…</p>}
              {!loading && list.length === 0 && (
                <Card className="p-6 text-center text-sm text-muted-foreground">
                  Nada por aqui ainda.
                </Card>
              )}
              {list.map((item) => (
                <Card
                  key={item.id}
                  className={`p-3 flex flex-col gap-2 cursor-pointer transition-colors ${
                    item.is_read ? "" : "border-primary/40 bg-primary/5"
                  }`}
                  onClick={() => {
                    if (!item.is_read) markRead(item.id);
                    onItemAction?.(item);
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm break-words">{item.title}</p>
                      {item.description && (
                        <p className="text-xs text-muted-foreground break-words mt-0.5">
                          {item.description}
                        </p>
                      )}
                    </div>
                    {!item.is_read && (
                      <span className="h-2 w-2 rounded-full bg-red-500 mt-1 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: ptBR })}
                    </span>
                    <div className="flex items-center gap-1">
                      <Badge variant={statusVariant(item.status)} className="text-[10px]">
                        {statusLabel(item.status)}
                      </Badge>
                      {audience !== "user" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-green-500/40 text-green-700 hover:bg-green-500/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setStatus(item.id, "resolved");
                            }}
                          >
                            Aprovar
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              setStatus(item.id, "rejected");
                            }}
                          >
                            Reprovar
                          </Button>
                          {item.status !== "pending" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs"
                              onClick={(e) => {
                                e.stopPropagation();
                                setStatus(item.id, "pending");
                              }}
                            >
                              Pendente
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

function statusLabel(s: InboxItem["status"]) {
  switch (s) {
    case "pending": return "Pendente";
    case "in_progress": return "Em andamento";
    case "resolved": return "Aprovado";
    case "rejected": return "Reprovado";
    case "info": return "Informativo";
  }
}

function statusVariant(s: InboxItem["status"]): "default" | "secondary" | "destructive" | "outline" {
  switch (s) {
    case "pending": return "default";
    case "resolved": return "secondary";
    case "rejected": return "destructive";
    default: return "outline";
  }
}
