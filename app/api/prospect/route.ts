import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// POST /api/prospect — public, no auth
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const { raison_sociale, nom_contact, telephone, email, adresse, ville, message } = await req.json();

  if (!raison_sociale || !nom_contact || !telephone || !email) {
    return NextResponse.json({ error: 'Champs obligatoires manquants' }, { status: 400 });
  }

  const { error } = await supabase.from('prospect_requests').insert({
    raison_sociale: raison_sociale.trim(),
    nom_contact: nom_contact.trim(),
    telephone: telephone.trim(),
    email: email.trim().toLowerCase(),
    adresse: adresse?.trim() || null,
    ville: ville?.trim() || null,
    message: message?.trim() || null,
    status: 'nouveau',
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// GET /api/prospect — admin only (called from parametres page via supabase client directly)
