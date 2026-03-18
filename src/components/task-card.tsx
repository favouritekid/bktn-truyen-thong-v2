'use client';

import { STATUS_COLORS } from '@/lib/constants';
import { formatDateVN, getChannelColor, isOverdue, isDueSoon } from '@/lib/utils';
import type { Task } from '@/lib/types';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
}

export default function TaskCard({ task, onClick }: TaskCardProps) {
  const statusColor = STATUS_COLORS[task.status] || '#9E9E9E';
  const channelColor = getChannelColor(task.channel);
  const overdue = isOverdue(task.deadline) && !['Đã đăng'].includes(task.status);
  const dueSoon = isDueSoon(task.deadline) && !['Đã đăng'].includes(task.status);
  const assigneeNames = task.assignees?.map(a => a.full_name).join(', ') || 'Chưa gán';
  const resultCount = task.results?.length || 0;

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg shadow-sm border border-gray-200 p-3 cursor-pointer hover:shadow-md transition-shadow group relative"
    >
      {/* Channel badge */}
      <div className="flex items-center justify-between mb-2">
        <span
          className="text-[10px] font-bold text-white px-2 py-0.5 rounded-full"
          style={{ backgroundColor: channelColor }}
        >
          {task.channel}
        </span>
        {task.priority === 'Cao' && (
          <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
            Ưu tiên cao
          </span>
        )}
      </div>

      {/* Title */}
      <h4 className="text-sm font-semibold text-gray-800 mb-1.5 leading-tight line-clamp-2">
        {task.title}
      </h4>

      {/* Content type */}
      {task.content_type && (
        <p className="text-[11px] text-gray-500 mb-1.5">{task.content_type}</p>
      )}

      {/* Deadline */}
      {task.deadline && (
        <div className={`flex items-center gap-1 text-[11px] mb-1.5 ${
          overdue ? 'text-red-600 font-bold' : dueSoon ? 'text-amber-600 font-medium' : 'text-gray-500'
        }`}>
          <span>&#128197;</span>
          <span>{formatDateVN(task.deadline)}</span>
          {overdue && <span className="ml-1 text-red-500">(Trễ hạn!)</span>}
          {dueSoon && !overdue && <span className="ml-1">(Sắp đến hạn)</span>}
        </div>
      )}

      {/* Assignees */}
      <p className="text-[11px] text-gray-600 mb-1.5 truncate">
        <span className="text-gray-400">Phụ trách:</span> {assigneeNames}
      </p>

      {/* Admin note indicator */}
      {task.admin_note && (
        <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 mb-1.5 truncate">
          Ghi chú: {task.admin_note}
        </p>
      )}

      {/* Bottom row: results + status */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
        {resultCount > 0 && (
          <span className="text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
            {resultCount} kết quả
          </span>
        )}
        <span
          className="text-[10px] font-bold text-white px-2 py-0.5 rounded-full ml-auto"
          style={{ backgroundColor: statusColor }}
        >
          {task.status}
        </span>
      </div>
    </div>
  );
}
