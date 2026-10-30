import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compatible = process.env.SGF_WEB_TARGET === "compat";
const variante = compatible ? "compat" : "moderna";

export default defineConfig({
  plugins: compatible ? [react()] : [react(), tailwindcss()],
  base: `/${variante}/`,
  build: {
    outDir: path.resolve(__dirname, `dist/${variante}`),
    emptyOutDir: true,
    target: compatible ? ["firefox80", "chrome84", "safari14"] : ["firefox128", "chrome111", "safari16.4"],
  },
  resolve: { alias: {
    "@": path.resolve(__dirname, "src"),
    "sgf-estilos": path.resolve(__dirname, compatible ? "src/estilos-compat.css" : "src/estilos-modernos.css"),
    "sgf-polyfills": path.resolve(__dirname, compatible ? "src/polyfills-compat.ts" : "src/polyfills-modernos.ts"),
  } },
  server: { port: 5173, proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true } } },
});
