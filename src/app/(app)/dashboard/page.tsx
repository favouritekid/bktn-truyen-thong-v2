'use client';

import { useCallback, useMemo, useState } from 'react';
import { STATUSES, STATUS_COLORS, CHANNEL_COLORS } from '@/lib/constants';
import { useChannels } from '@/hooks/use-channels';
import { formatDateVN, isOverdue, isDueSoon, isAdminOrAbove } from '@/lib/utils';
import { useProfile } from '@/components/profile-context';
import { useTasks } from '@/hooks/use-tasks';
import TaskDrawer from '@/components/task-drawer';
import TaskForm from '@/components/task-form';
import type { Task } from '@/lib/types';

export default function DashboardPage() {
  const profile = useProfile();
  const { channels: dbChannels } = useChannels();
  const { tasks, loading, refresh } = useTasks({
    profileId: profile.id,
    role: profile.role,
  });

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [formTask, setFormTask] = useState<Task | null | undefined>(undefined);

  const channelNames = dbChannels.map(c => c.name);

  const stats = useMemo(() => {
    const byStatus: Record<string, number> = {};
    for (const s of STATUSES) byStatus[s] = 0;
    const byChannel: Record<string, number> = {};
    for (const c of channelNames) byChannel[c] = 0;
    const byAssignee: Record<string, { name: string; count: number; completed: number }> = {};
    const overdue: Task[] = [];
    const dueSoon: Task[] = [];

    for (const t of tasks) {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      if (t.channel) byChannel[t.channel] = (byChannel[t.channel] || 0) + 1;

      if (t.assignees) {
        for (const a of t.assignees) {
          if (!byAssignee[a.id]) byAssignee[a.id] = { name: a.full_name, count: 0, completed: 0 };
          byAssignee[a.id].count++;
          if (t.status === 'Đã đăng') byAssignee[a.id].completed++;
        }
      }

      if (isOverdue(t.deadline) && !['Đã đăng'].includes(t.status)) {
        overdue.push(t);
      } else if (isDueSoon(t.deadline) && !['Đã đăng'].includes(t.status)) {
        dueSoon.push(t);
      }
    }

    return { total: tasks.length, byStatus, byChannel, byAssignee, overdue, dueSoon };
  }, [tasks, channelNames]);

  // Pipeline progress
  const pipelineStatuses = STATUSES.filter(s => s !== 'Đã đăng');
  const completedCount = stats.byStatus['Đã đăng'] || 0;
  const inProgressCount = stats.total - completedCount;

  const openDrawer = useCallback((task: Task) => setSelectedTask(task), []);
  const closeDrawer = useCallback(() => setSelectedTask(null), []);
  const openEditForm = useCallback((task: Task) => {
    setSelectedTask(null);
    setFormTask(task);
  }, []);
  const closeForm = useCallback(() => setFormTask(undefined), []);

  if (loading) {
    return (
      <div className="text-center py-20 text-gray-400">
        <p className="text-lg">Đang tải dashboard...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {STATUSES.map(status => {
          const count = stats.byStatus[status] || 0;
          const color = STATUS_COLORS[status] || '#9E9E9E';
          return (
            <div
              key={status}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 text-center"
            >
              <div
                className="text-3xl font-bold mb-1"
                style={{ color }}
              >
                {count}
              </div>
              <div className="text-xs font-medium text-gray-500">{status}</div>
              <div
                className="mt-2 h-1 rounded-full"
                style={{ backgroundColor: color + '30' }}
              >
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    backgroundColor: color,
                    width: stats.total > 0 ? `${(count / stats.total) * 100}%` : '0%',
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Pipeline progress bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-3">Pipeline tiến độ</h3>
        <div className="flex h-8 rounded-lg overflow-hidden bg-gray-100">
          {STATUSES.map(status => {
            const count = stats.byStatus[status] || 0;
            const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
            if (pct === 0) return null;
            return (
              <div
                key={status}
                className="flex items-center justify-center text-white text-[10px] font-bold transition-all duration-500 overflow-hidden"
                style={{ backgroundColor: STATUS_COLORS[status], width: `${pct}%`, minWidth: pct > 0 ? '30px' : '0' }}
                title={`${status}: ${count} (${pct.toFixed(0)}%)`}
              >
                {pct >= 8 && `${count}`}
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-3 mt-2">
          {STATUSES.map(status => (
            <div key={status} className="flex items-center gap-1.5 text-[11px] text-gray-500">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: STATUS_COLORS[status] }} />
              {status} ({stats.byStatus[status] || 0})
            </div>
          ))}
        </div>
        <div className="mt-3 text-sm text-gray-600">
          Tổng: <span className="font-bold">{stats.total}</span> task
          &middot; Hoàn thành: <span className="font-bold text-green-600">{completedCount}</span>
          &middot; Đang xử lý: <span className="font-bold text-amber-600">{inProgressCount}</span>
        </div>
      </div>

      {/* Alerts: Overdue + Due soon */}
      {(stats.overdue.length > 0 || stats.dueSoon.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Overdue */}
          {stats.overdue.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4">
              <h3 className="text-sm font-bold text-red-700 mb-2">
                Trễ hạn ({stats.overdue.length})
              </h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {stats.overdue.map(t => (
                  <button
                    key={t.id}
                    onClick={() => openDrawer(t)}
                    className="w-full text-left bg-white rounded-lg px-3 py-2 text-sm hover:bg-red-100 transition-colors border border-red-100 flex items-center justify-between gap-2"
                  >
                    <span className="truncate font-medium text-gray-800">{t.title}</span>
                    <span className="text-[11px] text-red-600 shrink-0">{formatDateVN(t.deadline)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Due soon */}
          {stats.dueSoon.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h3 className="text-sm font-bold text-amber-700 mb-2">
                Sắp đến hạn ({stats.dueSoon.length})
              </h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {stats.dueSoon.map(t => (
                  <button
                    key={t.id}
                    onClick={() => openDrawer(t)}
                    className="w-full text-left bg-white rounded-lg px-3 py-2 text-sm hover:bg-amber-100 transition-colors border border-amber-100 flex items-center justify-between gap-2"
                  >
                    <span className="truncate font-medium text-gray-800">{t.title}</span>
                    <span className="text-[11px] text-amber-600 shrink-0">{formatDateVN(t.deadline)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Channel breakdown */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-3">Phân bổ theo kênh</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b border-gray-200">
                <th className="pb-2 font-semibold text-gray-600">Kênh</th>
                {STATUSES.map(s => (
                  <th key={s} className="pb-2 font-semibold text-center text-gray-600 text-xs px-1">
                    {s}
                  </th>
                ))}
                <th className="pb-2 font-semibold text-center text-gray-600">Tổng</th>
              </tr>
            </thead>
            <tbody>
              {channelNames.map(ch => {
                const chTasks = tasks.filter(t => t.channel === ch);
                if (chTasks.length === 0) return null;
                return (
                  <tr key={ch} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-2">
                      <span
                        className="text-xs font-bold text-white px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: CHANNEL_COLORS[ch] || '#6B7280' }}
                      >
                        {ch}
                      </span>
                    </td>
                    {STATUSES.map(s => {
                      const count = chTasks.filter(t => t.status === s).length;
                      return (
                        <td key={s} className="py-2 text-center text-xs">
                          {count > 0 ? (
                            <span className="font-bold" style={{ color: STATUS_COLORS[s] }}>
                              {count}
                            </span>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-2 text-center font-bold text-gray-700">{chTasks.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Team breakdown */}
      {isAdminOrAbove(profile.role) && Object.keys(stats.byAssignee).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Phân bổ theo nhân viên</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b border-gray-200">
                  <th className="pb-2 font-semibold text-gray-600">Nhân viên</th>
                  <th className="pb-2 font-semibold text-center text-gray-600">Tổng task</th>
                  <th className="pb-2 font-semibold text-center text-gray-600">Hoàn thành</th>
                  <th className="pb-2 font-semibold text-center text-gray-600">Tỷ lệ</th>
                  <th className="pb-2 font-semibold text-gray-600">Tiến độ</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats.byAssignee)
                  .sort((a, b) => b[1].count - a[1].count)
                  .map(([id, info]) => {
                    const pct = info.count > 0 ? Math.round((info.completed / info.count) * 100) : 0;
                    return (
                      <tr key={id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="py-2 font-medium">{info.name}</td>
                        <td className="py-2 text-center">{info.count}</td>
                        <td className="py-2 text-center text-green-600 font-bold">{info.completed}</td>
                        <td className="py-2 text-center text-gray-600">{pct}%</td>
                        <td className="py-2">
                          <div className="h-2 rounded-full bg-gray-200 w-full max-w-[120px]">
                            <div
                              className="h-full rounded-full bg-green-500 transition-all duration-500"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Drawer */}
      {selectedTask && (
        <TaskDrawer
          task={selectedTask}
          onClose={closeDrawer}
          onRefresh={refresh}
          onEdit={openEditForm}
        />
      )}

      {/* Form modal */}
      {formTask !== undefined && (
        <TaskForm
          task={formTask}
          onClose={closeForm}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
