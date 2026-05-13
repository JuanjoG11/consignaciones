import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw, X } from 'lucide-react';

function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ' + r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  if (!offlineReady && !needRefresh) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[9999] animate-in fade-in slide-in-from-bottom-10 duration-500">
      <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 p-6 rounded-2xl shadow-2xl max-w-sm flex flex-col gap-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h3 className="text-white font-semibold text-lg flex items-center gap-2">
              <RefreshCw className={`w-5 h-5 text-blue-400 ${needRefresh ? 'animate-spin-slow' : ''}`} />
              {offlineReady ? 'App Lista' : 'Actualización Disponible'}
            </h3>
            <p className="text-slate-400 text-sm mt-1 leading-relaxed">
              {offlineReady 
                ? 'La aplicación ya se puede usar sin conexión a internet.' 
                : 'Hay una nueva versión de ConsigControl lista para instalar.'}
            </p>
          </div>
          <button 
            onClick={close}
            className="p-1 hover:bg-slate-800 rounded-lg transition-colors text-slate-500 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        {needRefresh && (
          <button
            onClick={() => updateServiceWorker(true)}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-medium py-2.5 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20"
          >
            Actualizar ahora
          </button>
        )}
      </div>
    </div>
  );
}

export default ReloadPrompt;
