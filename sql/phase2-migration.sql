-- Phase 2: Checklist, Task Links, Comments
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. Helper function: is_task_assignee()
-- ============================================
CREATE OR REPLACE FUNCTION public.is_task_assignee(p_task_id text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.task_assignees
    WHERE task_id = p_task_id
      AND user_id = auth.uid()
  );
$$;

-- ============================================
-- 2. Table: task_checklists
-- ============================================
CREATE TABLE IF NOT EXISTS public.task_checklists (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id text NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  title text NOT NULL,
  is_checked boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_checklists_task_id ON public.task_checklists(task_id);

-- updated_at trigger
CREATE TRIGGER set_task_checklists_updated_at
  BEFORE UPDATE ON public.task_checklists
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.task_checklists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view checklists"
  ON public.task_checklists FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin or assignee can insert checklists"
  ON public.task_checklists FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
    OR public.is_task_assignee(task_id)
  );

CREATE POLICY "Admin or assignee can update checklists"
  ON public.task_checklists FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
    OR public.is_task_assignee(task_id)
  );

CREATE POLICY "Admin or assignee can delete checklists"
  ON public.task_checklists FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
    OR public.is_task_assignee(task_id)
  );

-- ============================================
-- 3. Table: task_links
-- ============================================
CREATE TABLE IF NOT EXISTS public.task_links (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id text NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  url text NOT NULL,
  label_id uuid REFERENCES public.link_labels(id) ON DELETE SET NULL,
  note text DEFAULT '',
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_links_task_id ON public.task_links(task_id);

-- RLS
ALTER TABLE public.task_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view task_links"
  ON public.task_links FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin or assignee can insert task_links"
  ON public.task_links FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
    OR public.is_task_assignee(task_id)
  );

CREATE POLICY "Admin or assignee can delete task_links"
  ON public.task_links FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
    OR public.is_task_assignee(task_id)
  );

-- ============================================
-- 4. Table: task_comments
-- ============================================
CREATE TABLE IF NOT EXISTS public.task_comments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id text NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  content text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON public.task_comments(task_id);

-- updated_at trigger
CREATE TRIGGER set_task_comments_updated_at
  BEFORE UPDATE ON public.task_comments
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view comments"
  ON public.task_comments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin or assignee can insert comments"
  ON public.task_comments FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
    OR public.is_task_assignee(task_id)
  );

CREATE POLICY "Own comments can update"
  ON public.task_comments FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Own or admin can delete comments"
  ON public.task_comments FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- ============================================
-- 5. Enable Realtime for new tables
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_checklists;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_links;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;
