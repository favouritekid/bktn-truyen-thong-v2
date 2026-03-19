-- Phase 2c: Link submission results to checklist items
-- Run this in Supabase SQL Editor

-- Add checklist_item_id to task_member_submission_links
ALTER TABLE public.task_member_submission_links
  ADD COLUMN IF NOT EXISTS checklist_item_id uuid REFERENCES public.task_checklists(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_submission_links_checklist_item
  ON public.task_member_submission_links(checklist_item_id);
