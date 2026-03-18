'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { formatDateVN } from '@/lib/utils';
import { ROLE_LABELS } from '@/lib/constants';
import { useProfile } from './profile-context';
import { useToast } from './ui/toast';
import type { TaskComment, Profile } from '@/lib/types';

interface TaskCommentsProps {
  taskId: string;
  onRefresh: () => void;
}

interface RawComment {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
  updated_at: string;
  user: Profile | Profile[];
}

export default function TaskComments({ taskId, onRefresh }: TaskCommentsProps) {
  const profile = useProfile();
  const { show } = useToast();
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);

  const isAdmin = profile.role === 'admin' || profile.role === 'super_admin';

  const fetchComments = useCallback(async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('task_comments')
      .select('id, task_id, user_id, content, created_at, updated_at, user:profiles!task_comments_user_id_profiles_fkey(id, email, full_name, role)')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching comments:', error);
    } else {
      const mapped = ((data as unknown as RawComment[]) || []).map(c => ({
        ...c,
        user: Array.isArray(c.user) ? c.user[0] : c.user,
      })) as TaskComment[];
      setComments(mapped);
    }
    setLoading(false);
  }, [taskId]);

  useEffect(() => {
    fetchComments();
  }, [fetchComments]);

  // Realtime subscription for comments
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`comments-${taskId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'task_comments',
        filter: `task_id=eq.${taskId}`,
      }, () => {
        fetchComments();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [taskId, fetchComments]);

  const logActivity = useCallback(async (action: string, detail: string) => {
    const supabase = createClient();
    await supabase.from('activity_logs').insert({
      user_id: profile.id,
      action,
      detail,
      task_id: taskId,
    });
  }, [profile.id, taskId]);

  const handleSend = useCallback(async () => {
    if (!content.trim()) return;
    setSending(true);
    const supabase = createClient();
    const { error } = await supabase.from('task_comments').insert({
      task_id: taskId,
      user_id: profile.id,
      content: content.trim(),
    });

    if (error) {
      show('Lỗi gửi bình luận: ' + error.message, 'error');
    } else {
      setContent('');
      await logActivity('add_comment', `Thêm bình luận`);
      onRefresh();
    }
    setSending(false);
  }, [content, taskId, profile.id, show, logActivity, onRefresh]);

  const handleDelete = useCallback(async (commentId: string) => {
    if (!window.confirm('Xóa bình luận này?')) return;
    const supabase = createClient();
    const { error } = await supabase
      .from('task_comments')
      .delete()
      .eq('id', commentId);

    if (error) {
      show('Lỗi xóa bình luận: ' + error.message, 'error');
    } else {
      await logActivity('delete_comment', `Xóa bình luận`);
      onRefresh();
    }
  }, [show, logActivity, onRefresh]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${formatDateVN(dateStr)} ${hours}:${mins}`;
  };

  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">
        Bình luận {comments.length > 0 && `(${comments.length})`}
      </h4>

      {loading ? (
        <p className="text-sm text-gray-400 italic">Đang tải...</p>
      ) : (
        <>
          {/* Comments thread */}
          {comments.length === 0 ? (
            <p className="text-sm text-gray-400 italic mb-3">Chưa có bình luận.</p>
          ) : (
            <div className="space-y-2 mb-3 max-h-80 overflow-y-auto">
              {comments.map(c => {
                const isOwn = c.user_id === profile.id;
                return (
                  <div
                    key={c.id}
                    className={`rounded-lg p-3 text-sm group ${isOwn ? 'bg-blue-50' : 'bg-gray-50'}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-800">
                          {c.user?.full_name || 'Ẩn danh'}
                        </span>
                        {c.user?.role && (
                          <span className="text-[10px] font-medium text-gray-500 bg-gray-200 px-1.5 py-0.5 rounded">
                            {ROLE_LABELS[c.user.role] || c.user.role}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400">{formatTime(c.created_at)}</span>
                        {(isOwn || isAdmin) && (
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="text-red-400 hover:text-red-600 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Xóa"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    </div>
                    <p className="text-gray-700 whitespace-pre-wrap">{c.content}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Input */}
          <div className="flex items-start gap-2">
            <textarea
              value={content}
              onChange={e => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Nhập bình luận... (Enter để gửi, Shift+Enter xuống dòng)"
              rows={2}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <button
              onClick={handleSend}
              disabled={sending || !content.trim()}
              className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 shrink-0"
            >
              Gửi
            </button>
          </div>
        </>
      )}
    </div>
  );
}
