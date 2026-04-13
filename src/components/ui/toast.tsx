'use client';

import { createContext, useCallback, useContext, useState } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  action?: ToastAction;
}

interface ToastContextValue {
  show: (message: string, type?: ToastType, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, type: ToastType = 'info', action?: ToastAction) => {
    const id = ++nextId;
    setToasts(prev => [...prev, { id, message, type, action }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, action ? 5000 : 3500);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const styleMap: Record<ToastType, string> = {
    success: 'bg-white border-green-200 text-green-800',
    error: 'bg-white border-red-200 text-red-800',
    info: 'bg-white border-gray-200 text-gray-800',
    warning: 'bg-white border-amber-200 text-amber-800',
  };

  const actionColorMap: Record<ToastType, string> = {
    success: 'text-green-700 hover:text-green-900',
    error: 'text-red-700 hover:text-red-900',
    info: 'text-gray-700 hover:text-gray-900',
    warning: 'text-amber-700 hover:text-amber-900',
  };

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`${styleMap[t.type]} border px-4 py-2.5 rounded-md shadow-sm text-sm flex items-center justify-between gap-3 animate-[slideIn_0.3s_ease]`}
            role="alert"
          >
            <span>{t.message}</span>
            <div className="flex items-center gap-2 shrink-0">
              {t.action && (
                <button
                  onClick={() => { t.action!.onClick(); dismiss(t.id); }}
                  className={`text-xs font-medium underline hover:no-underline ${actionColorMap[t.type]}`}
                >
                  {t.action.label}
                </button>
              )}
              <button
                onClick={() => dismiss(t.id)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
