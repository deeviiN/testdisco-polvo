import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const useRemoteAppRefresh = () => {
  useEffect(() => {
    console.log("Iniciando escuta de comandos remotos...");

    const channel = supabase
      .channel('app-remote-commands')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'app_remote_commands',
          filter: "command_type=eq.REFRESH_ALL"
        },
        (payload) => {
          console.log("Comando de atualização remota recebido!", payload);
          toast.info("Atualização recebida. Recarregando agora...", { duration: 1200 });
          const force = (window as unknown as { __forceAppUpdate?: () => Promise<void> }).__forceAppUpdate;
          if (force) void force();
          else window.location.reload();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
};
