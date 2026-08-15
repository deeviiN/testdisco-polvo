import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      screens: {
        xxs: "360px",
        xs: "380px",
      },
      fontFamily: {
        sans: ['"Inter"', 'system-ui', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0", opacity: "0" },
          to: { height: "var(--radix-accordion-content-height)", opacity: "1" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)", opacity: "1" },
          to: { height: "0", opacity: "0" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-out": {
          "0%": { opacity: "1", transform: "translateY(0)" },
          "100%": { opacity: "0", transform: "translateY(10px)" },
        },
        "scale-in": {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)" },
          "100%": { transform: "translateX(0)" },
        },
        "float": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-6px)" },
        },
        "shimmer": {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "octopus-wiggle": {
          "0%, 100%": { transform: "rotate(0deg) scale(1)" },
          "15%": { transform: "rotate(-3deg) scale(1.03)" },
          "30%": { transform: "rotate(3deg) scale(0.97)" },
          "45%": { transform: "rotate(-2deg) scale(1.02)" },
          "60%": { transform: "rotate(2deg) scale(0.98)" },
          "75%": { transform: "rotate(-1deg) scale(1.01)" },
          "90%": { transform: "rotate(1deg) scale(1)" },
        },
        "pulse-green-blue": {
          "0%, 100%": {
            backgroundColor: "hsl(95 75% 45% / 0.35)",
            borderColor: "hsl(95 80% 55% / 0.95)",
            boxShadow: "0 0 28px 6px hsl(95 80% 50% / 0.65)",
          },
          "50%": {
            backgroundColor: "hsl(212 95% 55% / 0.4)",
            borderColor: "hsl(212 100% 65% / 0.95)",
            boxShadow: "0 0 32px 8px hsl(212 95% 55% / 0.7)",
          },
        },
        "pulse-cane-green": {
          "0%, 100%": {
            backgroundColor: "hsl(140 75% 38%)",
            backgroundImage: "linear-gradient(135deg, hsl(140 80% 45%), hsl(150 85% 32%))",
            boxShadow: "0 0 14px 3px hsl(140 85% 50% / 0.7), inset 0 0 8px hsla(140, 90%, 70%, 0.55)",
            borderColor: "hsl(140 85% 60% / 1)",
          },
          "50%": {
            backgroundColor: "hsl(140 90% 50%)",
            backgroundImage: "linear-gradient(135deg, hsl(140 95% 58%), hsl(150 95% 42%))",
            boxShadow: "0 0 32px 10px hsl(140 95% 55% / 1), inset 0 0 12px hsla(140, 100%, 80%, 0.85)",
            borderColor: "hsl(140 100% 70% / 1)",
          },
        },
        "shine": {
          "0%": { transform: "translateX(-120%) skewX(-12deg)" },
          "100%": { transform: "translateX(220%) skewX(-12deg)" },
        },
        "bounce-soft": {
          "0%, 100%": { transform: "scale(1)" },
          "40%": { transform: "scale(0.96)" },
          "70%": { transform: "scale(1.02)" },
        },
        "glow-pulse": {
          "0%, 100%": { opacity: "0.7", filter: "blur(2px)" },
          "50%": { opacity: "1", filter: "blur(6px)" },
        },
        "shake-x": {
          "0%, 100%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-6px)" },
          "40%": { transform: "translateX(6px)" },
          "60%": { transform: "translateX(-4px)" },
          "80%": { transform: "translateX(4px)" },
        },
        "marquee-x": {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "theme-pulse": {
          "0%, 100%": { filter: "brightness(1) saturate(1)" },
          "50%": { filter: "brightness(1.18) saturate(1.15)" },
        },
        "theme-holo": {
          "0%, 100%": { filter: "hue-rotate(0deg) saturate(1.15) brightness(1.05)" },
          "50%": { filter: "hue-rotate(180deg) saturate(1.3) brightness(1.1)" },
        },
        "shake-x-strong": {
          "0%, 100%": { transform: "translateX(0)" },
          "10%": { transform: "translateX(-10px)" },
          "20%": { transform: "translateX(10px)" },
          "30%": { transform: "translateX(-9px)" },
          "40%": { transform: "translateX(9px)" },
          "50%": { transform: "translateX(-7px)" },
          "60%": { transform: "translateX(7px)" },
          "70%": { transform: "translateX(-5px)" },
          "80%": { transform: "translateX(5px)" },
          "90%": { transform: "translateX(-2px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.4s ease-out",
        "fade-out": "fade-out 0.3s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
        "slide-in-right": "slide-in-right 0.3s ease-out",
        "enter": "fade-in 0.4s ease-out, scale-in 0.3s ease-out",
        "float": "float 3s ease-in-out infinite",
        "shimmer": "shimmer 2s linear infinite",
        "octopus-wiggle": "octopus-wiggle 2.5s ease-in-out infinite",
        "pulse-green-blue": "pulse-green-blue 1.4s ease-in-out infinite",
        "pulse-cane-green": "pulse-cane-green 2.4s ease-in-out infinite",
        "shine": "shine 1.1s ease-out",
        "bounce-soft": "bounce-soft 0.45s ease-out",
        "glow-pulse": "glow-pulse 2.6s ease-in-out infinite",
        "marquee-x": "marquee-x 28s linear infinite",
        "shake-x": "shake-x 0.5s ease-in-out",
        "theme-pulse": "theme-pulse 1.8s ease-in-out infinite",
        "theme-holo": "theme-holo 5s linear infinite",
        "shake-x-strong": "shake-x-strong 0.7s cubic-bezier(.36,.07,.19,.97) both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
