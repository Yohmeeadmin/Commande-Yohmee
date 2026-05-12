// Composant PDF universel — Facture / Devis / Avoir
// Même rendu HTML/CSS A4 que BonLivraison

import { numberToWordsFr } from '@/components/livraisons/BonLivraison';
import type { BLCompany } from '@/components/livraisons/BonLivraison';

export interface FactureItem {
  designation: string;
  quantite: number;
  prix_ht: number;
  tva_pct: number;
}

export interface FactureDoc {
  type: 'facture' | 'devis' | 'avoir';
  reference: string;
  date_emission: string;   // YYYY-MM-DD
  date_echeance?: string | null;
  date_validite?: string | null;
  devis_reference?: string | null;
  invoice_reference?: string | null;
  client: {
    nom: string;
    raison_sociale?: string | null;
    code?: string | null;
    ice?: string | null;
    adresse?: string | null;
  };
  items: FactureItem[];
  discount_percent?: number;
  notes?: string | null;
  conditions?: string | null;
  company?: BLCompany | null;
  logoUrl?: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function addDays(date: string, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// ─── Composant ───────────────────────────────────────────────────────────────

export default function FacturePDF({ doc }: { doc: FactureDoc }) {
  const co = doc.company;
  const raisonSociale = co?.raison_sociale || 'BDK FOOD SARL';
  const adresseLigne1 = co?.adresse_siege || 'Lot 911, Al Massar,';
  const cpVille = [co?.code_postal, co?.ville_siege].filter(Boolean).join(' ') || '40000 Marrakech';
  const tel = co?.telephone_societe || '0600414890';
  const email = co?.email_societe || 'Commercial@bdk-food.com';
  const siteWeb = co?.site_web || 'WWW.bdk-food.com';
  const rc = co?.rc || '151343';
  const ifFiscal = co?.if_fiscal || '660040481';
  const iceSociete = co?.ice_societe || '003524755000061';
  const tp = co?.tp || '64006880';

  const TITRE: Record<FactureDoc['type'], string> = {
    facture: 'FACTURE',
    devis: 'DEVIS',
    avoir: 'AVOIR',
  };
  const titre = TITRE[doc.type];

  const discountRate = doc.discount_percent ?? 0;

  // Totaux
  const totalsHT = doc.items.reduce((acc, item) => {
    const ht = item.prix_ht * item.quantite;
    acc.totalHT += ht;
    const key = item.tva_pct;
    acc.byVat[key] = (acc.byVat[key] ?? 0) + ht;
    return acc;
  }, { totalHT: 0, byVat: {} as Record<number, number> });

  const discountAmount = totalsHT.totalHT * (discountRate / 100);
  const totalHTAfterDiscount = totalsHT.totalHT - discountAmount;
  const totalTVA = Object.entries(totalsHT.byVat).reduce((sum, [rate, ht]) => {
    return sum + ht * (1 - discountRate / 100) * (Number(rate) / 100);
  }, 0);
  const totalTTC = totalHTAfterDiscount + totalTVA;

  const vatEntries = Object.entries(totalsHT.byVat)
    .filter(([, ht]) => ht > 0)
    .sort(([a], [b]) => Number(a) - Number(b));

  // Date d'échéance par défaut = fin de mois
  const echeance = doc.date_echeance
    ? fmtDate(doc.date_echeance)
    : doc.type === 'facture'
      ? fmtDate(addDays(doc.date_emission, 30))
      : null;

  return (
    <div style={{
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize: '11px',
      color: '#111',
      width: '210mm',
      minHeight: '297mm',
      padding: '15mm 15mm 20mm',
      boxSizing: 'border-box',
      position: 'relative',
      backgroundColor: 'white',
    }}>

      {/* ── En-tête ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12mm' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={doc.logoUrl ?? '/logo.png'} alt="Logo" style={{ height: '20mm', objectFit: 'contain' }} />
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '20px', fontWeight: 'bold', letterSpacing: '1px' }}>{titre}</div>
          <div style={{ marginTop: '3px' }}><strong>Réf. : {doc.reference}</strong></div>
          <div>Date : {fmtDate(doc.date_emission)}</div>
          {echeance && <div>Échéance : {echeance}</div>}
          {doc.date_validite && <div>Valable jusqu&apos;au : {fmtDate(doc.date_validite)}</div>}
          {doc.client.code && <div>Code client : {doc.client.code}</div>}
          {doc.devis_reference && <div style={{ color: '#555' }}>Devis : {doc.devis_reference}</div>}
          {doc.invoice_reference && <div style={{ color: '#555' }}>Facture : {doc.invoice_reference}</div>}
        </div>
      </div>

      {/* ── Émetteur / Client ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '10mm', marginBottom: '8mm' }}>
        <div style={{ flex: 1, border: '1px solid #ccc', padding: '5mm', minHeight: '35mm' }}>
          <div style={{ fontSize: '10px', color: '#555', marginBottom: '3px' }}>Émetteur :</div>
          <div style={{ fontWeight: 'bold', fontSize: '12px' }}>{raisonSociale}</div>
          <div>{adresseLigne1}</div>
          <div>{cpVille}</div>
          <div style={{ marginTop: '3mm' }}>Tél. : {tel}</div>
          <div>E-mail : {email}</div>
          <div>Site web : {siteWeb}</div>
        </div>
        <div style={{ flex: 1, border: '1px solid #ccc', padding: '5mm', minHeight: '35mm' }}>
          <div style={{ fontSize: '10px', color: '#555', marginBottom: '3px' }}>
            {doc.type === 'devis' ? 'Proposé à :' : 'Adressé à :'}
          </div>
          <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{doc.client.raison_sociale || doc.client.nom}</div>
          {doc.client.ice && <div>I.C.E : {doc.client.ice}</div>}
          {doc.client.adresse && <div style={{ marginTop: '2mm', color: '#444' }}>{doc.client.adresse}</div>}
        </div>
      </div>

      {/* ── Tableau articles ─────────────────────────────────────────────────── */}
      <div style={{ textAlign: 'right', fontSize: '10px', color: '#555', marginBottom: '2px' }}>
        Montants exprimés en MAD
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '6mm' }}>
        <thead>
          <tr style={{ backgroundColor: '#f5f5f5' }}>
            <th style={thStyle('left')}>Désignation</th>
            <th style={thStyle('center')}>TVA</th>
            <th style={thStyle('right')}>P.U. HT</th>
            <th style={thStyle('center')}>Qté</th>
            <th style={thStyle('right')}>Total HT</th>
          </tr>
        </thead>
        <tbody>
          {doc.items.map((item, idx) => {
            const totalHT = item.prix_ht * item.quantite;
            return (
              <tr key={idx} style={{ borderBottom: '1px dotted #ddd' }}>
                <td style={tdStyle('left')}>{item.designation}</td>
                <td style={tdStyle('center')}>{item.tva_pct}%</td>
                <td style={tdStyle('right')}>{item.prix_ht.toFixed(2)}</td>
                <td style={tdStyle('center')}>{item.quantite}</td>
                <td style={tdStyle('right')}>{totalHT.toFixed(2)}</td>
              </tr>
            );
          })}
          {Array.from({ length: Math.max(0, 10 - doc.items.length) }).map((_, i) => (
            <tr key={`empty-${i}`} style={{ borderBottom: '1px dotted #eee' }}>
              <td style={{ ...tdStyle('left'), height: '7mm' }}>&nbsp;</td>
              <td style={tdStyle('center')} />
              <td style={tdStyle('right')} />
              <td style={tdStyle('center')} />
              <td style={tdStyle('right')} />
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── Totaux ───────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10mm' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: '80mm' }}>
          <tbody>
            <tr>
              <td style={totalLabelStyle}>Total HT</td>
              <td style={totalValueStyle}>{totalsHT.totalHT.toFixed(2)}</td>
            </tr>
            {discountRate > 0 && (
              <>
                <tr style={{ color: '#dc2626' }}>
                  <td style={totalLabelStyle}>Remise {discountRate}%</td>
                  <td style={totalValueStyle}>-{discountAmount.toFixed(2)}</td>
                </tr>
                <tr>
                  <td style={totalLabelStyle}>Total HT après remise</td>
                  <td style={totalValueStyle}>{totalHTAfterDiscount.toFixed(2)}</td>
                </tr>
              </>
            )}
            {vatEntries.map(([rate, ht]) => {
              const tva = ht * (1 - discountRate / 100) * (Number(rate) / 100);
              return (
                <tr key={rate}>
                  <td style={totalLabelStyle}>Total TVA {rate}%</td>
                  <td style={totalValueStyle}>{tva.toFixed(2)}</td>
                </tr>
              );
            })}
            <tr style={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>
              <td style={totalLabelStyle}>{doc.type === 'avoir' ? 'Montant avoir' : 'Total TTC'}</td>
              <td style={totalValueStyle}>{totalTTC.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Montant en lettres ───────────────────────────────────────────────── */}
      <div style={{ marginBottom: '8mm' }}>
        <div style={{ fontSize: '10px', color: '#555' }}>
          {doc.type === 'avoir'
            ? 'Avoir d\'un montant de :'
            : doc.type === 'devis'
              ? 'Montant total TTC :'
              : 'Arrêté le présent document à la somme de :'}
        </div>
        <div style={{ fontWeight: 'bold', marginTop: '2px' }}>
          {numberToWordsFr(totalTTC)}
        </div>
      </div>

      {/* ── Notes / Conditions ───────────────────────────────────────────────── */}
      {(doc.notes || doc.conditions) && (
        <div style={{ marginBottom: '8mm', fontSize: '10px', color: '#444' }}>
          {doc.notes && (
            <div style={{ marginBottom: '3mm' }}>
              <span style={{ fontWeight: 'bold' }}>Notes : </span>{doc.notes}
            </div>
          )}
          {doc.conditions && (
            <div>
              <span style={{ fontWeight: 'bold' }}>Conditions : </span>{doc.conditions}
            </div>
          )}
        </div>
      )}

      {/* ── Pied de page ─────────────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute',
        bottom: '10mm',
        left: '15mm',
        right: '15mm',
        textAlign: 'center',
        fontSize: '9px',
        color: '#555',
        borderTop: '1px solid #ddd',
        paddingTop: '3mm',
      }}>
        <div style={{ fontWeight: 'bold', marginBottom: '1px' }}>
          Siège social : {raisonSociale} - {adresseLigne1} - {cpVille}
        </div>
        <div>Téléphone : {tel} - {siteWeb} - {email}</div>
        <div>
          {[rc && `R.C : ${rc}`, ifFiscal && `I.F : ${ifFiscal}`, iceSociete && `I.C.E : ${iceSociete}`, tp && `T.P : ${tp}`].filter(Boolean).join(' - ')}
          &nbsp;&nbsp;1/1
        </div>
      </div>
    </div>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

function thStyle(align: 'left' | 'center' | 'right'): React.CSSProperties {
  return {
    textAlign: align,
    padding: '3mm 2mm',
    border: '1px solid #ccc',
    fontWeight: 'bold',
    fontSize: '10px',
    backgroundColor: '#f5f5f5',
  };
}

function tdStyle(align: 'left' | 'center' | 'right'): React.CSSProperties {
  return { textAlign: align, padding: '2mm 2mm', fontSize: '10.5px' };
}

const totalLabelStyle: React.CSSProperties = {
  padding: '2mm 4mm',
  fontSize: '11px',
  borderBottom: '1px solid #eee',
};

const totalValueStyle: React.CSSProperties = {
  padding: '2mm 4mm',
  textAlign: 'right',
  fontSize: '11px',
  borderBottom: '1px solid #eee',
  minWidth: '30mm',
};
