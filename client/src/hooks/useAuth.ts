import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "../api/client.ts";
import type { SessionUser } from "../types/api.ts";

export function useAuth() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);
  const userRef = useRef<SessionUser | null>(null);

  const clearSession = useCallback((message = "") => {
    api.setAuthToken(null);
    setUser(null);
    userRef.current = null;
    if (message) setError(message);
  }, []);

  const login = useCallback(async (username: string, password: string, machineId: string) => {
    setError("");
    const response = await api.login(username, password, machineId);
    if (!response.success || !response.data) {
      setError(response.error || "Error de autenticacion.");
      return false;
    }
    api.setAuthToken(response.data.token);
    setUser(response.data.user);
    userRef.current = response.data.user;
    return true;
  }, []);

  const logout = useCallback(async () => {
    await api.logout();
    clearSession("");
  }, [clearSession]);

  useEffect(() => {
    const restore = async () => {
      const token = api.getAuthToken();
      if (!token) {
        setChecking(false);
        return;
      }
      const response = await api.verifySession();
      if (response.success && response.data) {
        setUser(response.data);
        userRef.current = response.data;
        setError("");
      } else {
        clearSession("");
      }
      setChecking(false);
    };

    const onExpired = () => clearSession("Sesion expirada.");
    const onOffline = () => {
      if (userRef.current) clearSession("El servidor se desconecto. Debe iniciar sesion nuevamente.");
      else api.setAuthToken(null);
    };
    const onRestarted = () => clearSession("El servidor fue reiniciado. Debe iniciar sesion nuevamente.");

    void restore();
    window.addEventListener("sgf:session-expired", onExpired);
    window.addEventListener("sgf:server-offline", onOffline);
    window.addEventListener("sgf:server-restarted", onRestarted);

    return () => {
      window.removeEventListener("sgf:session-expired", onExpired);
      window.removeEventListener("sgf:server-offline", onOffline);
      window.removeEventListener("sgf:server-restarted", onRestarted);
    };
  }, [clearSession]);

  return { user, error, checking, login, logout, setError };
}
