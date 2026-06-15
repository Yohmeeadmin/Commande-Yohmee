import { supabase } from '@/lib/supabase/client';
import { localDateStr } from '@/lib/utils';

// ─── Constantes partagées ────────────────────────────────────────────────────

export const STATUTS_FACTURE = [
  { value: 'brouillon',            label: 'Brouillon', color: 'text-gray-600',   bg: 'bg-gray-100' },
  { value: 'emise',                label: 'Émise',     color: 'text-blue-600',   bg: 'bg-blue-100' },
  { value: 'partiellement_reglee', label: 'Partiel',   color: 'text-orange-500', bg: 'bg-orange-100' },
  { value: 'soldee',               label: 'Soldée',    color: 'text-green-600',  bg: 'bg-green-100' },
  { value: 'annulee',              label: 'Annulée',   color: 'text-red-600',    bg: 'bg-red-100' },
];

export const STATUTS_BL: Record<string, { label: string; color: string; bg: string }> = {
  brouillon: { label: 'Brouillon', color: 'text-gray-600',  bg: 'bg-gray-100' },
  emis:      { label: 'Émis',     color: 'text-blue-600',   bg: 'bg-blue-100' },
  facture:   { label: 'Facturé',  color: 'text-green-600',  bg: 'bg-green-100' },
};

export const MODES_PAIEMENT = [
  { value: 'virement', label: 'Virement' },
  { value: 'especes',  label: 'Espèces' },
  { value: 'cheque',   label: 'Chèque' },
  { value: 'carte',    label: 'Carte' },
  { value: 'avoir',    label: 'Avoir' },
];

export const TVA_OPTIONS = [0, 10, 20];

// ─── nextRef ─────────────────────────────────────────────────────────────────

/**
 * Génère la prochaine référence au format PREFIX-YYYYMM-NNNN.
 * Exemple : nextRef('FA', 'invoices') → 'FA-202605-0001'
 */
export async function nextRef(prefix: string, table: string): Promise<string> {
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const { data } = await supabase
    .from(table)
    .select('reference')
    .like('reference', `${prefix}-${ym}-%`)
    .order('reference', { ascending: false })
    .limit(1);
  const last = (data as { reference: string }[] | null)?.[0]?.reference;
  const num = last ? parseInt(last.split('-').pop() ?? '0') + 1 : 1;
  return `${prefix}-${ym}-${String(num).padStart(4, '0')}`;
}

// ─── calcTotals ──────────────────────────────────────────────────────────────

type CalcItem = {
  quantite?: number;
  quantity?: number;
  prix_ht?: number;
  unit_price?: number;
  tva_pct?: number;
  vat_rate?: number;
};

/**
 * Calcule HT, TVA, TTC.
 * La remise s'applique sur le HT AVANT le calcul TVA :
 *   ht_net = ht_brut × (1 − discount/100)
 *   tva    = ht_net × (tva_pct/100)
 */
export function calcTotals(
  items: CalcItem[],
  discountPercent = 0
): { total_ht: number; total_tva: number; total_ttc: number } {
  const factor = 1 - discountPercent / 100;

  const total_ht_brut = items.reduce((s, i) => {
    const qty = i.quantite ?? i.quantity ?? 0;
    const pu  = i.prix_ht ?? i.unit_price ?? 0;
    return s + qty * pu;
  }, 0);

  const total_ht = total_ht_brut * factor;

  const total_tva = items.reduce((s, i) => {
    const qty  = i.quantite ?? i.quantity ?? 0;
    const pu   = i.prix_ht ?? i.unit_price ?? 0;
    const rate = i.tva_pct ?? i.vat_rate ?? 0;
    return s + qty * pu * factor * (rate / 100);
  }, 0);

  return { total_ht, total_tva, total_ttc: total_ht + total_tva };
}

// ─── createInvoiceFromBL ─────────────────────────────────────────────────────

interface BLForInvoice {
  id: string;
  numero: string;
  delivery_date: string;
  items: { display_name: string; unit_price: number; quantity: number; vat_rate: number }[];
}

/**
 * Crée une facture (statut 'brouillon') depuis un bon de livraison.
 * Met à jour le statut du BL à 'facture'.
 * Retourne { ok: true, reference } ou { ok: false, error }.
 */
export async function createInvoiceFromBL(
  bl: BLForInvoice,
  clientId: string,
  formatDate: (d: string) => string
): Promise<{ ok: true; reference: string } | { ok: false; error: string }> {
  try {
    const items = bl.items ?? [];
    const { total_ht, total_tva, total_ttc } = calcTotals(items);

    const reference = await nextRef('FA', 'invoices');

    const { data: inv, error: invError } = await supabase
      .from('invoices')
      .insert({
        reference,
        client_id: clientId,
        statut: 'brouillon',
        date_emission: localDateStr(),
        total_ht,
        total_tva,
        total_ttc,
        total_regle: 0,
        discount_percent: 0,
      })
      .select()
      .single();

    if (invError || !inv) {
      return { ok: false, error: invError?.message ?? 'Erreur lors de la création de la facture' };
    }

    const { error: itemsError } = await supabase.from('invoice_items').insert(
      items.map((i, pos) => ({
        invoice_id: inv.id,
        designation: `${i.display_name} — BL ${bl.numero} du ${formatDate(bl.delivery_date)}`,
        quantite: i.quantity,
        prix_ht: i.unit_price,
        tva_pct: i.vat_rate,
        position: pos,
      }))
    );

    if (itemsError) {
      return { ok: false, error: itemsError.message };
    }

    const { error: linkError } = await supabase.from('invoice_bons_livraison').insert({
      invoice_id: inv.id,
      bon_livraison_id: bl.id,
    });

    if (linkError) {
      return { ok: false, error: linkError.message };
    }

    const { error: blError } = await supabase
      .from('bons_livraison')
      .update({ statut: 'facture' })
      .eq('id', bl.id);

    if (blError) {
      return { ok: false, error: blError.message };
    }

    return { ok: true, reference };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}
