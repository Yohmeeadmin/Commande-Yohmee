import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// Vérifie que le requêtant est admin
async function verifyAdmin(request: NextRequest) {
  const auth = request.headers.get('Authorization');
  if (!auth) return null;
  const token = auth.replace('Bearer ', '');
  const { data: { user }, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await getSupabaseAdmin()
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') return null;
  return user;
}

// GET /api/admin/users — liste tous les utilisateurs
export async function GET(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const { data, error } = await getSupabaseAdmin()
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/admin/users — crée un utilisateur
export async function POST(request: NextRequest) {
  const admin = await verifyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const body = await request.json();
  const { first_name, last_name, email, role, modules, ateliers, driver_id } = body;

  if (!email || !first_name || !last_name || !role) {
    return NextResponse.json({ error: 'Champs manquants' }, { status: 400 });
  }

  // Générer un mot de passe provisoire
  const tempPassword = generatePassword();

  // Créer l'utilisateur dans Supabase Auth
  const { data: authUser, error: authError } = await getSupabaseAdmin().auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password: tempPassword,
    email_confirm: true, // pas besoin de confirmation email
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  // Créer le profil
  const { error: profileError } = await getSupabaseAdmin().from('profiles').insert({
    id: authUser.user.id,
    first_name: first_name.trim(),
    last_name: last_name.trim(),
    email: email.trim().toLowerCase(),
    role,
    modules: modules || [],
    ateliers: ateliers || [],
    driver_id: driver_id || null,
    is_active: true,
    must_change_password: true,
  });

  if (profileError) {
    // Rollback : supprimer l'user auth créé
    await getSupabaseAdmin().auth.admin.deleteUser(authUser.user.id);
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  return NextResponse.json({ tempPassword }, { status: 201 });
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  const array = new Uint8Array(12);
  crypto.getRandomValues(array);
  return Array.from(array, x => chars[x % chars.length]).join('');
}
