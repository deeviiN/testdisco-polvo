import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, User as UserIcon } from "lucide-react";
import MsnChatIcon from "@/components/MsnChatIcon";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";

const ROLE_LABELS: Record<string, string> = {
  teacher: "Professor(a)",
  coord_pedagogico: "Coord. Pedagógico(a)",
  supervisor: "Corpo de Alunos C.A",
  secretario_escolar: "Assistente de Aluno",
  gestor_pedagogico: "Gestor(a) Pedagógico(a)",
  chef_projeto_vida: "Chef da Sala",
};

type Contact = {
  user_id: string;
  full_name: string;
  role: string;
};

type LastMsg = { content: string; created_at: string; from_me: boolean };

export default function MessagesContacts() {
  const navigate = useNavigate();
  const { user, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [lastMsgs, setLastMsgs] = useState<Record<string, LastMsg>>({});
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "unread" | "active" | string>("all");

  useEffect(() => {
    if (!profile?.school_id) return;
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, full_name, role")
        .eq("school_id", profile.school_id)
        .eq("is_approved", true)
        .order("full_name", { ascending: true });
      if (!active) return;
      if (!error && data) {
        setContacts(
          (data as Contact[]).filter((c) => c.user_id && c.user_id !== user?.id)
        );
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [profile?.school_id, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    const load = async () => {
      const { data: unreadData } = await supabase
        .from("direct_messages")
        .select("sender_id")
        .eq("recipient_id", user.id)
        .is("read_at", null);
      if (!active) return;
      const counts: Record<string, number> = {};
      (unreadData ?? []).forEach((m: any) => {
        counts[m.sender_id] = (counts[m.sender_id] ?? 0) + 1;
      });
      setUnread(counts);

      const { data: msgs } = await supabase
        .from("direct_messages")
        .select("sender_id, recipient_id, content, created_at")
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(200);
      if (!active) return;
      const map: Record<string, LastMsg> = {};
      (msgs ?? []).forEach((m: any) => {
        const other = m.sender_id === user.id ? m.recipient_id : m.sender_id;
        if (!map[other]) {
          map[other] = {
            content: m.content,
            created_at: m.created_at,
            from_me: m.sender_id === user.id,
          };
        }
      });
      setLastMsgs(map);
    };
    load();
    const ch = supabase
      .channel(`dm-unread-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "direct_messages", filter: `recipient_id=eq.${user.id}` },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "direct_messages", filter: `sender_id=eq.${user.id}` },
        () => load()
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [user?.id]);

  const availableRoles = useMemo(() => {
    const set = new Set<string>();
    contacts.forEach((c) => c.role && set.add(c.role));
    return Array.from(set).sort((a, b) =>
      (ROLE_LABELS[a] ?? a).localeCompare(ROLE_LABELS[b] ?? b)
    );
  }, [contacts]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    let base = !term
      ? contacts
      : contacts.filter(
          (c) =>
            c.full_name?.toLowerCase().includes(term) ||
            (ROLE_LABELS[c.role] ?? c.role).toLowerCase().includes(term)
        );
    if (filter === "unread") {
      base = base.filter((c) => (unread[c.user_id] ?? 0) > 0);
    } else if (filter === "active") {
      base = base.filter((c) => !!lastMsgs[c.user_id]);
    } else if (filter.startsWith("role:")) {
      const role = filter.slice(5);
      base = base.filter((c) => c.role === role);
    }
    // ordenar: mensagens não lidas primeiro, depois por última mensagem desc, depois alfabético
    return [...base].sort((a, b) => {
      const ua = unread[a.user_id] ?? 0;
      const ub = unread[b.user_id] ?? 0;
      if (ua !== ub) return ub - ua;
      const la = lastMsgs[a.user_id]?.created_at ?? "";
      const lb = lastMsgs[b.user_id]?.created_at ?? "";
      if (la || lb) return lb.localeCompare(la);
      return a.full_name.localeCompare(b.full_name);
    });
  }, [contacts, q, unread, lastMsgs, filter]);

  const openChat = (c: Contact) => {
    navigate(`/dm/${encodeURIComponent(c.user_id)}?name=${encodeURIComponent(c.full_name)}`);
  };

  return (
    <div className="h-dvh overflow-y-auto bg-background pb-6 pt-20">
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur-sm border-b border-border/40 px-4 py-2 flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <MsnChatIcon size={20} spinSeconds={4} />
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-bold font-display leading-tight truncate flex items-center gap-2">
              <span className="truncate">Conversas</span>
              {(() => {
                const total = Object.values(unread).reduce((a, b) => a + b, 0);
                return total > 0 ? (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                    {total > 99 ? "99+" : total}
                  </span>
                ) : null;
              })()}
            </h1>
            <p className="text-[10px] text-muted-foreground">Toque em um colega para conversar</p>
          </div>
        </div>
      </div>

      <div className="px-3 pt-8 max-w-md mx-auto space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome ou cargo…"
            className="pl-9 h-10 rounded-xl"
          />
        </div>

        {(() => {
          const totalUnread = Object.values(unread).reduce((a, b) => a + b, 0);
          const activeCount = contacts.filter((c) => !!lastMsgs[c.user_id]).length;
          const chips: { id: string; label: string; badge?: number }[] = [
            { id: "all", label: "Todos", badge: contacts.length },
            { id: "unread", label: "Não lidas", badge: totalUnread },
            { id: "active", label: "Com chat", badge: activeCount },
            ...availableRoles.map((r) => ({
              id: `role:${r}`,
              label: (ROLE_LABELS[r] ?? r).replace("Professor(a)", "Prof.").replace("Coord. Pedagógico(a)", "Coord.").replace("Corpo de Alunos C.A", "C.A.").replace("Assistente de Aluno", "Sec.").replace("Gestor(a) Pedagógico(a)", "Gestor").replace("Chef da Sala", "Chef"),
            })),
          ];
          return (
            <div className="flex flex-wrap items-center gap-1.5">
              {chips.map((chip) => {
                const active = filter === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setFilter(chip.id)}
                    className={`inline-flex items-center gap-1 h-8 px-2.5 rounded-full text-[11px] font-semibold border transition ${
                      active
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card text-foreground border-border/60 hover:bg-accent"
                    }`}
                  >
                    <span>{chip.label}</span>
                    {typeof chip.badge === "number" && chip.badge > 0 && (
                      <span
                        className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] flex items-center justify-center ${
                          active
                            ? "bg-primary-foreground/20 text-primary-foreground"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {chip.badge > 99 ? "99+" : chip.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })()}

        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Carregando contatos…</div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted/60 flex items-center justify-center mb-2">
              <UserIcon className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold">Nenhum colega disponível</p>
            <p className="text-xs text-muted-foreground mt-1">
              Quando outros usuários da sua escola forem aprovados, eles aparecerão aqui.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60 bg-card rounded-xl overflow-hidden border border-border/40">
            {filtered.map((c) => {
              const last = lastMsgs[c.user_id];
              const count = unread[c.user_id] ?? 0;
              const timeLabel = last
                ? (() => {
                    const d = new Date(last.created_at);
                    const today = new Date();
                    const sameDay =
                      d.getFullYear() === today.getFullYear() &&
                      d.getMonth() === today.getMonth() &&
                      d.getDate() === today.getDate();
                    if (sameDay) {
                      return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                    }
                    const diff = (today.getTime() - d.getTime()) / 86400000;
                    if (diff < 7) {
                      return d.toLocaleDateString("pt-BR", { weekday: "short" });
                    }
                    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
                  })()
                : "";
              const previewText = last
                ? `${last.from_me ? "Você: " : ""}${last.content}`
                : ROLE_LABELS[c.role] ?? c.role;
              return (
                <li key={c.user_id}>
                  <button
                    type="button"
                    onClick={() => openChat(c)}
                    className="w-full flex items-center gap-3 px-3 py-3 hover:bg-accent active:bg-accent/70 transition text-left"
                  >
                    <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary text-lg font-bold">
                      {(c.full_name?.[0] ?? "?").toUpperCase()}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center justify-between gap-2">
                        <span className="text-[15px] font-semibold text-foreground truncate">
                          {c.full_name}
                        </span>
                        {timeLabel && (
                          <span className={`text-[11px] shrink-0 ${count > 0 ? "text-emerald-600 font-semibold" : "text-muted-foreground"}`}>
                            {timeLabel}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center justify-between gap-2 mt-0.5">
                        <span className={`text-[13px] truncate ${count > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                          {previewText}
                        </span>
                        {count > 0 && (
                          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-emerald-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                            {count > 99 ? "99+" : count}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
