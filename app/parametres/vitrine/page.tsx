'use client';

import { useEffect, useState, useRef } from 'react';
import { ArrowLeft, Search, X, Globe, ExternalLink, Eye, EyeOff, ImageIcon, Upload, Loader2, Check, ChevronDown, ChevronUp } from 'lucide-react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase/client';
import Image from 'next/image';

interface Article {
  id: string;
  display_name: string;
  is_active: boolean;
  prix_pro: number | null;
  prix_particulier: number | null;
  custom_price: number | null;
  quantity: number;
}

interface ProductRef {
  id: string;
  name: string;
  atelier: string;
  show_on_landing: boolean;
  is_active: boolean;
  description_publique: string | null;
  photo_url: string | null;
  articles: Article[];
}

function formatPrice(n: number) {
  return n.toFixed(2).replace('.', ',') + ' MAD';
}

function getArticlePrice(a: Article, basePrice: number): number {
  return a.prix_pro ?? a.prix_particulier ?? a.custom_price ?? (basePrice * a.quantity);
}

export default function VitrinePage() {
  const [refs, setRefs] = useState<ProductRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAtelier, setFilterAtelier] = useState('tous');
  const [filterMode, setFilterMode] = useState<'tous' | 'en-ligne' | 'hors-ligne'>('tous');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [toggling, setToggling] = useState<Set<string>>(new Set());
  const [savingDesc, setSavingDesc] = useState<Set<string>>(new Set());
  const [editingDesc, setEditingDesc] = useState<Record<string, string>>({});
  const [uploadingPhoto, setUploadingPhoto] = useState<Set<string>>(new Set());
  const photoInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from('product_references')
      .select(`
        id, name, atelier, show_on_landing, is_active, description_publique, photo_url, base_unit_price,
        articles:product_articles(id, display_name, is_active, prix_pro, prix_particulier, custom_price, quantity)
      `)
      .order('name');
    setRefs((data as any[] || []).map(r => ({
      ...r,
      articles: r.articles || [],
    })));
    setLoading(false);
  }

  async function toggleLanding(ref: ProductRef) {
    setToggling(prev => new Set(prev).add(ref.id));
    await supabase.from('product_references').update({ show_on_landing: !ref.show_on_landing }).eq('id', ref.id);
    setRefs(prev => prev.map(r => r.id === ref.id ? { ...r, show_on_landing: !r.show_on_landing } : r));
    setToggling(prev => { const n = new Set(prev); n.delete(ref.id); return n; });
  }

  async function saveDesc(ref: ProductRef) {
    const desc = editingDesc[ref.id] ?? ref.description_publique ?? '';
    setSavingDesc(prev => new Set(prev).add(ref.id));
    await supabase.from('product_references').update({ description_publique: desc || null }).eq('id', ref.id);
    setRefs(prev => prev.map(r => r.id === ref.id ? { ...r, description_publique: desc || null } : r));
    setEditingDesc(prev => { const n = { ...prev }; delete n[ref.id]; return n; });
    setSavingDesc(prev => { const n = new Set(prev); n.delete(ref.id); return n; });
  }

  async function handlePhotoUpload(ref: ProductRef, file: File) {
    setUploadingPhoto(prev => new Set(prev).add(ref.id));
    try {
      const ext = file.name.split('.').pop();
      const path = `products/${ref.id}.${ext}`;

      // 1. Get signed upload URL
      const signRes = await fetch('/api/upload-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, bucket: 'catalogue' }),
      });
      const signData = await signRes.json();
      if (!signRes.ok) return;

      // 2. Upload directly to Supabase
      const { error: upError } = await supabase.storage
        .from('catalogue')
        .uploadToSignedUrl(path, signData.token, file, { contentType: file.type });
      if (upError) return;

      // 3. Save public URL
      const { data: { publicUrl } } = supabase.storage.from('catalogue').getPublicUrl(path);
      const url = `${publicUrl}?t=${Date.now()}`;
      await supabase.from('product_references').update({ photo_url: url }).eq('id', ref.id);
      setRefs(prev => prev.map(r => r.id === ref.id ? { ...r, photo_url: url } : r));
    } finally {
      setUploadingPhoto(prev => { const n = new Set(prev); n.delete(ref.id); return n; });
    }
  }

  const ateliers = ['tous', ...Array.from(new Set(refs.map(r => r.atelier).filter(Boolean)))];

  const filtered = refs.filter(r => {
    if (filterAtelier !== 'tous' && r.atelier !== filterAtelier) return false;
    if (filterMode === 'en-ligne' && !r.show_on_landing) return false;
    if (filterMode === 'hors-ligne' && r.show_on_landing) return false;
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const onlineCount = refs.filter(r => r.show_on_landing).length;

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/parametres" className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <ArrowLeft size={24} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            Catalogue en ligne
            <span className="text-sm font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{onlineCount} en ligne</span>
          </h1>
          <p className="text-gray-500 mt-1">Gérez les produits affichés sur votre vitrine publique</p>
        </div>
        <a href="/accueil" target="_blank"
          className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 px-3 py-2 rounded-xl hover:bg-blue-50 transition-colors">
          <Globe size={15} /> Voir la vitrine <ExternalLink size={13} />
        </a>
      </div>

      {/* Filtres */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un produit…"
            className="w-full pl-9 pr-9 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          />
          {search && <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X size={13} /></button>}
        </div>

        <div className="flex gap-2">
          {/* Mode filter */}
          <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
            {([
              { key: 'tous', label: 'Tous' },
              { key: 'en-ligne', label: 'En ligne' },
              { key: 'hors-ligne', label: 'Hors ligne' },
            ] as const).map(f => (
              <button key={f.key} onClick={() => setFilterMode(f.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filterMode === f.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Atelier filter */}
          {ateliers.length > 2 && (
            <select value={filterAtelier} onChange={e => setFilterAtelier(e.target.value)}
              className="px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 capitalize">
              {ateliers.map(a => (
                <option key={a} value={a}>{a === 'tous' ? 'Tous les ateliers' : a}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="animate-spin text-gray-300" size={32} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <Globe size={32} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">Aucun produit trouvé</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(ref => {
            const isExpanded = expanded.has(ref.id);
            const isToggling = toggling.has(ref.id);
            const isUploadingPhoto = uploadingPhoto.has(ref.id);
            const isSavingDesc = savingDesc.has(ref.id);
            const descValue = editingDesc[ref.id] !== undefined ? editingDesc[ref.id] : (ref.description_publique ?? '');
            const isDirty = editingDesc[ref.id] !== undefined;
            const activeArticles = ref.articles.filter(a => a.is_active);

            return (
              <div key={ref.id} className={`bg-white rounded-2xl border transition-all ${ref.show_on_landing ? 'border-green-200' : 'border-gray-100'}`}>
                {/* Row principale */}
                <div className="flex items-center gap-4 p-4">
                  {/* Photo miniature */}
                  <div className="w-14 h-14 rounded-xl bg-gray-100 overflow-hidden shrink-0 relative">
                    {ref.photo_url ? (
                      <Image src={ref.photo_url} alt={ref.name} fill className="object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <ImageIcon size={18} className="text-gray-300" />
                      </div>
                    )}
                  </div>

                  {/* Infos */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 truncate">{ref.name}</p>
                      {!ref.is_active && (
                        <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-full">Inactif</span>
                      )}
                      {ref.show_on_landing && (
                        <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium flex items-center gap-1">
                          <Eye size={10} /> En ligne
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 capitalize">
                      {ref.atelier} · {activeArticles.length} article{activeArticles.length !== 1 ? 's' : ''} actif{activeArticles.length !== 1 ? 's' : ''}
                    </p>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* Toggle en ligne */}
                    <button
                      onClick={() => toggleLanding(ref)}
                      disabled={isToggling}
                      title={ref.show_on_landing ? 'Retirer de la vitrine' : 'Mettre en ligne'}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                        ref.show_on_landing
                          ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200'
                          : 'bg-gray-100 text-gray-500 hover:bg-green-50 hover:text-green-700 border border-transparent hover:border-green-200'
                      }`}
                    >
                      {isToggling ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : ref.show_on_landing ? (
                        <><Eye size={13} /> En ligne</>
                      ) : (
                        <><EyeOff size={13} /> Mettre en ligne</>
                      )}
                    </button>

                    {/* Lien vers la fiche complète */}
                    <Link href={`/catalogue/${ref.id}`}
                      className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                      title="Modifier la fiche complète">
                      <ExternalLink size={15} />
                    </Link>

                    {/* Expand */}
                    <button onClick={() => toggleExpand(ref.id)}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors">
                      {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>
                  </div>
                </div>

                {/* Panneau étendu */}
                {isExpanded && (
                  <div className="border-t border-gray-50 p-4 space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">

                      {/* Photo */}
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Photo vitrine</p>
                        <div className="flex items-start gap-3">
                          <div className="w-24 h-24 rounded-xl bg-gray-100 overflow-hidden relative shrink-0">
                            {ref.photo_url ? (
                              <Image src={ref.photo_url} alt={ref.name} fill className="object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <ImageIcon size={24} className="text-gray-300" />
                              </div>
                            )}
                            {isUploadingPhoto && (
                              <div className="absolute inset-0 bg-white/80 flex items-center justify-center">
                                <Loader2 size={16} className="animate-spin text-blue-600" />
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-2">
                            <input
                              ref={el => { photoInputRefs.current[ref.id] = el; }}
                              type="file" accept="image/*" className="hidden"
                              onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(ref, f); }}
                            />
                            <button
                              onClick={() => photoInputRefs.current[ref.id]?.click()}
                              disabled={isUploadingPhoto}
                              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                              <Upload size={13} /> Changer la photo
                            </button>
                            <p className="text-xs text-gray-400">JPG, PNG · Max 5 Mo</p>
                          </div>
                        </div>
                      </div>

                      {/* Description publique */}
                      <div className="space-y-2">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Description publique</p>
                        <textarea
                          value={descValue}
                          onChange={e => setEditingDesc(prev => ({ ...prev, [ref.id]: e.target.value }))}
                          placeholder="Description visible par les visiteurs…"
                          rows={4}
                          className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                        {isDirty && (
                          <button
                            onClick={() => saveDesc(ref)}
                            disabled={isSavingDesc}
                            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
                          >
                            {isSavingDesc ? <><Loader2 size={12} className="animate-spin" /> Enregistrement…</> : <><Check size={12} /> Enregistrer</>}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Articles */}
                    {ref.articles.length > 0 && (
                      <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">Articles</p>
                        <div className="grid sm:grid-cols-2 gap-1.5">
                          {ref.articles.map(a => {
                            const price = a.prix_pro ?? a.prix_particulier ?? a.custom_price;
                            return (
                              <div key={a.id} className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm ${a.is_active ? 'bg-gray-50' : 'bg-gray-50 opacity-40'}`}>
                                <span className={`${a.is_active ? 'text-gray-700' : 'text-gray-400 line-through'}`}>{a.display_name}</span>
                                <span className="text-gray-500 text-xs shrink-0 ml-2">{price !== null ? formatPrice(price) : '—'}</span>
                              </div>
                            );
                          })}
                        </div>
                        {ref.articles.filter(a => !a.is_active).length > 0 && (
                          <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                            ⚠ Certains articles sont inactifs — ils n'apparaissent pas dans le formulaire de devis.
                          </p>
                        )}
                      </div>
                    )}

                    {ref.articles.length === 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-700 flex items-center justify-between">
                        <span>⚠ Aucun article — ce produit ne peut pas être sélectionné dans un devis.</span>
                        <Link href={`/catalogue/${ref.id}`} className="text-xs font-semibold underline hover:no-underline shrink-0 ml-3">
                          Ajouter des articles
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
