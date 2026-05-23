import { useEffect, useState } from 'react';
import { CheckCircleIcon, XCircleIcon, XMarkIcon } from '@heroicons/react/24/outline';

export type ToastType = 'success' | 'error';

interface ToastMessage {
  id: number;
  type: ToastType;
  message: string;
}

let addToast: (type: ToastType, message: string) => void = () => {};

export function toast(type: ToastType, message: string) {
  addToast(type, message);
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  let counter = 0;

  useEffect(() => {
    addToast = (type, message) => {
      const id = ++counter;
      setToasts(prev => [...prev, { id, type, message }]);
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 4000);
    };
  }, []);

  const remove = (id: number) => setToasts(prev => prev.filter(t => t.id !== id));

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 w-80">
      {toasts.map(t => (
        <div
          key={t.id}
          className={`flex items-start gap-3 p-4 rounded-xl shadow-lg border text-sm font-medium transition-all duration-300 ${
            t.type === 'success'
              ? 'bg-white border-emerald-200 text-emerald-800'
              : 'bg-white border-red-200 text-red-800'
          }`}
        >
          {t.type === 'success'
            ? <CheckCircleIcon className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
            : <XCircleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          }
          <span className="flex-1">{t.message}</span>
          <button onClick={() => remove(t.id)} className="text-slate-400 hover:text-slate-600 flex-shrink-0">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
