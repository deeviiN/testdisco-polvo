import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  // Build version: short timestamp DDMM.HHMM (UTC) — easy to compare across devices
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const buildVersion = `${pad(now.getUTCDate())}${pad(now.getUTCMonth() + 1)}.${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}`;
  const buildTimestamp = now.getTime();
  const versionAsset = JSON.stringify(
    { version: buildVersion, buildTime: buildTimestamp, generatedAt: now.toISOString() },
    null,
    2,
  );
  const versionJsonPlugin: Plugin = {
    name: "app-version-json",
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "version.json", source: versionAsset });
    },
  };
  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(buildVersion),
      __APP_BUILD_TIME__: JSON.stringify(buildTimestamp),
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      versionJsonPlugin,
      VitePWA({
        selfDestroying: false,
        injectRegister: false,
        registerType: "autoUpdate",
        devOptions: {
          enabled: false,
        },
        includeAssets: ["favicon-octopus.ico", "apple-touch-icon-octopus.png"],
        workbox: {
          navigateFallback: null,
          navigateFallbackDenylist: [/^\/~oauth/],
          globPatterns: ["**/*.{png,ico,svg,webp,jpg,jpeg}"],
          cleanupOutdatedCaches: true,
          skipWaiting: true,
          clientsClaim: true,
          importScripts: ["/push-sw.js"],
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkOnly",
            },
            {
              urlPattern: ({ request }) => ["script", "style", "worker"].includes(request.destination),
              handler: "NetworkOnly",
            },
          ],
        },
        manifest: {
          name: "Agendamento de Ambiente Escolar",
          short_name: "Agendamento Escolar",
          description: "Agendamento de Ambiente Escolar para escolas",
          theme_color: "#1a8a5c",
          background_color: "#f7f8fa",
          display: "standalone",
          orientation: "portrait",
          start_url: "/",
          icons: [
            {
              src: "/app-icon-octopus-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/app-icon-octopus-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/app-icon-octopus-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
      }),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
