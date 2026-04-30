import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// GET /api/portail/[token]
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = getSupabaseAdmin();

  const { data: client, error } = await supabase
    .from('clients')
    .select('id, nom, raison_sociale, telephone, email, adresse_livraison, ville, type_client, portal_active, company_id')
    .eq('portal_token', token)
    .single();

  if (error || !client) return NextResponse.json({ error: 'Lien invalide' }, { status: 404 });
  if (!client.portal_active) return NextResponse.json({ error: 'Portail non activé' }, { status: 403 });

  // Chercher les settings de l'entreprise du client (ou la première si pas de company_id)
  const settingsQuery = supabase
    .from('app_settings')
    .select('company_name, logo_url, portal_order_deadline');

  const { data: settings } = client.company_id
    ? await settingsQuery.eq('company_id', client.company_id).maybeSingle()
    : await settingsQuery.order('id').limit(1).maybeSingle();

  return NextResponse.json({ client, settings });
}
