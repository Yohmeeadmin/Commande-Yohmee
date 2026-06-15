'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ArrowLeft, Minus, Plus, ChevronDown, Printer, ExternalLink, Download, X } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface IngLine {
  id: string;
  quantite: number;
  stock_item_id: string | null;
  sous_recipe_id: string | null;
  stock_item: { nom: string; unite: string } | null;
  sous_recipe: { nom: string } | null;
}

interface Etape {
  id: string;
  ordre: number;
  nom: string;
  duree_fixe_min: number | null;
  notes: string | null;
}

interface Recipe {
  id: string;
  nom: string;
  type: string;
  rendement: number;
  perte_pct: number;
  poids_portion_g: number | null;
  unite: string | null;
  atelier: string | null;
  categorie: string | null;
  ingredients: IngLine[];
  etapes: Etape[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const GRAM_FACTORS: Record<string, number> = {
  kg: 1000, g: 1, l: 1000, litre: 1000, cl: 10, ml: 1,
};

function fmtDuree(min: number | null): string {
  if (!min || min <= 0) return '';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

function fmtQte(q: number, unite: string): string {
  const key = unite.toLowerCase().trim();
  const inGrams = GRAM_FACTORS[key] != null ? q * GRAM_FACTORS[key] : null;
  if (inGrams !== null) {
    if (inGrams >= 1000) return `${parseFloat((inGrams / 1000).toFixed(3))} kg`;
    if (inGrams >= 1)   return `${Math.round(inGrams)} g`;
    return `${Math.round(inGrams * 1000)} mg`;
  }
  if (q < 1)  return `${q.toFixed(2)} ${unite}`;
  if (q < 10) return `${parseFloat(q.toFixed(2))} ${unite}`;
  return `${Math.round(q)} ${unite}`;
}

function equivG(q: number, unite: string): string {
  const key = unite.toLowerCase().trim();
  const f = GRAM_FACTORS[key];
  if (f == null) return '—';
  const g = q * f;
  if (g >= 1000) return `${parseFloat((g / 1000).toFixed(3))} kg`;
  return `${Math.round(g)} g`;
}

function computeFactor(recipe: Recipe, mode: 'portions' | 'kg', qty: number): number {
  if (qty <= 0) return 1;
  if (mode === 'portions') return qty / (recipe.rendement || 1);
  // kg mode
  if (recipe.type === 'sous_recette') {
    const kgBrut = (recipe.ingredients || []).reduce((s, i) => {
      if (!i.stock_item) return s;
      const f = GRAM_FACTORS[(i.stock_item.unite || '').toLowerCase()] ?? 0;
      return s + i.quantite * f / 1000;
    }, 0);
    const perte = (recipe.perte_pct || 0) / 100;
    const kgOut = kgBrut * (1 - perte); // kg total de la sous-recette (sans diviser par rendement)
    return kgOut > 0 ? qty / kgOut : qty;
  }
  let w = 0;
  if (recipe.poids_portion_g && recipe.poids_portion_g > 0) {
    w = recipe.poids_portion_g / 1000;
  } else {
    const kgBrut = (recipe.ingredients || []).reduce((s, i) => {
      if (i.stock_item_id && i.stock_item) {
        const f = GRAM_FACTORS[(i.stock_item.unite || '').toLowerCase()] ?? 0;
        return s + i.quantite * f / 1000;
      }
      if (i.sous_recipe_id) return s + i.quantite;
      return s;
    }, 0);
    const perte = (recipe.perte_pct || 0) / 100;
    w = kgBrut > 0 ? kgBrut * (1 - perte) / (recipe.rendement || 1) : 0;
  }
  if (w <= 0) return qty;
  return qty / (w * (recipe.rendement || 1));
}

function calcPoidsTotal(recipe: Recipe, factor: number): number {
  return (recipe.ingredients || []).reduce((s, i) => {
    if (i.stock_item_id && i.stock_item) {
      const f = GRAM_FACTORS[(i.stock_item.unite || '').toLowerCase()] ?? 0;
      return s + i.quantite * factor * f / 1000;
    }
    if (i.sous_recipe_id) return s + i.quantite * factor;
    return s;
  }, 0);
}

function fmtPoids(kg: number): string {
  if (kg <= 0) return '—';
  if (kg >= 1) return `${parseFloat(kg.toFixed(2))} kg`;
  return `${Math.round(kg * 1000)} g`;
}

// ─── Print Modal ──────────────────────────────────────────────────────────────

function PrintModal({ recipe, initialQty, initialMode, onClose }: {
  recipe: Recipe;
  initialQty: number;
  initialMode: 'portions' | 'kg';
  onClose: () => void;
}) {
  const [qty, setQty]   = useState(initialQty);
  const [mode, setMode] = useState<'portions' | 'kg'>(initialMode);
  const factor = computeFactor(recipe, mode, qty);
  const sortedEtapes = [...(recipe.etapes || [])].sort((a, b) => a.ordre - b.ordre);
  const typeLabel = recipe.type === 'sous_recette' ? 'sous-recette' : 'recette';
  const uniteLabel = mode === 'kg' ? 'kg' : (recipe.unite || 'portions');

  // Inject print style
  useEffect(() => {
    const style = document.createElement('style');
    style.id = '__fiche-print';
    style.textContent = `
      @media print {
        body > * { display: none !important; }
        body > [data-print-modal] { display: flex !important; position: static !important; overflow: visible !important; background: white !important; padding: 0 !important; }
        [data-print-modal] > * { max-height: none !important; overflow: visible !important; box-shadow: none !important; border-radius: 0 !important; width: 100% !important; max-width: 100% !important; }
        [data-no-print] { display: none !important; }
        @page { size: A4 portrait; margin: 15mm 18mm; }
      }
    `;
    document.head.appendChild(style);
    return () => document.getElementById('__fiche-print')?.remove();
  }, []);

  // Close on Escape
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  function handleDownload() {
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    const rows = (recipe.ingredients || []).map(ing => {
      const nom = ing.stock_item?.nom ?? ing.sous_recipe?.nom ?? '—';
      const unite = ing.stock_item?.unite ?? 'kg';
      const q = ing.quantite * factor;
      return `<tr>
        <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;font-size:13px">${ing.sous_recipe_id ? '<span style="font-size:10px;background:#ede9fe;color:#7c3aed;padding:1px 4px;border-radius:3px;margin-right:4px;font-weight:700">SR</span>' : ''}${nom}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:right;font-weight:600">${fmtQte(q, unite)}</td>
        <td style="padding:5px 8px;border-bottom:1px solid #f3f4f6;font-size:13px;text-align:right;color:#9ca3af">${equivG(q, unite)}</td>
      </tr>`;
    }).join('');
    const steps = sortedEtapes.map((e, i) => `
      <div style="display:flex;gap:10px;margin-bottom:10px;align-items:flex-start">
        <div style="width:22px;height:22px;border-radius:50%;background:#f59e0b;color:white;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">${i+1}</div>
        <div><p style="margin:0 0 2px;font-weight:700;font-size:13px">${e.nom}${e.duree_fixe_min ? ` <span style="font-weight:400;color:#6b7280;font-size:12px">(${fmtDuree(e.duree_fixe_min)})</span>` : ''}</p>${e.notes ? `<p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5">${e.notes}</p>` : ''}</div>
      </div>`).join('');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${recipe.nom}</title>
      <style>body{font-family:'Helvetica Neue',Arial,sans-serif;margin:0;padding:20mm 18mm;color:#111}@page{size:A4;margin:15mm 18mm}</style>
    </head><body>
      <div style="border-left:4px solid #f59e0b;padding-left:14px;margin-bottom:20px">
        <p style="font-size:10px;font-weight:700;color:#f59e0b;text-transform:uppercase;letter-spacing:.08em;margin:0 0 4px">Document · ${typeLabel}</p>
        <h1 style="font-size:24px;font-weight:900;margin:0 0 4px">${recipe.nom}</h1>
        <p style="font-size:12px;color:#6b7280;margin:0">Pour ${qty} ${uniteLabel}${recipe.atelier ? ' · ' + recipe.atelier : ''}${recipe.categorie ? ' · ' + recipe.categorie : ''}</p>
      </div>
      <h2 style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#f59e0b;border-bottom:2px solid #fef3c7;padding-bottom:4px;margin-bottom:8px">Ingrédients</h2>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="font-size:10px;font-weight:700;color:#f59e0b;text-align:left;padding:4px 8px;border-bottom:1px solid #e5e7eb">Ingrédient</th>
          <th style="font-size:10px;font-weight:700;color:#f59e0b;text-align:right;padding:4px 8px;border-bottom:1px solid #e5e7eb">Quantité</th>
          <th style="font-size:10px;font-weight:700;color:#f59e0b;text-align:right;padding:4px 8px;border-bottom:1px solid #e5e7eb">Equiv. g</th>
        </tr></thead><tbody>${rows}</tbody>
      </table>
      ${sortedEtapes.length > 0 ? `<h2 style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#f59e0b;border-bottom:2px solid #fef3c7;padding-bottom:4px;margin:20px 0 10px">Procédé</h2>${steps}` : ''}
      <p style="margin-top:20px;border-top:1px solid #e5e7eb;padding-top:6px;font-size:10px;color:#9ca3af;text-align:right">Imprimé le ${new Date().toLocaleDateString('fr-FR')}</p>
    </body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 300);
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div data-print-modal="" style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ background: 'white', borderRadius: '20px', width: '100%', maxWidth: '680px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderLeft: '4px solid #f59e0b' }}>

        {/* Header */}
        <div data-no-print="" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '11px', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '.06em', background: '#fef3c7', padding: '3px 8px', borderRadius: '8px' }}>Document</span>
            <span style={{ fontSize: '14px', fontWeight: 600, color: '#374151' }}>1 {typeLabel}</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button onClick={() => window.print()}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
              <Printer size={14} /> Imprimer
            </button>
            <button onClick={handleDownload}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', background: 'white', color: '#d97706', border: '1.5px solid #f59e0b', borderRadius: '10px', fontSize: '13px', fontWeight: 700, cursor: 'pointer' }}>
              <Download size={14} /> Télécharger
            </button>
            <button onClick={onClose}
              style={{ width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', border: 'none', borderRadius: '8px', cursor: 'pointer', color: '#6b7280' }}>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Quantité à produire */}
        <div data-no-print="" style={{ padding: '14px 20px', borderBottom: '1px solid #f3f4f6', flexShrink: 0 }}>
          <p style={{ fontSize: '12px', fontWeight: 600, color: '#6b7280', margin: '0 0 10px' }}>Quantité à produire</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ display: 'flex', borderRadius: '10px', overflow: 'hidden', border: '1.5px solid #fcd34d' }}>
              <button onClick={() => { setMode('portions'); setQty(recipe.rendement || 1); }}
                style={{ padding: '7px 16px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, background: mode === 'portions' ? '#f59e0b' : 'white', color: mode === 'portions' ? 'white' : '#9ca3af', transition: 'all .15s' }}>
                portions
              </button>
              <button onClick={() => { setMode('kg'); setQty(1); }}
                style={{ padding: '7px 16px', border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: 600, background: mode === 'kg' ? '#f59e0b' : 'white', color: mode === 'kg' ? 'white' : '#9ca3af', transition: 'all .15s' }}>
                Kg
              </button>
            </div>
            <div style={{ display: 'flex', border: '1.5px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden', alignItems: 'center' }}>
              <button onClick={() => setQty(q => Math.max(mode === 'portions' ? 1 : 0.1, parseFloat((q - (mode === 'portions' ? 1 : 0.1)).toFixed(2))))}
                style={{ padding: '7px 12px', border: 'none', background: 'white', cursor: 'pointer', fontSize: '16px', color: '#6b7280', lineHeight: 1 }}>−</button>
              <input type="number" value={qty} min={mode === 'portions' ? 1 : 0.1} step={mode === 'portions' ? 1 : 0.1}
                onChange={e => setQty(Math.max(0.01, parseFloat(e.target.value) || 1))}
                style={{ width: '56px', textAlign: 'center', border: 'none', borderLeft: '1px solid #e5e7eb', borderRight: '1px solid #e5e7eb', padding: '7px 4px', fontSize: '14px', fontWeight: 700, outline: 'none' }} />
              <button onClick={() => setQty(q => parseFloat((q + (mode === 'portions' ? 1 : 0.1)).toFixed(2)))}
                style={{ padding: '7px 12px', border: 'none', background: 'white', cursor: 'pointer', fontSize: '16px', color: '#6b7280', lineHeight: 1 }}>+</button>
            </div>
            <span style={{ fontSize: '13px', color: '#9ca3af' }}>{uniteLabel}</span>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ overflowY: 'auto', padding: '20px', flex: 1 }}>

          {/* Title */}
          <h1 style={{ fontSize: '22px', fontWeight: 900, margin: '0 0 6px', color: '#111' }}>{recipe.nom}</h1>
          {(recipe.atelier || recipe.categorie) && (
            <div style={{ display: 'flex', gap: '6px', marginBottom: '18px' }}>
              {recipe.atelier && <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', background: '#fef3c7', color: '#92400e', borderRadius: '6px' }}>{recipe.atelier}</span>}
              {recipe.categorie && <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', background: '#f3f4f6', color: '#6b7280', borderRadius: '6px' }}>{recipe.categorie}</span>}
            </div>
          )}

          {/* Ingrédients */}
          {(recipe.ingredients || []).length > 0 && (
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#f59e0b', margin: '0 0 8px' }}>Ingrédients</p>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#f59e0b', padding: '6px 8px', borderBottom: '2px solid #fef3c7' }}>Ingrédient</th>
                    <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 700, color: '#f59e0b', padding: '6px 8px', borderBottom: '2px solid #fef3c7' }}>Quantité</th>
                    <th style={{ textAlign: 'right', fontSize: '11px', fontWeight: 700, color: '#f59e0b', padding: '6px 8px', borderBottom: '2px solid #fef3c7' }}>Equiv. g</th>
                  </tr>
                </thead>
                <tbody>
                  {(recipe.ingredients || []).map((ing, i) => {
                    const nom = ing.stock_item?.nom ?? ing.sous_recipe?.nom ?? '—';
                    const unite = ing.stock_item?.unite ?? 'kg';
                    const isSR = !!ing.sous_recipe_id;
                    const q = ing.quantite * factor;
                    return (
                      <tr key={i}>
                        <td style={{ padding: '9px 8px', borderBottom: '1px solid #f3f4f6', fontSize: '13px', color: '#374151', display: 'table-cell' }}>
                          {isSR && <span style={{ fontSize: '10px', background: '#ede9fe', color: '#7c3aed', padding: '1px 5px', borderRadius: '4px', marginRight: '5px', fontWeight: 700 }}>SR</span>}
                          {nom}
                        </td>
                        <td style={{ padding: '9px 8px', borderBottom: '1px solid #f3f4f6', fontSize: '13px', fontWeight: 600, textAlign: 'right', color: '#111' }}>{fmtQte(q, unite)}</td>
                        <td style={{ padding: '9px 8px', borderBottom: '1px solid #f3f4f6', fontSize: '13px', textAlign: 'right', color: '#9ca3af' }}>{equivG(q, unite)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Procédé */}
          {sortedEtapes.length > 0 && (
            <div>
              <p style={{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#f59e0b', margin: '0 0 12px' }}>Procédé</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {sortedEtapes.map((etape, i) => (
                  <div key={i} style={{ display: 'flex', gap: '12px', background: '#fafafa', borderRadius: '12px', padding: '12px', alignItems: 'flex-start' }}>
                    <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: '#f59e0b', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'baseline' }}>
                        <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#111' }}>{etape.nom}</p>
                        {etape.duree_fixe_min && <span style={{ fontSize: '11px', color: '#9ca3af', flexShrink: 0 }}>{fmtDuree(etape.duree_fixe_min)}</span>}
                      </div>
                      {etape.notes && <p style={{ margin: '3px 0 0', fontSize: '12px', color: '#6b7280', lineHeight: 1.5 }}>{etape.notes}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Print styles (page) ──────────────────────────────────────────────────────

const PAGE_PRINT_STYLE = `
  @media screen { .print-content { display: none; } }
  @media print  { .print-content { display: block !important; } .no-print { display: none !important; } @page { size: A4; margin: 15mm 18mm; } }
`;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FicheDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState(1);
  const [mode, setMode] = useState<'portions' | 'kg'>('portions');
  const [modeOpen, setModeOpen] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);

  useEffect(() => { load(); }, [id]);

  async function load() {
    const { data } = await supabase
      .from('recipe_sheets')
      .select(`
        id, nom, type, rendement, perte_pct, poids_portion_g, unite, atelier, categorie,
        ingredients:recipe_ingredients!recipe_sheet_id(
          id, quantite, stock_item_id, sous_recipe_id,
          stock_item:stock_items(nom, unite),
          sous_recipe:recipe_sheets!sous_recipe_id(nom)
        ),
        etapes:etapes_recette!recipe_sheet_id(
          id, ordre, nom, duree_fixe_min, notes
        )
      `)
      .eq('id', id)
      .single();
    if (data) {
      setRecipe(data as Recipe);
      setQty((data as Recipe).rendement || 1);
    }
    setLoading(false);
  }

  if (loading) return (
    <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Chargement…</div>
  );
  if (!recipe) return (
    <div className="flex items-center justify-center h-48 text-gray-400 text-sm">Recette introuvable.</div>
  );

  const factor = computeFactor(recipe, mode, qty);
  const poidsTotal = calcPoidsTotal(recipe, factor);
  const sortedEtapes = [...(recipe.etapes || [])].sort((a, b) => a.ordre - b.ordre);
  const totalDuree = sortedEtapes.reduce((s, e) => s + (e.duree_fixe_min || 0), 0);
  const modeLabel = mode === 'portions' ? (recipe.unite || 'portions') : 'kg produit fini';

  return (
    <>
      <style>{PAGE_PRINT_STYLE}</style>

      <div className="no-print space-y-5 pb-10">

        {/* Top bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/recettes/fiches"
            className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            <ArrowLeft size={14} /> Retour
          </Link>

          {/* Quantity selector */}
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl px-3 py-1.5 ml-auto">
            <span className="text-sm text-gray-500 mr-2">Pour</span>
            <button onClick={() => setQty(q => Math.max(0.5, q - (mode === 'portions' ? 1 : 0.5)))}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-600">
              <Minus size={13} />
            </button>
            <input
              type="number" min={0.5} step={mode === 'portions' ? 1 : 0.5}
              value={qty}
              onChange={e => setQty(Math.max(0.5, parseFloat(e.target.value) || 1))}
              className="w-12 text-center text-sm font-bold text-gray-900 focus:outline-none bg-transparent"
            />
            <button onClick={() => setQty(q => q + (mode === 'portions' ? 1 : 0.5))}
              className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-600">
              <Plus size={13} />
            </button>
            {/* Mode dropdown */}
            <div className="relative ml-1">
              <button onClick={() => setModeOpen(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                {modeLabel} <ChevronDown size={12} />
              </button>
              {modeOpen && (
                <div className="absolute top-full mt-1 right-0 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden min-w-[160px]">
                  <button onClick={() => { setMode('portions'); setModeOpen(false); setQty(recipe.rendement || 1); }}
                    className={`w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-amber-50 transition-colors ${mode === 'portions' ? 'text-amber-600' : 'text-gray-700'}`}>
                    {recipe.unite || 'portions'}
                  </button>
                  <button onClick={() => { setMode('kg'); setModeOpen(false); setQty(1); }}
                    className={`w-full text-left px-4 py-2.5 text-sm font-medium hover:bg-amber-50 transition-colors ${mode === 'kg' ? 'text-amber-600' : 'text-gray-700'}`}>
                    kg produit fini
                  </button>
                </div>
              )}
            </div>
          </div>

          <Link href={`/recettes?edit=${recipe.id}`}
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            <ExternalLink size={14} /> Modifier
          </Link>
          <button onClick={() => setPrintOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold transition-colors">
            <Printer size={14} /> Exporter PDF
          </button>
        </div>

        {/* Titre */}
        <div className="bg-white rounded-2xl border border-gray-100 px-6 py-5">
          <h1 className="text-3xl font-black text-gray-900">{recipe.nom}</h1>
          {(recipe.atelier || recipe.categorie) && (
            <div className="flex items-center gap-2 mt-2">
              {recipe.atelier && <span className="text-xs font-semibold px-2.5 py-1 bg-amber-100 text-amber-700 rounded-lg">{recipe.atelier}</span>}
              {recipe.categorie && <span className="text-xs font-semibold px-2.5 py-1 bg-gray-100 text-gray-600 rounded-lg">{recipe.categorie}</span>}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Poids total', value: fmtPoids(poidsTotal) },
            { label: mode === 'portions' ? 'Portions' : 'Kg', value: qty.toString() },
            { label: 'Unité', value: recipe.unite || 'portions' },
            { label: 'Durée totale', value: totalDuree > 0 ? fmtDuree(totalDuree) : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-2xl border border-gray-100 px-4 py-4">
              <p className="text-xs text-gray-400 mb-1">{label}</p>
              <p className="text-xl font-black text-gray-900">{value}</p>
            </div>
          ))}
        </div>

        {/* Ingrédients + Procédé */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">

            {/* Ingrédients */}
            <div className="p-5">
              <h2 className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-4">
                Ingrédients ({(recipe.ingredients || []).length})
              </h2>
              <div className="space-y-0">
                {(recipe.ingredients || []).length === 0 && (
                  <p className="text-sm text-gray-400">Aucun ingrédient</p>
                )}
                {(recipe.ingredients || []).map((ing, i) => {
                  const nom = ing.stock_item?.nom ?? ing.sous_recipe?.nom ?? '—';
                  const unite = ing.stock_item?.unite ?? 'kg';
                  const isSR = !!ing.sous_recipe_id;
                  const qteScaled = ing.quantite * factor;
                  return (
                    <div key={i} className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
                      <span className="text-sm text-gray-700 flex items-center gap-2">
                        {isSR && <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-600 rounded font-bold">SR</span>}
                        {nom}
                      </span>
                      <span className="text-sm font-bold text-gray-900 tabular-nums">
                        {fmtQte(qteScaled, unite)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Procédé */}
            <div className="p-5">
              <h2 className="text-xs font-bold text-amber-500 uppercase tracking-widest mb-4">Procédé</h2>
              {sortedEtapes.length === 0 ? (
                <p className="text-sm text-gray-400">Aucune étape renseignée.</p>
              ) : (
                <div className="space-y-5">
                  {sortedEtapes.map((etape, i) => (
                    <div key={i}>
                      <div className="flex items-baseline justify-between gap-2 mb-1">
                        <p className="text-sm font-bold text-gray-800">Étape {i + 1} — {etape.nom}</p>
                        {etape.duree_fixe_min && (
                          <span className="text-xs text-gray-400 shrink-0">{fmtDuree(etape.duree_fixe_min)}</span>
                        )}
                      </div>
                      {etape.notes && (
                        <p className="text-sm text-gray-600 leading-relaxed">{etape.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>

      </div>

      {/* Modal impression */}
      {printOpen && (
        <PrintModal
          recipe={recipe}
          initialQty={qty}
          initialMode={mode}
          onClose={() => setPrintOpen(false)}
        />
      )}
    </>
  );
}
