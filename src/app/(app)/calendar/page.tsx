'use client';

import { useCallback, useMemo, useState } from 'react';
import { STATUS_COLORS } from '@/lib/constants';
import { formatDateVN } from '@/lib/utils';
import { useProfile } from '@/components/profile-context';
import { useTasks } from '@/hooks/use-tasks';
import TaskDrawer from '@/components/task-drawer';
import TaskForm from '@/components/task-form';
import type { Task } from '@/lib/types';

const DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // Monday as start
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function formatShortDate(date: Date): string {
  return `${date.getDate()}/${date.getMonth() + 1}`;
}

export default function CalendarPage() {
  const profile = useProfile();
  const { tasks, loading, refresh } = useTasks({
    profileId: profile.id,
    role: profile.role,
  });

  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [formTask, setFormTask] = useState<Task | null | undefined>(undefined);

  const weekStart = useMemo(() => getWeekStart(currentDate), [currentDate]);
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }, [weekStart]);

  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // Map tasks to days
  const tasksByDay = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const day of weekDays) {
      const key = day.toISOString().split('T')[0];
      map[key] = [];
    }

    for (const task of tasks) {
      // Completed tasks show on completion date
      if (task.status === 'Đã đăng' && task.completed_at) {
        const completedDate = new Date(task.completed_at);
        completedDate.setHours(0, 0, 0, 0);
        const key = completedDate.toISOString().split('T')[0];
        if (map[key]) {
          map[key].push(task);
        }
      }

      // All tasks show on their deadline date
      if (task.deadline) {
        const deadlineDate = new Date(task.deadline);
        deadlineDate.setHours(0, 0, 0, 0);
        const key = deadlineDate.toISOString().split('T')[0];
        if (map[key]) {
          // Don't add duplicate if already added via completed_at on same day
          if (task.status === 'Đã đăng' && task.completed_at) {
            const completedDate = new Date(task.completed_at);
            completedDate.setHours(0, 0, 0, 0);
            if (isSameDay(completedDate, deadlineDate)) continue;
          }
          map[key].push(task);
        }
      }
    }

    return map;
  }, [tasks, weekDays]);

  const goToPrevWeek = useCallback(() => {
    setCurrentDate(prev => addDays(prev, -7));
  }, []);

  const goToNextWeek = useCallback(() => {
    setCurrentDate(prev => addDays(prev, 7));
  }, []);

  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  const openDrawer = useCallback((task: Task) => setSelectedTask(task), []);
  const closeDrawer = useCallback(() => setSelectedTask(null), []);
  const openEditForm = useCallback((task: Task) => {
    setSelectedTask(null);
    setFormTask(task);
  }, []);
  const closeForm = useCallback(() => setFormTask(undefined), []);

  // Week label
  const weekLabel = `${formatShortDate(weekDays[0])} - ${formatShortDate(weekDays[6])}/${weekDays[6].getFullYear()}`;

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-lg font-bold text-gray-800">Lịch nội dung</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={goToPrevWeek}
            className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            &larr; Tuần trước
          </button>
          <button
            onClick={goToToday}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition-colors"
          >
            Hôm nay
          </button>
          <button
            onClick={goToNextWeek}
            className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Tuần sau &rarr;
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-500 mb-3">{weekLabel}</p>

      {loading ? (
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="text-center py-1.5">
                <div className="h-3 w-6 mx-auto bg-gray-200 rounded animate-pulse mb-1" />
                <div className="h-4 w-8 mx-auto bg-gray-200 rounded animate-pulse" />
              </div>
              <div className="bg-gray-50 rounded-lg min-h-[200px] p-2 space-y-2">
                {i % 2 === 0 && <div className="h-12 w-full bg-gray-200 rounded animate-pulse" />}
                {i % 3 === 0 && <div className="h-12 w-full bg-gray-200 rounded animate-pulse" />}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-2">
          {/* Day headers */}
          {weekDays.map((day, i) => {
            const isToday = isSameDay(day, today);
            const dayOfWeek = day.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            return (
              <div
                key={i}
                className={`text-center py-2 rounded-t-lg text-sm font-bold ${
                  isToday
                    ? 'bg-blue-600 text-white'
                    : isWeekend
                    ? 'bg-gray-200 text-gray-600'
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                <div>{DAY_NAMES[dayOfWeek]}</div>
                <div className="text-xs font-normal">{formatShortDate(day)}</div>
              </div>
            );
          })}

          {/* Day cells */}
          {weekDays.map((day, i) => {
            const key = day.toISOString().split('T')[0];
            const dayTasks = tasksByDay[key] || [];
            const isToday = isSameDay(day, today);
            const dayOfWeek = day.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            return (
              <div
                key={`cell-${i}`}
                className={`min-h-[200px] rounded-b-lg border p-1.5 space-y-1 ${
                  isToday
                    ? 'border-blue-300 bg-blue-50/50'
                    : isWeekend
                    ? 'border-gray-200 bg-gray-50'
                    : 'border-gray-200 bg-white'
                }`}
              >
                {dayTasks.length === 0 ? (
                  <div className="text-center pt-8">
                    <svg className="w-5 h-5 mx-auto text-gray-200 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>
                    <p className="text-[10px] text-gray-300">Trống</p>
                  </div>
                ) : (
                  dayTasks.map(task => {
                    const statusColor = STATUS_COLORS[task.status] || '#9E9E9E';
                    return (
                      <button
                        key={task.id}
                        onClick={() => openDrawer(task)}
                        className="w-full text-left rounded-md px-2 py-1.5 text-[11px] leading-tight hover:opacity-80 transition-opacity border-l-3"
                        style={{
                          backgroundColor: statusColor + '15',
                          borderLeftColor: statusColor,
                          borderLeftWidth: '3px',
                        }}
                      >
                        <div className="font-medium text-gray-800 line-clamp-2">{task.title}</div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: statusColor }}
                          />
                          <span className="text-[9px] text-gray-500 truncate">{task.status}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            );
          })}
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
