-- Phase 3: Task Archive & Delete
-- Run this migration on Supabase SQL Editor

-- 1. Add archive columns to tasks
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES auth.users(id);

-- 2. Create index for archive filtering
CREATE INDEX IF NOT EXISTS idx_tasks_is_archived ON public.tasks(is_archived);

-- 3. RLS DELETE policy for tasks (defense-in-depth, API uses service role)
DROP POLICY IF EXISTS "tasks_delete" ON public.tasks;
CREATE POLICY "tasks_delete" ON public.tasks
  FOR DELETE TO authenticated
  USING (
    -- super_admin can delete tasks not in 'Đã đăng'
    (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'super_admin') AND status != 'Đã đăng')
    OR
    -- admin can delete 'Bản nháp' and 'Chờ duyệt KH'
    (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') AND status IN ('Bản nháp', 'Chờ duyệt KH'))
    OR
    -- editor can delete own 'Bản nháp' only
    (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'editor') AND status = 'Bản nháp' AND created_by = auth.uid())
  );

-- 4. Make activity_logs.task_id SET NULL on task deletion (preserve logs)
-- First check and drop existing FK if it has RESTRICT
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'activity_logs_task_id_fkey'
    AND table_name = 'activity_logs'
  ) THEN
    ALTER TABLE public.activity_logs DROP CONSTRAINT activity_logs_task_id_fkey;
  END IF;
END $$;

ALTER TABLE public.activity_logs
  ADD CONSTRAINT activity_logs_task_id_fkey
  FOREIGN KEY (task_id) REFERENCES public.tasks(id) ON DELETE SET NULL;
