// Composant Bon de Livraison — format A4, fidèle au modèle BDK FOOD SARL

export interface BLItem {
  display_name: string;
  vat_rate: number;      // 0 | 10 | 20
  unit_price: number;    // HT
  quantity: number;
}

export interface BLCompany {
  raison_sociale?: string | null;
  adresse_siege?: string | null;
  code_postal?: string | null;
  ville_siege?: string | null;
  telephone_societe?: string | null;
  email_societe?: string | null;
  site_web?: string | null;
  rc?: string | null;
  if_fiscal?: string | null;
  ice_societe?: string | null;
  tp?: string | null;
  cnss?: string | null;
}

export interface BLOrder {
  numero: string;
  delivery_date: string; // YYYY-MM-DD
  client: {
    nom: string;
    code?: string | null;
    ice?: string | null;
    adresse_livraison?: string | null;
  };
  items: BLItem[];
  logoUrl?: string | null;
  company?: BLCompany | null;
}

// ─── Utilitaires ──────────────────────────────────────────────────────────────

function fmtDate(s: string): string {
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
}

function lastDayOfMonth(s: string): string {
  const [y, m] = s.split('-').map(Number);
  const last = new Date(y, m, 0); // jour 0 du mois suivant = dernier jour du mois courant
  return fmtDate(`${y}-${String(m).padStart(2, '0')}-${String(last.getDate()).padStart(2, '0')}`);
}

const UNITS_FR = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const TENS_FR = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

function belowHundred(n: number): string {
  if (n < 20) return UNITS_FR[n];
  const ten = Math.floor(n / 10);
  const unit = n % 10;
  if (ten === 7) return unit === 1 ? 'soixante et onze' : `soixante-${UNITS_FR[10 + unit]}`;
  if (ten === 9) return `quatre-vingt-${UNITS_FR[unit] || ''}`.replace(/-$/, unit === 0 ? 's' : '');
  if (unit === 0) return TENS_FR[ten] + (ten === 8 ? 's' : '');
  if (unit === 1 && ten !== 8) return `${TENS_FR[ten]} et un`;
  return `${TENS_FR[ten]}-${UNITS_FR[unit]}`;
}

function belowThousand(n: number): string {
  if (n === 0) return '';
  if (n < 100) return belowHundred(n);
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const prefix = hundreds === 1 ? 'cent' : `${UNITS_FR[hundreds]} cent${rest === 0 && hundreds > 1 ? 's' : ''}`;
  return rest === 0 ? prefix : `${prefix} ${belowHundred(rest)}`;
}

export function numberToWordsFr(amount: number): string {
  const total = Math.round(amount);
  if (total === 0) return 'zéro dirham';
  const millions = Math.floor(total / 1_000_000);
  const thousands = Math.floor((total % 1_000_000) / 1000);
  const hundreds = total % 1000;

  const parts: string[] = [];
  if (millions > 0) parts.push(`${belowThousand(millions)} million${millions > 1 ? 's' : ''}`);
  if (thousands > 0) parts.push(thousands === 1 ? 'mille' : `${belowThousand(thousands)} mille`);
  if (hundreds > 0) parts.push(belowThousand(hundreds));

  const words = parts.join(' ').trim();
  // Capitalise première lettre
  return (words.charAt(0).toUpperCase() + words.slice(1)) + ' dirham' + (total > 1 ? 's' : '');
}

// ─── Composant BL ─────────────────────────────────────────────────────────────

export default function BonLivraison({ order }: { order: BLOrder }) {
  const co = order.company;
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
  // Regrouper les items par taux TVA pour le calcul des totaux
  const totalsHT = order.items.reduce((acc, item) => {
    const ht = item.unit_price * item.quantity;
    acc.totalHT += ht;
    const key = item.vat_rate;
    acc.byVat[key] = (acc.byVat[key] ?? 0) + ht;
    return acc;
  }, { totalHT: 0, byVat: {} as Record<number, number> });

  const totalTVA = Object.entries(totalsHT.byVat).reduce((sum, [rate, ht]) => {
    return sum + ht * (Number(rate) / 100);
  }, 0);

  const totalTTC = totalsHT.totalHT + totalTVA;

  const vatEntries = Object.entries(totalsHT.byVat)
    .filter(([, ht]) => ht > 0)
    .sort(([a], [b]) => Number(a) - Number(b));

  return (
    <div style={{
      fontFamily: 'Arial, Helvetica, sans-serif',
      fontSize: '11px',
      color: '#111',
      width: '210mm',
      height: '297mm',
      padding: '15mm 15mm 20mm',
      boxSizing: 'border-box',
      position: 'relative',
      backgroundColor: 'white',
      overflow: 'hidden',
    }}>

      {/* ── En-tête ─────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12mm' }}>
        {/* Logo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={order.logoUrl ?? '/logo.png'} alt="BDK" style={{ height: '20mm', objectFit: 'contain' }} />

        {/* Titre + références */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '18px', fontWeight: 'bold' }}>Bon de livraison</div>
          <div style={{ marginTop: '3px' }}>
            <strong>Réf. : {order.numero}</strong>
          </div>
          <div>Date : {fmtDate(order.delivery_date)}</div>
          <div>Date d&apos;échéance : {lastDayOfMonth(order.delivery_date)}</div>
          {order.client.code && <div>Code client : {order.client.code}</div>}
        </div>
      </div>

      {/* ── Émetteur / Adressé à ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '10mm', marginBottom: '8mm' }}>
        {/* Émetteur */}
        <div style={{ flex: 1, border: '1px solid #ccc', padding: '5mm', minHeight: '35mm' }}>
          <div style={{ fontSize: '10px', color: '#555', marginBottom: '3px' }}>Émetteur :</div>
          <div style={{ fontWeight: 'bold', fontSize: '12px' }}>{raisonSociale}</div>
          <div>{adresseLigne1}</div>
          <div>{cpVille}</div>
          <div style={{ marginTop: '3mm' }}>Tél. : {tel}</div>
          <div>E-mail : {email}</div>
          <div>Site web : {siteWeb}</div>
        </div>

        {/* Adressé à */}
        <div style={{ flex: 1, border: '1px solid #ccc', padding: '5mm', minHeight: '35mm' }}>
          <div style={{ fontSize: '10px', color: '#555', marginBottom: '3px' }}>Adressé à :</div>
          <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{order.client.nom}</div>
          {order.client.ice && <div>I.C.E : {order.client.ice}</div>}
          {order.client.adresse_livraison && (
            <div style={{ marginTop: '2mm', color: '#444' }}>{order.client.adresse_livraison}</div>
          )}
        </div>
      </div>

      {/* ── Tableau articles ────────────────────────────────────────────────── */}
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
          {order.items.map((item, idx) => {
            const totalHT = item.unit_price * item.quantity;
            return (
              <tr key={idx} style={{ borderBottom: '1px dotted #ddd' }}>
                <td style={tdStyle('left')}>{item.display_name}</td>
                <td style={tdStyle('center')}>{item.vat_rate}%</td>
                <td style={tdStyle('right')}>{item.unit_price.toFixed(2)}</td>
                <td style={tdStyle('center')}>{item.quantity} U</td>
                <td style={tdStyle('right')}>{totalHT.toFixed(2)}</td>
              </tr>
            );
          })}
          {/* Lignes vides pour remplir la page */}
          {Array.from({ length: Math.max(0, 12 - order.items.length) }).map((_, i) => (
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

      {/* ── Totaux ──────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '10mm' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: '80mm' }}>
          <tbody>
            <tr>
              <td style={totalLabelStyle}>Total HT</td>
              <td style={totalValueStyle}>{totalsHT.totalHT.toFixed(2)}</td>
            </tr>
            {vatEntries.map(([rate, ht]) => {
              const tva = ht * (Number(rate) / 100);
              return (
                <tr key={rate}>
                  <td style={totalLabelStyle}>Total TVA {rate}%</td>
                  <td style={totalValueStyle}>{tva.toFixed(2)}</td>
                </tr>
              );
            })}
            <tr style={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>
              <td style={totalLabelStyle}>Total TTC</td>
              <td style={totalValueStyle}>{totalTTC.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* ── Montant en lettres ──────────────────────────────────────────────── */}
      <div style={{ marginBottom: '15mm' }}>
        <div style={{ fontSize: '10px', color: '#555' }}>
          Arrêté le présent bon de livraison à la somme de :
        </div>
        <div style={{ fontWeight: 'bold', marginTop: '2px' }}>
          {numberToWordsFr(totalTTC)}
        </div>
      </div>

      {/* ── Pied de page ────────────────────────────────────────────────────── */}
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
        <div>
          Téléphone : {tel} - {siteWeb} - {email}
        </div>
        <div>
          {[rc && `R.C : ${rc}`, ifFiscal && `I.F : ${ifFiscal}`, iceSociete && `I.C.E : ${iceSociete}`, tp && `T.P : ${tp}`].filter(Boolean).join(' - ')}
          &nbsp;&nbsp;1/1
        </div>
      </div>
    </div>
  );
}

// ─── Styles inline partagés ───────────────────────────────────────────────────

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
  return {
    textAlign: align,
    padding: '2mm 2mm',
    fontSize: '10.5px',
  };
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
