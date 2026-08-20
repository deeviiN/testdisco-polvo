import { Phone, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCall } from "./CallProvider";

type Props = {
  /** If provided, starts a 1:1 DM call. Omit for group call (school). */
  dmUserId?: string;
  dmUserName?: string;
  /** Compact = icon-only h-9 (used in header). */
  size?: "default" | "sm";
};

/**
 * Render two buttons: voice + video.
 * - With dmUserId/dmUserName -> starts DM call
 * - Without -> starts group school call
 */
export default function CallButtons({ dmUserId, dmUserName, size = "sm" }: Props) {
  const { startDmCall, startGroupCall, status } = useCall();
  const disabled = status !== "idle";
  const h = size === "sm" ? "h-9 w-9" : "h-11 w-11";

  const onAudio = () => {
    if (dmUserId) startDmCall(dmUserId, dmUserName ?? "Contato", "audio");
    else startGroupCall("audio");
  };
  const onVideo = () => {
    if (dmUserId) startDmCall(dmUserId, dmUserName ?? "Contato", "video");
    else startGroupCall("video");
  };

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onAudio}
        disabled={disabled}
        className={`${h} shrink-0 text-green-600 hover:bg-green-600/10`}
        aria-label="Chamada de voz"
        title="Chamada de voz"
      >
        <Phone className="h-5 w-5" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onVideo}
        disabled={disabled}
        className={`${h} shrink-0 text-blue-600 hover:bg-blue-600/10`}
        aria-label="Chamada de vídeo"
        title="Chamada de vídeo"
      >
        <Video className="h-5 w-5" />
      </Button>
    </div>
  );
}
