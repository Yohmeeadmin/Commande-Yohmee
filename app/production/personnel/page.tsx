'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, ExternalLink, X, Clock, Coffee, Users, Settings, Printer, Plus, ChevronRight, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface Employe {
  id: string;
  nom: string;
  poste: string | null;
  service: string | null;
  shift_debut: string | null;
  shift_fin: string | null;
  shift_pause_min: number | null;
  jours_off: number[] | null;
}

interface Slot {
  employe_id: string;
  heure_debut: string;
  heure_fin: string;
  pause_min: number;
}

type DragSource = { empId: string; slot: Slot; fromJour: number };

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const CIBLE_MIN = 44 * 60;

const SERVICE_COLORS: Record<string, { header: string; row: string; badge: string; dot: string; cell: string; text: string }> = {
  Boulangerie:  { header: 'bg-amber-50 border-amber-200',  row: 'hover:bg-amber-50/30', badge: 'bg-amber-100 text-amber-800',  dot: 'bg-amber-400',  cell: 'bg-amber-50',  text: 'text-amber-800' },
  Pâtisserie:   { header: 'bg-pink-50 border-pink-200',    row: 'hover:bg-pink-50/30',   badge: 'bg-pink-100 text-pink-800',    dot: 'bg-pink-400',   cell: 'bg-pink-50',   text: 'text-pink-800' },
  Viennoiserie: { header: 'bg-orange-50 border-orange-200',row: 'hover:bg-orange-50/30', badge: 'bg-orange-100 text-orange-800',dot: 'bg-orange-400', cell: 'bg-orange-50', text: 'text-orange-800' },
  Burger:       { header: 'bg-red-50 border-red-200',      row: 'hover:bg-red-50/30',    badge: 'bg-red-100 text-red-800',      dot: 'bg-red-400',    cell: 'bg-red-50',    text: 'text-red-800' },
  Production:   { header: 'bg-blue-50 border-blue-200',    row: 'hover:bg-blue-50/30',   badge: 'bg-blue-100 text-blue-800',    dot: 'bg-blue-400',   cell: 'bg-blue-50',   text: 'text-blue-800' },
  Livraison:    { header: 'bg-indigo-50 border-indigo-200',row: 'hover:bg-indigo-50/30', badge: 'bg-indigo-100 text-indigo-800',dot: 'bg-indigo-400', cell: 'bg-indigo-50', text: 'text-indigo-800' },
  Traiteur:     { header: 'bg-teal-50 border-teal-200',    row: 'hover:bg-teal-50/30',   badge: 'bg-teal-100 text-teal-800',    dot: 'bg-teal-400',   cell: 'bg-teal-50',   text: 'text-teal-800' },
};

const DEFAULT_STYLE = { header: 'bg-gray-50 border-gray-200', row: 'hover:bg-gray-50/30', badge: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400', cell: 'bg-gray-50', text: 'text-gray-700' };

function sStyle(service: string | null) {
  return (service && SERVICE_COLORS[service]) ? SERVICE_COLORS[service] : DEFAULT_STYLE;
}

function slotNetMin(slot: Slot): number {
  const [dh, dm] = slot.heure_debut.split(':').map(Number);
  const [fh, fm] = slot.heure_fin.split(':').map(Number);
  let diff = (fh * 60 + fm) - (dh * 60 + dm);
  if (diff < 0) diff += 24 * 60;
  return Math.max(0, diff - slot.pause_min);
}

function fmtMin(min: number): string {
  if (min <= 0) return '0h';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

// ─── Helpers semaine ─────────────────────────────────────────────────────────

/** Retourne le lundi de la semaine contenant `date` */
function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=dim, 1=lun...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Numéro de semaine ISO */
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/** Date du jour i (0=lundi) à partir du lundi */
function dayDate(monday: Date, i: number): Date {
  const d = new Date(monday);
  d.setDate(d.getDate() + i);
  return d;
}

/** Format "10 mai" */
function fmtDay(date: Date): string {
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

/** Format YYYY-MM-DD pour input type=week */
function toWeekInputValue(monday: Date): string {
  const year = monday.getFullYear();
  const week = String(getISOWeek(monday)).padStart(2, '0');
  return `${year}-W${week}`;
}

/** Parse input type=week value → monday Date */
function parseWeekInput(val: string): Date {
  // val = "2026-W20"
  const [yearStr, wStr] = val.split('-W');
  const year = parseInt(yearStr);
  const week = parseInt(wStr);
  // ISO week 1 = semaine contenant le 4 janv
  const jan4 = new Date(year, 0, 4);
  const monday = getMondayOf(jan4);
  monday.setDate(monday.getDate() + (week - 1) * 7);
  return monday;
}

// ─── Couleurs impression (hex pour inline styles) ────────────────────────────

const PRINT_COLORS: Record<string, { bg: string; border: string; text: string; cellBg: string }> = {
  Boulangerie:  { bg: '#fffbeb', border: '#f59e0b', text: '#92400e', cellBg: '#fef3c7' },
  Pâtisserie:   { bg: '#fdf2f8', border: '#ec4899', text: '#9d174d', cellBg: '#fce7f3' },
  Viennoiserie: { bg: '#fff7ed', border: '#f97316', text: '#9a3412', cellBg: '#ffedd5' },
  Burger:       { bg: '#fff1f2', border: '#f43f5e', text: '#9f1239', cellBg: '#ffe4e6' },
  Production:   { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af', cellBg: '#dbeafe' },
  Livraison:    { bg: '#eef2ff', border: '#6366f1', text: '#3730a3', cellBg: '#e0e7ff' },
  Traiteur:     { bg: '#f0fdfa', border: '#14b8a6', text: '#134e4a', cellBg: '#ccfbf1' },
};
const DEFAULT_PRINT = { bg: '#f9fafb', border: '#9ca3af', text: '#374151', cellBg: '#f3f4f6' };
function pColor(service: string | null) {
  return (service && PRINT_COLORS[service]) ? PRINT_COLORS[service] : DEFAULT_PRINT;
}

// ─── Génération HTML impression (nouvelle fenêtre) ────────────────────────────

function buildPrintHtml(employes: Employe[], planning: Record<number, Slot[]>, monday: Date): string {
  const services = [...new Set(employes.map(e => e.service ?? 'Autre'))].sort();
  const byService = new Map<string, Employe[]>();
  services.forEach(s => byService.set(s, employes.filter(e => (e.service ?? 'Autre') === s)));

  function getSlot(empId: string, jour: number): Slot | undefined {
    return (planning[jour] ?? []).find(s => s.employe_id === empId);
  }
  const dateStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const weekNum = getISOWeek(monday);
  const dayDates = JOURS.map((_, i) => dayDate(monday, i));

  // En-têtes colonnes (une seule fois)
  const jourHeaders = JOURS.map((j, i) => {
    const wkColor = i >= 5 ? '#d1d5db' : '#6b7280';
    const wkBg = i >= 5 ? 'background:#f9fafb;' : '';
    const dateLabel = dayDates[i].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    return `<th style="text-align:center;padding:7px 4px;font-size:10px;font-weight:700;color:${wkColor};text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e5e7eb;${wkBg}">
      <div>${j.slice(0,3)}</div>
      <div style="font-size:9px;font-weight:500;color:#9ca3af;margin-top:1px;text-transform:none;letter-spacing:0;">${dateLabel}</div>
    </th>`;
  }).join('');

  // Lignes par service
  const allRows = services.map(service => {
    const emps = byService.get(service) ?? [];
    const pc = pColor(emps[0]?.service ?? null);

    const separator = `<tr>
      <td colspan="8" style="padding:12px 14px 4px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:8px;height:8px;border-radius:50%;background:${pc.border};flex-shrink:0;"></div>
          <span style="font-size:10px;font-weight:900;color:${pc.text};text-transform:uppercase;letter-spacing:0.8px;">${service}</span>
          <div style="flex:1;height:1px;background:#e5e7eb;"></div>
        </div>
      </td>
    </tr>`;

    const rows = emps.map((emp, eIdx) => {
      const isLast = eIdx === emps.length - 1;
      const cells = JOURS.map((_, i) => {
        const slot = getSlot(emp.id, i);
        const wkBg = i >= 5 ? 'background:#f9fafb;' : '';
        if (!slot) return `<td style="text-align:center;padding:5px 3px;${wkBg}border-bottom:${isLast ? '1px solid #f3f4f6' : '1px solid #f3f4f6'};color:#e5e7eb;font-size:12px;">—</td>`;
        return `<td style="text-align:center;padding:4px 3px;${wkBg}border-bottom:1px solid #f3f4f6;vertical-align:middle;">
          <div style="font-size:11px;font-weight:800;color:#1f2937;">${slot.heure_debut.slice(0,5)}–${slot.heure_fin.slice(0,5)}</div>
          ${slot.pause_min > 0 ? `<div style="font-size:9px;color:#9ca3af;">${slot.pause_min}'</div>` : ''}
          <div style="font-size:10px;font-weight:700;color:${pc.text};">${fmtMin(slotNetMin(slot))}</div>
        </td>`;
      }).join('');
      return `<tr>
        <td style="padding:6px 14px;border-bottom:1px solid #f3f4f6;">
          <div style="font-size:12px;font-weight:700;color:#111827;">${emp.nom}</div>
          ${emp.poste ? `<div style="font-size:10px;color:#9ca3af;">${emp.poste}</div>` : ''}
        </td>
        ${cells}
      </tr>`;
    }).join('');

    return separator + rows;
  }).join('');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>Planning équipe — S${weekNum}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; background: white; color: #111827; padding: 20px; }
    @media print {
      body { padding: 0; }
      @page { margin: 8mm; size: A4 landscape; }
    }
  </style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px;padding-bottom:12px;border-bottom:3px solid #111827;">
    <div>
      <div style="font-size:20px;font-weight:900;color:#111827;letter-spacing:-0.5px;margin-bottom:2px;">Planning équipe — Semaine ${weekNum}</div>
      <div style="font-size:12px;color:#374151;font-weight:600;">${fmtDay(dayDates[0])} – ${fmtDay(dayDates[6])}</div>
    </div>
    <div style="font-size:10px;color:#9ca3af;">Édité le ${dateStr}</div>
  </div>
  <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
    <thead>
      <tr style="background:#f9fafb;">
        <th style="text-align:left;padding:7px 14px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #e5e7eb;width:140px;">Employé</th>
        ${jourHeaders}
      </tr>
    </thead>
    <tbody>
      ${allRows}
    </tbody>
  </table>
  <div style="margin-top:12px;font-size:9px;color:#d1d5db;text-align:right;">BDK Commandes</div>
  </div>
</body>
</html>`;
}

function printWindow(employes: Employe[], planning: Record<number, Slot[]>, monday: Date) {
  const html = buildPrintHtml(employes, planning, monday);
  const win = window.open('', '_blank', 'width=1200,height=800');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

// ─── Composant PrintPlanning (rendu dans #print-planning-sheet) ───────────────

function PrintPlanning({ employes, planning }: { employes: Employe[]; planning: Record<number, Slot[]> }) {
  const services = [...new Set(employes.map(e => e.service ?? 'Autre'))].sort();
  const byService = new Map<string, Employe[]>();
  services.forEach(s => byService.set(s, employes.filter(e => (e.service ?? 'Autre') === s)));

  function getSlot(empId: string, jour: number): Slot | undefined {
    return (planning[jour] ?? []).find(s => s.employe_id === empId);
  }

  const totalGlobal = employes.reduce((sum, emp) => {
    return sum + JOURS.reduce((s, _, i) => { const sl = getSlot(emp.id, i); return s + (sl ? slotNetMin(sl) : 0); }, 0);
  }, 0);

  const now = new Date();
  const dateStr = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const s: React.CSSProperties & Record<string, string | number> = {};

  return (
    <div style={{ padding: '24px', fontFamily: 'system-ui, sans-serif', background: 'white', minHeight: '100vh' }}>

      {/* En-tête */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '28px', paddingBottom: '20px', borderBottom: '3px solid #111827' }}>
        <div>
          <div style={{ fontSize: '22px', fontWeight: 900, color: '#111827', letterSpacing: '-0.5px', marginBottom: '4px' }}>
            Planning de la semaine
          </div>
          <div style={{ fontSize: '13px', color: '#6b7280', fontWeight: 500 }}>Édité le {dateStr}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '12px', color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px' }}>
            {employes.length} employés · {services.length} services
          </div>
          <div style={{ fontSize: '18px', fontWeight: 900, color: '#111827' }}>
            {fmtMin(totalGlobal)}
            <span style={{ fontSize: '12px', fontWeight: 500, color: '#9ca3af', marginLeft: '6px' }}>
              / {fmtMin(employes.length * CIBLE_MIN)} cible
            </span>
          </div>
        </div>
      </div>

      {/* Sections par service */}
      {services.map((service, sIdx) => {
        const emps = byService.get(service) ?? [];
        const pc = pColor(emps[0]?.service ?? null);
        const totalService = emps.reduce((sum, emp) =>
          sum + JOURS.reduce((s, _, i) => { const sl = getSlot(emp.id, i); return s + (sl ? slotNetMin(sl) : 0); }, 0), 0);
        const heuresParJour = JOURS.map((_, j) => emps.reduce((sum, emp) => {
          const sl = getSlot(emp.id, j); return sum + (sl ? slotNetMin(sl) : 0);
        }, 0));

        return (
          <div key={service} style={{ marginBottom: sIdx < services.length - 1 ? '24px' : 0, pageBreakInside: 'avoid' }}>
            {/* Header service */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: pc.bg, border: `1px solid ${pc.border}`, borderRadius: '10px 10px 0 0', padding: '10px 16px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: pc.border, flexShrink: 0 }} />
              <div style={{ fontSize: '13px', fontWeight: 900, color: pc.text, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{service}</div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: pc.text, background: 'rgba(0,0,0,0.08)', borderRadius: '6px', padding: '2px 8px' }}>{emps.length} pers.</div>
              <div style={{ marginLeft: 'auto', fontSize: '13px', fontWeight: 900, color: pc.text }}>{fmtMin(totalService)}</div>
            </div>

            {/* Tableau */}
            <table style={{ width: '100%', borderCollapse: 'collapse', border: `1px solid ${pc.border}`, borderTop: 'none', borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
              <thead>
                <tr style={{ background: '#f9fafb' }}>
                  <th style={{ textAlign: 'left', padding: '8px 14px', fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', width: '140px', borderBottom: '1px solid #e5e7eb' }}>Employé</th>
                  {JOURS.map((j, i) => (
                    <th key={i} style={{ textAlign: 'center', padding: '8px 6px', fontSize: '10px', fontWeight: 700, color: i >= 5 ? '#d1d5db' : '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #e5e7eb', background: i >= 5 ? '#f9fafb' : undefined }}>
                      <div>{j}</div>
                      {heuresParJour[i] > 0 && <div style={{ fontSize: '9px', fontWeight: 600, color: '#9ca3af', marginTop: '2px' }}>{fmtMin(heuresParJour[i])}</div>}
                    </th>
                  ))}
                  <th style={{ textAlign: 'center', padding: '8px 14px', fontSize: '10px', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '1px solid #e5e7eb' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {emps.map((emp, eIdx) => {
                  const total = JOURS.reduce((s, _, i) => { const sl = getSlot(emp.id, i); return s + (sl ? slotNetMin(sl) : 0); }, 0);
                  const isLast = eIdx === emps.length - 1;
                  return (
                    <tr key={emp.id} style={{ background: eIdx % 2 === 0 ? 'white' : '#fafafa' }}>
                      <td style={{ padding: '9px 14px', borderBottom: isLast ? 'none' : '1px solid #f3f4f6', borderRight: '1px solid #f3f4f6' }}>
                        <div style={{ fontSize: '12px', fontWeight: 700, color: '#111827' }}>{emp.nom}</div>
                        {emp.poste && <div style={{ fontSize: '10px', color: '#9ca3af', marginTop: '1px' }}>{emp.poste}</div>}
                      </td>
                      {JOURS.map((_, i) => {
                        const slot = getSlot(emp.id, i);
                        return (
                          <td key={i} style={{ textAlign: 'center', padding: '6px', borderBottom: isLast ? 'none' : '1px solid #f3f4f6', borderRight: '1px solid #f3f4f6', background: i >= 5 ? '#f9fafb' : undefined, verticalAlign: 'middle' }}>
                            {slot ? (
                              <div style={{ background: pc.cellBg, borderRadius: '6px', padding: '5px 4px', display: 'inline-block', minWidth: '80px' }}>
                                <div style={{ fontSize: '11px', fontWeight: 800, color: '#1f2937' }}>
                                  {slot.heure_debut.slice(0,5)} – {slot.heure_fin.slice(0,5)}
                                </div>
                                {slot.pause_min > 0 && (
                                  <div style={{ fontSize: '9px', color: '#9ca3af', marginTop: '1px' }}>{slot.pause_min}' pause</div>
                                )}
                                <div style={{ fontSize: '11px', fontWeight: 700, color: pc.text, marginTop: '2px' }}>{fmtMin(slotNetMin(slot))}</div>
                              </div>
                            ) : (
                              <span style={{ color: '#e5e7eb', fontSize: '12px' }}>—</span>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ textAlign: 'center', padding: '9px 14px', borderBottom: isLast ? 'none' : '1px solid #f3f4f6' }}>
                        <div style={{ fontSize: '13px', fontWeight: 900, color: total > CIBLE_MIN ? '#dc2626' : total === CIBLE_MIN ? '#16a34a' : total > 0 ? '#111827' : '#d1d5db' }}>
                          {total > 0 ? fmtMin(total) : '—'}
                        </div>
                        {total > 0 && total !== CIBLE_MIN && (
                          <div style={{ fontSize: '9px', color: total > CIBLE_MIN ? '#dc2626' : '#6b7280', marginTop: '1px' }}>
                            {total > CIBLE_MIN ? `+${fmtMin(total - CIBLE_MIN)}` : `-${fmtMin(CIBLE_MIN - total)}`}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}

      {/* Footer */}
      <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '10px', color: '#9ca3af' }}>Cible hebdomadaire : 44h / employé</div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <span style={{ fontSize: '10px', color: '#16a34a', fontWeight: 600 }}>■ Objectif atteint</span>
          <span style={{ fontSize: '10px', color: '#dc2626', fontWeight: 600 }}>■ Dépassement</span>
          <span style={{ fontSize: '10px', color: '#6b7280', fontWeight: 600 }}>■ En dessous</span>
        </div>
      </div>
    </div>
  );
}

// ─── Vue Équipe partageable (écran) ──────────────────────────────────────────

function VueEquipe({ employes, planning, weekMonday }: { employes: Employe[]; planning: Record<number, Slot[]>; weekMonday: Date }) {
  const services = [...new Set(employes.map(e => e.service ?? 'Autre'))].sort();
  const byService = new Map<string, Employe[]>();
  services.forEach(s => byService.set(s, employes.filter(e => (e.service ?? 'Autre') === s)));

  function getSlot(empId: string, jour: number): Slot | undefined {
    return (planning[jour] ?? []).find(s => s.employe_id === empId);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div className="text-sm font-semibold text-gray-500">
          Semaine <span className="font-black text-gray-900">{getISOWeek(weekMonday)}</span>
          <span className="text-gray-400 ml-2 font-normal text-xs">{fmtDay(weekMonday)} – {fmtDay(dayDate(weekMonday, 6))}</span>
        </div>
        <button onClick={() => printWindow(employes, planning, weekMonday)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800">
          <Printer size={14} /> Imprimer / PDF
        </button>
      </div>

      {/* En-têtes colonnes — une seule fois */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-4 py-2 text-xs font-black text-gray-400 uppercase tracking-wider w-44">Employé</th>
              {JOURS.map((j, i) => (
                <th key={i} className={`text-center px-2 py-2 text-xs font-black uppercase tracking-wider ${i >= 5 ? 'text-gray-300' : 'text-gray-500'}`}>
                  <div>{j.slice(0, 3)}</div>
                  <div className="text-[10px] font-medium normal-case tracking-normal text-gray-400">{fmtDay(dayDate(weekMonday, i))}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {services.map(service => {
              const emps = byService.get(service) ?? [];
              const st = sStyle(emps[0]?.service ?? null);
              return (
                <React.Fragment key={service}>
                  {/* Séparateur service */}
                  <tr>
                    <td colSpan={8} className="px-4 pt-4 pb-1">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${st.dot}`} />
                        <span className={`text-xs font-black uppercase tracking-wider ${st.text}`}>{service}</span>
                        <div className="flex-1 h-px bg-gray-100" />
                      </div>
                    </td>
                  </tr>
                  {emps.map((emp, eIdx) => (
                    <tr key={emp.id} className={`${eIdx === emps.length - 1 ? 'border-b border-gray-100' : ''}`}>
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-gray-900 text-sm">{emp.nom}</p>
                        {emp.poste && <p className="text-xs text-gray-400">{emp.poste}</p>}
                      </td>
                      {JOURS.map((_, i) => {
                        const slot = getSlot(emp.id, i);
                        return (
                          <td key={i} className={`text-center px-1 py-2 ${i >= 5 ? 'bg-gray-50/50' : ''}`}>
                            {slot ? (
                              <div>
                                <p className="text-xs font-black text-gray-800">{slot.heure_debut.slice(0,5)}–{slot.heure_fin.slice(0,5)}</p>
                                {slot.pause_min > 0 && <p className="text-[10px] text-gray-400">{slot.pause_min}'</p>}
                                <p className={`text-[10px] font-bold ${st.text}`}>{fmtMin(slotNetMin(slot))}</p>
                              </div>
                            ) : <span className="text-gray-200 text-xs">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Modal profil employé ────────────────────────────────────────────────────

const JOURS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function ProfilModal({ emp, onClose, onSave, onApply }: {
  emp: Employe;
  onClose: () => void;
  onSave: (patch: Partial<Employe>) => Promise<void>;
  onApply: (empId: string, shift: { debut: string; fin: string; pause: number }, joursOff: number[]) => void;
}) {
  const st = sStyle(emp.service);
  const [debut, setDebut]   = useState(emp.shift_debut ?? '04:00');
  const [fin, setFin]       = useState(emp.shift_fin ?? '12:00');
  const [pause, setPause]   = useState(emp.shift_pause_min ?? 0);
  const [joursOff, setJoursOff] = useState<number[]>(emp.jours_off ?? []);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  const netMin = (() => {
    const [dh, dm] = debut.split(':').map(Number);
    const [fh, fm] = fin.split(':').map(Number);
    let diff = (fh * 60 + fm) - (dh * 60 + dm);
    if (diff < 0) diff += 24 * 60;
    return Math.max(0, diff - pause);
  })();

  function toggleJourOff(j: number) {
    setJoursOff(prev => prev.includes(j) ? prev.filter(x => x !== j) : [...prev, j]);
  }

  async function handleSave() {
    setSaving(true);
    await onSave({ shift_debut: debut, shift_fin: fin, shift_pause_min: pause, jours_off: joursOff });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function handleApply() {
    onApply(emp.id, { debut, fin, pause }, joursOff);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className={`flex items-center gap-3 px-6 py-4 rounded-t-2xl border-b ${st.header}`}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-sm ${st.badge}`}>
            {emp.nom.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`font-black text-base leading-tight ${st.text}`}>{emp.nom}</p>
            <p className="text-xs text-gray-400">{emp.poste ?? emp.service ?? '—'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white/60 rounded-xl transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-6">

          {/* Shift habituel */}
          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">Shift habituel</p>
            <div className="bg-gray-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Clock size={14} className="text-gray-400 shrink-0" />
                <span className="text-sm text-gray-500 w-16 shrink-0">Début</span>
                <input type="time" value={debut} onChange={e => setDebut(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div className="flex items-center gap-3">
                <Clock size={14} className="text-gray-400 shrink-0" />
                <span className="text-sm text-gray-500 w-16 shrink-0">Fin</span>
                <input type="time" value={fin} onChange={e => setFin(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-400" />
              </div>
              <div className="flex items-center gap-3">
                <Coffee size={14} className="text-gray-400 shrink-0" />
                <span className="text-sm text-gray-500 w-16 shrink-0">Pause</span>
                <input type="number" min={0} max={120} step={5} value={pause}
                  onChange={e => setPause(parseInt(e.target.value) || 0)}
                  className="w-20 px-3 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-center focus:outline-none focus:ring-2 focus:ring-blue-400" />
                <span className="text-sm text-gray-400">min</span>
                <span className={`ml-auto text-sm font-black ${st.text}`}>{fmtMin(netMin)} net</span>
              </div>
            </div>
          </div>

          {/* Jours de repos */}
          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">Jours de repos habituels</p>
            <div className="flex gap-2">
              {JOURS_SHORT.map((j, idx) => {
                const isOff = joursOff.includes(idx);
                const isWeekend = idx >= 5;
                return (
                  <button key={idx} type="button" onClick={() => toggleJourOff(idx)}
                    className={`flex-1 py-2 rounded-xl text-xs font-black transition-all border-2 ${
                      isOff
                        ? 'bg-gray-900 border-gray-900 text-white'
                        : isWeekend
                        ? 'bg-gray-100 border-gray-100 text-gray-400 hover:border-gray-300'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}>
                    {j}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-gray-400 mt-2">
              {joursOff.length === 0 ? 'Aucun jour de repos défini' : `${joursOff.length} jour${joursOff.length > 1 ? 's' : ''} de repos`}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 space-y-2">
          {/* Appliquer sur la semaine */}
          <button onClick={handleApply}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 transition-colors">
            <Zap size={15} /> Appliquer ce shift sur la semaine
          </button>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors">
              Fermer
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 px-4 py-2.5 text-sm font-semibold bg-gray-900 text-white rounded-xl hover:bg-gray-800 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
              {saving ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Enregistrement…</>
                : saved ? <><Check size={14} />Profil enregistré</>
                : <><Check size={14} />Enregistrer le profil</>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page principale ──────────────────────────────────────────────────────────

export default function ProductionPersonnelPage() {
  const [employes, setEmployes] = useState<Employe[]>([]);
  const [loading, setLoading]   = useState(true);
  const [planning, setPlanning] = useState<Record<number, Slot[]>>({});
  const [weekMonday, setWeekMonday] = useState<Date>(() => getMondayOf(new Date()));
  const [drag, setDrag]         = useState<DragSource | null>(null);
  const [dragOver, setDragOver] = useState<{ empId: string; jour: number } | null>(null);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [view, setView]       = useState<'admin' | 'equipe'>('admin');
  const [profilEmp, setProfilEmp] = useState<Employe | null>(null);
  const planningRef           = useRef(planning);
  planningRef.current         = planning;
  // Vrai uniquement quand l'utilisateur a fait une modification (pas au chargement)
  const userEditedRef         = useRef(false);

  useEffect(() => { load(); }, []);

  // Auto-save 1.5s après une vraie modification utilisateur
  useEffect(() => {
    if (!userEditedRef.current) return;
    const t = setTimeout(() => { save(planningRef.current); }, 1500);
    return () => clearTimeout(t);
  }, [planning]); // eslint-disable-line

  async function load() {
    setLoading(true);
    const [{ data: emps }, { data: dispoData }] = await Promise.all([
      supabase.from('rh_employes').select('id, nom, poste, service, shift_debut, shift_fin, shift_pause_min, jours_off').eq('actif', true).order('service').order('nom'),
      supabase.from('disponibilites').select('*'),
    ]);
    setEmployes((emps as Employe[]) ?? []);
    const plan: Record<number, Slot[]> = {};
    ((dispoData as (Slot & { jour_semaine: number })[]) ?? []).forEach(d => {
      if (!plan[d.jour_semaine]) plan[d.jour_semaine] = [];
      plan[d.jour_semaine].push({ employe_id: d.employe_id, heure_debut: d.heure_debut, heure_fin: d.heure_fin, pause_min: d.pause_min ?? 0 });
    });
    setPlanning(plan);
    setLoading(false);
    userEditedRef.current = false; // reset : le chargement n'est pas une modif utilisateur
  }

  function getSlot(empId: string, jour: number): Slot | undefined {
    return (planning[jour] ?? []).find(s => s.employe_id === empId);
  }

  function addSlot(empId: string, jour: number) {
    if (getSlot(empId, jour)) return;
    userEditedRef.current = true;
    setPlanning(p => ({ ...p, [jour]: [...(p[jour] ?? []), { employe_id: empId, heure_debut: '04:00', heure_fin: '12:00', pause_min: 0 }] }));
  }

  function removeSlot(empId: string, jour: number) {
    userEditedRef.current = true;
    setPlanning(p => ({ ...p, [jour]: (p[jour] ?? []).filter(s => s.employe_id !== empId) }));
  }

  function updateSlot(empId: string, jour: number, patch: Partial<Slot>) {
    userEditedRef.current = true;
    setPlanning(p => ({ ...p, [jour]: (p[jour] ?? []).map(s => s.employe_id === empId ? { ...s, ...patch } : s) }));
  }

  function onDrop(empId: string, jour: number) {
    if (!drag) { setDrag(null); setDragOver(null); return; }
    if (getSlot(empId, jour)) { setDrag(null); setDragOver(null); return; }
    if (drag.empId === empId && jour === drag.fromJour) { setDrag(null); setDragOver(null); return; }
    userEditedRef.current = true;
    setPlanning(p => ({ ...p, [jour]: [...(p[jour] ?? []), { ...drag.slot, employe_id: empId }] }));
    setDrag(null);
    setDragOver(null);
  }

  async function save(plan: Record<number, Slot[]>) {
    setSaving(true);
    setSaveError(null);

    const { error: delErr } = await supabase
      .from('disponibilites')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    if (delErr) {
      console.error('[save] delete error:', delErr);
      setSaveError(delErr.message);
      setSaving(false);
      return;
    }

    const rows: object[] = [];
    Object.entries(plan).forEach(([jour, slots]) => {
      slots.forEach(s => rows.push({ employe_id: s.employe_id, jour_semaine: Number(jour), heure_debut: s.heure_debut, heure_fin: s.heure_fin, pause_min: s.pause_min }));
    });

    if (rows.length > 0) {
      const { error: insErr } = await supabase.from('disponibilites').insert(rows);
      if (insErr) {
        console.error('[save] insert error:', insErr);
        setSaveError(insErr.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function saveProfil(empId: string, patch: Partial<Employe>) {
    await supabase.from('rh_employes').update({
      shift_debut:     patch.shift_debut,
      shift_fin:       patch.shift_fin,
      shift_pause_min: patch.shift_pause_min,
      jours_off:       patch.jours_off,
    }).eq('id', empId);
    // Mettre à jour localement
    setEmployes(prev => prev.map(e => e.id === empId ? { ...e, ...patch } : e));
    if (profilEmp?.id === empId) setProfilEmp(p => p ? { ...p, ...patch } : p);
  }

  function applyShift(empId: string, shift: { debut: string; fin: string; pause: number }, joursOff: number[]) {
    userEditedRef.current = true;
    setPlanning(p => {
      const next = { ...p };
      JOURS.forEach((_, jour) => {
        if (joursOff.includes(jour)) {
          // Jour off → retirer le slot existant
          next[jour] = (next[jour] ?? []).filter(s => s.employe_id !== empId);
        } else {
          // Jour travaillé → ajouter ou remplacer
          const existing = (next[jour] ?? []).filter(s => s.employe_id !== empId);
          next[jour] = [...existing, { employe_id: empId, heure_debut: shift.debut, heure_fin: shift.fin, pause_min: shift.pause }];
        }
      });
      return next;
    });
  }

  // Grouper par service
  const services = [...new Set(employes.map(e => e.service ?? 'Autre'))].sort();
  const byService = new Map<string, Employe[]>();
  services.forEach(s => byService.set(s, employes.filter(e => (e.service ?? 'Autre') === s)));

  // Totaux
  const heuresParEmp = new Map<string, number>();
  Object.values(planning).forEach(slots => slots.forEach(s => {
    heuresParEmp.set(s.employe_id, (heuresParEmp.get(s.employe_id) ?? 0) + slotNetMin(s));
  }));
  const totalSemaineMin = Array.from(heuresParEmp.values()).reduce((a, b) => a + b, 0);
  const heuresParJour = JOURS.map((_, idx) => (planning[idx] ?? []).reduce((sum, s) => sum + slotNetMin(s), 0));

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/production" className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-gray-900">Planning équipe</h1>
            <p className="text-sm text-gray-400">
              {view === 'admin' ? 'Cliquez + pour ajouter · glissez un shift pour le copier' : 'Vue partageable par service'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
            <button onClick={() => setView('admin')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${view === 'admin' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <Settings size={13} /> Admin
            </button>
            <button onClick={() => setView('equipe')} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${view === 'equipe' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              <Users size={13} /> Équipe
            </button>
          </div>
          {/* Sélecteur de semaine */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl px-2 py-1.5">
            <button type="button" onClick={() => setWeekMonday(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n; })}
              className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded-lg font-bold text-base transition-colors">‹</button>
            <label className="flex flex-col items-center cursor-pointer px-1">
              <span className="text-xs font-black text-gray-800">S{getISOWeek(weekMonday)}</span>
              <span className="text-[10px] text-gray-400 leading-tight whitespace-nowrap">{fmtDay(weekMonday)}</span>
              <input type="week" value={toWeekInputValue(weekMonday)}
                onChange={e => { if (e.target.value) setWeekMonday(parseWeekInput(e.target.value)); }}
                className="sr-only" />
            </label>
            <button type="button" onClick={() => setWeekMonday(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n; })}
              className="w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-200 rounded-lg font-bold text-base transition-colors">›</button>
          </div>
          {employes.length > 0 && (
            <div className="bg-gray-100 rounded-xl px-4 py-2 text-sm flex items-center gap-2">
              <span className="text-gray-500">Semaine</span>
              <span className={`font-black ${totalSemaineMin > employes.length * CIBLE_MIN ? 'text-red-600' : totalSemaineMin === employes.length * CIBLE_MIN ? 'text-emerald-600' : 'text-gray-900'}`}>
                {fmtMin(totalSemaineMin)}
              </span>
              <span className="text-gray-400 text-xs">/ {fmtMin(employes.length * CIBLE_MIN)}</span>
            </div>
          )}
          <Link href="/charges/rh" className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors">
            <ExternalLink size={15} /> Employés
          </Link>
          {saving ? (
            <div className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-400">
              <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
              Enregistrement…
            </div>
          ) : saveError ? (
            <div className="flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 font-semibold max-w-xs" title={saveError}>
              <X size={14} /> Erreur — {saveError.length > 40 ? saveError.slice(0, 40) + '…' : saveError}
            </div>
          ) : saved ? (
            <div className="flex items-center gap-2 px-4 py-2.5 text-sm text-emerald-600 font-semibold">
              <Check size={14} /> Enregistré
            </div>
          ) : null}
        </div>
      </div>

      {/* Modal profil employé */}
      {profilEmp && (
        <ProfilModal
          emp={profilEmp}
          onClose={() => setProfilEmp(null)}
          onSave={patch => saveProfil(profilEmp.id, patch)}
          onApply={applyShift}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-300" /></div>
      ) : view === 'equipe' ? (
        <VueEquipe employes={employes} planning={planning} weekMonday={weekMonday} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white">
          <table className="w-full border-collapse" style={{ minWidth: '900px' }}>
            <thead>
              <tr className="border-b border-gray-100">
                {/* Colonne employé */}
                <th className="text-left px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider sticky left-0 bg-white z-10 w-44">
                  Employé
                </th>
                {JOURS.map((j, i) => (
                  <th key={i} className={`text-center px-2 py-3 text-xs font-black uppercase tracking-wider ${i >= 5 ? 'text-gray-300 bg-gray-50/50' : 'text-gray-500'}`}>
                    <div>{j.slice(0, 3)}</div>
                    <div className="text-[10px] font-semibold text-gray-400 mt-0.5 normal-case tracking-normal">
                      {fmtDay(dayDate(weekMonday, i))}
                    </div>
                    {heuresParJour[i] > 0 && (
                      <div className="text-[10px] font-semibold text-gray-400 mt-0.5 normal-case">{fmtMin(heuresParJour[i])}</div>
                    )}
                  </th>
                ))}
                <th className="text-center px-4 py-3 text-xs font-black text-gray-400 uppercase tracking-wider w-28">Total</th>
              </tr>
            </thead>

            <tbody>
              {services.map(service => {
                const emps = byService.get(service) ?? [];
                const st = sStyle(emps[0]?.service ?? null);
                return (
                  <React.Fragment key={service}>
                    {/* Ligne de groupe service */}
                    <tr className={`border-y border-gray-100`}>
                      <td colSpan={10} className={`px-4 py-2 ${st.header}`}>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${st.dot}`} />
                          <span className={`text-xs font-black uppercase tracking-wider ${st.text}`}>{service}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${st.badge}`}>{emps.length} pers.</span>
                        </div>
                      </td>
                    </tr>

                    {emps.map(emp => {
                      const heures = heuresParEmp.get(emp.id) ?? 0;
                      const pct = Math.min(100, (heures / CIBLE_MIN) * 100);
                      const st = sStyle(emp.service);
                      return (
                        <tr key={emp.id} className={`border-b border-gray-50 ${st.row} transition-colors`}>
                          {/* Cellule employé */}
                          <td className="px-4 py-2 sticky left-0 bg-white z-10">
                            <button
                              onClick={() => setProfilEmp(emp)}
                              className="flex items-center gap-1 group text-left w-full"
                            >
                              <p className="text-sm font-bold text-gray-900 leading-tight group-hover:text-blue-600 transition-colors">{emp.nom}</p>
                              <ChevronRight size={12} className="text-gray-300 group-hover:text-blue-400 transition-colors shrink-0" />
                            </button>
                            {emp.poste && <p className="text-xs text-gray-400">{emp.poste}</p>}
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${heures > CIBLE_MIN ? 'bg-red-400' : heures === CIBLE_MIN ? 'bg-emerald-400' : 'bg-blue-400'}`}
                                  style={{ width: `${pct}%` }} />
                              </div>
                              <span className={`text-[10px] font-black shrink-0 ${heures > CIBLE_MIN ? 'text-red-600' : heures === CIBLE_MIN ? 'text-emerald-600' : 'text-gray-500'}`}>
                                {heures > 0 ? fmtMin(heures) : '—'}
                              </span>
                            </div>
                          </td>

                          {/* Cellules jours */}
                          {JOURS.map((_, jour) => {
                            const slot = getSlot(emp.id, jour);
                            const isWeekend = jour >= 5;
                            const isOver = dragOver?.empId === emp.id && dragOver?.jour === jour;
                            const canDrop = !!drag && !slot && !(drag.empId === emp.id && drag.fromJour === jour);

                            return (
                              <td
                                key={jour}
                                className={`px-1.5 py-1.5 align-top ${isWeekend ? 'bg-gray-50/50' : ''}`}
                                onDragOver={e => { if (canDrop) { e.preventDefault(); setDragOver({ empId: emp.id, jour }); } }}
                                onDragLeave={() => setDragOver(null)}
                                onDrop={() => onDrop(emp.id, jour)}
                              >
                                {slot ? (
                                  <div
                                    draggable
                                    onDragStart={() => setDrag({ empId: emp.id, slot: { ...slot }, fromJour: jour })}
                                    onDragEnd={() => { setDrag(null); setDragOver(null); }}
                                    className={`${st.cell} rounded-xl p-2 relative group cursor-grab active:cursor-grabbing transition-all ${drag?.empId === emp.id && drag.fromJour === jour ? 'opacity-40 scale-95' : ''}`}
                                  >
                                    {/* X */}
                                    <button onClick={() => removeSlot(emp.id, jour)}
                                      className="absolute top-1 right-1 p-0.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity rounded">
                                      <X size={10} />
                                    </button>

                                    {/* Horaires */}
                                    <div className="flex items-center gap-0.5 mb-1">
                                      <Clock size={8} className="text-gray-400 shrink-0" />
                                      <input type="time" value={slot.heure_debut}
                                        onChange={e => updateSlot(emp.id, jour, { heure_debut: e.target.value })}
                                        onDragStart={e => e.stopPropagation()}
                                        className="text-xs bg-transparent border-none outline-none w-12 text-gray-700 font-semibold cursor-text" />
                                      <span className="text-gray-300 text-[10px]">-</span>
                                      <input type="time" value={slot.heure_fin}
                                        onChange={e => updateSlot(emp.id, jour, { heure_fin: e.target.value })}
                                        onDragStart={e => e.stopPropagation()}
                                        className="text-xs bg-transparent border-none outline-none w-12 text-gray-700 font-semibold cursor-text" />
                                    </div>

                                    {/* Pause */}
                                    <div className="flex items-center gap-1">
                                      <Coffee size={8} className="text-gray-400 shrink-0" />
                                      <input type="number" min={0} max={120} step={5}
                                        value={slot.pause_min || ''}
                                        onChange={e => updateSlot(emp.id, jour, { pause_min: parseInt(e.target.value) || 0 })}
                                        onDragStart={e => e.stopPropagation()}
                                        placeholder="0"
                                        className="text-xs bg-transparent border-none outline-none w-6 text-gray-500 cursor-text text-center" />
                                      <span className="text-[9px] text-gray-400">min</span>
                                      <span className={`ml-auto text-[10px] font-black ${st.text}`}>{fmtMin(slotNetMin(slot))}</span>
                                    </div>
                                  </div>
                                ) : (
                                  <div
                                    className={`rounded-xl border-2 border-dashed transition-all flex items-center justify-center h-16
                                      ${isOver && canDrop
                                        ? 'border-emerald-400 bg-emerald-50'
                                        : 'border-gray-100 hover:border-gray-200 group cursor-pointer'
                                      }`}
                                    onClick={() => addSlot(emp.id, jour)}
                                  >
                                    <Plus size={12} className="text-gray-300 group-hover:text-gray-400 transition-colors" />
                                  </div>
                                )}
                              </td>
                            );
                          })}

                          {/* Total */}
                          <td className="text-center px-4 py-2">
                            <span className={`text-sm font-black ${heures > CIBLE_MIN ? 'text-red-600' : heures === CIBLE_MIN ? 'text-emerald-600' : heures > 0 ? 'text-gray-800' : 'text-gray-200'}`}>
                              {heures > 0 ? fmtMin(heures) : '—'}
                            </span>
                            {heures > 0 && heures !== CIBLE_MIN && (
                              <p className="text-[10px] text-gray-400">
                                {heures > CIBLE_MIN ? `+${fmtMin(heures - CIBLE_MIN)}` : `-${fmtMin(CIBLE_MIN - heures)}`}
                              </p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
