'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Channel } from '@/lib/types';

export function useChannels() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const supabase = createClient();
      const { data } = await supabase
        .from('channels')
        .select('id, name, description, status, created_at, updated_at')
        .eq('status', 'active')
        .order('name');
      setChannels((data as Channel[]) || []);
      setLoading(false);
    }
    fetch();
  }, []);

  return { channels, loading };
}
