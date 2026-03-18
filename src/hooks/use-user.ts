'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/lib/types';
import type { User } from '@supabase/supabase-js';

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    async function load() {
      setLoading(true);
      const { data: { user: authUser } } = await supabase.auth.getUser();
      setUser(authUser);

      if (authUser) {
        const { data } = await supabase
          .from('profiles')
          .select('id, email, full_name, role, is_active, last_login_at, last_activity_at, created_by, created_at, updated_at')
          .eq('id', authUser.id)
          .single();
        setProfile(data as Profile | null);
      }
      setLoading(false);
    }

    load();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser(session.user);
        supabase
          .from('profiles')
          .select('id, email, full_name, role, is_active, last_login_at, last_activity_at, created_by, created_at, updated_at')
          .eq('id', session.user.id)
          .single()
          .then(({ data }) => setProfile(data as Profile | null));
      } else {
        setUser(null);
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, profile, loading };
}
