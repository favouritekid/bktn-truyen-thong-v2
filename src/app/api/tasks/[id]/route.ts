import { createAdminClient, verifyRole, isVerifyError, verifyErrorResponse } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

// DELETE /api/tasks/[id] - Hard delete a task
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyRole(['super_admin', 'admin', 'editor']);
    if (isVerifyError(auth)) return verifyErrorResponse(auth);

    const { id } = await params;
    const adminClient = createAdminClient();

    // Fetch task
    const { data: task } = await adminClient
      .from('tasks')
      .select('id, title, status, created_by')
      .eq('id', id)
      .single();

    if (!task) {
      return NextResponse.json({ error: 'Không tìm thấy task' }, { status: 404 });
    }

    // Permission matrix
    const role = auth.profile.role;
    const userId = auth.user.id;

    if (task.status === 'Đã đăng') {
      return NextResponse.json({ error: 'Không thể xóa task đã đăng' }, { status: 403 });
    }

    if (role === 'admin' && !['Bản nháp', 'Chờ duyệt KH'].includes(task.status)) {
      return NextResponse.json({ error: 'Admin chỉ xóa được task Bản nháp hoặc Chờ duyệt KH' }, { status: 403 });
    }

    if (role === 'editor') {
      if (task.status !== 'Bản nháp' || task.created_by !== userId) {
        return NextResponse.json({ error: 'Editor chỉ xóa được task bản nháp do mình tạo' }, { status: 403 });
      }
    }

    // Log before delete (task_id will be set to NULL after cascade)
    await adminClient.from('activity_logs').insert({
      user_id: userId,
      action: 'delete_task',
      detail: `Xóa task: ${task.title} (${task.status})`,
      task_id: id,
    });

    // Hard delete - cascades to all child tables
    const { error } = await adminClient
      .from('tasks')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/tasks/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 });
  }
}

// PATCH /api/tasks/[id] - Archive/Restore a task
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyRole(['super_admin', 'admin', 'editor']);
    if (isVerifyError(auth)) return verifyErrorResponse(auth);

    const { id } = await params;
    const body = await request.json();
    const { action } = body;

    const adminClient = createAdminClient();

    const { data: task } = await adminClient
      .from('tasks')
      .select('id, title, status, created_by, is_archived')
      .eq('id', id)
      .single();

    if (!task) {
      return NextResponse.json({ error: 'Không tìm thấy task' }, { status: 404 });
    }

    const role = auth.profile.role;
    const userId = auth.user.id;

    if (action === 'archive') {
      if (task.is_archived) {
        return NextResponse.json({ error: 'Task đã được lưu trữ' }, { status: 400 });
      }

      // Permission: admin/super_admin always, editor only own draft
      if (role === 'editor' && (task.status !== 'Bản nháp' || task.created_by !== userId)) {
        return NextResponse.json({ error: 'Editor chỉ lưu trữ được task bản nháp do mình tạo' }, { status: 403 });
      }

      const { error } = await adminClient
        .from('tasks')
        .update({
          is_archived: true,
          archived_at: new Date().toISOString(),
          archived_by: userId,
        })
        .eq('id', id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      await adminClient.from('activity_logs').insert({
        user_id: userId,
        action: 'archive_task',
        detail: `Lưu trữ task: ${task.title}`,
        task_id: id,
      });

      return NextResponse.json({ success: true });
    }

    if (action === 'restore') {
      // Only admin/super_admin can restore
      if (role === 'editor') {
        return NextResponse.json({ error: 'Không có quyền khôi phục' }, { status: 403 });
      }

      if (!task.is_archived) {
        return NextResponse.json({ error: 'Task chưa được lưu trữ' }, { status: 400 });
      }

      const { error } = await adminClient
        .from('tasks')
        .update({
          is_archived: false,
          archived_at: null,
          archived_by: null,
        })
        .eq('id', id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }

      await adminClient.from('activity_logs').insert({
        user_id: userId,
        action: 'restore_task',
        detail: `Khôi phục task: ${task.title}`,
        task_id: id,
      });

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err) {
    console.error('PATCH /api/tasks/[id] error:', err);
    return NextResponse.json({ error: 'Lỗi hệ thống' }, { status: 500 });
  }
}
