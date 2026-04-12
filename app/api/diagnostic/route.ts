import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const TABLES_REQUIRED = [
  'profiles',
  'categories',
  'products',
  'clients',
  'orders',
  'order_items',
  'recurring_orders',
  'recurring_order_items',
  'product_references',
  'product_articles',
  'delivery_slots',
  'drivers',
  'ateliers',
];

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const envOk = {
    NEXT_PUBLIC_SUPABASE_URL: !!url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: !!key,
    SUPABASE_SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  };

  if (!url || !key) {
    return NextResponse.json({ ok: false, env: envOk, tables: null });
  }

  const supabase = createClient(url, key);

  const tableResults: Record<string, boolean> = {};

  await Promise.all(
    TABLES_REQUIRED.map(async (table) => {
      const { error } = await supabase.from(table).select('*').limit(0);
      // error.code 42P01 = table does not exist
      tableResults[table] = !error || error.code !== '42P01';
    })
  );

  const allTablesOk = Object.values(tableResults).every(Boolean);

  return NextResponse.json({
    ok: allTablesOk && Object.values(envOk).every(Boolean),
    env: envOk,
    tables: tableResults,
  });
}
