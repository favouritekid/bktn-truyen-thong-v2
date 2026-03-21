'use client';

import { formatDateTimeVN, getChannelColor, isOverdue, isDueSoon } from '@/lib/utils';
import type { Task } from '@/lib/types';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
}

export default function TaskCard({ task, onClick }: TaskCardProps) {
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
      className="bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-gray-300 hover:shadow-sm transition-all px-3 py-2.5 group"
    >
      {/* Labels row: channels + campaign + priority */}
      {((task.channels?.length || 0) > 0 || task.campaign || task.priority === 'Cao') && (
        <div className="flex items-center gap-1 flex-wrap mb-1.5">
          {(task.channels || []).map(ch => (
            <span
              key={ch.id}
              className="text-[10px] font-medium px-1.5 py-0.5 rounded"
              style={{ backgroundColor: getChannelColor(ch.name) + '18', color: getChannelColor(ch.name) }}
            >
              {ch.name}
            </span>
          ))}
          {task.campaign && (
            <span className="text-[10px] font-medium text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
              {task.campaign.name}
            </span>
          )}
          {task.priority === 'Cao' && (
            <span className="text-[10px] font-semibold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
              Urgent
            </span>
          )}
        </div>
      )}

      {/* Title */}
      <h4 className="text-[13px] font-medium text-gray-900 leading-snug line-clamp-2 mb-2">
        {task.title}
      </h4>

      {/* Bottom row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Deadline */}
          {task.deadline && (
            <span className={`inline-flex items-center gap-1 text-[11px] ${
              overdue ? 'text-red-600 font-medium' : dueSoon ? 'text-amber-600' : 'text-gray-400'
            }`}>
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {formatDateTimeVN(task.deadline)}
              {overdue && <span className="text-[9px]">Trễ</span>}
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
              className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold text-white border-2 border-white"
              style={{ backgroundColor: getAvatarColor(a.full_name) }}
            >
              {getInitials(a.full_name)}
            </div>
          ))}
          {(task.assignees?.length || 0) > 3 && (
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold text-gray-500 bg-gray-100 border-2 border-white">
              +{task.assignees!.length - 3}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
