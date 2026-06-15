'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Printer, ArrowLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAppSettings } from '@/lib/useAppSettings';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Supplier {
  id: string; nom: string;
  telephone?: string | null; email?: string | null; ice?: string | null;
}

interface BDCLine {
  id: string; stock_item_id: string;
  quantite_commandee: number; quantite_recue: number | null;
  prix_unitaire: number;
  stock_item?: { nom: string; unite: string } | null;
}

interface BDC {
  id: string; date: string;
  statut: 'en_attente' | 'recu_partiel' | 'recu_complet';
  note: string | null; total: number;
  supplier?: Supplier | null;
  lines?: BDCLine[];
}

const STATUT_LABELS: Record<string, string> = {
  en_attente:   'En attente',
  recu_partiel: 'Reçu partiel',
  recu_complet: 'Reçu complet',
};

// 210mm ≈ 794px à 96dpi
const DOC_WIDTH_PX = 794;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function fmtNum(n: number) {
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const UNITS_FR = ['', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf',
  'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf'];
const TENS_FR = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

function belowHundred(n: number): string {
  if (n < 20) return UNITS_FR[n];
  const ten = Math.floor(n / 10); const unit = n % 10;
  if (ten === 7) return unit === 1 ? 'soixante et onze' : `soixante-${UNITS_FR[10 + unit]}`;
  if (ten === 9) return `quatre-vingt-${UNITS_FR[unit] || ''}`.replace(/-$/, unit === 0 ? 's' : '');
  if (unit === 0) return TENS_FR[ten] + (ten === 8 ? 's' : '');
  if (unit === 1 && ten !== 8) return `${TENS_FR[ten]} et un`;
  return `${TENS_FR[ten]}-${UNITS_FR[unit]}`;
}
function belowThousand(n: number): string {
  if (n === 0) return '';
  if (n < 100) return belowHundred(n);
  const h = Math.floor(n / 100); const rest = n % 100;
  const prefix = h === 1 ? 'cent' : `${UNITS_FR[h]} cent${rest === 0 && h > 1 ? 's' : ''}`;
  return rest === 0 ? prefix : `${prefix} ${belowHundred(rest)}`;
}
function numberToWords(amount: number): string {
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
  return (words.charAt(0).toUpperCase() + words.slice(1)) + ' dirham' + (total > 1 ? 's' : '');
}

// ─── Styles partagés ──────────────────────────────────────────────────────────

function thStyle(align: 'left' | 'center' | 'right'): React.CSSProperties {
  return { textAlign: align, padding: '3mm 2mm', border: '1px solid #ccc', fontWeight: 'bold', fontSize: '10px', backgroundColor: '#f5f5f5' };
}
function tdStyle(align: 'left' | 'center' | 'right', extra?: React.CSSProperties): React.CSSProperties {
  return { textAlign: align, padding: '2mm 2mm', fontSize: '10.5px', ...extra };
}
const totalLabelStyle: React.CSSProperties = { padding: '2mm 4mm', fontSize: '11px', borderBottom: '1px solid #eee' };
const totalValueStyle: React.CSSProperties = { padding: '2mm 4mm', textAlign: 'right', fontSize: '11px', borderBottom: '1px solid #eee', minWidth: '30mm' };

// ─── Composant document A4 ───────────────────────────────────────────────────

interface DocProps { bdc: BDC; logoUrl?: string | null; company: Record<string, string | null | undefined> }

function BonCommandeDoc({ bdc, logoUrl, company }: DocProps) {
  const lines = bdc.lines || [];
  const total = lines.reduce((s, l) => s + l.quantite_commandee * l.prix_unitaire, 0);
  const numero = `BDC-${bdc.date.replace(/-/g, '')}-${bdc.id.slice(0, 6).toUpperCase()}`;
  const hasRecu = lines.some(l => l.quantite_recue !== null);

  const raisonSociale = company.raison_sociale || 'BDK';
  const adresse = company.adresse_siege || '';
  const cpVille = [company.code_postal, company.ville_siege].filter(Boolean).join(' ');
  const tel = company.telephone_societe || '';
  const email = company.email_societe || '';
  const rc = company.rc || '';
  const ifFiscal = company.if_fiscal || '';
  const ice = company.ice_societe || '';
  const tp = company.tp || '';

  return (
    <div style={{
      fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '11px', color: '#111',
      width: '210mm', height: '297mm', padding: '15mm 15mm 20mm',
      boxSizing: 'border-box', position: 'relative', backgroundColor: 'white', overflow: 'hidden',
    }}>

      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10mm' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {logoUrl
          ? <img src={logoUrl} alt="Logo" style={{ height: '18mm', objectFit: 'contain' }} />
          : <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{raisonSociale}</div>
        }
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '18px', fontWeight: 'bold' }}>Bon de commande</div>
          <div style={{ marginTop: '3px' }}><strong>Réf. : {numero}</strong></div>
          <div>Date : {fmtDate(bdc.date)}</div>
          {bdc.statut !== 'en_attente' && (
            <div style={{ marginTop: '3px', display: 'inline-block', padding: '1px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: 'bold',
              backgroundColor: bdc.statut === 'recu_complet' ? '#dcfce7' : '#dbeafe',
              color: bdc.statut === 'recu_complet' ? '#15803d' : '#1d4ed8',
            }}>
              {STATUT_LABELS[bdc.statut]}
            </div>
          )}
        </div>
      </div>

      {/* Émetteur / Fournisseur */}
      <div style={{ display: 'flex', gap: '8mm', marginBottom: '6mm' }}>
        <div style={{ flex: 1, border: '1px solid #ccc', padding: '4mm', minHeight: '28mm' }}>
          <div style={{ fontSize: '10px', color: '#555', marginBottom: '3px' }}>Émetteur :</div>
          <div style={{ fontWeight: 'bold', fontSize: '12px' }}>{raisonSociale}</div>
          {adresse && <div>{adresse}</div>}
          {cpVille && <div>{cpVille}</div>}
          {tel && <div style={{ marginTop: '2mm' }}>Tél. : {tel}</div>}
          {email && <div>E-mail : {email}</div>}
          {ice && <div>I.C.E : {ice}</div>}
        </div>
        <div style={{ flex: 1, border: '1px solid #ccc', padding: '4mm', minHeight: '28mm' }}>
          <div style={{ fontSize: '10px', color: '#555', marginBottom: '3px' }}>Fournisseur :</div>
          <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{bdc.supplier?.nom || '—'}</div>
          {bdc.supplier?.telephone && <div style={{ marginTop: '2mm' }}>Tél. : {bdc.supplier.telephone}</div>}
          {bdc.supplier?.email && <div>{bdc.supplier.email}</div>}
          {bdc.supplier?.ice && <div>I.C.E : {bdc.supplier.ice}</div>}
        </div>
      </div>

      {/* Note */}
      {bdc.note && (
        <div style={{ border: '1px solid #fcd34d', backgroundColor: '#fffbeb', padding: '3mm 4mm', borderRadius: '4px', marginBottom: '5mm', fontSize: '10.5px' }}>
          <span style={{ fontWeight: 'bold', color: '#92400e' }}>Note : </span>
          <span style={{ color: '#78350f' }}>{bdc.note}</span>
        </div>
      )}

      {/* Tableau articles */}
      <div style={{ textAlign: 'right', fontSize: '10px', color: '#555', marginBottom: '2px' }}>Montants exprimés en MAD</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '5mm' }}>
        <thead>
          <tr style={{ backgroundColor: '#f5f5f5' }}>
            <th style={thStyle('left')}>Désignation</th>
            <th style={thStyle('center')}>Unité</th>
            <th style={thStyle('right')}>Qté commandée</th>
            {hasRecu && <th style={thStyle('right')}>Qté reçue</th>}
            <th style={thStyle('right')}>P.U.</th>
            <th style={thStyle('right')}>Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={l.id} style={{ borderBottom: '1px dotted #ddd', backgroundColor: i % 2 === 0 ? 'white' : '#fafafa' }}>
              <td style={tdStyle('left')}>{l.stock_item?.nom || '—'}</td>
              <td style={tdStyle('center')}>{l.stock_item?.unite || ''}</td>
              <td style={tdStyle('right')}>{l.quantite_commandee}</td>
              {hasRecu && (
                <td style={tdStyle('right', { color: l.quantite_recue === l.quantite_commandee ? '#16a34a' : '#ea580c', fontWeight: 'bold' })}>
                  {l.quantite_recue !== null ? l.quantite_recue : '—'}
                </td>
              )}
              <td style={tdStyle('right')}>{fmtNum(l.prix_unitaire)}</td>
              <td style={tdStyle('right', { fontWeight: 'bold' })}>{fmtNum(l.quantite_commandee * l.prix_unitaire)}</td>
            </tr>
          ))}
          {/* Lignes vides */}
          {Array.from({ length: Math.max(0, 10 - lines.length) }).map((_, i) => (
            <tr key={`empty-${i}`} style={{ borderBottom: '1px dotted #eee' }}>
              <td style={{ ...tdStyle('left'), height: '7mm' }}>&nbsp;</td>
              <td style={tdStyle('center')} /><td style={tdStyle('right')} />
              {hasRecu && <td style={tdStyle('right')} />}
              <td style={tdStyle('right')} /><td style={tdStyle('right')} />
            </tr>
          ))}
        </tbody>
      </table>

      {/* Total */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8mm' }}>
        <table style={{ borderCollapse: 'collapse', minWidth: '70mm' }}>
          <tbody>
            <tr style={{ backgroundColor: '#f5f5f5', fontWeight: 'bold' }}>
              <td style={totalLabelStyle}>Total HT</td>
              <td style={totalValueStyle}>{fmtNum(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Montant en lettres */}
      <div style={{ marginBottom: '12mm' }}>
        <div style={{ fontSize: '10px', color: '#555' }}>Arrêté le présent bon de commande à la somme de :</div>
        <div style={{ fontWeight: 'bold', marginTop: '2px' }}>{numberToWords(total)}</div>
      </div>

      {/* Signatures */}
      <div style={{ display: 'flex', gap: '15mm', marginBottom: '10mm' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '10px', color: '#555', marginBottom: '2mm' }}>Émis par</div>
          <div style={{ height: '18mm', borderBottom: '1px solid #ccc' }} />
          <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>{raisonSociale}</div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '10px', color: '#555', marginBottom: '2mm' }}>Accusé de réception fournisseur</div>
          <div style={{ height: '18mm', borderBottom: '1px solid #ccc' }} />
          <div style={{ fontSize: '10px', color: '#888', marginTop: '2px' }}>{bdc.supplier?.nom || ''}</div>
        </div>
      </div>

      {/* Footer fixe */}
      <div style={{
        position: 'absolute', bottom: '10mm', left: '15mm', right: '15mm',
        textAlign: 'center', fontSize: '9px', color: '#555',
        borderTop: '1px solid #ddd', paddingTop: '3mm',
      }}>
        {(adresse || cpVille) && (
          <div style={{ fontWeight: 'bold', marginBottom: '1px' }}>
            Siège social : {raisonSociale}{adresse ? ` - ${adresse}` : ''}{cpVille ? ` - ${cpVille}` : ''}
          </div>
        )}
        {(tel || email) && <div>{[tel && `Téléphone : ${tel}`, email].filter(Boolean).join(' - ')}</div>}
        <div>
          {[rc && `R.C : ${rc}`, ifFiscal && `I.F : ${ifFiscal}`, ice && `I.C.E : ${ice}`, tp && `T.P : ${tp}`].filter(Boolean).join(' - ')}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BDCDocumentPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { settings } = useAppSettings();

  const [bdc, setBdc] = useState<BDC | null>(null);
  const [loading, setLoading] = useState(true);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const updateScale = useCallback(() => {
    if (!wrapperRef.current) return;
    const available = wrapperRef.current.clientWidth - 32;
    setScale(Math.min(1, available / DOC_WIDTH_PX));
  }, []);

  useEffect(() => {
    supabase
      .from('purchase_orders')
      .select('*, supplier:suppliers(id, nom, telephone, email, ice), lines:purchase_order_lines(*, stock_item:stock_items(nom, unite))')
      .eq('id', id)
      .single()
      .then(({ data }) => { setBdc(data as BDC); setLoading(false); });
  }, [id]);

  useEffect(() => {
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [updateScale]);

  function handlePrint() {
    const content = printRef.current?.innerHTML;
    if (!content) return;
    const numero = bdc ? `BDC-${bdc.date.replace(/-/g, '')}-${bdc.id.slice(0, 6).toUpperCase()}` : 'BDC';
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${numero}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body { width: 210mm; background: white; }
            @page { size: A4 portrait; margin: 0; }
            @media print {
              html, body { margin: 0; padding: 0; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>${content}</body>
      </html>
    `);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
    </div>
  );

  if (!bdc) return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-3">
      <p className="text-gray-400">Bon de commande introuvable</p>
    </div>
  );

  const company = {
    raison_sociale: settings?.raison_sociale,
    adresse_siege: settings?.adresse_siege,
    code_postal: settings?.code_postal,
    ville_siege: settings?.ville_siege,
    telephone_societe: settings?.telephone_societe,
    email_societe: settings?.email_societe,
    rc: settings?.rc,
    if_fiscal: settings?.if_fiscal,
    ice_societe: settings?.ice_societe,
    tp: settings?.tp,
  };
  const logoUrl = settings?.logo_url;
  const numero = `BDC-${bdc.date.replace(/-/g, '')}-${bdc.id.slice(0, 6).toUpperCase()}`;

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-100 overflow-hidden">

      {/* Barre de contrôle */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
        <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors">
          <ArrowLeft size={16} /> Retour
        </button>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">{numero}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
            bdc.statut === 'recu_complet' ? 'bg-green-100 text-green-700' :
            bdc.statut === 'recu_partiel' ? 'bg-blue-100 text-blue-700' :
            'bg-orange-100 text-orange-700'
          }`}>{STATUT_LABELS[bdc.statut]}</span>
        </div>
        <button onClick={handlePrint}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-700 transition-colors">
          <Printer size={15} /> Imprimer / PDF
        </button>
      </div>

      {/* Prévisualisation scalée */}
      <div ref={wrapperRef} className="flex-1 overflow-y-auto py-4 px-4">
        <div className="flex justify-center">
          <div style={{
            width: `${DOC_WIDTH_PX * scale}px`,
            height: `${(DOC_WIDTH_PX * 297 / 210) * scale}px`,
            flexShrink: 0, overflow: 'hidden',
            boxShadow: '0 2px 16px rgba(0,0,0,0.12)', borderRadius: '4px',
          }}>
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: '210mm', height: '297mm' }}>
              <BonCommandeDoc bdc={bdc} logoUrl={logoUrl} company={company} />
            </div>
          </div>
        </div>
      </div>

      {/* Source cachée pour impression */}
      <div ref={printRef} aria-hidden style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}>
        <div style={{ width: '210mm', height: '297mm', overflow: 'hidden' }}>
          <BonCommandeDoc bdc={bdc} logoUrl={logoUrl} company={company} />
        </div>
      </div>
    </div>
  );
}
