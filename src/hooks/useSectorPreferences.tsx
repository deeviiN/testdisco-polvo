import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export interface FontOption {
  key: string;
  label: string;
  family: string;
}

export interface ColorOption {
  key: string;
  label: string;
  // HSL hue/sat for the radial gradient stops
  hueA: number; // brightest stop
  satA: number;
  lightA: number;
  hueB: number; // mid stop
  satB: number;
  lightB: number;
  hueC: number; // darkest stop
  satC: number;
  lightC: number;
}

export const FONT_OPTIONS: FontOption[] = [
  { key: "default", label: "Padrão", family: '"Plus Jakarta Sans", system-ui, sans-serif' },
  { key: "playfair", label: "Playfair", family: '"Playfair Display", serif' },
  { key: "bebas", label: "Bebas Neue", family: '"Bebas Neue", system-ui, sans-serif' },
  { key: "quicksand", label: "Quicksand", family: '"Quicksand", system-ui, sans-serif' },
];

// Paleta alinhada com os botões do painel do gestor (PANEL_COLORS)
export const COLOR_OPTIONS: ColorOption[] = [
  { key: "default",     label: "Azul",        hueA: 220, satA: 85, lightA: 32, hueB: 225, satB: 80, lightB: 20, hueC: 225, satC: 75, lightC: 12 },
  { key: "ruby",        label: "Vermelho",    hueA: 0,   satA: 82, lightA: 36, hueB: 355, satB: 80, lightB: 24, hueC: 350, satC: 70, lightC: 14 },
  { key: "verde",       label: "Verde",       hueA: 142, satA: 72, lightA: 32, hueB: 150, satB: 70, lightB: 22, hueC: 150, satC: 65, lightC: 13 },
  { key: "amarelo",     label: "Amarelo",     hueA: 50,  satA: 95, lightA: 42, hueB: 45,  satB: 90, lightB: 30, hueC: 40,  satC: 85, lightC: 18 },
  { key: "gold",        label: "Dourado",     hueA: 40,  satA: 90, lightA: 40, hueB: 32,  satB: 88, lightB: 28, hueC: 25,  satC: 80, lightC: 16 },
  { key: "ouro",        label: "Ouro",        hueA: 46,  satA: 95, lightA: 44, hueB: 40,  satB: 90, lightB: 32, hueC: 35,  satC: 85, lightC: 18 },
  { key: "cinza",       label: "Cinza",       hueA: 220, satA: 12, lightA: 42, hueB: 220, satB: 12, lightB: 28, hueC: 220, satC: 10, lightC: 16 },
  { key: "bege",        label: "Bege",        hueA: 38,  satA: 45, lightA: 50, hueB: 34,  satB: 42, lightB: 36, hueC: 30,  satC: 38, lightC: 22 },
  { key: "violet",      label: "Roxo",        hueA: 265, satA: 75, lightA: 38, hueB: 270, satB: 72, lightB: 24, hueC: 270, satC: 65, lightC: 14 },
  { key: "marrom",      label: "Marrom",      hueA: 25,  satA: 55, lightA: 32, hueB: 20,  satB: 58, lightB: 20, hueC: 18,  satC: 55, lightC: 12 },
  { key: "azul_escuro", label: "Azul Escuro", hueA: 225, satA: 80, lightA: 24, hueB: 228, satB: 82, lightB: 16, hueC: 230, satC: 78, lightC: 10 },
  { key: "rosa",        label: "Rosa",        hueA: 335, satA: 85, lightA: 45, hueB: 340, satB: 80, lightB: 32, hueC: 340, satC: 70, lightC: 18 },
  { key: "lilas",       label: "Lilás",       hueA: 285, satA: 70, lightA: 50, hueB: 280, satB: 65, lightB: 36, hueC: 275, satC: 58, lightC: 20 },
  { key: "laranja",     label: "Laranja",     hueA: 25,  satA: 95, lightA: 42, hueB: 18,  satB: 90, lightB: 30, hueC: 15,  satC: 85, lightC: 16 },
];

export type StyleMode =
  | "flat" | "glow" | "neon" | "metal" | "crystal" | "pulse" | "ember"
  | "auto" | "varnish" | "chrome" | "holo" | "carbon" | "frost" | "pearl" | "diamond"
  | "aurora" | "lava" | "ice" | "galaxy" | "sunset" | "laser" | "candy" | "velvet";

export const STYLE_MODES: { key: StyleMode; label: string }[] = [
  { key: "glow",    label: "Brilho" },
  { key: "neon",    label: "Neon" },
  { key: "laser",   label: "Laser" },
  { key: "metal",   label: "Metal" },
  { key: "crystal", label: "Cristal" },
  { key: "pulse",   label: "Pulso" },
  { key: "ember",   label: "Brasa" },
  { key: "lava",    label: "Lava" },
  { key: "ice",     label: "Gelo" },
  { key: "aurora",  label: "Aurora" },
  { key: "galaxy",  label: "Galáxia" },
  { key: "sunset",  label: "Pôr do Sol" },
  { key: "auto",    label: "Automotivo" },
  { key: "varnish", label: "Verniz" },
  { key: "chrome",  label: "Cromado" },
  { key: "holo",    label: "Holográfico" },
  { key: "carbon",  label: "Carbono" },
  { key: "frost",   label: "Vidro Fosco" },
  { key: "pearl",   label: "Madrepérola" },
  { key: "diamond", label: "Diamante" },
  { key: "candy",   label: "Caramelo" },
  { key: "velvet",  label: "Veludo" },
  { key: "flat",    label: "Padrão" },
];


export interface StyleEffects {
  idleShadow: string;
  selectedShadow: string;
  idleBorder: string;
  selectedBorder: string;
  sheen: "none" | "soft" | "strong" | "bar"; // top highlight style
  iconGlow?: string; // optional drop-shadow filter
}

export function getStyleEffects(color: ColorOption, mode: StyleMode): StyleEffects {
  const c = color;
  switch (mode) {
    case "flat":
      return {
        idleShadow: "none",
        selectedShadow: `0 0 0 3px hsla(${c.hueA}, 95%, 75%, 0.95), 0 0 28px hsla(${c.hueA}, 90%, 65%, 0.75), 0 0 60px hsla(${c.hueA}, 85%, 60%, 0.55)`,
        idleBorder: `1px solid hsla(${c.hueA}, 30%, 45%, 0.4)`,
        selectedBorder: `2px solid hsla(${c.hueA}, 80%, 70%, 0.9)`,
        sheen: "none",
      };
    case "neon":
      return {
        idleShadow: `0 0 0 1px hsla(${c.hueA}, 100%, 75%, 0.85), 0 0 12px hsla(${c.hueA}, 100%, 65%, 0.9), 0 0 28px hsla(${c.hueA}, 100%, 60%, 0.65), 0 0 60px hsla(${c.hueA}, 100%, 55%, 0.45)`,
        selectedShadow: `0 0 0 2px hsla(${c.hueA}, 100%, 80%, 1), 0 0 24px hsla(${c.hueA}, 100%, 70%, 0.95), 0 0 60px hsla(${c.hueA}, 100%, 65%, 0.85), 0 0 120px hsla(${c.hueA}, 100%, 55%, 0.65)`,
        idleBorder: `1px solid hsla(${c.hueA}, 100%, 80%, 0.7)`,
        selectedBorder: `2px solid hsla(${c.hueA}, 100%, 85%, 1)`,
        sheen: "none",
        iconGlow: `drop-shadow(0 0 6px hsla(${c.hueA}, 100%, 70%, 0.9))`,
      };
    case "metal":
      return {
        idleShadow: `inset 0 2px 1px hsla(0, 0%, 100%, 0.45), inset 0 -3px 6px hsla(${c.hueC}, 60%, 5%, 0.7), inset 0 8px 12px -8px hsla(0, 0%, 100%, 0.5), 0 4px 12px hsla(${c.hueC}, 80%, 5%, 0.6)`,
        selectedShadow: `inset 0 2px 1px hsla(0, 0%, 100%, 0.55), inset 0 -3px 6px hsla(${c.hueC}, 60%, 5%, 0.7), 0 0 0 3px hsla(${c.hueA}, 95%, 75%, 1), 0 0 30px hsla(${c.hueA}, 90%, 60%, 0.7), 0 8px 20px hsla(${c.hueC}, 80%, 5%, 0.6)`,
        idleBorder: `1px solid hsla(${c.hueA}, 40%, 55%, 0.5)`,
        selectedBorder: `2px solid hsla(${c.hueA}, 80%, 70%, 0.9)`,
        sheen: "bar",
      };
    case "crystal":
      return {
        idleShadow: `inset 0 3px 8px hsla(0, 0%, 100%, 0.35), inset 0 -1px 3px hsla(${c.hueC}, 60%, 5%, 0.4), 0 2px 14px hsla(${c.hueA}, 70%, 50%, 0.45), 0 8px 24px hsla(${c.hueC}, 80%, 5%, 0.5)`,
        selectedShadow: `inset 0 3px 10px hsla(0, 0%, 100%, 0.5), 0 0 0 3px hsla(${c.hueA}, 95%, 80%, 0.95), 0 0 40px hsla(${c.hueA}, 95%, 70%, 0.85), 0 0 80px hsla(${c.hueA}, 85%, 60%, 0.55)`,
        idleBorder: `1.5px solid hsla(0, 0%, 100%, 0.4)`,
        selectedBorder: `3px solid hsla(0, 0%, 100%, 0.7)`,
        sheen: "strong",
      };
    case "pulse":
      return {
        idleShadow: `0 0 24px hsla(${c.hueA}, 80%, 55%, 0.45), 0 0 60px hsla(${c.hueA}, 75%, 50%, 0.3), 0 8px 22px hsla(${c.hueC}, 80%, 5%, 0.6)`,
        selectedShadow: `0 0 40px hsla(${c.hueA}, 95%, 65%, 0.85), 0 0 90px hsla(${c.hueA}, 90%, 60%, 0.65), 0 0 140px hsla(${c.hueA}, 85%, 55%, 0.45), 0 0 0 3px hsla(${c.hueA}, 95%, 75%, 0.85)`,
        idleBorder: `1px solid hsla(${c.hueA}, 70%, 65%, 0.3)`,
        selectedBorder: `2px solid hsla(${c.hueA}, 90%, 75%, 0.8)`,
        sheen: "soft",
      };
    case "ember":
      return {
        idleShadow: `inset 0 -8px 18px hsla(${c.hueA}, 100%, 50%, 0.55), inset 0 3px 6px hsla(0, 0%, 100%, 0.25), 0 4px 14px hsla(${c.hueC}, 80%, 5%, 0.6), 0 0 18px hsla(${c.hueA}, 95%, 55%, 0.4)`,
        selectedShadow: `inset 0 -10px 22px hsla(${c.hueA}, 100%, 55%, 0.75), 0 0 0 3px hsla(${c.hueA}, 100%, 70%, 0.95), 0 0 40px hsla(${c.hueA}, 100%, 60%, 0.85), 0 0 90px hsla(${c.hueA}, 95%, 55%, 0.6)`,
        idleBorder: `1.5px solid hsla(${c.hueA}, 90%, 60%, 0.55)`,
        selectedBorder: `2.5px solid hsla(${c.hueA}, 100%, 75%, 0.95)`,
        sheen: "soft",
      };
    case "auto":
      // Pintura automotiva: flake metálico, reflexo curvo no topo, sombra profunda
      return {
        idleShadow: `inset 0 6px 14px hsla(0, 0%, 100%, 0.45), inset 0 -10px 20px hsla(${c.hueC}, 70%, 4%, 0.75), inset 0 0 30px hsla(${c.hueA}, 80%, 50%, 0.35), 0 6px 18px hsla(${c.hueC}, 80%, 5%, 0.65), 0 14px 32px hsla(${c.hueC}, 70%, 5%, 0.55)`,
        selectedShadow: `inset 0 8px 16px hsla(0, 0%, 100%, 0.6), inset 0 -12px 24px hsla(${c.hueC}, 70%, 4%, 0.8), 0 0 0 3px hsla(${c.hueA}, 95%, 78%, 1), 0 0 36px hsla(${c.hueA}, 95%, 65%, 0.85), 0 16px 36px hsla(${c.hueC}, 70%, 5%, 0.6)`,
        idleBorder: `1.5px solid hsla(${c.hueA}, 50%, 60%, 0.5)`,
        selectedBorder: `2.5px solid hsla(${c.hueA}, 90%, 75%, 0.95)`,
        sheen: "strong",
      };
    case "varnish":
      // Verniz/laca: highlight superior nítido, wet look
      return {
        idleShadow: `inset 0 10px 18px -6px hsla(0, 0%, 100%, 0.55), inset 0 -2px 6px hsla(${c.hueC}, 70%, 5%, 0.55), 0 4px 14px hsla(${c.hueC}, 70%, 5%, 0.55)`,
        selectedShadow: `inset 0 12px 22px -6px hsla(0, 0%, 100%, 0.7), 0 0 0 3px hsla(${c.hueA}, 95%, 78%, 0.95), 0 0 32px hsla(${c.hueA}, 90%, 65%, 0.8), 0 8px 22px hsla(${c.hueC}, 70%, 5%, 0.55)`,
        idleBorder: `1px solid hsla(${c.hueA}, 60%, 65%, 0.45)`,
        selectedBorder: `2px solid hsla(${c.hueA}, 90%, 78%, 0.9)`,
        sheen: "strong",
      };
    case "chrome":
      // Cromado espelhado: highlights claros e escuros alternados
      return {
        idleShadow: `inset 0 8px 14px hsla(0, 0%, 100%, 0.6), inset 0 -8px 14px hsla(0, 0%, 100%, 0.25), inset 0 0 0 1px hsla(0, 0%, 100%, 0.35), 0 6px 18px hsla(${c.hueC}, 60%, 5%, 0.6)`,
        selectedShadow: `inset 0 10px 16px hsla(0, 0%, 100%, 0.75), inset 0 -10px 16px hsla(0, 0%, 100%, 0.3), 0 0 0 3px hsla(${c.hueA}, 95%, 80%, 1), 0 0 36px hsla(${c.hueA}, 90%, 70%, 0.8), 0 8px 22px hsla(${c.hueC}, 60%, 5%, 0.55)`,
        idleBorder: `1.5px solid hsla(0, 0%, 100%, 0.6)`,
        selectedBorder: `2.5px solid hsla(0, 0%, 100%, 0.85)`,
        sheen: "bar",
        iconGlow: `drop-shadow(0 1px 2px hsla(0, 0%, 0%, 0.45))`,
      };
    case "holo":
      // Holográfico iridescente
      return {
        idleShadow: `0 0 14px hsla(300, 90%, 70%, 0.45), 0 0 22px hsla(180, 90%, 65%, 0.4), 0 0 30px hsla(260, 90%, 70%, 0.4), inset 0 2px 6px hsla(0, 0%, 100%, 0.35), 0 6px 18px hsla(${c.hueC}, 70%, 5%, 0.55)`,
        selectedShadow: `0 0 0 3px hsla(300, 95%, 80%, 0.85), 0 0 30px hsla(180, 100%, 70%, 0.85), 0 0 60px hsla(260, 100%, 70%, 0.75), 0 0 90px hsla(330, 100%, 70%, 0.5)`,
        idleBorder: `1.5px solid hsla(280, 90%, 75%, 0.55)`,
        selectedBorder: `2.5px solid hsla(180, 95%, 80%, 0.9)`,
        sheen: "soft",
        iconGlow: `drop-shadow(0 0 4px hsla(300, 95%, 75%, 0.7))`,
      };
    case "carbon":
      // Fibra de carbono: brilho fosco com textura sutil
      return {
        idleShadow: `inset 0 1px 0 hsla(0, 0%, 100%, 0.15), inset 0 -2px 6px hsla(0, 0%, 0%, 0.6), 0 3px 10px hsla(0, 0%, 0%, 0.55)`,
        selectedShadow: `inset 0 1px 0 hsla(0, 0%, 100%, 0.2), 0 0 0 3px hsla(${c.hueA}, 90%, 65%, 0.9), 0 0 24px hsla(${c.hueA}, 85%, 55%, 0.7), 0 6px 18px hsla(0, 0%, 0%, 0.6)`,
        idleBorder: `1px solid hsla(0, 0%, 0%, 0.55)`,
        selectedBorder: `2px solid hsla(${c.hueA}, 90%, 70%, 0.85)`,
        sheen: "none",
      };
    case "frost":
      // Vidro fosco / glassmorphism
      return {
        idleShadow: `inset 0 1px 0 hsla(0, 0%, 100%, 0.45), inset 0 0 20px hsla(0, 0%, 100%, 0.12), 0 4px 16px hsla(${c.hueC}, 60%, 5%, 0.35)`,
        selectedShadow: `inset 0 1px 0 hsla(0, 0%, 100%, 0.6), 0 0 0 2px hsla(${c.hueA}, 90%, 80%, 0.85), 0 0 28px hsla(${c.hueA}, 85%, 70%, 0.65), 0 6px 22px hsla(${c.hueC}, 60%, 5%, 0.4)`,
        idleBorder: `1.5px solid hsla(0, 0%, 100%, 0.45)`,
        selectedBorder: `2.5px solid hsla(0, 0%, 100%, 0.75)`,
        sheen: "soft",
      };
    case "pearl":
      // Madrepérola: branco perolado, reflexos arco-íris suaves
      return {
        idleShadow: `inset 0 4px 10px hsla(0, 0%, 100%, 0.55), inset 0 -3px 8px hsla(${c.hueC}, 40%, 30%, 0.35), 0 0 14px hsla(${c.hueA}, 60%, 75%, 0.4), 0 6px 16px hsla(${c.hueC}, 60%, 10%, 0.45)`,
        selectedShadow: `inset 0 5px 12px hsla(0, 0%, 100%, 0.7), 0 0 0 3px hsla(${c.hueA}, 70%, 85%, 0.9), 0 0 24px hsla(330, 80%, 80%, 0.55), 0 0 40px hsla(200, 80%, 80%, 0.45), 0 0 60px hsla(${c.hueA}, 80%, 75%, 0.55)`,
        idleBorder: `1.5px solid hsla(${c.hueA}, 50%, 85%, 0.55)`,
        selectedBorder: `2.5px solid hsla(0, 0%, 100%, 0.85)`,
        sheen: "strong",
      };
    case "diamond":
      // Diamante: facetas cintilantes
      return {
        idleShadow: `inset 0 3px 8px hsla(0, 0%, 100%, 0.5), inset 0 -2px 5px hsla(${c.hueC}, 60%, 5%, 0.45), 0 0 10px hsla(0, 0%, 100%, 0.4), 0 0 18px hsla(${c.hueA}, 80%, 70%, 0.45), 0 6px 18px hsla(${c.hueC}, 70%, 5%, 0.55)`,
        selectedShadow: `inset 0 4px 10px hsla(0, 0%, 100%, 0.7), 0 0 0 3px hsla(0, 0%, 100%, 0.85), 0 0 24px hsla(0, 0%, 100%, 0.7), 0 0 50px hsla(${c.hueA}, 95%, 80%, 0.8), 0 0 90px hsla(${c.hueA}, 90%, 70%, 0.55)`,
        idleBorder: `1.5px solid hsla(0, 0%, 100%, 0.55)`,
        selectedBorder: `3px solid hsla(0, 0%, 100%, 0.95)`,
        sheen: "strong",
        iconGlow: `drop-shadow(0 0 4px hsla(0, 0%, 100%, 0.9))`,
      };
    case "aurora":
      // Aurora boreal: faixas verde/ciano/violeta dançando
      return {
        idleShadow: `0 0 16px hsla(160, 90%, 60%, 0.5), 0 0 30px hsla(190, 90%, 60%, 0.4), 0 0 50px hsla(270, 85%, 65%, 0.4), inset 0 2px 6px hsla(0, 0%, 100%, 0.3)`,
        selectedShadow: `0 0 0 3px hsla(160, 95%, 75%, 0.9), 0 0 30px hsla(160, 95%, 65%, 0.85), 0 0 60px hsla(190, 95%, 65%, 0.75), 0 0 100px hsla(270, 90%, 70%, 0.6)`,
        idleBorder: `1.5px solid hsla(160, 80%, 70%, 0.55)`,
        selectedBorder: `2.5px solid hsla(190, 95%, 80%, 0.95)`,
        sheen: "soft",
        iconGlow: `drop-shadow(0 0 5px hsla(160, 95%, 70%, 0.8))`,
      };
    case "lava":
      // Lava: laranja/vermelho incandescente saindo de baixo
      return {
        idleShadow: `inset 0 -14px 24px hsla(15, 100%, 55%, 0.65), inset 0 -22px 36px hsla(40, 100%, 55%, 0.45), inset 0 3px 6px hsla(0, 0%, 100%, 0.2), 0 0 22px hsla(15, 100%, 55%, 0.55), 0 6px 18px hsla(0, 80%, 8%, 0.6)`,
        selectedShadow: `inset 0 -18px 30px hsla(15, 100%, 60%, 0.8), inset 0 -28px 44px hsla(40, 100%, 60%, 0.55), 0 0 0 3px hsla(20, 100%, 70%, 0.95), 0 0 40px hsla(15, 100%, 60%, 0.9), 0 0 90px hsla(0, 100%, 55%, 0.7)`,
        idleBorder: `1.5px solid hsla(20, 100%, 65%, 0.6)`,
        selectedBorder: `2.5px solid hsla(15, 100%, 75%, 0.95)`,
        sheen: "soft",
        iconGlow: `drop-shadow(0 0 6px hsla(20, 100%, 65%, 0.9))`,
      };
    case "ice":
      // Gelo: azul claro cristalino com brilho frio
      return {
        idleShadow: `inset 0 3px 10px hsla(200, 100%, 90%, 0.55), inset 0 -2px 6px hsla(210, 80%, 30%, 0.35), 0 0 14px hsla(195, 100%, 75%, 0.55), 0 0 26px hsla(200, 95%, 65%, 0.4), 0 6px 16px hsla(220, 70%, 10%, 0.45)`,
        selectedShadow: `inset 0 4px 12px hsla(195, 100%, 95%, 0.75), 0 0 0 3px hsla(190, 100%, 80%, 0.95), 0 0 32px hsla(195, 100%, 75%, 0.85), 0 0 60px hsla(210, 95%, 70%, 0.6), 0 0 100px hsla(220, 90%, 65%, 0.4)`,
        idleBorder: `1.5px solid hsla(195, 90%, 80%, 0.6)`,
        selectedBorder: `2.5px solid hsla(190, 100%, 88%, 0.95)`,
        sheen: "strong",
        iconGlow: `drop-shadow(0 0 5px hsla(195, 100%, 80%, 0.85))`,
      };
    case "galaxy":
      // Galáxia: violeta profundo com pontos estelares
      return {
        idleShadow: `0 0 18px hsla(265, 85%, 55%, 0.55), 0 0 36px hsla(290, 80%, 50%, 0.4), inset 0 2px 6px hsla(0, 0%, 100%, 0.25), inset 0 -4px 12px hsla(260, 90%, 8%, 0.7), 0 6px 18px hsla(260, 80%, 5%, 0.65)`,
        selectedShadow: `0 0 0 3px hsla(280, 95%, 78%, 0.95), 0 0 36px hsla(265, 95%, 65%, 0.9), 0 0 70px hsla(290, 95%, 60%, 0.75), 0 0 120px hsla(310, 90%, 60%, 0.55)`,
        idleBorder: `1.5px solid hsla(275, 80%, 70%, 0.55)`,
        selectedBorder: `2.5px solid hsla(285, 95%, 82%, 0.95)`,
        sheen: "soft",
        iconGlow: `drop-shadow(0 0 6px hsla(280, 95%, 75%, 0.85))`,
      };
    case "sunset":
      // Pôr do sol: laranja → rosa → roxo
      return {
        idleShadow: `0 0 16px hsla(20, 100%, 60%, 0.5), 0 0 30px hsla(340, 95%, 65%, 0.4), 0 0 48px hsla(280, 85%, 60%, 0.35), inset 0 2px 6px hsla(0, 0%, 100%, 0.3)`,
        selectedShadow: `0 0 0 3px hsla(25, 100%, 75%, 0.95), 0 0 32px hsla(20, 100%, 65%, 0.85), 0 0 64px hsla(340, 100%, 65%, 0.7), 0 0 110px hsla(280, 95%, 60%, 0.55)`,
        idleBorder: `1.5px solid hsla(25, 90%, 70%, 0.6)`,
        selectedBorder: `2.5px solid hsla(20, 100%, 78%, 0.95)`,
        sheen: "soft",
        iconGlow: `drop-shadow(0 0 5px hsla(20, 100%, 70%, 0.85))`,
      };
    case "laser":
      // Laser: feixe extremamente fino e ultra-saturado
      return {
        idleShadow: `0 0 0 1px hsla(${c.hueA}, 100%, 85%, 1), 0 0 6px hsla(${c.hueA}, 100%, 70%, 0.95), 0 0 16px hsla(${c.hueA}, 100%, 60%, 0.85), 0 0 40px hsla(${c.hueA}, 100%, 55%, 0.7), 0 0 80px hsla(${c.hueA}, 100%, 50%, 0.5)`,
        selectedShadow: `0 0 0 2px hsla(${c.hueA}, 100%, 92%, 1), 0 0 12px hsla(${c.hueA}, 100%, 80%, 1), 0 0 30px hsla(${c.hueA}, 100%, 70%, 0.95), 0 0 70px hsla(${c.hueA}, 100%, 60%, 0.85), 0 0 140px hsla(${c.hueA}, 100%, 55%, 0.7)`,
        idleBorder: `1px solid hsla(${c.hueA}, 100%, 90%, 0.95)`,
        selectedBorder: `2px solid hsla(${c.hueA}, 100%, 95%, 1)`,
        sheen: "none",
        iconGlow: `drop-shadow(0 0 8px hsla(${c.hueA}, 100%, 75%, 1))`,
      };
    case "candy":
      // Caramelo/doce: highlight grande, brilho fofo e açucarado
      return {
        idleShadow: `inset 0 8px 14px hsla(0, 0%, 100%, 0.55), inset 0 -4px 10px hsla(${c.hueC}, 70%, 20%, 0.5), 0 4px 14px hsla(${c.hueA}, 80%, 55%, 0.45), 0 8px 20px hsla(${c.hueC}, 70%, 10%, 0.5)`,
        selectedShadow: `inset 0 10px 18px hsla(0, 0%, 100%, 0.7), 0 0 0 3px hsla(${c.hueA}, 95%, 80%, 0.95), 0 0 28px hsla(${c.hueA}, 95%, 70%, 0.85), 0 0 60px hsla(${c.hueA}, 90%, 65%, 0.6)`,
        idleBorder: `1.5px solid hsla(${c.hueA}, 80%, 75%, 0.6)`,
        selectedBorder: `2.5px solid hsla(${c.hueA}, 95%, 85%, 0.95)`,
        sheen: "strong",
      };
    case "velvet":
      // Veludo: superfície macia e profunda, brilho discreto nas bordas
      return {
        idleShadow: `inset 0 2px 6px hsla(0, 0%, 100%, 0.15), inset 0 -6px 16px hsla(${c.hueC}, 70%, 5%, 0.7), 0 0 12px hsla(${c.hueA}, 70%, 45%, 0.35), 0 6px 18px hsla(${c.hueC}, 70%, 5%, 0.6)`,
        selectedShadow: `inset 0 2px 6px hsla(0, 0%, 100%, 0.2), inset 0 -8px 20px hsla(${c.hueC}, 70%, 5%, 0.75), 0 0 0 3px hsla(${c.hueA}, 85%, 65%, 0.9), 0 0 28px hsla(${c.hueA}, 85%, 55%, 0.75), 0 0 60px hsla(${c.hueA}, 80%, 50%, 0.5)`,
        idleBorder: `1px solid hsla(${c.hueA}, 60%, 45%, 0.55)`,
        selectedBorder: `2px solid hsla(${c.hueA}, 85%, 70%, 0.9)`,
        sheen: "none",
      };
    case "glow":
    default:

      return {
        idleShadow: `inset 0 1.5px 5px hsla(${c.hueA}, 90%, 75%, 0.35), inset 0 -2px 8px hsla(${c.hueC}, 85%, 5%, 0.55), 0 0 14px hsla(${c.hueA}, 80%, 50%, 0.35), 0 6px 18px hsla(${c.hueC}, 80%, 5%, 0.7)`,
        selectedShadow: `0 0 0 4px hsla(${c.hueA}, 95%, 75%, 1), 0 0 50px hsla(${c.hueA}, 90%, 65%, 0.95), 0 0 80px hsla(${c.hueA}, 85%, 60%, 0.85), 0 0 120px hsla(${c.hueA}, 80%, 55%, 0.7), 0 0 160px hsla(${c.hueA}, 75%, 50%, 0.5), 0 8px 30px hsla(${c.hueC}, 70%, 10%, 0.6)`,
        idleBorder: `1.5px solid hsla(${c.hueA}, 90%, 70%, 0.55)`,
        selectedBorder: `3px solid hsla(${c.hueA}, 95%, 75%, 0.9)`,
        sheen: "soft",
      };
  }
}

interface SectorPreferencesContextValue {
  fontKey: string;
  colorKey: string;
  glowEnabled: boolean; // derived: styleMode !== 'flat'
  styleMode: StyleMode;
  setFontKey: (k: string) => void;
  setColorKey: (k: string) => void;
  setGlowEnabled: (v: boolean) => void;
  setStyleMode: (m: StyleMode) => void;
  cycleStyleMode: () => void;
  font: FontOption;
  color: ColorOption;
}

const SectorPreferencesContext = createContext<SectorPreferencesContextValue | null>(null);

export function useSectorPreferences() {
  const ctx = useContext(SectorPreferencesContext);
  if (!ctx) throw new Error("useSectorPreferences must be used within SectorPreferencesProvider");
  return ctx;
}

const FONT_STORAGE_KEY = "sectors-font-key";
const COLOR_STORAGE_KEY = "sectors-color-key";
const GLOW_STORAGE_KEY = "sectors-glow-enabled";
const STYLE_MODE_KEY = "sectors-style-mode";

// Inject Google Fonts once for the non-default options
function ensureFontsLoaded() {
  if (typeof document === "undefined") return;
  const id = "sectors-google-fonts";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?" +
    [
      "family=Quicksand:wght@400;700",
      "family=Bebas+Neue",
      "family=Playfair+Display:wght@400;700;800",
    ].join("&") +
    "&display=swap";
  document.head.appendChild(link);
}

export function SectorPreferencesProvider({ children }: { children: ReactNode }) {
  const [fontKey, setFontKeyState] = useState<string>(() => {
    try {
      return localStorage.getItem(FONT_STORAGE_KEY) || "default";
    } catch {
      return "default";
    }
  });
  const [colorKey, setColorKeyState] = useState<string>(() => {
    try {
      return localStorage.getItem(COLOR_STORAGE_KEY) || "default";
    } catch {
      return "default";
    }
  });
  const [styleMode, setStyleModeState] = useState<StyleMode>(() => {
    try {
      const m = localStorage.getItem(STYLE_MODE_KEY) as string | null;
      if (m && STYLE_MODES.some((s) => s.key === m)) return m as StyleMode;
      if (m === "compact") return "glow";
      const g = localStorage.getItem(GLOW_STORAGE_KEY);
      if (g === "0") return "flat";
      return "glow";
    } catch {
      return "glow";
    }
  });
  const glowEnabled = styleMode !== "flat";

  const color = COLOR_OPTIONS.find((c) => c.key === colorKey) || COLOR_OPTIONS[0];

  // Sync global classes on <html>
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("glow-off", styleMode === "flat");
    document.documentElement.classList.remove("neon-mode");
  }, [styleMode]);

  // Inject CSS variables with the chosen color theme so any button across the app
  // can opt-in to the same gradient + glow used by the sector buttons.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const c = color;
    const grad = `linear-gradient(145deg, hsla(${c.hueA}, ${c.satA}%, ${c.lightA}%, 1), hsla(${c.hueB}, ${c.satB}%, ${c.lightB}%, 1))`;
    const gradSel = `radial-gradient(circle at 30% 25%, hsla(${c.hueA}, ${c.satA + 10}%, ${c.lightA + 12}%, 1) 0%, hsla(${c.hueB}, ${c.satB + 5}%, ${c.lightB + 6}%, 1) 60%, hsla(${c.hueC}, ${c.satC + 10}%, ${c.lightC + 4}%, 1) 100%)`;
    const solid = `hsl(${c.hueA}, ${c.satA}%, ${c.lightA + 4}%)`;
    const glow = `0 0 16px hsla(${c.hueA}, ${c.satA}%, ${c.lightA + 10}%, 0.55), 0 4px 16px hsla(${c.hueC}, ${c.satC}%, ${c.lightC}%, 0.45), inset 0 1px 0 hsla(0, 0%, 100%, 0.18)`;
    const border = `1px solid hsla(${c.hueA}, 30%, 60%, 0.35)`;
    root.style.setProperty("--sector-grad", grad);
    root.style.setProperty("--sector-grad-selected", gradSel);
    root.style.setProperty("--sector-solid", solid);
    root.style.setProperty("--sector-glow", glow);
    root.style.setProperty("--sector-border", border);
  }, [color]);

  useEffect(() => {
    ensureFontsLoaded();
  }, []);

  const setFontKey = (k: string) => {
    setFontKeyState(k);
    try { localStorage.setItem(FONT_STORAGE_KEY, k); } catch { /* ignore */ }
  };
  const setColorKey = (k: string) => {
    setColorKeyState(k);
    try { localStorage.setItem(COLOR_STORAGE_KEY, k); } catch { /* ignore */ }
  };
  const setStyleMode = (m: StyleMode) => {
    setStyleModeState(m);
    try {
      localStorage.setItem(STYLE_MODE_KEY, m);
      localStorage.setItem(GLOW_STORAGE_KEY, m === "glow" ? "1" : "0");
    } catch { /* ignore */ }
  };
  const setGlowEnabled = (v: boolean) => setStyleMode(v ? "glow" : "flat");
  const cycleStyleMode = () => {
    const idx = STYLE_MODES.findIndex((s) => s.key === styleMode);
    const next = STYLE_MODES[(idx + 1) % STYLE_MODES.length].key;
    setStyleMode(next);
  };

  const font = FONT_OPTIONS.find((f) => f.key === fontKey) || FONT_OPTIONS[0];

  return (
    <SectorPreferencesContext.Provider value={{ fontKey, colorKey, glowEnabled, styleMode, setFontKey, setColorKey, setGlowEnabled, setStyleMode, cycleStyleMode, font, color }}>
      {children}
    </SectorPreferencesContext.Provider>
  );
}
