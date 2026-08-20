import octopusVideoAsset from "@/assets/octopus-mascote.mp4.asset.json";
import octopusImageAsset from "@/assets/octopus-multitask.png.asset.json";

const videoUrl = octopusVideoAsset.url;
const posterUrl = octopusImageAsset.url;

/**
 * Mascote polvo animado (tentáculos se mexendo, cabeça parada).
 * Usa o vídeo em loop, com a imagem estática como poster/fallback.
 */
export default function OctopusMascot({
  className = "",
  alt = "Mascote AgenSchool",
}: {
  className?: string;
  alt?: string;
}) {
  return (
    <video
      src={videoUrl}
      poster={posterUrl}
      aria-label={alt}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      disablePictureInPicture
      className={className}
    />
  );
}
