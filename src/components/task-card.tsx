'use client';

import { STATUS_COLORS } from '@/lib/constants';
import { formatDateTimeVN, getChannelColor, isOverdue, isDueSoon } from '@/lib/utils';
import type { Task } from '@/lib/types';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
}

export default function TaskCard({ task, onClick }: TaskCardProps) {
  const statusColor = STATUS_COLORS[task.status] || '#9E9E9E';
  const firstChannelColor = task.channels?.[0] ? getChannelColor(task.channels[0].name) : '#6B7280';
  const overdue = isOverdue(task.deadline) && !['Đã đăng'].includes(task.status);
  const dueSoon = isDueSoon(task.deadline) && !['Đã đăng'].includes(task.status);
  const resultCount = task.results?.length || 0;

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    return parts.length > 1
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase();
  };

  const avatarColors = ['#4F46E5', '#0891B2', '#059669', '#D97706', '#DC2626', '#7C3AED', '#DB2777'];
  const getAvatarColor = (name: string) => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return avatarColors[Math.abs(hash) % avatarColors.length];
  };

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 cursor-pointer hover:shadow-md transition-all group relative overflow-hidden"
    >
      {/* Color strip top - first channel color */}
      <div className="h-1" style={{ backgroundColor: firstChannelColor }} />

      <div className="px-3 py-2.5">
        {/* Labels row */}
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          {(task.channels || []).map(ch => (
            <span
              key={ch.id}
              className="text-[10px] font-semibold text-white px-2 py-0.5 rounded"
              style={{ backgroundColor: getChannelColor(ch.name) }}
            >
              {ch.name}
            </span>
          ))}
          {task.campaign && (
            <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
              {task.campaign.name}
            </span>
          )}
          {task.priority === 'Cao' && (
            <span className="text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
              !!!
            </span>
          )}
        </div>

        {/* Title */}
        <h4 className="text-[13px] font-medium text-gray-800 leading-snug line-clamp-2 mb-2">
          {task.title}
        </h4>

        {/* Badges + Avatars row */}
        <div className="flex items-center justify-between gap-2">
          {/* Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Deadline badge */}
            {task.deadline && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded ${
                overdue
                  ? 'bg-red-100 text-red-700'
                  : dueSoon
                    ? 'bg-amber-100 text-amber-700'
                    : task.status === 'Đã đăng'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-gray-100 text-gray-600'
              }`}>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {formatDateTimeVN(task.deadline)}
              </span>
            )}

            {/* Results badge */}
            {resultCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
                </svg>
                {resultCount}
              </span>
            )}

            {/* Admin note indicator */}
            {task.admin_note && (
              <span className="inline-flex items-center text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded" title={task.admin_note}>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                </svg>
              </span>
            )}

            {/* Status badge */}
            <span
              className="text-[10px] font-semibold text-white px-2 py-0.5 rounded"
              style={{ backgroundColor: statusColor }}
            >
              {task.status}
            </span>
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
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold text-gray-500 bg-gray-200 border-2 border-white">
                +{task.assignees!.length - 3}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
