'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { X, Printer } from 'lucide-react';
import BonLivraison, { type BLOrder } from './BonLivraison';

interface BLModalProps {
  orders: BLOrder[];
  title?: string;
  onClose: () => void;
}

// 210mm ≈ 794px à 96dpi
const BL_WIDTH_PX = 794;

export default function BLModal({ orders, title, onClose }: BLModalProps) {
  const printRef = useRef<HTMLDivElement>(null);   // source pour l'impression (taille réelle)
  const wrapperRef = useRef<HTMLDivElement>(null); // conteneur visible pour le scale
  const [scale, setScale] = useState(1);

  const updateScale = useCallback(() => {
    if (!wrapperRef.current) return;
    const available = wrapperRef.current.clientWidth - 32; // padding 16px chaque côté
    setScale(Math.min(1, available / BL_WIDTH_PX));
  }, []);

  useEffect(() => {
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [updateScale]);

  function handlePrint() {
    const content = printRef.current?.innerHTML;
    if (!content) return;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${title ?? 'Bon de livraison'}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body { width: 210mm; background: white; }
            @page { size: A4 portrait; margin: 0; }
            @media print {
              html, body { margin: 0; padding: 0; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .bl-page-break { page-break-after: always; break-after: page; }
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

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[9998]" onClick={onClose} />
      <div className="fixed inset-0 z-[9999] flex flex-col bg-gray-100 overflow-hidden">

        {/* Barre de contrôle */}
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
          <div className="min-w-0 mr-3">
            <p className="font-bold text-gray-900 text-sm truncate">{title ?? 'Bon de livraison'}</p>
            {orders.length > 1 && (
              <p className="text-xs text-gray-400">{orders.length} BL à imprimer</p>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 active:bg-gray-800 transition-colors"
            >
              <Printer size={15} />
              <span className="hidden sm:inline">Imprimer</span>
            </button>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Prévisualisation scalée */}
        <div ref={wrapperRef} className="flex-1 overflow-y-auto py-4 px-4">
          <div className="flex flex-col items-center gap-4">
            {orders.map((order, idx) => (
              <div
                key={order.numero + idx}
                style={{
                  // Le wrapper prend la taille scalée pour que le scroll soit correct
                  width: `${BL_WIDTH_PX * scale}px`,
                  height: `${(BL_WIDTH_PX * 297 / 210) * scale}px`,
                  flexShrink: 0,
                  overflow: 'hidden',
                  boxShadow: '0 2px 16px rgba(0,0,0,0.12)',
                  borderRadius: '4px',
                }}
              >
                <div style={{
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                  width: '210mm',
                  height: '297mm',
                }}>
                  <BonLivraison order={order} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Source cachée pour l'impression (taille réelle, hors écran) */}
        <div
          ref={printRef}
          aria-hidden
          style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}
        >
          {orders.map((order, idx) => (
            <div
              key={'print-' + order.numero + idx}
              className={idx < orders.length - 1 ? 'bl-page-break' : ''}
              style={{ width: '210mm', height: '297mm', overflow: 'hidden' }}
            >
              <BonLivraison order={order} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
