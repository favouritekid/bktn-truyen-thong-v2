export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: 'super_admin' | 'admin' | 'editor';
  is_active: boolean;
  last_login_at?: string;
  last_activity_at?: string;
  created_by?: string;
  updated_at?: string;
  created_at?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  channel: string;
  content_type: string | null;
  status: string;
  priority: string;
  deadline: string | null;
  completed_at: string | null;
  admin_note: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  // Joined data
  assignees?: Profile[];
  results?: TaskResult[];
  creator?: Profile;
}

export interface TaskResult {
  id: string;
  task_id: string;
  type: string;
  value: string;
  label: string;
  created_at: string;
  created_by: string;
}

export interface ActivityLog {
  id: number;
  user_id: string;
  action: string;
  detail: string;
  task_id: string | null;
  created_at: string;
}

export interface DashboardStats {
  total: number;
  byStatus: Record<string, number>;
  byChannel: Record<string, number>;
  byAssignee: Record<string, number>;
  overdue: Task[];
  dueSoon: Task[];
}

export interface Channel {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'archived';
  created_by?: string;
  updated_by?: string;
  archived_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: string;
  code: string;
  name: string;
  description: string;
  start_at?: string;
  end_at?: string;
  status: 'draft' | 'active' | 'paused' | 'ended' | 'archived';
  notes: string;
  created_by?: string;
  updated_by?: string;
  archived_at?: string;
  status_before_archive?: string;
  created_at: string;
  updated_at: string;
  channels?: Channel[];
}

export interface LinkLabel {
  id: string;
  name: string;
  is_active: boolean;
  created_by?: string;
  updated_by?: string;
  created_at: string;
  updated_at: string;
}
