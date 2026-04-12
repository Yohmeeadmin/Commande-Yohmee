'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import Link from 'next/link';
import { Client } from '@/types';
import { MobileFlowProps, OrderLine, ArticleWithRef } from './types';
import { calculateArticlePrice } from '@/types';
import StepClient from './StepClient';
import StepCatalogue from './StepCatalogue';
import CartSheet from './CartSheet';

type Step = 'client' | 'catalogue';

export default function MobileFlow({
  clients, articles, categories, deliverySlots,
  lines, setLines, form, setForm, onSubmit, submitting,
}: MobileFlowProps) {
  const [step, setStep] = useState<Step>('client');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  function handleSelectClient(client: Client) {
    setSelectedClient(client);
    setForm(f => ({ ...f, client_id: client.id }));
  }

  function handleReorder(newLines: OrderLine[]) {
    setLines(newLines);
  }

  function handleAdd(article: ArticleWithRef) {
    setLines(prev => {
      const existing = prev.find(l => l.article_id === article.id);
      if (existing) {
        return prev.map(l =>
          l.article_id === article.id ? { ...l, quantite: l.quantite + 1 } : l
        );
      }
      const price = calculateArticlePrice(article, article.product_reference);
      return [...prev, {
        id: crypto.randomUUID(),
        article_id: article.id,
        article_display_name: article.display_name,
        quantite: 1,
        prix_unitaire: price,
        unit_quantity: article.quantity,
      }];
    });
  }

  function handleUpdateQty(id: string, delta: number) {
    setLines(prev =>
      prev.map(l => l.id === id
        ? { ...l, quantite: Math.max(1, l.quantite + delta) }
        : l
      )
    );
  }

  function handleRemove(id: string) {
    setLines(prev => prev.filter(l => l.id !== id));
  }

  const stepLabels: Record<Step, string> = {
    client: 'Choisir le client',
    catalogue: 'Catalogue',
  };

  return (
    <div className="fixed inset-0 bg-gray-50 z-10 flex flex-col" style={{ top: 56, bottom: 56 }}>
      {/* Header étape */}
      <div className="flex-shrink-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-400 font-medium">
            Étape {step === 'client' ? '1' : '2'}/2
          </p>
          <h2 className="font-bold text-gray-900">{stepLabels[step]}</h2>
        </div>
        <Link
          href="/commandes"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100"
        >
          <X size={18} className="text-gray-500" />
        </Link>
      </div>

      {/* Contenu de l'étape */}
      <div className="flex-1 overflow-hidden">
        {step === 'client' && (
          <StepClient
            clients={clients}
            selectedClient={selectedClient}
            onSelect={handleSelectClient}
            onReorder={handleReorder}
            onNext={() => setStep('catalogue')}
          />
        )}
        {step === 'catalogue' && selectedClient && (
          <StepCatalogue
            client={selectedClient}
            categories={categories}
            articles={articles}
            lines={lines}
            onAdd={handleAdd}
            onBack={() => setStep('client')}
            onOpenCart={() => setCartOpen(true)}
          />
        )}
      </div>

      {/* Cart sheet */}
      {cartOpen && (
        <CartSheet
          lines={lines}
          form={form}
          deliverySlots={deliverySlots}
          submitting={submitting}
          onUpdateQty={handleUpdateQty}
          onRemove={handleRemove}
          onFormChange={updates => setForm(f => ({ ...f, ...updates }))}
          onSubmit={onSubmit}
          onClose={() => setCartOpen(false)}
        />
      )}
    </div>
  );
}
