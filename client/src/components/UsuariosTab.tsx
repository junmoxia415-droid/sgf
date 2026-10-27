import { type FormEvent, useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Pencil, Plus, Trash2 } from "lucide-react";
import * as api from "../api/client.ts";
import type { Role, SessionUser, User } from "../types/api.ts";

type Props = {
  currentUser: SessionUser;
  showToast: (t: "success" | "error" | "info", m: string) => void;
  onEdited: () => void;
  onEdit?: (u: User) => void;
  refresh: number;
};

export function UsuariosTab({ currentUser, showToast, onEdited, onEdit, refresh }: Props) {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState({ username: "", password: "", name: "", role: "usuario" as Role });

  const fetchUsers = useCallback(async () => {
    const response = await api.getUsers();
    if (response.success && Array.isArray(response.data)) setUsers(response.data);
    else showToast("error", response.error || "No se pudieron cargar los usuarios.");
  }, [showToast]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers, refresh]);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.username || !form.password || !form.name) {
      showToast("error", "Complete todos los campos.");
      return;
    }

    const response = await api.createUser(form);
    if (response.success) {
      showToast("success", "Usuario creado.");
      setForm({ username: "", password: "", name: "", role: "usuario" });
      await fetchUsers();
      onEdited();
    } else {
      showToast("error", response.error || "Error al crear usuario.");
    }
  };

  const del = async (id: string) => {
    if (currentUser.id === id) {
      showToast("error", "No puede eliminar su propio usuario.");
      return;
    }
    if (!confirm("Eliminar usuario?")) return;

    const response = await api.deleteUser(id);
    if (response.success) {
      showToast("success", "Usuario eliminado.");
      await fetchUsers();
      onEdited();
    } else {
      showToast("error", response.error || "Error al eliminar usuario.");
    }
  };

  return (
    <motion.div
      key="usuarios"
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      transition={{ duration: 0.2 }}
      className="space-y-5"
    >
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5">
        <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2 text-sm">
          <Plus className="w-4 h-4 text-emerald-500" />
          Nuevo Usuario
        </h3>

        <form onSubmit={create} className="grid sm:grid-cols-4 gap-2">
          <input
            type="text"
            placeholder="Username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 outline-none"
          />
          <input
            type="text"
            placeholder="Nombre completo"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 outline-none"
          />
          <input
            type="password"
            placeholder="Contrasena"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300 outline-none"
          />
          <div className="flex gap-2">
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
              className="flex-1 px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-700 dark:text-gray-300"
            >
              <option value="usuario">Usuario</option>
              <option value="admin">Admin</option>
            </select>
            <button type="submit" className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-xl transition-colors">
              Crear
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-800/50">
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500">Usuario</th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 hidden sm:table-cell">Nombre</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">Rol</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500">Activo</th>
              <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
            {users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                  No hay usuarios registrados.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">{u.username}</td>
                  <td className="px-4 py-2.5 hidden sm:table-cell text-gray-500">{u.name}</td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.role === "admin" ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <span className={`inline-block w-2 h-2 rounded-full ${u.active === 1 ? "bg-emerald-400" : "bg-red-400"}`} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex justify-end gap-1">
                      {onEdit && (
                        <button
                          onClick={() => onEdit(u)}
                          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-blue-500 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => del(u.id)}
                        disabled={currentUser.id === u.id}
                        className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-gray-400 hover:text-red-500 transition-colors disabled:opacity-30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}
