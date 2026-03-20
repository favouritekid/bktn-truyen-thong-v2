-- ============================================================
-- DATABASE SCHEMA SNAPSHOT - 2026-03-20
-- Supabase project: uqzuxendvjnqovrviufi
-- ============================================================

-- ========================
-- ENUM TYPES
-- ========================
-- user_role: super_admin, admin, editor
-- task_status: Bản nháp, Chờ duyệt KH, Đã duyệt, Đang làm, Chờ duyệt KQ, Đã đăng
-- task_priority: Cao, Trung bình, Thấp
-- campaign_status: draft, active, paused, ended, archived

-- ========================
-- TABLES
-- ========================

-- profiles (auth users)
--   id          uuid PK (from auth.users)
--   email       text NOT NULL
--   role        user_role DEFAULT 'editor'
--   full_name   text
--   is_active   bool DEFAULT true
--   last_login_at    timestamptz
--   last_activity_at timestamptz
--   created_by  uuid → auth.users(id)
--   created_at  timestamptz DEFAULT now()
--   updated_at  timestamptz DEFAULT now()

-- tasks
--   id          text PK
--   title       text NOT NULL
--   description text DEFAULT ''
--   content_type text
--   status      task_status DEFAULT 'Bản nháp'
--   priority    task_priority DEFAULT 'Trung bình'
--   deadline    timestamptz
--   completed_at timestamptz
--   admin_note  text DEFAULT ''
--   campaign_id uuid → campaigns(id) ON DELETE SET NULL
--   created_by  uuid NOT NULL → profiles(id)
--   created_at  timestamptz DEFAULT now()
--   updated_at  timestamptz DEFAULT now()

-- task_assignees (junction)
--   task_id  text → tasks(id) ON DELETE CASCADE
--   user_id  uuid → profiles(id) ON DELETE CASCADE

-- task_channels (junction)
--   task_id    text → tasks(id) ON DELETE CASCADE
--   channel_id uuid → channels(id) ON DELETE CASCADE

-- task_checklists
--   id               uuid PK
--   task_id          text → tasks(id) ON DELETE CASCADE
--   title            text NOT NULL
--   is_checked       bool DEFAULT false
--   sort_order       int DEFAULT 0
--   assignee_user_id uuid → profiles(id) ON DELETE SET NULL
--   created_by       uuid
--   created_at       timestamptz DEFAULT now()
--   updated_at       timestamptz DEFAULT now()

-- task_links
--   id         uuid PK
--   task_id    text → tasks(id) ON DELETE CASCADE
--   url        text NOT NULL
--   label_id   uuid → link_labels(id) ON DELETE SET NULL
--   note       text DEFAULT ''
--   created_by uuid
--   created_at timestamptz DEFAULT now()

-- task_comments
--   id         uuid PK
--   task_id    text → tasks(id) ON DELETE CASCADE
--   user_id    uuid NOT NULL → profiles(id)
--   content    text NOT NULL
--   created_at timestamptz DEFAULT now()
--   updated_at timestamptz DEFAULT now()

-- task_results (legacy)
--   id         uuid PK
--   task_id    text → tasks(id) ON DELETE CASCADE
--   type       text NOT NULL
--   value      text NOT NULL
--   label      text DEFAULT ''
--   created_by uuid → profiles(id)
--   created_at timestamptz DEFAULT now()

-- task_member_submissions
--   id           uuid PK
--   task_id      text → tasks(id) ON DELETE CASCADE
--   user_id      uuid → profiles(id) ON DELETE CASCADE
--   note         text DEFAULT ''
--   submitted_at timestamptz DEFAULT now()
--   updated_at   timestamptz DEFAULT now()

-- task_member_submission_links
--   id                uuid PK
--   submission_id     uuid → task_member_submissions(id) ON DELETE CASCADE
--   checklist_item_id uuid → task_checklists(id) ON DELETE SET NULL
--   label_id          uuid → link_labels(id) ON DELETE SET NULL
--   url               text NOT NULL
--   note              text DEFAULT ''
--   created_at        timestamptz DEFAULT now()

-- channels
--   id          uuid PK
--   name        text NOT NULL UNIQUE
--   description text DEFAULT ''
--   status      text DEFAULT 'active'
--   created_by  uuid
--   updated_by  uuid
--   archived_at timestamptz
--   created_at  timestamptz DEFAULT now()
--   updated_at  timestamptz DEFAULT now()

-- campaigns
--   id                    uuid PK
--   code                  text NOT NULL UNIQUE
--   name                  text NOT NULL
--   description           text DEFAULT ''
--   start_at              date
--   end_at                date
--   status                campaign_status DEFAULT 'draft'
--   notes                 text DEFAULT ''
--   created_by            uuid
--   updated_by            uuid
--   archived_at           timestamptz
--   status_before_archive campaign_status
--   created_at            timestamptz DEFAULT now()
--   updated_at            timestamptz DEFAULT now()

-- campaign_channels (junction)
--   campaign_id uuid → campaigns(id) ON DELETE CASCADE
--   channel_id  uuid → channels(id) ON DELETE CASCADE

-- link_labels
--   id         uuid PK
--   name       text NOT NULL UNIQUE
--   is_active  bool DEFAULT true
--   created_by uuid
--   updated_by uuid
--   created_at timestamptz DEFAULT now()
--   updated_at timestamptz DEFAULT now()

-- activity_logs
--   id         int8 PK
--   user_id    uuid → profiles(id)
--   action     text NOT NULL
--   detail     text DEFAULT ''
--   task_id    text → tasks(id) ON DELETE SET NULL
--   created_at timestamptz DEFAULT now()

-- ========================
-- RLS POLICIES
-- ========================

-- tasks:        SELECT (admin or assigned), INSERT (auth), UPDATE (admin or assigned), DELETE (none yet)
-- task_assignees: SELECT (all), INSERT (auth), DELETE (admin)
-- task_channels: SELECT (all), INSERT (admin/assignee), DELETE (admin/assignee)
-- task_checklists: SELECT (all), INSERT/UPDATE/DELETE (admin/assignee)
-- task_links:   SELECT (all), INSERT/DELETE (admin/assignee)
-- task_comments: SELECT (all), INSERT (admin/assignee), UPDATE (own), DELETE (own/admin)
-- task_results: SELECT (admin/assigned), INSERT (admin/assigned), DELETE (admin/own)
-- task_member_submissions: SELECT (all), INSERT/UPDATE (own), DELETE (own/admin)
-- task_member_submission_links: SELECT (all), INSERT (submission owner), DELETE (submission owner/admin)
-- profiles:     SELECT (all), UPDATE (own)
-- channels:     SELECT (all), INSERT/UPDATE (admin)
-- campaigns:    SELECT (all), INSERT/UPDATE (admin)
-- campaign_channels: SELECT (all), INSERT/UPDATE/DELETE (admin)
-- link_labels:  SELECT (all), INSERT/UPDATE (admin)
-- activity_logs: SELECT (admin/own), INSERT (auth)
