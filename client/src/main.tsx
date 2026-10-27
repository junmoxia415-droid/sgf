import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

async function bootstrap() {
  const root = document.getElementById("root");
  if (!root) {
    document.body.innerHTML = '<div style="padding:48px;text-align:center;font-family:sans-serif;"><h1 style="color:#991b1b;">SGF - Error</h1><p>Contenedor #root no encontrado.</p></div>';
    return;
  }
  try {
    const { default: App } = await import("./App");
    createRoot(root).render(<StrictMode><App/></StrictMode>);
  } catch (err: any) {
    root.innerHTML = `<div style="padding:48px;text-align:center;font-family:sans-serif;"><h1 style="color:#991b1b;">SGF - Error al iniciar</h1><p>${err.message||"Error desconocido"}</p><p style="color:#6b7280;font-size:14px;">Verifique que el servidor central este encendido.</p></div>`;
  }
}
bootstrap();
