import { type FormEvent, useState } from "react";
import { AlertCircle, LockKeyhole, Moon, Sun } from "lucide-react";
import type { HealthData } from "../types/api.ts";

type Props = {
  serverInfo: HealthData | null;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  loginError: string;
  onLogin: (u: string, p: string) => Promise<boolean>;
  onOpenDbConfig?: () => void;
  onDbChange?: () => void;
};

export function LoginScreen({ serverInfo, loginError, onLogin, theme, onToggleTheme }: Props) {
  const [form, setForm] = useState({ username: "", password: "" });
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.username || !form.password || loading) return;
    setLoading(true);
    try { await onLogin(form.username, form.password); } finally { setLoading(false); }
  };
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 to-blue-100 dark:from-slate-950 dark:to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-700 p-8 relative">
        <button type="button" onClick={onToggleTheme} aria-label={theme === "light" ? "Activar tema oscuro" : "Activar tema claro"} className="absolute top-4 right-4 p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">{theme === "light" ? <Moon size={18}/> : <Sun size={18}/>}</button>
        <div className="text-center mb-7">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-blue-600 flex items-center justify-center"><LockKeyhole className="w-8 h-8 text-white" /></div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Bienvenido a SGF</h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Inicie sesión con la cuenta que le proporcionó el administrador.</p>
          <p className="mt-3 text-xs text-slate-500">{serverInfo ? "Servidor disponible" : "Comprobando servidor"} · Sin registro público</p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          {loginError && <div className="p-3 border border-red-200 rounded-lg text-sm text-red-700 flex gap-2"><AlertCircle className="w-4 h-4" />{loginError}</div>}
          <label className="block text-sm text-slate-700 dark:text-slate-200">Usuario
            <input autoFocus autoComplete="username" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} className="mt-1 w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800" />
          </label>
          <label className="block text-sm text-slate-700 dark:text-slate-200">Contraseña
            <input type="password" autoComplete="current-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} className="mt-1 w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800" />
          </label>
          <button type="submit" disabled={loading} className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-xl">{loading ? "Entrando…" : "Entrar"}</button>
        </form>
      </div>
    </div>
  );
}
