'use client';

import { X, Trash2, CheckCircle, Save, ChevronDown } from 'lucide-react';
import { OrderLine, OrderForm } from './types';
import { DeliverySlot } from '@/types';
import { formatPrice } from '@/lib/utils';

interface Props {
  lines: OrderLine[];
  form: OrderForm;
  deliverySlots: DeliverySlot[];
  submitting: boolean;
  onUpdateQty: (id: string, delta: number) => void;
  onRemove: (id: string) => void;
  onFormChange: (updates: Partial<OrderForm>) => void;
  onSubmit: (status: 'brouillon' | 'confirmee') => Promise<void>;
  onClose: () => void;
}

export default function CartSheet({
  lines, form, deliverySlots, submitting,
  onUpdateQty, onRemove, onFormChange, onSubmit, onClose,
}: Props) {
  const total = lines.reduce((s, l) => s + l.quantite * l.prix_unitaire, 0);
  const totalQty = lines.reduce((s, l) => s + l.quantite, 0);

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl safe-area-pb flex flex-col"
        style={{ maxHeight: '92vh' }}>

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

          {/* Lignes panier */}
          <div className="px-4 pt-4 space-y-3">
            {lines.map(line => (
              <div key={line.id} className="flex items-center gap-3 bg-gray-50 rounded-2xl p-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm leading-snug">{line.article_display_name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{formatPrice(line.prix_unitaire)} / unité</p>
                </div>
                {/* Contrôle quantité */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => onUpdateQty(line.id, -1)}
                    className="w-9 h-9 flex items-center justify-center bg-white border border-gray-200 rounded-full text-lg font-bold text-gray-600 active:scale-90 transition-transform"
                  >
                    −
                  </button>
                  <span className="w-7 text-center font-bold text-gray-900">{line.quantite}</span>
                  <button
                    onClick={() => onUpdateQty(line.id, 1)}
                    className="w-9 h-9 flex items-center justify-center bg-blue-600 rounded-full text-white text-lg font-bold active:scale-90 transition-transform"
                  >
                    +
                  </button>
                </div>
                {/* Prix ligne + delete */}
                <div className="text-right flex-shrink-0 flex items-center gap-2">
                  <p className="font-bold text-gray-900 text-sm w-16 text-right">
                    {formatPrice(line.quantite * line.prix_unitaire)}
                  </p>
                  <button
                    onClick={() => onRemove(line.id)}
                    className="w-8 h-8 flex items-center justify-center text-red-400 active:scale-90 transition-transform"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Infos livraison */}
          <div className="px-4 pt-5 pb-2 space-y-3">
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Livraison</p>

            {/* Date */}
            <div className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3">
              <span className="text-sm font-medium text-gray-600 w-24 flex-shrink-0">Date</span>
              <input
                type="date"
                value={form.date_livraison}
                onChange={e => onFormChange({ date_livraison: e.target.value })}
                className="flex-1 bg-transparent text-right font-semibold text-gray-900 focus:outline-none"
              />
            </div>

            {/* Créneau */}
            {deliverySlots.length > 0 && (
              <div className="flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3">
                <span className="text-sm font-medium text-gray-600 w-24 flex-shrink-0">Créneau</span>
                <div className="flex-1 flex items-center justify-end gap-1">
                  <select
                    value={form.delivery_slot_id}
                    onChange={e => onFormChange({ delivery_slot_id: e.target.value })}
                    className="bg-transparent font-semibold text-gray-900 text-right focus:outline-none appearance-none"
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
            )}

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
