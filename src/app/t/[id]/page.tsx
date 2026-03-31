import { createServerSupabase } from '@/lib/supabase/server';
import { redirect, notFound } from 'next/navigation';
import { STATUS_COLORS } from '@/lib/constants';
import Link from 'next/link';

export default async function TaskDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: taskId } = await params;

  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Fetch task with related data
  const { data: task } = await supabase
    .from('tasks')
    .select(`
      id, title, description, status, priority, deadline, content_type,
      admin_note, created_at, updated_at, campaign_id, created_by,
      campaign:campaigns(name),
      channels:task_channels(channel:channels(name)),
      assignees:task_assignees(user:profiles(id, full_name)),
      checklists:task_checklists(id, title, is_checked, sort_order),
      creator:profiles!tasks_created_by_fkey(full_name)
    `)
    .eq('id', taskId)
    .single();

  if (!task) notFound();

  const statusColor = STATUS_COLORS[task.status] || '#8B8F96';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channelNames = (task.channels as any[])?.map(c => c.channel?.name).filter(Boolean) ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const assigneeNames = (task.assignees as any[])?.map(a => a.user?.full_name).filter(Boolean) ?? [];
  const checklists = (task.checklists as { id: string; title: string; is_checked: boolean; sort_order: number }[])
    ?.sort((a, b) => a.sort_order - b.sort_order) ?? [];
  const checkDone = checklists.filter(c => c.is_checked).length;
  const checkTotal = checklists.length;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const campaignName = (task.campaign as any)?.name as string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const creatorName = (task.creator as any)?.full_name as string | undefined;
  const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'Đã đăng';
  const deadlineStr = task.deadline ? new Date(task.deadline).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null;

  const priorityStyles: Record<string, string> = {
    'Cao': 'bg-red-100 text-red-700',
    'Trung bình': 'bg-yellow-100 text-yellow-700',
    'Thấp': 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-gray-400 font-mono">{task.id}</span>
          <Link
            href={`/kanban?task=${encodeURIComponent(task.id)}`}
            className="text-xs text-indigo-600 font-medium hover:text-indigo-700"
          >
            Mở Kanban &rarr;
          </Link>
        </div>
      </header>

      <main className="max-w-lg mx-auto px-4 py-5 space-y-4">
        {/* Title + Status */}
        <div>
          <h1 className="text-lg font-semibold text-gray-900 leading-snug">{task.title}</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium text-white"
              style={{ backgroundColor: statusColor }}
            >
              {task.status}
            </span>
            {task.priority && (
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${priorityStyles[task.priority] ?? 'bg-gray-100 text-gray-600'}`}>
                {task.priority}
              </span>
            )}
            {task.content_type && (
              <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-600">
                {task.content_type}
              </span>
            )}
          </div>
        </div>

        {/* Info card */}
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {campaignName && (
            <InfoRow label="Chiến dịch" value={campaignName} />
          )}
          {channelNames.length > 0 && (
            <InfoRow label="Kênh" value={channelNames.join(', ')} />
          )}
          {deadlineStr && (
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-xs text-gray-500">Deadline</span>
              <span className={`text-sm font-medium ${isOverdue ? 'text-red-600' : 'text-gray-900'}`}>
                {deadlineStr}
                {isOverdue && <span className="ml-1 text-xs">(Quá hạn)</span>}
              </span>
            </div>
          )}
          {creatorName && (
            <InfoRow label="Tạo bởi" value={creatorName} />
          )}
        </div>

        {/* Assignees */}
        {assigneeNames.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500 mb-2">Phụ trách</p>
            <div className="flex flex-wrap gap-1.5">
              {assigneeNames.map(name => (
                <span key={name} className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 rounded-full text-xs text-gray-700">
                  <span className="w-4 h-4 rounded-full bg-indigo-200 text-indigo-700 flex items-center justify-center text-[10px] font-bold shrink-0">
                    {name.charAt(0)}
                  </span>
                  {name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {task.description && (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-500 mb-2">Mô tả</p>
            <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{task.description}</p>
          </div>
        )}

        {/* Checklist */}
        {checkTotal > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500">Checklist</p>
              <span className={`text-xs font-medium ${checkDone === checkTotal ? 'text-green-600' : 'text-gray-500'}`}>
                {checkDone}/{checkTotal}
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full h-1.5 bg-gray-100 rounded-full mb-3">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${checkTotal > 0 ? (checkDone / checkTotal) * 100 : 0}%`,
                  backgroundColor: checkDone === checkTotal ? '#4A8C5E' : '#C09640',
                }}
              />
            </div>
            <ul className="space-y-1.5">
              {checklists.map(item => (
                <li key={item.id} className="flex items-start gap-2">
                  <span className={`mt-0.5 shrink-0 w-4 h-4 rounded border flex items-center justify-center text-[10px] ${item.is_checked ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300'}`}>
                    {item.is_checked && '✓'}
                  </span>
                  <span className={`text-sm ${item.is_checked ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                    {item.title}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Admin note */}
        {task.admin_note && (
          <div className="bg-amber-50 rounded-xl border border-amber-200 px-4 py-3">
            <p className="text-xs text-amber-600 mb-1 font-medium">Ghi chú Admin</p>
            <p className="text-sm text-amber-800 whitespace-pre-wrap">{task.admin_note}</p>
          </div>
        )}

        {/* Timestamps */}
        <div className="text-center text-[11px] text-gray-400 pt-2 pb-8 space-y-0.5">
          <p>Tạo: {new Date(task.created_at).toLocaleString('vi-VN')}</p>
          <p>Cập nhật: {new Date(task.updated_at).toLocaleString('vi-VN')}</p>
        </div>
      </main>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  );
}
