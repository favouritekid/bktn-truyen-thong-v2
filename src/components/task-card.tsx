'use client';

import { STATUS_COLORS } from '@/lib/constants';
import { formatDateTimeVN, getChannelColor, isOverdue, isDueSoon } from '@/lib/utils';
import type { Task } from '@/lib/types';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
}

export default function TaskCard({ task, onClick }: TaskCardProps) {
  const statusColor = STATUS_COLORS[task.status] || '#8B8F96';
  const overdue = isOverdue(task.deadline) && !['Đã đăng'].includes(task.status);
  const dueSoon = isDueSoon(task.deadline) && !['Đã đăng'].includes(task.status);

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    return parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase();
  };

  const avatarColors = ['#6366F1', '#0891B2', '#059669', '#D97706', '#DC2626', '#7C3AED', '#DB2777'];
  const getAvatarColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return avatarColors[Math.abs(hash) % avatarColors.length];
  };

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-md border border-gray-150 cursor-pointer hover:bg-gray-50 transition-colors px-3 py-2"
    >
      {/* Title */}
      <h4 className="text-[13px] font-medium text-gray-900 leading-snug line-clamp-2 mb-1.5">
        {task.title}
      </h4>

      {/* Meta line: status dot + channels + campaign */}
      <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
        {/* Status dot + label */}
        <span className="inline-flex items-center gap-1">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: statusColor }} />
          <span className="text-[11px] text-gray-500">{task.status}</span>
        </span>

        {/* Separator */}
        {(task.channels?.length || 0) > 0 && <span className="text-gray-300">·</span>}

        {/* Channels as text */}
        {(task.channels || []).map(ch => (
          <span key={ch.id} className="inline-flex items-center gap-1 text-[11px] text-gray-500">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: getChannelColor(ch.name) }} />
            {ch.name}
          </span>
        ))}

        {/* Campaign */}
        {task.campaign && (
          <>
            <span className="text-gray-300">·</span>
            <span className="text-[11px] text-gray-400">{task.campaign.name}</span>
          </>
        )}

        {/* Priority */}
        {task.priority === 'Cao' && (
          <span className="text-[10px] font-medium text-orange-600 bg-orange-50 px-1 py-0.5 rounded">Urgent</span>
        )}
      </div>

      {/* Bottom row: deadline + creator + avatars */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Deadline */}
          {task.deadline && (
            <span className={`inline-flex items-center gap-1 text-[11px] ${
              overdue ? 'text-red-600' : dueSoon ? 'text-amber-600' : 'text-gray-400'
            }`}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {formatDateTimeVN(task.deadline)}
            </span>
          )}

          {/* Creator */}
          {task.creator && (
            <span className="text-[11px] text-gray-400 truncate">
              {task.creator.full_name}
            </span>
          )}

          {/* Admin note indicator */}
          {task.admin_note && (
            <span title={task.admin_note}>
              <svg className="w-3 h-3 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
              </svg>
            </span>
          )}
        </div>

        {/* Assignee avatars */}
        <div className="flex -space-x-1.5 shrink-0">
          {(task.assignees || []).slice(0, 3).map(a => (
            <div
              key={a.id}
              title={a.full_name}
              className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold text-white border border-white"
              style={{ backgroundColor: getAvatarColor(a.full_name) }}
            >
              {getInitials(a.full_name)}
            </div>
          ))}
          {(task.assignees?.length || 0) > 3 && (
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[7px] font-bold text-gray-500 bg-gray-100 border border-white">
              +{task.assignees!.length - 3}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
