import { useNavigate } from "react-router-dom";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useInbox, type InboxAudience } from "@/hooks/useInbox";
import { useSchoolMessagesUnread } from "@/hooks/useSchoolMessagesUnread";
import MsnChatIcon from "@/components/MsnChatIcon";

type Props = {
  audience: InboxAudience;
  to: string;
  title?: string;
  enabled?: boolean;
  className?: string;
};

const tone: Record<InboxAudience, string> = {
  admin: "bg-amber-500/15 text-amber-300 hover:bg-amber-500/25 hover:text-amber-200 border-amber-500/20",
  gestor: "bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25 hover:text-emerald-100 border-emerald-500/20",
  user: "bg-sky-500/15 text-sky-200 hover:bg-sky-500/25 hover:text-sky-100 border-sky-500/20",
};

export default function InboxBadge({ audience, to, title = "Caixa de mensagens", enabled = true, className }: Props) {
  const navigate = useNavigate();
  const { unreadCount, markAllRead } = useInbox(audience, enabled && audience !== "user");
  const { unread: chatUnread, markAllSeen } = useSchoolMessagesUnread(enabled && audience === "user");

  if (!enabled) return null;

  const count = audience === "user" ? chatUnread : unreadCount;
  const tipLine =
    count > 0
      ? `${count} ${count === 1 ? "nova mensagem" : "novas mensagens"}`
      : "Nenhuma mensagem nova";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`${title} — ${tipLine}`}
            onClick={() => {
              if (audience === "user") markAllSeen();
              else markAllRead();
              navigate(to);
            }}
            className={`relative rounded-lg h-9 w-9 shrink-0 border transition-all ${tone[audience]} ${className ?? ""}`}
          >
            {audience === "user" ? <MsnChatIcon size={24} /> : <Inbox className="h-4 w-4" />}
            {count > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center animate-pulse ring-2 ring-black/40">
                {count > 9 ? "9+" : count}
              </span>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <p className="font-semibold">{tipLine}</p>
          <p className="text-muted-foreground">Abrir {title.toLowerCase()}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

