---
name: Mascote polvo em vídeo
description: Mascote AgenSchool agora é vídeo em loop (tentáculos se mexendo, cabeça parada) via componente OctopusMascot
type: design
---
O mascote polvo é exibido pelo componente `src/components/OctopusMascot.tsx`, que renderiza o vídeo
`src/assets/octopus-mascote.mp4.asset.json` em loop (autoPlay, muted, playsInline) com a imagem
`octopus-multitask.png` como poster/fallback.

Movimento aprovado: cabeça/capacete totalmente parados, somente os tentáculos se curvam, esticam e
se cruzam como se fossem pegar algo. Não usar mais animações CSS de balanço na imagem estática.

Usado em: tela de login (`Auth.tsx`, ícone pequeno e mascote grande) e `QrScan.tsx`.
