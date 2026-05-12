'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { X, Printer } from 'lucide-react';
import FacturePDF, { type FactureDoc } from './FacturePDF';

interface FactureModalProps {
  doc: FactureDoc;
  onClose: () => void;
}

const DOC_WIDTH_PX = 794; // 210mm @ 96dpi

export default function FactureModal({ doc, onClose }: FactureModalProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const updateScale = useCallback(() => {
    if (!wrapperRef.current) return;
    const available = wrapperRef.current.clientWidth - 32;
    setScale(Math.min(1, available / DOC_WIDTH_PX));
  }, []);

  useEffect(() => {
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [updateScale]);

  function handlePrint() {
    const content = printRef.current?.innerHTML;
    if (!content) return;
    const titreMap = { facture: 'Facture', devis: 'Devis', avoir: 'Avoir' };
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <meta charset="utf-8"/>
      <title>${titreMap[doc.type]} ${doc.reference}</title>
      <style>
        *{margin:0;padding:0;box-sizing:border-box;}
        html,body{width:210mm;background:white;}
        @page{size:A4 portrait;margin:0;}
        @media print{html,body{margin:0;padding:0;}body{-webkit-print-color-adjust:exact;print-color-adjust:exact;}}
      </style>
    </head><body>${content}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); win.close(); }, 300);
  }

  const titreMap = { facture: 'Facture', devis: 'Devis', avoir: 'Avoir' };

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-[9998]" onClick={onClose} />
      <div className="fixed inset-0 z-[9999] flex flex-col bg-gray-100 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200 shadow-sm flex-shrink-0">
          <p className="font-bold text-gray-900 text-sm">{titreMap[doc.type]} {doc.reference}</p>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white text-sm font-semibold rounded-xl hover:bg-gray-700 transition-colors">
              <Printer size={15} />
              <span className="hidden sm:inline">Imprimer</span>
            </button>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 text-gray-500">
              <X size={20} />
            </button>
          </div>
        </div>

        <div ref={wrapperRef} className="flex-1 overflow-y-auto py-4 px-4">
          <div className="flex flex-col items-center">
            <div style={{
              width: `${DOC_WIDTH_PX * scale}px`,
              overflow: 'hidden',
              boxShadow: '0 2px 16px rgba(0,0,0,0.12)',
              borderRadius: '4px',
            }}>
              <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: '210mm' }}>
                <FacturePDF doc={doc} />
              </div>
            </div>
          </div>
        </div>

        <div ref={printRef} aria-hidden style={{ position: 'absolute', left: '-9999px', top: 0, pointerEvents: 'none' }}>
          <div style={{ width: '210mm' }}>
            <FacturePDF doc={doc} />
          </div>
        </div>
      </div>
    </>
  );
}
