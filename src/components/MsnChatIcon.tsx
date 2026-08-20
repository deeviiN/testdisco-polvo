import React from "react";

/**
 * Ícone estilo MSN Messenger antigo: dois bonequinhos de frente
 * um pro outro, orbitando em torno do centro mantendo-se em pé.
 */
type Props = {
  size?: number;
  className?: string;
  /** velocidade da rotação em segundos por volta */
  spinSeconds?: number;
};

export const MsnChatIcon: React.FC<Props> = ({
  size = 28,
  className,
  spinSeconds = 4,
}) => {
  const uid = React.useId().replace(/:/g, "");
  const spinName = `msnSpin_${uid}`;
  const counterName = `msnCounter_${uid}`;

  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        width: size,
        height: size,
      }}
      aria-hidden="true"
    >
      <style>{`
        @keyframes ${spinName} {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes ${counterName} {
          from { transform: rotate(0deg); }
          to   { transform: rotate(-360deg); }
        }
      `}</style>
      <svg
        viewBox="0 0 64 64"
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
        style={{ overflow: "visible" }}
      >
        <defs>
          <linearGradient id={`msn-blue-${uid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#7ec8ff" />
            <stop offset="100%" stopColor="#1f6fd0" />
          </linearGradient>
          <linearGradient id={`msn-green-${uid}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#b6f08a" />
            <stop offset="100%" stopColor="#2f9e22" />
          </linearGradient>
        </defs>

        {/* grupo que gira em torno do centro */}
        <g
          style={{
            transformOrigin: "32px 32px",
            transformBox: "view-box" as any,
            animation: `${spinName} ${spinSeconds}s linear infinite`,
          }}
        >
          {/* Boneco esquerdo (azul) — contra-rotaciona pra ficar em pé */}
          <g
            style={{
              transformOrigin: "20px 32px",
              transformBox: "view-box" as any,
              animation: `${counterName} ${spinSeconds}s linear infinite`,
            }}
          >
            <circle cx="20" cy="20" r="8"
              fill={`url(#msn-blue-${uid})`} stroke="#0a3a78" strokeWidth="1.5" />
            <circle cx="22.5" cy="19" r="1.2" fill="#fff" />
            <path
              d="M10 50 Q10 34 20 34 Q30 34 30 50 Z"
              fill={`url(#msn-blue-${uid})`}
              stroke="#0a3a78"
              strokeWidth="1.5"
            />
          </g>

          {/* Boneco direito (verde) — contra-rotaciona pra ficar em pé */}
          <g
            style={{
              transformOrigin: "44px 32px",
              transformBox: "view-box" as any,
              animation: `${counterName} ${spinSeconds}s linear infinite`,
            }}
          >
            <circle cx="44" cy="20" r="8"
              fill={`url(#msn-green-${uid})`} stroke="#1c5a13" strokeWidth="1.5" />
            <circle cx="41.5" cy="19" r="1.2" fill="#fff" />
            <path
              d="M34 50 Q34 34 44 34 Q54 34 54 50 Z"
              fill={`url(#msn-green-${uid})`}
              stroke="#1c5a13"
              strokeWidth="1.5"
            />
          </g>
        </g>
      </svg>
    </span>
  );
};

export default MsnChatIcon;
