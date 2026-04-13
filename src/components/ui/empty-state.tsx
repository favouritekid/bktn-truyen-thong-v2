interface EmptyStateProps {
  icon?: React.ReactNode;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({ icon, message, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="text-center py-6">
      {icon && <div className="text-gray-300 mb-2 flex justify-center">{icon}</div>}
      <p className="text-xs text-gray-400">{message}</p>
      {actionLabel && onAction && (
        <button onClick={onAction} className="text-xs text-blue-600 hover:text-blue-700 font-medium mt-2">
          + {actionLabel}
        </button>
      )}
    </div>
  );
}
