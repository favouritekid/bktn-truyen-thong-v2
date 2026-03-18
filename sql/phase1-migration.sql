-- ============================================================
-- Phase 1 Migration: Auth, Roles, User Management, Master Data
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1.1 Add super_admin to user_role enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'super_admin' BEFORE 'admin';

-- 1.2 Update profiles schema
-- Add new columns
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Migrate data: full_name = name, is_active from status
UPDATE profiles SET full_name = name WHERE full_name IS NULL;
UPDATE profiles SET is_active = (status = 'active') WHERE true;

-- Drop old columns
ALTER TABLE profiles DROP COLUMN IF EXISTS name;
ALTER TABLE profiles DROP COLUMN IF EXISTS status;

-- Drop the old user_status enum (if exists and no longer referenced)
DROP TYPE IF EXISTS user_status;

-- Upgrade hapham1388@gmail.com to super_admin
UPDATE profiles
SET role = 'super_admin'
WHERE email = 'hapham1388@gmail.com';

-- 1.3 Create new tables

-- Channels
CREATE TABLE IF NOT EXISTS channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  archived_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Campaign status enum
DO $$ BEGIN
  CREATE TYPE campaign_status AS ENUM ('draft', 'active', 'paused', 'ended', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text DEFAULT '',
  start_at date,
  end_at date,
  status campaign_status NOT NULL DEFAULT 'draft',
  notes text DEFAULT '',
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  archived_at timestamptz,
  status_before_archive campaign_status,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Campaign-Channels junction table
CREATE TABLE IF NOT EXISTS campaign_channels (
  campaign_id uuid NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  channel_id uuid NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, channel_id)
);

-- Link Labels
CREATE TABLE IF NOT EXISTS link_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 1.4 Pre-populate channels
INSERT INTO channels (name, description) VALUES
  ('Facebook', 'Kênh Facebook'),
  ('TikTok/YouTube', 'Kênh TikTok và YouTube'),
  ('Website/Blog', 'Website và Blog'),
  ('Zalo OA', 'Zalo Official Account')
ON CONFLICT (name) DO NOTHING;

-- 1.5 Update handle_new_user() trigger to use full_name and is_active
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, is_active)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'full_name', new.email),
    'editor',
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name);
  RETURN new;
END;
$$;

-- 1.6 Create updated_at triggers

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Profiles
DROP TRIGGER IF EXISTS set_profiles_updated_at ON profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Campaigns
DROP TRIGGER IF EXISTS set_campaigns_updated_at ON campaigns;
CREATE TRIGGER set_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Channels
DROP TRIGGER IF EXISTS set_channels_updated_at ON channels;
CREATE TRIGGER set_channels_updated_at
  BEFORE UPDATE ON channels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Link Labels
DROP TRIGGER IF EXISTS set_link_labels_updated_at ON link_labels;
CREATE TRIGGER set_link_labels_updated_at
  BEFORE UPDATE ON link_labels
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 1.7 RLS Policies

-- Helper function
CREATE OR REPLACE FUNCTION is_admin_or_above()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND role IN ('admin', 'super_admin')
  );
$$;

-- Enable RLS on new tables
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE link_labels ENABLE ROW LEVEL SECURITY;

-- Channels policies
DROP POLICY IF EXISTS "channels_select" ON channels;
CREATE POLICY "channels_select" ON channels
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "channels_insert" ON channels;
CREATE POLICY "channels_insert" ON channels
  FOR INSERT TO authenticated WITH CHECK (is_admin_or_above());

DROP POLICY IF EXISTS "channels_update" ON channels;
CREATE POLICY "channels_update" ON channels
  FOR UPDATE TO authenticated USING (is_admin_or_above());

-- Campaigns policies
DROP POLICY IF EXISTS "campaigns_select" ON campaigns;
CREATE POLICY "campaigns_select" ON campaigns
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "campaigns_insert" ON campaigns;
CREATE POLICY "campaigns_insert" ON campaigns
  FOR INSERT TO authenticated WITH CHECK (is_admin_or_above());

DROP POLICY IF EXISTS "campaigns_update" ON campaigns;
CREATE POLICY "campaigns_update" ON campaigns
  FOR UPDATE TO authenticated USING (is_admin_or_above());

-- Campaign Channels policies
DROP POLICY IF EXISTS "campaign_channels_select" ON campaign_channels;
CREATE POLICY "campaign_channels_select" ON campaign_channels
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "campaign_channels_insert" ON campaign_channels;
CREATE POLICY "campaign_channels_insert" ON campaign_channels
  FOR INSERT TO authenticated WITH CHECK (is_admin_or_above());

DROP POLICY IF EXISTS "campaign_channels_update" ON campaign_channels;
CREATE POLICY "campaign_channels_update" ON campaign_channels
  FOR UPDATE TO authenticated USING (is_admin_or_above());

DROP POLICY IF EXISTS "campaign_channels_delete" ON campaign_channels;
CREATE POLICY "campaign_channels_delete" ON campaign_channels
  FOR DELETE TO authenticated USING (is_admin_or_above());

-- Link Labels policies
DROP POLICY IF EXISTS "link_labels_select" ON link_labels;
CREATE POLICY "link_labels_select" ON link_labels
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "link_labels_insert" ON link_labels;
CREATE POLICY "link_labels_insert" ON link_labels
  FOR INSERT TO authenticated WITH CHECK (is_admin_or_above());

DROP POLICY IF EXISTS "link_labels_update" ON link_labels;
CREATE POLICY "link_labels_update" ON link_labels
  FOR UPDATE TO authenticated USING (is_admin_or_above());
