export interface Profile {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'editor';
  status: 'active' | 'inactive';
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
