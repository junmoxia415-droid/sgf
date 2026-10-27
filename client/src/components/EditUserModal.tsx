import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import * as api from "../api/client.ts";
import type { Role, User } from "../types/api.ts";

type Props = { user: User; onClose: () => void; onSaved: () => void; showToast: (t:"success"|"error"|"info",m:string)=>void };

export function EditUserModal({ user, onClose, onSaved, showToast }: Props) {
  const [form, setForm] = useState({ name: user.name, role: user.role, active: user.active===1, password: "" });

  const save = async () => {
    const body: Record<string,unknown> = { name: form.name, role: form.role, active: form.active };
    if (form.password) body.password = form.password;
    const r = await api.updateUser(user.id, body);
    if (r.success) { showToast("success","Usuario actualizado."); onSaved(); onClose(); }
    else showToast("error", r.error||"Error.");
  };

  return (
    <AnimatePresence><motion.div initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <motion.div initial={{scale:0.96}} animate={{scale:1}} exit={{scale:0.96}} onClick={e=>e.stopPropagation()} className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-lg font-semibold">Editar: {user.username}</h3>
        <input className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-sm" placeholder="Nombre completo" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
        <select value={form.role} onChange={e=>setForm({...form,role:e.target.value as Role})} className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-sm"><option value="usuario">Usuario</option><option value="admin">Administrador</option></select>
        <input type="password" className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-sm" placeholder="Nueva contrasena (dejar vacio)" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/>
        <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})} className="w-4 h-4 rounded text-emerald-600"/>Usuario activo</label>
        <div className="flex justify-end gap-2 pt-2"><button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">Cancelar</button><button onClick={save} className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm">Guardar</button></div>
      </motion.div>
    </motion.div></AnimatePresence>
  );
}
