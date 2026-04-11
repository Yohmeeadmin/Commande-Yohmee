'use client';

import { useState } from 'react';
import { X, Check, AlertTriangle, Calendar, ArrowRight } from 'lucide-react';
import { OrderItem } from '@/types';
import { formatPrice } from '@/lib/utils';

interface DeliveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: OrderItem[];
  onConfirmComplete: () => void;
  onConfirmPartial: (deliveredItems: { order_item_id: string; quantite_livree: number }[]) => void;
  onCreateBackorder: (date: string, items: { product_id: string; product_nom: string; quantite: number; prix_unitaire: number }[]) => void;
}

type Step = 'ask' | 'partial' | 'reschedule';

export default function DeliveryModal({
  isOpen,
  onClose,
  items,
  onConfirmComplete,
  onConfirmPartial,
  onCreateBackorder,
}: DeliveryModalProps) {
  const [step, setStep] = useState<Step>('ask');
  const [deliveredQuantities, setDeliveredQuantities] = useState<Record<string, number>>({});
  const [backorderDate, setBackorderDate] = useState(() => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  });

  if (!isOpen) return null;

  const handleQuantityChange = (itemId: string, value: number, max: number) => {
    setDeliveredQuantities({
      ...deliveredQuantities,
      [itemId]: Math.min(Math.max(0, value), max),
    });
  };

  const getDeliveredQty = (item: OrderItem) => {
    return deliveredQuantities[item.id] ?? item.quantite;
  };

  const getRemainingQty = (item: OrderItem) => {
    return item.quantite - getDeliveredQty(item);
  };

  const hasRemaining = items.some(item => getRemainingQty(item) > 0);
  const remainingItems = items.filter(item => getRemainingQty(item) > 0);

  const handleConfirmPartial = () => {
    const deliveredItems = items.map(item => ({
      order_item_id: item.id,
      quantite_livree: getDeliveredQty(item),
    }));
    onConfirmPartial(deliveredItems);

    if (hasRemaining) {
      setStep('reschedule');
    } else {
      onClose();
    }
  };

  const handleCreateBackorder = () => {
    const backorderItems = remainingItems.map(item => ({
      product_id: item.product_id!,
      product_nom: item.product_nom || (item.product as any)?.nom || 'Produit',
      quantite: getRemainingQty(item),
      prix_unitaire: item.prix_unitaire,
    }));
    onCreateBackorder(backorderDate, backorderItems);
    onClose();
  };

  const setTomorrow = () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    setBackorderDate(tomorrow.toISOString().split('T')[0]);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {step === 'ask' && 'Marquer comme livrée'}
            {step === 'partial' && 'Quantités livrées'}
            {step === 'reschedule' && 'Reprogrammer le reliquat'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* STEP 1: Ask complete or partial */}
          {step === 'ask' && (
            <div className="text-center space-y-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                <Check className="text-green-600" size={32} />
              </div>
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Cette commande a-t-elle été livrée complètement ?
                </h3>
                <p className="text-gray-500">
                  {items.length} article{items.length > 1 ? 's' : ''} dans cette commande
                </p>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={() => {
                    onConfirmComplete();
                    onClose();
                  }}
                  className="w-full py-4 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Check size={20} />
                  Oui, commande complète
                </button>
                <button
                  onClick={() => {
                    // Initialize with full quantities
                    const initial: Record<string, number> = {};
                    items.forEach(item => {
                      initial[item.id] = item.quantite;
                    });
                    setDeliveredQuantities(initial);
                    setStep('partial');
                  }}
                  className="w-full py-4 bg-amber-50 text-amber-700 border border-amber-200 rounded-xl font-medium hover:bg-amber-100 transition-colors flex items-center justify-center gap-2"
                >
                  <AlertTriangle size={20} />
                  Non, livraison incomplète
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: Partial delivery - enter quantities */}
          {step === 'partial' && (
            <div className="space-y-4">
              <p className="text-gray-600 mb-4">
                Indiquez les quantités réellement livrées pour chaque produit :
              </p>

              <div className="space-y-3">
                {items.map((item) => {
                  const delivered = getDeliveredQty(item);
                  const remaining = getRemainingQty(item);
                  const isPartial = remaining > 0;

                  return (
                    <div
                      key={item.id}
                      className={`p-4 rounded-xl border ${
                        isPartial ? 'border-amber-200 bg-amber-50' : 'border-gray-100 bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="font-medium text-gray-900">
                            {(item.product as any)?.nom || item.product_nom}
                          </p>
                          <p className="text-sm text-gray-500">
                            Commandé : {item.quantite}
                          </p>
                        </div>
                        {isPartial && (
                          <span className="text-xs px-2 py-1 bg-amber-200 text-amber-800 rounded-full">
                            Reliquat : {remaining}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600">Livré :</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(item.id, delivered - 1, item.quantite)}
                            className="w-10 h-10 flex items-center justify-center bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-lg font-medium"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            max={item.quantite}
                            value={delivered}
                            onChange={(e) => handleQuantityChange(item.id, parseInt(e.target.value) || 0, item.quantite)}
                            className="w-20 text-center px-3 py-2 border border-gray-200 rounded-lg text-lg font-medium"
                          />
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(item.id, delivered + 1, item.quantite)}
                            className="w-10 h-10 flex items-center justify-center bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-lg font-medium"
                          >
                            +
                          </button>
                        </div>
                        <span className="text-sm text-gray-500">/ {item.quantite}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {hasRemaining && (
                <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex items-center gap-2 text-amber-800">
                    <AlertTriangle size={20} />
                    <span className="font-medium">
                      {remainingItems.length} produit{remainingItems.length > 1 ? 's' : ''} avec reliquat
                    </span>
                  </div>
                  <p className="text-sm text-amber-700 mt-1">
                    Vous pourrez reprogrammer ces quantités à l&apos;étape suivante.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Reschedule backorder */}
          {step === 'reschedule' && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Calendar className="text-blue-600" size={32} />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Reprogrammer les quantités restantes ?
                </h3>
                <p className="text-gray-500">
                  Une nouvelle commande sera créée avec les produits non livrés.
                </p>
              </div>

              {/* Récap reliquat */}
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-sm font-medium text-gray-700 mb-3">Produits à reprogrammer :</p>
                <div className="space-y-2">
                  {remainingItems.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        {(item.product as any)?.nom || item.product_nom}
                      </span>
                      <span className="font-medium text-gray-900">
                        {getRemainingQty(item)} {(item.product as any)?.unite || 'unité(s)'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Date picker */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Date de livraison
                </label>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={setTomorrow}
                    className="px-4 py-2.5 bg-blue-50 text-blue-700 rounded-xl font-medium hover:bg-blue-100 transition-colors"
                  >
                    Demain
                  </button>
                  <input
                    type="date"
                    value={backorderDate}
                    onChange={(e) => setBackorderDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  onClick={handleCreateBackorder}
                  className="w-full py-4 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Calendar size={20} />
                  Créer la commande reliquat
                </button>
                <button
                  onClick={onClose}
                  className="w-full py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition-colors"
                >
                  Non, ne pas reprogrammer
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer for partial step */}
        {step === 'partial' && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
            <button
              onClick={() => setStep('ask')}
              className="flex-1 py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition-colors"
            >
              Retour
            </button>
            <button
              onClick={handleConfirmPartial}
              className="flex-1 py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
            >
              Valider
              <ArrowRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
