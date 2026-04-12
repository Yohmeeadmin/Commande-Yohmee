import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

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

// PATCH /api/admin/users/[id] — met à jour un utilisateur
// body: { action?: 'reset_password' } | { first_name, last_name, role, modules, ateliers, is_active }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Non autorisé' }, { status: 403 });

  const { id } = await params;
  const body = await request.json();

  // Action spéciale : reset mot de passe
  if (body.action === 'reset_password') {
    const tempPassword = generatePassword();

    const { error: authError } = await getSupabaseAdmin().auth.admin.updateUserById(id, {
      password: tempPassword,
    });
    if (authError) return NextResponse.json({ error: authError.message }, { status: 500 });

    await getSupabaseAdmin()
      .from('profiles')
      .update({ must_change_password: true })
      .eq('id', id);

    return NextResponse.json({ tempPassword });
  }

  // Mise à jour du profil
  const { first_name, last_name, role, modules, ateliers, is_active } = body;

  const { error } = await getSupabaseAdmin()
    .from('profiles')
    .update({ first_name, last_name, role, modules, ateliers, is_active })
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Si désactivé, on peut forcer la déconnexion en révoquant les sessions
  if (is_active === false) {
    await getSupabaseAdmin().auth.admin.signOut(id, 'global').catch(() => {});
  }

  return NextResponse.json({ success: true });
}

function generatePassword(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
  const array = new Uint8Array(12);
  crypto.getRandomValues(array);
  return Array.from(array, x => chars[x % chars.length]).join('');
}
