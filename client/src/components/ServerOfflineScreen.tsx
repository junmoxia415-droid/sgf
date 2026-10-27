import { RefreshCcw, WifiOff } from "lucide-react";

export function ServerOfflineScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-6">
      <div className="max-w-lg w-full bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center"><WifiOff className="w-8 h-8 text-red-600" /></div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Servidor no disponible</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-4">No se puede conectar con el servidor central.</p>
        <ul className="text-left text-sm text-gray-500 max-w-xs mx-auto space-y-1 mb-6">
          <li>- Servidor encendido</li><li>- IP y puerto correctos</li><li>- Red LAN funcionando</li><li>- Firewall permite conexion</li>
        </ul>
        <button onClick={onRetry} className="inline-flex items-center gap-2 px-6 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"><RefreshCcw className="w-4 h-4"/>Reintentar</button>
        <p className="mt-6 text-xs text-gray-400">Sin servidor, la aplicacion no funciona.</p>
      </div>
    </div>
  );
}
