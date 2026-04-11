'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

export interface AtelierDB {
  id: string;
  value: string;
  label: string;
  color: string;
  bg_color: string;
  sort_order: number;
}

let cache: AtelierDB[] | null = null;
const listeners: Array<(ateliers: AtelierDB[]) => void> = [];

function notify(ateliers: AtelierDB[]) {
  cache = ateliers;
  listeners.forEach(fn => fn(ateliers));
}

export async function refreshAteliers() {
  const { data } = await supabase.from('ateliers').select('*').order('sort_order');
  if (data) notify(data);
}

export function useAteliers() {
  const [ateliers, setAteliers] = useState<AtelierDB[]>(cache || []);

  useEffect(() => {
    listeners.push(setAteliers);
    if (!cache) {
      refreshAteliers();
    } else {
      setAteliers(cache);
    }
    return () => {
      const idx = listeners.indexOf(setAteliers);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }, []);

  const getStyle = (value: string) => {
    const a = ateliers.find(at => at.value === value);
    if (a) return { label: a.label, color: a.color, bgColor: a.bg_color };
    return { label: value, color: '#6B7280', bgColor: '#F3F4F6' };
  };

  return { ateliers, getStyle };
}
