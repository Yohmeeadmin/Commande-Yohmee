import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// PATCH /api/portail/[token]/profil
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = getSupabaseAdmin();

  const { data: client } = await supabase
    .from('clients')
    .select('id, portal_active')
    .eq('portal_token', token)
    .single();

  if (!client?.portal_active) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const { telephone, email, adresse_livraison, ville } = await req.json();

  const { error } = await supabase
    .from('clients')
    .update({ telephone: telephone || null, email: email || null, adresse_livraison: adresse_livraison || null, ville: ville || null })
    .eq('id', client.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
