-- ============================================================
-- PHASE 4: ZALO BOT NOTIFICATION INTEGRATION
-- Bảng lưu liên kết tài khoản Zalo Bot với user profiles
-- ============================================================

-- zalo_bot_users: mapping profile → zalo chat_id
CREATE TABLE IF NOT EXISTS zalo_bot_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  chat_id text NOT NULL,
  display_name text DEFAULT '',
  linked_at timestamptz DEFAULT now(),
  is_active boolean DEFAULT true,
  UNIQUE(user_id),
  UNIQUE(chat_id)
);

-- RLS
ALTER TABLE zalo_bot_users ENABLE ROW LEVEL SECURITY;

-- Admin/super_admin can view all
CREATE POLICY "admin_select_zalo_bot_users" ON zalo_bot_users
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'admin'))
    OR user_id = auth.uid()
  );

-- Users can insert their own link
CREATE POLICY "user_insert_own_zalo_bot" ON zalo_bot_users
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own link
CREATE POLICY "user_update_own_zalo_bot" ON zalo_bot_users
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- Users can delete their own link
CREATE POLICY "user_delete_own_zalo_bot" ON zalo_bot_users
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- notification_logs: lưu lịch sử gửi thông báo
CREATE TABLE IF NOT EXISTS notification_logs (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  task_id text REFERENCES tasks(id) ON DELETE SET NULL,
  recipient_user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  chat_id text NOT NULL,
  notification_type text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'sent',
  error_detail text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_select_notification_logs" ON notification_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('super_admin', 'admin'))
    OR recipient_user_id = auth.uid()
  );

CREATE POLICY "service_insert_notification_logs" ON notification_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);
