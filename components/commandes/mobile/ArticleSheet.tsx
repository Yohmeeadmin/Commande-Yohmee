'use client';

import { X } from 'lucide-react';
import { ArticleWithRef, OrderLine } from './types';
import { calculateArticlePrice, getProductStateStyle, PACK_TYPES } from '@/types';
import { formatPrice } from '@/lib/utils';

interface Props {
  articles: ArticleWithRef[];
  lines: OrderLine[];
  onAdd: (article: ArticleWithRef) => void;
  onClose: () => void;
}

export default function ArticleSheet({ articles, lines, onAdd, onClose }: Props) {
  const ref = articles[0]?.product_reference;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-50" onClick={onClose} />
      <div className="fixed left-0 right-0 z-50 bg-white rounded-t-2xl shadow-2xl animate-slide-up flex flex-col" style={{ bottom: 56, maxHeight: 'calc(80vh - 56px)' }}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">{ref?.code}</p>
            <h3 className="font-bold text-gray-900 text-lg">{ref?.name}</h3>
          </div>
          <button
            onClick={onClose}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100"
          >
            <X size={18} className="text-gray-500" />
          </button>
        </div>

        {/* Options */}
        <div className="p-4 space-y-3 flex-1 overflow-y-auto">
          <p className="text-sm text-gray-400 font-medium">Choisissez un format</p>
          {articles.map(article => {
            const price = calculateArticlePrice(article, article.product_reference);
            const stateStyle = getProductStateStyle(article.product_state);
            const packLabel = PACK_TYPES.find(p => p.value === article.pack_type)?.label ?? article.pack_type;
            const inCart = lines.find(l => l.article_id === article.id);

            return (
              <button
                key={article.id}
                onClick={() => { onAdd(article); onClose(); }}
                className="w-full flex items-center justify-between p-4 rounded-2xl border-2 transition-all active:scale-98
                  border-gray-100 hover:border-blue-200 hover:bg-blue-50"
              >
                <div className="text-left">
                  <p className="font-semibold text-gray-900">
                    {packLabel} {article.quantity}
                  </p>
                  <span
                    className="inline-block mt-1 text-xs px-2.5 py-0.5 rounded-full font-medium"
                    style={{ backgroundColor: stateStyle.bgColor, color: stateStyle.color }}
                  >
                    {stateStyle.label}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {inCart && (
                    <span className="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-1 rounded-full">
                      ×{inCart.quantite}
                    </span>
                  )}
                  <div className="text-right">
                    <p className="font-bold text-gray-900">{formatPrice(price)}</p>
                    <p className="text-xs text-gray-400">/ unité</p>
                  </div>
                  <div className="w-9 h-9 flex items-center justify-center bg-blue-600 rounded-full text-white font-bold text-lg">
                    +
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
