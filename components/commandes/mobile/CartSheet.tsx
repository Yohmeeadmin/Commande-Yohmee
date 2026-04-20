'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, Trash2, CheckCircle, Save, ChevronDown, Bell, Clock, Calendar, AlertTriangle, GitMerge } from 'lucide-react';
import { OrderLine, OrderForm } from './types';
import { DeliverySlot } from '@/types';
import { formatPrice } from '@/lib/utils';
import { supabase } from '@/lib/supabase/client';

interface DuplicateOrder {
  id: string;
  numero: string;
  status: string;
  items: { product_article_id: string; quantity_ordered: number; unit_price: number; article_unit_quantity: number }[];
}

interface Props {
  lines: OrderLine[];
  form: OrderForm;
  deliverySlots: DeliverySlot[];
  submitting: boolean;
  deliveryHint?: { mode: 'heure' | 'creneau'; label: string } | null;
  onUpdateQty: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  onFormChange: (updates: Partial<OrderForm>) => void;
  onSubmit: (status: 'brouillon' | 'confirmee') => Promise<void>;
  onClose: () => void;
}

export default function CartSheet({
  lines, form, deliverySlots, submitting, deliveryHint,
  onUpdateQty, onRemove, onFormChange, onSubmit, onClose,
}: Props) {
  const router = useRouter();
  const total = lines.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0);
  const totalQty = lines.reduce((s, l) => s + l.quantite, 0);

  const [duplicate, setDuplicate] = useState<DuplicateOrder | null>(null);
  const [merging, setMerging] = useState(false);

  // Détection doublon : même client, même date
  useEffect(() => {
    if (!form.client_id || !form.date_livraison) { setDuplicate(null); return; }
    let cancelled = false;
    supabase
      .from('orders')
      .select('id, numero, status, items:order_items(product_article_id, quantity_ordered, unit_price, article_unit_quantity)')
      .eq('client_id', form.client_id)
      .eq('delivery_date', form.date_livraison)
      .neq('status', 'annulee')
      .limit(1)
      .single()
      .then(({ data }: { data: any }) => {
        if (!cancelled) setDuplicate(data as DuplicateOrder | null);
      });
    return () => { cancelled = true; };
  }, [form.client_id, form.date_livraison]);

  async function handleMerge() {
    if (!duplicate) return;
    setMerging(true);
    try {
      for (const line of lines) {
        const existing = duplicate.items.find(i => i.product_article_id === line.article_id);
        if (existing) {
          await supabase.from('order_items')
            .update({ quantity_ordered: existing.quantity_ordered + line.quantite })
            .eq('order_id', duplicate.id)
            .eq('product_article_id', line.article_id);
        } else {
          await supabase.from('order_items').insert({
            order_id: duplicate.id,
            product_article_id: line.article_id,
            quantity_ordered: line.quantite,
            unit_price: line.prix_unitaire,
            article_unit_quantity: line.unit_quantity,
          });
        }
      }
      router.push(`/commandes/${duplicate.id}`);
    } finally {
      setMerging(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl flex flex-col"
        style={{ bottom: 56, maxHeight: 'calc(92vh - 56px)' }}>

        {/* Handle + header */}
        <div className="flex-shrink-0">
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
            <div>
              <h3 className="font-bold text-gray-900 text-lg">Panier</h3>
              <p className="text-sm text-gray-400">{totalQty} article{totalQty > 1 ? 's' : ''} · {formatPrice(total)}</p>
            </div>
            <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100">
              <X size={18} className="text-gray-500" />
            </button>
          </div>
        </div>

        {/* Contenu scrollable */}
        <div className="flex-1 overflow-y-auto">

          {/* Alerte doublon */}
          {duplicate && (
            <div className="mx-4 mt-4 bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <div className="flex items-start gap-2.5 mb-3">
                <AlertTriangle size={17} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-amber-900">Commande existante</p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    La commande <span className="font-semibold">{duplicate.numero}</span> existe déjà pour ce client à cette date.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleMerge}
                  disabled={merging || lines.length === 0}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-bold disabled:opacity-50 active:scale-95 transition-transform"
                >
                  <GitMerge size={15} />
                  {merging ? 'Groupement…' : 'Grouper'}
                </button>
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 border border-amber-200 text-amber-800 rounded-xl text-sm font-semibold active:scale-95 transition-transform"
                >
                  Annuler
                </button>
              </div>
            </div>
          )}

          {/* Lignes panier */}
          <div className="px-4 pt-4 space-y-3">
            {lines.map(line => (
              <div key={line.id} className="bg-gray-50 rounded-2xl p-3">
                <div className="flex items-start justify-between mb-2.5">
                  <div className="flex-1 min-w-0 pr-2">
                    <p className="font-medium text-gray-900 text-sm leading-snug">{line.article_display_name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{formatPrice(line.prix_unitaire)} / unité</p>
                  </div>
                  <button
                    onClick={() => onRemove(line.id)}
                    className="w-7 h-7 flex items-center justify-center text-gray-300 hover:text-red-400 active:scale-90 transition-all flex-shrink-0 -mt-0.5"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onUpdateQty(line.id, -1)}
                      className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded-full text-lg font-bold text-gray-600 active:scale-90 transition-transform"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={1}
                      value={line.quantite}
                      onChange={e => {
                        const val = parseInt(e.target.value, 10);
                        if (!isNaN(val) && val >= 1) onUpdateQty(line.id, val - line.quantite);
                      }}
                      onFocus={e => e.target.select()}
                      className="w-12 text-center font-bold text-gray-900 bg-white border border-gray-200 rounded-lg py-1 focus:outline-none focus:border-blue-400 text-base"
                    />
                    <button
                      onClick={() => onUpdateQty(line.id, 1)}
                      className="w-8 h-8 flex items-center justify-center bg-blue-600 rounded-full text-white text-lg font-bold active:scale-90 transition-transform"
                    >
                      +
                    </button>
                  </div>
                  <p className="font-bold text-gray-900 text-sm">
                    {formatPrice(line.quantite * line.prix_unitaire)}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Infos livraison */}
          <div className="px-4 pt-5 pb-2 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Livraison</p>
              {deliveryHint?.mode === 'creneau' && deliveryHint.label && (
                <span className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium bg-blue-50 text-blue-700">
                  <Calendar size={11} />
                  {deliveryHint.label}
                </span>
              )}
            </div>

            {/* Date */}
            <div className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3">
              <span className="text-sm font-medium text-gray-600 w-24 flex-shrink-0">Date</span>
              <input
                type="date"
                value={form.date_livraison}
                onChange={e => onFormChange({ date_livraison: e.target.value })}
                className="flex-1 bg-transparent text-right font-semibold text-gray-900 focus:outline-none text-base"
              />
            </div>

            {/* Heure ou Créneau selon le mode */}
            {deliveryHint?.mode === 'heure' ? (
              <div className="flex items-center gap-3 bg-purple-50 rounded-2xl px-4 py-3">
                <Clock size={16} className="text-purple-500 flex-shrink-0" />
                <span className="text-sm font-medium text-purple-700 w-24 flex-shrink-0">Heure</span>
                <input
                  type="time"
                  value={form.delivery_time}
                  onChange={e => onFormChange({ delivery_time: e.target.value })}
                  className="flex-1 bg-transparent font-semibold text-purple-900 text-right focus:outline-none text-base"
                />
              </div>
            ) : deliverySlots.length > 0 ? (
              <div className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3">
                <span className="text-sm font-medium text-gray-600 w-24 flex-shrink-0">Créneau</span>
                <div className="flex-1 flex items-center justify-end gap-1">
                  <select
                    value={form.delivery_slot_id}
                    onChange={e => onFormChange({ delivery_slot_id: e.target.value })}
                    className="bg-transparent font-semibold text-gray-900 text-right focus:outline-none appearance-none text-base"
                  >
                    <option value="">—</option>
                    {deliverySlots.map(s => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="text-gray-400 flex-shrink-0" />
                </div>
              </div>
            ) : null}

            {/* Note */}
            <div className="bg-gray-50 rounded-2xl px-4 py-3">
              <p className="text-sm font-medium text-gray-600 mb-1">Note</p>
              <input
                type="text"
                value={form.note}
                onChange={e => onFormChange({ note: e.target.value })}
                placeholder="Instruction particulière…"
                className="w-full bg-transparent text-gray-900 placeholder-gray-300 focus:outline-none text-sm"
              />
            </div>

            {/* Rappel */}
            <div className="bg-gray-50 rounded-2xl px-4 py-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Bell size={16} className={form.reminder_days !== null ? 'text-blue-500' : 'text-gray-400'} />
                  <div>
                    <p className="text-sm font-medium text-gray-700">Rappel client</p>
                    <p className="text-xs text-gray-400">Notifier avant la livraison</p>
                  </div>
                </div>
                <button
                  onClick={() => onFormChange({ reminder_days: form.reminder_days !== null ? null : 1 })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${form.reminder_days !== null ? 'bg-blue-600' : 'bg-gray-200'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${form.reminder_days !== null ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {form.reminder_days !== null && (
                <div>
                  <p className="text-xs text-gray-400 mb-2">Envoyer le rappel</p>
                  <div className="flex gap-2 flex-wrap">
                    {[1, 2, 3, 5, 7].map(d => (
                      <button
                        key={d}
                        onClick={() => onFormChange({ reminder_days: d })}
                        className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-colors
                          ${form.reminder_days === d
                            ? 'bg-blue-600 text-white'
                            : 'bg-white border border-gray-200 text-gray-600'}`}
                      >
                        {d === 1 ? 'Veille' : `${d} j avant`}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Total */}
          <div className="mx-4 mt-2 mb-3 flex items-center justify-between px-4 py-3 bg-blue-50 rounded-2xl">
            <span className="font-semibold text-blue-900">Total</span>
            <span className="text-2xl font-black text-blue-700">{formatPrice(total)}</span>
          </div>
        </div>

        {/* Boutons validation */}
        <div className="flex-shrink-0 px-4 pb-6 pt-3 border-t border-gray-100 space-y-2">
          <button
            onClick={() => onSubmit('confirmee')}
            disabled={submitting || lines.length === 0}
            className="w-full flex items-center justify-center gap-2 py-4 bg-blue-600 text-white rounded-2xl font-bold text-base disabled:opacity-50 active:scale-98 transition-transform"
          >
            <CheckCircle size={20} />
            {submitting ? 'Enregistrement…' : 'Confirmer la commande'}
          </button>
          <button
            onClick={() => onSubmit('brouillon')}
            disabled={submitting || lines.length === 0}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-gray-100 text-gray-700 rounded-2xl font-semibold text-sm disabled:opacity-50"
          >
            <Save size={18} />
            Enregistrer en brouillon
          </button>
        </div>
      </div>
    </>
  );
}
