import { AnimatePresence, motion } from "framer-motion";

const colors: Record<string, string> = { success: "bg-emerald-600 text-white", error: "bg-red-600 text-white", info: "bg-blue-600 text-white" };

export function Toast({ toast }: { toast: { type: "success"|"error"|"info"; message: string } | null }) {
  return <AnimatePresence>{toast && <motion.div initial={{opacity:0,y:-40}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-40}} className={`fixed top-4 right-4 z-[100] px-5 py-3 rounded-lg shadow-lg text-sm font-medium ${colors[toast.type]}`}>{toast.message}</motion.div>}</AnimatePresence>;
}
