import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: "/",
  // La salida se comprueba en Firefox 80; no implica compatibilidad con todos los navegadores antiguos.
  build: { target: ["firefox80", "chrome84", "safari14"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  server: { port: 5173, proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true } } },
});
