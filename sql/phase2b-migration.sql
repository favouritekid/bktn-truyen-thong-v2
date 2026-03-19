-- Phase 2b: Multi-channel per task, checklist assignees, per-editor submissions
-- Run this in Supabase SQL Editor

-- ============================================
-- 1. Table: task_channels (junction table)
-- ============================================
CREATE TABLE IF NOT EXISTS public.task_channels (
  task_id text NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, channel_id)
);

CREATE INDEX IF NOT EXISTS idx_task_channels_task_id ON public.task_channels(task_id);
CREATE INDEX IF NOT EXISTS idx_task_channels_channel_id ON public.task_channels(channel_id);

-- RLS
ALTER TABLE public.task_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view task_channels"
  ON public.task_channels FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin or assignee can insert task_channels"
  ON public.task_channels FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
    OR public.is_task_assignee(task_id)
  );

CREATE POLICY "Admin or assignee can delete task_channels"
  ON public.task_channels FOR DELETE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
    OR public.is_task_assignee(task_id)
  );

-- ============================================
-- 2. Migrate existing channel data to task_channels
--    (run this ONCE to move string data to junction)
-- ============================================
INSERT INTO public.task_channels (task_id, channel_id)
SELECT t.id, c.id
FROM public.tasks t
JOIN public.channels c ON c.name = t.channel
WHERE t.channel IS NOT NULL AND t.channel != ''
ON CONFLICT DO NOTHING;

-- ============================================
-- 3. Add assignee_user_id to task_checklists
-- ============================================
ALTER TABLE public.task_checklists
  ADD COLUMN IF NOT EXISTS assignee_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- ============================================
-- 4. Table: task_member_submissions
-- ============================================
CREATE TABLE IF NOT EXISTS public.task_member_submissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id text NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  note text DEFAULT '',
  submitted_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_task_member_submissions_task_id ON public.task_member_submissions(task_id);

-- updated_at trigger
CREATE TRIGGER set_task_member_submissions_updated_at
  BEFORE UPDATE ON public.task_member_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- RLS
ALTER TABLE public.task_member_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view submissions"
  ON public.task_member_submissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "User can insert own submission"
  ON public.task_member_submissions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "User can update own submission"
  ON public.task_member_submissions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "User can delete own submission"
  ON public.task_member_submissions FOR DELETE
  TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- ============================================
-- 5. Table: task_member_submission_links
-- ============================================
CREATE TABLE IF NOT EXISTS public.task_member_submission_links (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  submission_id uuid NOT NULL REFERENCES public.task_member_submissions(id) ON DELETE CASCADE,
  label_id uuid REFERENCES public.link_labels(id) ON DELETE SET NULL,
  url text NOT NULL,
  note text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_submission_links_submission_id ON public.task_member_submission_links(submission_id);

-- RLS
ALTER TABLE public.task_member_submission_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view submission_links"
  ON public.task_member_submission_links FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Submission owner can insert links"
  ON public.task_member_submission_links FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.task_member_submissions
      WHERE id = submission_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Submission owner can delete links"
  ON public.task_member_submission_links FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.task_member_submissions
      WHERE id = submission_id AND user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

-- ============================================
-- 6. Enable Realtime for new tables
-- ============================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_channels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_member_submissions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_member_submission_links;

-- ============================================
-- 7. Update deadline column to timestamptz if it's date-only
--    (safe to run - keeps existing data)
-- ============================================
-- If your tasks.deadline is currently 'date' type, uncomment the next line:
-- ALTER TABLE public.tasks ALTER COLUMN deadline TYPE timestamptz USING deadline::timestamptz;

-- ============================================
-- 8. (Optional) Drop the old channel column from tasks after confirming migration
-- Do NOT run this until you've verified task_channels data is correct!
-- ============================================
-- ALTER TABLE public.tasks DROP COLUMN IF EXISTS channel;
