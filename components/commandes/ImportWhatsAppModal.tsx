'use client';

import { useRef, useState } from 'react';
import { X, MessageSquare, Image as ImageIcon, Loader2, CheckCircle, AlertCircle, HelpCircle, ChevronDown, Search, RotateCcw } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ArticleOption {
  id: string;
  display_name: string;
  ref_name?: string;
}

interface ClientOption {
  id: string;
  nom: string;
}

interface ParsedLine {
  texte_original: string;
  article_id: string | null;
  article_nom: string;
  quantite: number;
  confiance: number;
  // override local
  _article_id: string | null;
  _article_nom: string;
  _quantite: number;
}

interface ParsedResult {
  client_id: string | null;
  client_nom_detecte: string;
  date_livraison: string | null;
  lignes: ParsedLine[];
}

interface Props {
  articles: ArticleOption[];
  clients: ClientOption[];
  onImport: (clientId: string, dateLivraison: string, lines: { articleId: string; quantite: number; displayName: string }[]) => void;
  onClose: () => void;
}

// ─── Alias localStorage ───────────────────────────────────────────────────────

const ALIAS_KEY = 'order_import_aliases';

function loadAliases(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(ALIAS_KEY) || '{}'); } catch { return {}; }
}

function saveAlias(texteOriginal: string, articleId: string) {
  const aliases = loadAliases();
  aliases[texteOriginal.toLowerCase().trim()] = articleId;
  localStorage.setItem(ALIAS_KEY, JSON.stringify(aliases));
}

// ─── Helpers UI ───────────────────────────────────────────────────────────────

function ConfidenceBadge({ conf }: { conf: number }) {
  if (conf >= 0.9) return <span className="flex items-center gap-1 text-xs font-bold text-green-600"><CheckCircle size={13} /> Certain</span>;
  if (conf >= 0.7) return <span className="flex items-center gap-1 text-xs font-bold text-orange-500"><AlertCircle size={13} /> À vérifier</span>;
  return <span className="flex items-center gap-1 text-xs font-bold text-red-500"><HelpCircle size={13} /> Non trouvé</span>;
}

// ─── Sélecteur d'article ──────────────────────────────────────────────────────

function ArticleSelector({ value, onChange, articles }: {
  value: string | null;
  onChange: (id: string, nom: string) => void;
  articles: ArticleOption[];
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = articles.find(a => a.id === value);
  const filtered = articles.filter(a =>
    a.display_name.toLowerCase().includes(search.toLowerCase()) ||
    (a.ref_name || '').toLowerCase().includes(search.toLowerCase())
  ).slice(0, 20);

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className={`flex items-center justify-between gap-2 w-full px-2.5 py-1.5 text-sm rounded-lg border transition-colors ${value ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-dashed border-gray-300 text-gray-400 hover:border-gray-400'}`}>
        <span className="truncate font-medium">{selected?.display_name || 'Choisir un produit…'}</span>
        <ChevronDown size={13} className="shrink-0" />
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-30 overflow-hidden" style={{ minWidth: 260 }}>
          <div className="p-2 border-b border-gray-100">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher…"
                className="w-full pl-7 pr-2 py-1.5 text-sm bg-gray-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto">
            {filtered.map(a => (
              <button key={a.id} type="button"
                onClick={() => { onChange(a.id, a.display_name); setOpen(false); setSearch(''); }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 border-b border-gray-50 last:border-0">
                <span className="font-medium text-gray-800">{a.display_name}</span>
              </button>
            ))}
            {filtered.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Aucun produit trouvé</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Composant principal ──────────────────────────────────────────────────────

export default function ImportWhatsAppModal({ articles, clients, onImport, onClose }: Props) {
  const [mode, setMode] = useState<'text' | 'image'>('text');
  const [inputText, setInputText] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParsedResult | null>(null);

  // Overrides locaux
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState('');
  const [lines, setLines] = useState<ParsedLine[]>([]);

  const fileRef = useRef<HTMLInputElement>(null);

  function handleImagePick(file: File) {
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = e => setImagePreview(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleAnalyze() {
    if (mode === 'text' && !inputText.trim()) return;
    if (mode === 'image' && !imageFile) return;

    setParsing(true);
    setError(null);
    setResult(null);

    try {
      const aliases = loadAliases();
      const body: Record<string, any> = {
        articles: articles.map(a => ({ id: a.id, display_name: a.display_name, ref_name: a.ref_name })),
        clients: clients.map(c => ({ id: c.id, nom: c.nom })),
        aliases,
      };

      if (mode === 'text') {
        body.text = inputText;
      } else if (imageFile) {
        const base64 = await fileToBase64(imageFile);
        body.imageBase64 = base64;
        body.mimeType = imageFile.type || 'image/jpeg';
      }

      const res = await fetch('/api/parse-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Erreur analyse');

      // Préparer les lignes avec overrides locaux
      const parsedLines: ParsedLine[] = (data.lignes || []).map((l: any) => ({
        ...l,
        _article_id: l.article_id,
        _article_nom: l.article_nom,
        _quantite: l.quantite,
      }));

      setResult(data);
      setSelectedClientId(data.client_id || '');
      setSelectedDate(data.date_livraison || new Date().toISOString().split('T')[0]);
      setLines(parsedLines);
    } catch (err: any) {
      setError(err?.message || 'Erreur inconnue');
    } finally {
      setParsing(false);
    }
  }

  function updateLine(idx: number, patch: Partial<ParsedLine>) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  }

  function handleConfirmLine(idx: number, articleId: string, articleNom: string) {
    const line = lines[idx];
    // Apprendre l'alias
    if (line.texte_original && articleId) {
      saveAlias(line.texte_original, articleId);
    }
    updateLine(idx, { _article_id: articleId, _article_nom: articleNom, confiance: 1 });
  }

  function handleImport() {
    if (!selectedClientId || !selectedDate) return;
    const validLines = lines
      .filter(l => l._article_id && l._quantite > 0)
      .map(l => ({ articleId: l._article_id!, quantite: l._quantite, displayName: l._article_nom }));
    if (validLines.length === 0) return;

    // Sauvegarder les alias confirmés
    lines.forEach(l => {
      if (l._article_id && l.confiance < 0.9 && l.texte_original) {
        saveAlias(l.texte_original, l._article_id);
      }
    });

    onImport(selectedClientId, selectedDate, validLines);
  }

  const canImport = selectedClientId && selectedDate && lines.some(l => l._article_id && l._quantite > 0);
  const needsReview = lines.some(l => !l._article_id || l.confiance < 0.7);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h2 className="font-black text-gray-900 text-lg">Importer une commande</h2>
            <p className="text-xs text-gray-400 mt-0.5">WhatsApp, bon de commande, email…</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto">

          {/* Étape 1 — Saisie */}
          {!result && (
            <div className="p-6 space-y-4">
              {/* Tabs */}
              <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
                <button onClick={() => setMode('text')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${mode === 'text' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                  <MessageSquare size={15} /> Message
                </button>
                <button onClick={() => setMode('image')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${mode === 'image' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>
                  <ImageIcon size={15} /> Photo / PDF
                </button>
              </div>

              {/* Mode texte */}
              {mode === 'text' && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Message WhatsApp</label>
                  <textarea
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    placeholder={"Ex:\nBonjour, je voudrais commander pour jeudi:\n- 20 pains briochés\n- 10 tartes citron\n- 5 croissants\nMerci !"}
                    rows={8}
                    className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-green-400 resize-none font-mono"
                    autoFocus
                  />
                </div>
              )}

              {/* Mode image */}
              {mode === 'image' && (
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Photo ou PDF</label>
                  {imagePreview ? (
                    <div className="relative">
                      <img src={imagePreview} alt="Bon de commande" className="w-full max-h-64 object-contain rounded-xl border border-gray-200 bg-gray-50" />
                      <button onClick={() => { setImageFile(null); setImagePreview(null); }}
                        className="absolute top-2 right-2 p-1.5 bg-white rounded-full shadow-md hover:bg-red-50">
                        <X size={14} className="text-red-500" />
                      </button>
                    </div>
                  ) : (
                    <div
                      onClick={() => fileRef.current?.click()}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleImagePick(f); }}
                      className="border-2 border-dashed border-gray-300 rounded-xl p-12 text-center cursor-pointer hover:border-green-400 hover:bg-green-50 transition-colors">
                      <ImageIcon size={32} className="mx-auto text-gray-300 mb-3" />
                      <p className="text-sm font-semibold text-gray-500">Glisser une image ici</p>
                      <p className="text-xs text-gray-400 mt-1">ou cliquer pour choisir · JPG, PNG, PDF</p>
                    </div>
                  )}
                  <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleImagePick(f); }} />
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
            </div>
          )}

          {/* Étape 2 — Résultats */}
          {result && (
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold text-gray-700">Commande analysée</p>
                <button onClick={() => { setResult(null); setLines([]); }}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600">
                  <RotateCcw size={12} /> Recommencer
                </button>
              </div>

              {/* Client */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</label>
                  {result.client_nom_detecte && (
                    <p className="text-xs text-gray-400">Détecté : « {result.client_nom_detecte} »</p>
                  )}
                  <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${!selectedClientId ? 'border-orange-300 bg-orange-50' : 'border-gray-200'}`}>
                    <option value="">— Sélectionner le client —</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.nom}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Date livraison</label>
                  <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
                </div>
              </div>

              {/* Lignes */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Produits détectés</label>
                  {needsReview && (
                    <span className="text-xs text-orange-500 font-semibold">⚠ Vérifier les lignes en orange/rouge</span>
                  )}
                </div>

                <div className="space-y-2">
                  {lines.map((line, idx) => (
                    <div key={idx} className={`rounded-xl border p-3 space-y-2 ${!line._article_id ? 'border-red-200 bg-red-50' : line.confiance < 0.7 ? 'border-orange-200 bg-orange-50' : 'border-gray-100 bg-gray-50'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-gray-500 italic flex-1">« {line.texte_original} »</p>
                        <ConfidenceBadge conf={line._article_id && line.confiance >= 0.9 ? line.confiance : (line._article_id ? line.confiance : 0)} />
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <ArticleSelector
                            value={line._article_id}
                            onChange={(id, nom) => handleConfirmLine(idx, id, nom)}
                            articles={articles}
                          />
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => updateLine(idx, { _quantite: Math.max(1, line._quantite - 1) })}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 font-bold text-sm">−</button>
                          <input type="number" min={1}
                            value={line._quantite}
                            onChange={e => updateLine(idx, { _quantite: parseInt(e.target.value) || 1 })}
                            className="w-14 text-center px-1 py-1 border border-gray-200 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-400" />
                          <button onClick={() => updateLine(idx, { _quantite: line._quantite + 1 })}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-100 font-bold text-sm">+</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
          {!result ? (
            <>
              <button onClick={onClose} className="px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-100 rounded-xl font-semibold">
                Annuler
              </button>
              <button
                onClick={handleAnalyze}
                disabled={parsing || (mode === 'text' ? !inputText.trim() : !imageFile)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white rounded-xl font-bold text-sm hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                {parsing ? <><Loader2 size={16} className="animate-spin" /> Analyse en cours…</> : '✨ Analyser'}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => { setResult(null); setLines([]); }}
                className="px-4 py-2.5 text-sm text-gray-500 hover:bg-gray-100 rounded-xl font-semibold">
                Retour
              </button>
              <button
                onClick={handleImport}
                disabled={!canImport}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Importer {lines.filter(l => l._article_id).length} ligne{lines.filter(l => l._article_id).length > 1 ? 's' : ''} →
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Enlever le prefix "data:image/jpeg;base64,"
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
