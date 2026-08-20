/**
 * Fundo estilo WhatsApp para a tela de mensagens.
 * Pattern repetido com o nome "AgenSchool" + ícones dos setores e profissionais.
 */
export default function ChatBackdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.07] dark:opacity-[0.10] text-foreground"
    >
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern
            id="agenschool-chat-bg"
            x="0"
            y="0"
            width="320"
            height="260"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(-12)"
          >
            {/* Nome do app repetido */}
            <text x="6" y="28" fontFamily="Inter, system-ui, sans-serif" fontWeight="800" fontSize="22" letterSpacing="-0.5" fill="currentColor">AgenSchool</text>
            <text x="170" y="70" fontFamily="Inter, system-ui, sans-serif" fontWeight="800" fontSize="22" letterSpacing="-0.5" fill="currentColor">AgenSchool</text>
            <text x="40" y="148" fontFamily="Inter, system-ui, sans-serif" fontWeight="800" fontSize="22" letterSpacing="-0.5" fill="currentColor">AgenSchool</text>
            <text x="190" y="200" fontFamily="Inter, system-ui, sans-serif" fontWeight="800" fontSize="22" letterSpacing="-0.5" fill="currentColor">AgenSchool</text>
            <text x="10" y="248" fontFamily="Inter, system-ui, sans-serif" fontWeight="800" fontSize="22" letterSpacing="-0.5" fill="currentColor">AgenSchool</text>

            <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {/* Laboratório */}
              <g transform="translate(140,8) scale(1.6)">
                <path d="M9 3h6" />
                <path d="M10 3v6L4 20a1 1 0 0 0 .9 1.5h14.2A1 1 0 0 0 20 20l-6-11V3" />
                <path d="M7 14h10" />
              </g>
              {/* Quadra */}
              <g transform="translate(270,20) scale(1.5)">
                <circle cx="12" cy="12" r="9" />
                <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
              </g>
              {/* Sala de vídeo */}
              <g transform="translate(8,60) scale(1.6)">
                <rect x="2" y="6" width="14" height="12" rx="2" />
                <path d="m22 8-6 4 6 4V8Z" />
              </g>
              {/* Informática */}
              <g transform="translate(100,90) scale(1.6)">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </g>
              {/* Pátio */}
              <g transform="translate(230,110) scale(1.6)">
                <path d="M12 2 4 14h5l-3 6h12l-3-6h5L12 2Z" />
                <path d="M12 20v2" />
              </g>
              {/* Professor */}
              <g transform="translate(280,170) scale(1.6)">
                <path d="M22 10 12 4 2 10l10 6 10-6Z" />
                <path d="M6 12v5c0 1.5 3 3 6 3s6-1.5 6-3v-5" />
              </g>
              {/* Coordenador */}
              <g transform="translate(8,170) scale(1.6)">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14Z" />
                <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
              </g>
              {/* Gestor */}
              <g transform="translate(120,210) scale(1.6)">
                <path d="M12 2 4 6v6c0 5 3.5 8.5 8 10 4.5-1.5 8-5 8-10V6l-8-4Z" />
                <path d="m9 12 2 2 4-4" />
              </g>
              {/* Secretário */}
              <g transform="translate(70,8) scale(1.5)">
                <rect x="6" y="4" width="12" height="18" rx="2" />
                <path d="M9 2h6v4H9zM9 12h6M9 16h6" />
              </g>
              {/* Chef da sala (coroa) */}
              <g transform="translate(220,228) scale(1.5)">
                <path d="M3 7l4 4 5-7 5 7 4-4-2 12H5L3 7Z" />
              </g>
            </g>
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#agenschool-chat-bg)" />
      </svg>
    </div>
  );
}
