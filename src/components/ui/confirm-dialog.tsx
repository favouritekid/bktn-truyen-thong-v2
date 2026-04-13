'use client';

import { useEffect, useRef, useState } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'default' | 'danger';
  onConfirm: (value?: string) => void;
  onCancel: () => void;
  promptMode?: boolean;
  promptPlaceholder?: string;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Hủy',
  variant = 'default',
  onConfirm,
  onCancel,
  promptMode = false,
  promptPlaceholder = '',
}: ConfirmDialogProps) {
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setInputValue('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [open, onCancel]);

  if (!open) return null;

  const canConfirm = !promptMode || inputValue.trim().length > 0;

  const confirmBtnClass = variant === 'danger'
    ? 'bg-red-600 hover:bg-red-700 text-white'
    : 'bg-gray-900 hover:bg-gray-800 text-white';

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-[100]" onClick={onCancel} />
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-lg w-full max-w-sm border border-gray-200">
          <div className="px-5 pt-5 pb-2">
            <h3 className="text-sm font-semibold text-gray-900 mb-2">{title}</h3>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">{message}</p>
          </div>

          {promptMode && (
            <div className="px-5 pb-2">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && canConfirm) onConfirm(inputValue.trim());
                }}
                placeholder={promptPlaceholder}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}

          <div className="flex justify-end gap-2 px-5 py-4">
            <button
              onClick={onCancel}
              className="px-3 py-1.5 rounded-md text-xs font-medium border border-gray-200 hover:bg-gray-50 text-gray-700 transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              onClick={() => onConfirm(promptMode ? inputValue.trim() : undefined)}
              disabled={!canConfirm}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50 ${confirmBtnClass}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
