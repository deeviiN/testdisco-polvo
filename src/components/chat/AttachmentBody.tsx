import { useRef } from "react";
import { FileText } from "lucide-react";
import { useChatAttachmentUrl } from "@/lib/chatAttachmentUrl";

function isImage(name: string) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name);
}
function isVideo(name: string) {
  return /\.(mp4|webm|mov|mkv|m4v|ogv)$/i.test(name);
}

interface Props {
  rawUrl: string;
  name: string;
  className?: string;
  variant?: "chat" | "inbox";
  mediaOnly?: boolean;
}

/**
 * Renderiza um anexo (imagem / vídeo / arquivo) resolvendo a URL assinada
 * sob demanda a partir de um caminho ou URL antiga do bucket privado.
 * Se a URL expirar (onError da mídia), reassina automaticamente uma única vez.
 */
export function AttachmentBody({ rawUrl, name, className, variant = "chat", mediaOnly }: Props) {
  const { url, refresh } = useChatAttachmentUrl(rawUrl);
  const retriedRef = useRef(false);
  const loading = !url;

  const handleError = () => {
    if (retriedRef.current) return;
    retriedRef.current = true;
    refresh();
  };

  if (loading) {
    return (
      <div
        className={`animate-pulse bg-muted/50 rounded-lg ${className ?? "w-40 h-24"}`}
        aria-label="Carregando anexo"
      />
    );
  }

  if (isImage(name)) {
    const imgClass =
      variant === "chat"
        ? `max-w-full max-h-72 object-cover block ${mediaOnly ? "rounded-2xl" : "rounded-lg mb-1"}`
        : className ?? "max-w-full max-h-72 object-cover rounded-lg";
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        <img src={url} alt={name} loading="lazy" className={imgClass} onError={handleError} />
      </a>
    );
  }

  if (isVideo(name)) {
    const vidClass =
      variant === "chat"
        ? `max-w-full max-h-72 object-cover bg-black block ${mediaOnly ? "rounded-2xl" : "rounded-lg mb-1"}`
        : className ?? "max-w-full max-h-72 bg-black rounded-lg";
    return <video src={url} controls preload="metadata" className={vidClass} onError={handleError} />;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 underline break-all mb-1"
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span>{name}</span>
    </a>
  );
}
