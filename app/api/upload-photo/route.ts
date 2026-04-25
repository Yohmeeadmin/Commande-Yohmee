import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// POST /api/upload-photo
// Creates a signed upload URL so the browser can upload directly to Supabase (bypasses RLS)
// Body: JSON { path: string, bucket?: string }
// Returns: { signedUrl, token, path }
export async function POST(req: NextRequest) {
  try {
    const { path, bucket = 'catalogue' } = await req.json();

    if (!path) {
      return NextResponse.json({ error: 'Chemin manquant' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ signedUrl: data.signedUrl, token: data.token, path: data.path });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? 'Erreur inconnue' }, { status: 500 });
  }
}
