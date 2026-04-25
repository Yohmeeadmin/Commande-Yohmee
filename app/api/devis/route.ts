import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { getResend, ADMIN_EMAIL, FROM_EMAIL } from '@/lib/resend';

export interface DevisItem {
  article_id: string;
  display_name: string;
  quantity: number;
  unit: string | null;
  unit_price: number;
  vat_rate: number;
}

function formatPrice(n: number) {
  return n.toFixed(2).replace('.', ',') + ' MAD';
}

function buildProspectEmail(nom: string, items: DevisItem[], totalHt: number, totalTtc: number): string {
  const rows = items
    .map(
      it => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#111">${it.display_name}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#555;text-align:center">${it.quantity}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;color:#555;text-align:right">${formatPrice(it.unit_price)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;font-weight:600;color:#111;text-align:right">${formatPrice(it.quantity * it.unit_price)}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Demande de devis BDK</title></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#fff;border:1px solid #e0e0e0">
    <div style="background:#000;padding:24px 32px">
      <p style="margin:0;color:#fff;font-size:22px;font-weight:900;letter-spacing:2px;text-transform:uppercase">BDK</p>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.5);font-size:11px;text-transform:uppercase;letter-spacing:2px">Demande de devis</p>
    </div>
    <div style="padding:32px">
      <p style="margin:0 0 24px;font-size:15px;color:#333">Bonjour <strong>${nom}</strong>,</p>
      <p style="margin:0 0 24px;font-size:14px;color:#555;line-height:1.6">
        Nous avons bien reçu votre demande de devis. Voici le récapitulatif des articles sélectionnés.
        Notre équipe vous contactera dans les plus brefs délais.
      </p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <thead>
          <tr style="background:#f8f8f8">
            <th style="padding:10px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999;text-align:left">Article</th>
            <th style="padding:10px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999;text-align:center">Qté</th>
            <th style="padding:10px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999;text-align:right">Prix unit.</th>
            <th style="padding:10px 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999;text-align:right">Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <div style="background:#f8f8f8;padding:16px;text-align:right">
        <p style="margin:0 0 4px;font-size:12px;color:#999">Total HT : <strong style="color:#333">${formatPrice(totalHt)}</strong></p>
        <p style="margin:0;font-size:15px;font-weight:700;color:#111">Total TTC : ${formatPrice(totalTtc)}</p>
      </div>

      <p style="margin:32px 0 0;font-size:13px;color:#888;border-top:1px solid #f0f0f0;padding-top:24px">
        Ce devis est indicatif. Les prix définitifs seront confirmés par notre équipe commerciale.<br>
        Pour toute question : <a href="mailto:contact@bdk.ma" style="color:#000">contact@bdk.ma</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

function buildAdminEmail(
  data: { raison_sociale: string; nom_contact: string; telephone: string; email: string; adresse?: string; ville?: string; message?: string },
  items: DevisItem[],
  totalHt: number
): string {
  const rows = items
    .map(
      it => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px">${it.display_name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;text-align:center">${it.quantity}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;text-align:right">${formatPrice(it.unit_price)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:13px;font-weight:600;text-align:right">${formatPrice(it.quantity * it.unit_price)}</td>
      </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#fff;border:1px solid #e0e0e0">
    <div style="background:#000;padding:20px 28px">
      <p style="margin:0;color:#fff;font-size:14px;font-weight:900;letter-spacing:2px;text-transform:uppercase">BDK — Nouvelle demande de devis</p>
    </div>
    <div style="padding:28px">
      <table style="width:100%;margin-bottom:24px">
        <tr><td style="font-size:12px;color:#999;text-transform:uppercase;letter-spacing:1px;padding-bottom:4px">Entreprise</td><td style="font-size:14px;font-weight:700">${data.raison_sociale}</td></tr>
        <tr><td style="font-size:12px;color:#999;text-transform:uppercase;letter-spacing:1px;padding:4px 0">Contact</td><td style="font-size:14px">${data.nom_contact}</td></tr>
        <tr><td style="font-size:12px;color:#999;text-transform:uppercase;letter-spacing:1px;padding:4px 0">Téléphone</td><td style="font-size:14px"><a href="tel:${data.telephone}" style="color:#000">${data.telephone}</a></td></tr>
        <tr><td style="font-size:12px;color:#999;text-transform:uppercase;letter-spacing:1px;padding:4px 0">Email</td><td style="font-size:14px"><a href="mailto:${data.email}" style="color:#000">${data.email}</a></td></tr>
        ${data.ville ? `<tr><td style="font-size:12px;color:#999;text-transform:uppercase;letter-spacing:1px;padding:4px 0">Ville</td><td style="font-size:14px">${data.ville}</td></tr>` : ''}
        ${data.message ? `<tr><td style="font-size:12px;color:#999;text-transform:uppercase;letter-spacing:1px;padding:4px 0">Message</td><td style="font-size:14px;color:#555">${data.message}</td></tr>` : ''}
      </table>

      <p style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#999;margin-bottom:8px">Articles demandés</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <thead>
          <tr style="background:#f8f8f8">
            <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;color:#aaa;text-align:left">Article</th>
            <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;color:#aaa;text-align:center">Qté</th>
            <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;color:#aaa;text-align:right">Prix</th>
            <th style="padding:8px 12px;font-size:11px;text-transform:uppercase;color:#aaa;text-align:right">Total</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <p style="text-align:right;font-size:14px;font-weight:700;margin:0">Total HT : ${formatPrice(totalHt)}</p>
    </div>
  </div>
</body>
</html>`;
}

// POST /api/devis — public
export async function POST(req: NextRequest) {
  const supabase = getSupabaseAdmin();
  const body = await req.json();

  const { raison_sociale, nom_contact, telephone, email, adresse, ville, message, items } = body as {
    raison_sociale: string;
    nom_contact: string;
    telephone: string;
    email: string;
    adresse?: string;
    ville?: string;
    message?: string;
    items: DevisItem[];
  };

  if (!raison_sociale || !nom_contact || !telephone || !email) {
    return NextResponse.json({ error: 'Champs obligatoires manquants' }, { status: 400 });
  }
  if (!items || items.length === 0) {
    return NextResponse.json({ error: 'Aucun article sélectionné' }, { status: 400 });
  }

  const totalHt = items.reduce((s, it) => s + it.quantity * it.unit_price, 0);
  const totalTtc = items.reduce((s, it) => {
    const vatMult = 1 + (it.vat_rate ?? 20) / 100;
    return s + it.quantity * it.unit_price * vatMult;
  }, 0);

  const { error: dbError } = await supabase.from('devis_requests').insert({
    raison_sociale: raison_sociale.trim(),
    nom_contact: nom_contact.trim(),
    telephone: telephone.trim(),
    email: email.trim().toLowerCase(),
    adresse: adresse?.trim() || null,
    ville: ville?.trim() || null,
    message: message?.trim() || null,
    items,
    total_ht: Math.round(totalHt * 100) / 100,
    status: 'nouveau',
  });

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

  // Emails — skip gracefully if Resend is not configured
  const resend = getResend();
  if (resend) {
    const emailData = { raison_sociale, nom_contact, telephone, email, adresse, ville, message };
    await Promise.allSettled([
      // Confirmation to prospect
      resend.emails.send({
        from: FROM_EMAIL,
        to: email.trim().toLowerCase(),
        subject: 'Votre demande de devis BDK',
        html: buildProspectEmail(nom_contact, items, totalHt, totalTtc),
      }),
      // Notification to admin
      ...(ADMIN_EMAIL
        ? [resend.emails.send({
            from: FROM_EMAIL,
            to: ADMIN_EMAIL,
            subject: `Nouvelle demande de devis — ${raison_sociale}`,
            html: buildAdminEmail(emailData, items, totalHt),
          })]
        : []),
    ]);
  }

  return NextResponse.json({ success: true });
}

// GET /api/devis — admin, returns all devis requests
export async function GET() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('devis_requests')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data });
}
