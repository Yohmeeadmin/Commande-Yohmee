import { NextRequest, NextResponse } from 'next/server';
import { sendWhatsApp } from '@/lib/whatsapp';

export async function POST(req: NextRequest) {
  const { phone, message } = await req.json();
  if (!phone || !message) {
    return NextResponse.json({ error: 'phone et message requis' }, { status: 400 });
  }
  const ok = await sendWhatsApp(phone, message);
  if (!ok) {
    return NextResponse.json({ error: 'Échec envoi WhatsApp' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
