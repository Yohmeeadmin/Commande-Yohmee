'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, ExternalLink, X, Clock, Coffee, Users, Settings, Printer, Plus, ChevronRight, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { getFerieFromList, JourFerie } from '@/lib/feries-maroc';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Employe {
  id: string;
  nom: string;
  poste: string | null;
  service: string | null;
  shift_debut: string | null;
  shift_fin: string | null;
  shift_pause_min: number | null;
  jours_off: number[] | null;
  heures_contrat: number | null;
}

interface Slot {
  employe_id: string;
  heure_debut: string;
  heure_fin: string;
  pause_min: number;
  ferie_traitement: 'recup' | 'majore' | null;
}

type AbsenceType = 'conge' | 'recup' | 'maladie' | 'autre' | 'off';

interface AbsenceRow {
  employe_id: string;
  date: string;
  type: AbsenceType;
  note?: string | null;
}

type DragSource = { empId: string; slot: Slot; fromJour: number };

// ─── Constantes ───────────────────────────────────────────────────────────────

const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
const CIBLE_MIN = 44 * 60;

const ABSENCE_TYPES: {
  key: AbsenceType; short: string; label: string;
  cell: string; badge: string; pill: string; text: string;
}[] = [
  { key: 'off',     short: 'OFF', label: 'Jour off',       cell: 'bg-red-50 border-red-500',         badge: 'bg-red-600 text-white',           pill: 'bg-red-600 text-white hover:bg-red-700',                text: 'text-red-600'     },
  { key: 'conge',   short: 'CP',  label: 'Congé payé',    cell: 'bg-emerald-50 border-emerald-300', badge: 'bg-emerald-100 text-emerald-800', pill: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200', text: 'text-emerald-700' },
  { key: 'recup',   short: 'REC', label: 'Récupération',  cell: 'bg-blue-50 border-blue-300',       badge: 'bg-blue-100 text-blue-800',       pill: 'bg-blue-100 text-blue-700 hover:bg-blue-200',           text: 'text-blue-700'    },
  { key: 'maladie', short: 'MAL', label: 'Maladie',       cell: 'bg-red-50 border-red-300',         badge: 'bg-red-100 text-red-800',         pill: 'bg-red-100 text-red-700 hover:bg-red-200',              text: 'text-red-700'     },
  { key: 'autre',   short: 'ABS', label: 'Autre absence', cell: 'bg-gray-50 border-gray-300',       badge: 'bg-gray-100 text-gray-700',       pill: 'bg-gray-100 text-gray-600 hover:bg-gray-200',           text: 'text-gray-600'    },
];

function absenceConfig(type: AbsenceType) {
  return ABSENCE_TYPES.find(a => a.key === type)!;
}

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slotNetMin(slot: Slot): number {
  const [dh, dm] = slot.heure_debut.split(':').map(Number);
  const [fh, fm] = slot.heure_fin.split(':').map(Number);
  let diff = (fh * 60 + fm) - (dh * 60 + dm);
  if (diff < 0) diff += 24 * 60;
  return Math.max(0, diff - slot.pause_min);
}

// Durée journalière d'un employé : son shift habituel si défini, sinon contrat / 5
function empDailyMin(emp: Employe): number {
  if (emp.shift_debut && emp.shift_fin) {
    const [dh, dm] = emp.shift_debut.split(':').map(Number);
    const [fh, fm] = emp.shift_fin.split(':').map(Number);
    let diff = (fh * 60 + fm) - (dh * 60 + dm);
    if (diff < 0) diff += 24 * 60;
    return Math.max(0, diff - (emp.shift_pause_min ?? 0));
  }
  return Math.round((emp.heures_contrat ?? 35) / 5 * 60);
}

function fmtMin(min: number): string {
  if (min <= 0) return '0h';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function dayDate(monday: Date, i: number): Date {
  const d = new Date(monday);
  d.setDate(d.getDate() + i);
  return d;
}

function fmtDay(date: Date): string {
  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

function toWeekInputValue(monday: Date): string {
  const year = monday.getFullYear();
  const week = String(getISOWeek(monday)).padStart(2, '0');
  return `${year}-W${week}`;
}

function parseWeekInput(val: string): Date {
  const [yearStr, wStr] = val.split('-W');
  const year = parseInt(yearStr);
  const week = parseInt(wStr);
  const jan4 = new Date(year, 0, 4);
  const monday = getMondayOf(jan4);
  monday.setDate(monday.getDate() + (week - 1) * 7);
  return monday;
}

function weekDatesOf(monday: Date): string[] {
  return JOURS.map((_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0];
  });
}

// ─── Print ────────────────────────────────────────────────────────────────────

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

const ABSENCE_PRINT: Record<AbsenceType, { bg: string; text: string; label: string }> = {
  off:     { bg: '#fee2e2', text: '#7f1d1d', label: 'OFF' },
  conge:   { bg: '#d1fae5', text: '#065f46', label: 'Congé' },
  recup:   { bg: '#dbeafe', text: '#1e3a8a', label: 'Récup.' },
  maladie: { bg: '#fee2e2', text: '#7f1d1d', label: 'Maladie' },
  autre:   { bg: '#f3f4f6', text: '#374151', label: 'Absent' },
};

function buildPrintHtml(
  employes: Employe[],
  planning: Record<number, Slot[]>,
  absences: Record<string, AbsenceType>,
  monday: Date
): string {
  const services = [...new Set(employes.map(e => e.service ?? 'Autre'))].sort();
  const byService = new Map<string, Employe[]>();
  services.forEach(s => byService.set(s, employes.filter(e => (e.service ?? 'Autre') === s)));
  const weekDates = weekDatesOf(monday);
  const weekNum = getISOWeek(monday);
  const dayDates = JOURS.map((_, i) => dayDate(monday, i));
  const dateStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const jourHeaders = JOURS.map((j, i) => {
    const wkColor = i >= 5 ? '#d1d5db' : '#6b7280';
    const wkBg = i >= 5 ? 'background:#f9fafb;' : '';
    const dateLabel = dayDates[i].toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    return `<th style="text-align:center;padding:7px 4px;font-size:10px;font-weight:700;color:${wkColor};text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #d1d5db;border-right:1px solid #e5e7eb;${wkBg}">
      <div>${j.slice(0,3)}</div>
      <div style="font-size:9px;font-weight:500;color:#9ca3af;margin-top:1px;text-transform:none;">${dateLabel}</div>
    </th>`;
  }).join('');

  const allRows = services.map(service => {
    const emps = byService.get(service) ?? [];
    const pc = pColor(emps[0]?.service ?? null);

    const separator = `<tr>
      <td colspan="9" style="padding:12px 14px 4px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:8px;height:8px;border-radius:50%;background:${pc.border};"></div>
          <span style="font-size:10px;font-weight:900;color:${pc.text};text-transform:uppercase;letter-spacing:0.8px;">${service}</span>
          <div style="flex:1;height:1px;background:#e5e7eb;"></div>
        </div>
      </td>
    </tr>`;

    const rows = emps.map((emp, eIdx) => {
      const isLast = eIdx === emps.length - 1;
      const cells = JOURS.map((_, i) => {
        const absKey = `${emp.id}_${i}`;
        const absence = absences[absKey];
        const slot = (planning[i] ?? []).find(s => s.employe_id === emp.id);
        const wkBg = i >= 5 ? 'background:#f9fafb;' : '';
        const cellBorder = `border-bottom:${isLast ? '1px solid #e5e7eb' : '1px solid #e5e7eb'};border-right:1px solid #e5e7eb;`;

        if (absence) {
          const ap = ABSENCE_PRINT[absence];
          return `<td style="text-align:center;padding:4px 3px;${wkBg}${cellBorder}vertical-align:middle;">
            <div style="background:${ap.bg};color:${ap.text};border-radius:6px;padding:4px 6px;font-size:10px;font-weight:800;display:inline-block;">${ap.label}</div>
          </td>`;
        }
        if (!slot) return `<td style="text-align:center;padding:5px 3px;${wkBg}${cellBorder}color:#e5e7eb;font-size:12px;">—</td>`;
        return `<td style="text-align:center;padding:4px 3px;${wkBg}${cellBorder}vertical-align:middle;">
          <div style="font-size:11px;font-weight:800;color:#1f2937;">${slot.heure_debut.slice(0,5)}–${slot.heure_fin.slice(0,5)}</div>
          ${slot.pause_min > 0 ? `<div style="font-size:9px;color:#9ca3af;">${slot.pause_min}'</div>` : ''}
          <div style="font-size:10px;font-weight:700;color:${pc.text};">${fmtMin(slotNetMin(slot))}</div>
        </td>`;
      }).join('');
      return `<tr>
        <td style="padding:6px 14px;border-bottom:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
          <div style="font-size:12px;font-weight:700;color:#111827;">${emp.nom}</div>
          ${emp.poste ? `<div style="font-size:10px;color:#9ca3af;">${emp.poste}</div>` : ''}
        </td>
        ${cells}
      </tr>`;
    }).join('');

    return separator + rows;
  }).join('');

  return `<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
  <title>Planning équipe — S${weekNum}</title>
  <style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:system-ui,-apple-system,sans-serif;background:white;color:#111827;padding:20px;}@media print{body{padding:0;}@page{margin:8mm;size:A4 landscape;}}</style>
  </head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px;padding-bottom:12px;border-bottom:3px solid #111827;">
    <div>
      <div style="font-size:20px;font-weight:900;letter-spacing:-0.5px;margin-bottom:2px;">Planning équipe — Semaine ${weekNum}</div>
      <div style="font-size:12px;color:#374151;font-weight:600;">${fmtDay(dayDates[0])} – ${fmtDay(dayDates[6])}</div>
    </div>
    <div style="font-size:10px;color:#9ca3af;">Édité le ${dateStr}</div>
  </div>
  <table style="width:100%;border-collapse:collapse;border:2px solid #d1d5db;border-radius:8px;overflow:hidden;">
    <thead>
      <tr style="background:#f3f4f6;">
        <th style="text-align:left;padding:7px 14px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:2px solid #d1d5db;border-right:1px solid #e5e7eb;width:140px;">Employé</th>
        ${jourHeaders}
        <th style="text-align:center;padding:7px 10px;font-size:10px;font-weight:700;color:#6b7280;text-transform:uppercase;border-bottom:2px solid #d1d5db;">Total</th>
      </tr>
    </thead>
    <tbody>${allRows}</tbody>
  </table>
  <div style="margin-top:12px;display:flex;gap:16px;align-items:center;font-size:10px;color:#6b7280;">
    <span>Légende :</span>
    <span style="background:#d1fae5;color:#065f46;padding:2px 6px;border-radius:4px;font-weight:700;">CP = Congé payé</span>
    <span style="background:#dbeafe;color:#1e3a8a;padding:2px 6px;border-radius:4px;font-weight:700;">REC = Récupération</span>
    <span style="background:#fee2e2;color:#7f1d1d;padding:2px 6px;border-radius:4px;font-weight:700;">MAL = Maladie</span>
    <span style="background:#f3f4f6;color:#374151;padding:2px 6px;border-radius:4px;font-weight:700;">ABS = Autre absence</span>
  </div>
  </body></html>`;
}

function printWindow(employes: Employe[], planning: Record<number, Slot[]>, absences: Record<string, AbsenceType>, monday: Date) {
  const html = buildPrintHtml(employes, planning, absences, monday);
  const win = window.open('', '_blank', 'width=1200,height=800');
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 400);
}

// ─── Vue Équipe ───────────────────────────────────────────────────────────────

function VueEquipe({ employes, planning, absences, weekMonday, feriesJour }: {
  employes: Employe[];
  planning: Record<number, Slot[]>;
  absences: Record<string, AbsenceType>;
  weekMonday: Date;
  feriesJour: (string | null)[];
}) {
  const services = [...new Set(employes.map(e => e.service ?? 'Autre'))].sort();
  const byService = new Map<string, Employe[]>();
  services.forEach(s => byService.set(s, employes.filter(e => (e.service ?? 'Autre') === s)));

  return (
    <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
        <div className="text-sm font-semibold text-gray-500">
          Semaine <span className="font-black text-gray-900">{getISOWeek(weekMonday)}</span>
          <span className="text-gray-400 ml-2 font-normal text-xs">{fmtDay(weekMonday)} – {fmtDay(dayDate(weekMonday, 6))}</span>
        </div>
        <button onClick={() => printWindow(employes, planning, absences, weekMonday)}
          className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-xl text-sm font-semibold hover:bg-gray-800">
          <Printer size={14} /> Imprimer / PDF
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-300 bg-gray-100">
              <th className="text-left px-4 py-2.5 text-xs font-black text-gray-500 uppercase tracking-wider w-44 border-r border-gray-300">Employé</th>
              {JOURS.map((j, i) => {
                const ferie = feriesJour[i];
                return (
                  <th key={i} className={`text-center px-2 py-2.5 text-xs font-black uppercase tracking-wider border-r border-gray-200 ${ferie ? 'bg-green-100 text-green-700' : i >= 5 ? 'text-gray-400 bg-gray-50' : 'text-gray-600'}`}>
                    <div>{j.slice(0, 3)}</div>
                    <div className="text-[10px] font-medium normal-case tracking-normal" style={{ color: ferie ? '#15803d' : '#9ca3af' }}>{fmtDay(dayDate(weekMonday, i))}</div>
                    {ferie && <div className="text-[9px] font-semibold text-green-600 normal-case leading-tight mt-0.5">{ferie.replace(' ★','')}</div>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {services.map(service => {
              const emps = byService.get(service) ?? [];
              const st = sStyle(emps[0]?.service ?? null);
              return (
                <React.Fragment key={service}>
                  <tr>
                    <td colSpan={8} className={`px-4 pt-3 pb-1 border-y border-gray-200 ${st.header}`}>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${st.dot}`} />
                        <span className={`text-xs font-black uppercase tracking-wider ${st.text}`}>{service}</span>
                      </div>
                    </td>
                  </tr>
                  {emps.map((emp, eIdx) => (
                    <tr key={emp.id} className={`border-b border-gray-200 ${eIdx === emps.length - 1 ? 'border-b-2 border-gray-300' : ''}`}>
                      <td className="px-4 py-2.5 border-r border-gray-300">
                        <p className="font-semibold text-gray-900 text-sm">{emp.nom}</p>
                        {emp.poste && <p className="text-xs text-gray-400">{emp.poste}</p>}
                      </td>
                      {JOURS.map((_, i) => {
                        const absKey = `${emp.id}_${i}`;
                        const absence = absences[absKey];
                        const slot = (planning[i] ?? []).find(s => s.employe_id === emp.id);
                        const ac = absence ? absenceConfig(absence) : null;
                        const ferie = feriesJour[i];
                        return (
                          <td key={i} className={`text-center px-1 py-2 border-r border-gray-200 ${ferie && !slot && !absence ? 'bg-green-50' : i >= 5 ? 'bg-gray-50' : ''}`}>
                            {absence && ac ? (
                              <span className={`inline-block text-xs font-black px-2 py-1 rounded-lg ${ac.badge}`}>{ac.label}</span>
                            ) : slot ? (
                              <div>
                                <p className="text-xs font-black text-gray-800">{slot.heure_debut.slice(0,5)}–{slot.heure_fin.slice(0,5)}</p>
                                {slot.pause_min > 0 && <p className="text-[10px] text-gray-400">{slot.pause_min}'</p>}
                                <p className={`text-[10px] font-bold ${st.text}`}>{fmtMin(slotNetMin(slot))}</p>
                                {ferie && slot.ferie_traitement && (
                                  <span className={`inline-block text-[9px] font-black px-1.5 py-0.5 rounded mt-0.5 ${slot.ferie_traitement === 'recup' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                                    {slot.ferie_traitement === 'recup' ? 'Récup' : 'Majoré'}
                                  </span>
                                )}
                              </div>
                            ) : ferie ? (
                              <span className="inline-block text-[10px] font-black px-2 py-1 rounded-lg bg-green-100 text-green-700">Férié</span>
                            ) : (
                              <span className="text-gray-300 text-xs">—</span>
                            )}
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

// ─── Modal profil employé ──────────────────────────────────────────────────────

const JOURS_SHORT = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

function ProfilModal({ emp, onClose, onSave, onApply }: {
  emp: Employe;
  onClose: () => void;
  onSave: (patch: Partial<Employe>) => Promise<void>;
  onApply: (empId: string, shift: { debut: string; fin: string; pause: number }, joursOff: number[]) => void;
}) {
  const st = sStyle(emp.service);
  const [debut, setDebut]         = useState(emp.shift_debut ?? '04:00');
  const [fin, setFin]             = useState(emp.shift_fin ?? '12:00');
  const [pause, setPause]         = useState(emp.shift_pause_min ?? 0);
  const [joursOff, setJoursOff]   = useState<number[]>(emp.jours_off ?? []);
  const [heuresContrat, setHeuresContrat] = useState(emp.heures_contrat ?? 35);
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
    await onSave({ shift_debut: debut, shift_fin: fin, shift_pause_min: pause, jours_off: joursOff, heures_contrat: heuresContrat });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
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

          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">Jours de repos habituels</p>
            <div className="flex gap-2">
              {JOURS_SHORT.map((j, idx) => {
                const isOff = joursOff.includes(idx);
                const isWeekend = idx >= 5;
                return (
                  <button key={idx} type="button" onClick={() => toggleJourOff(idx)}
                    className={`flex-1 py-2 rounded-xl text-xs font-black transition-all border-2 ${
                      isOff ? 'bg-gray-900 border-gray-900 text-white'
                        : isWeekend ? 'bg-gray-100 border-gray-100 text-gray-400 hover:border-gray-300'
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

          <div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider mb-3">Contrat de travail</p>
            <div className="flex items-center gap-3">
              <div className="flex gap-2 flex-wrap">
                {[20, 25, 30, 35, 39].map(h => (
                  <button key={h} type="button" onClick={() => setHeuresContrat(h)}
                    className={`px-3 py-2 rounded-xl text-sm font-bold border-2 transition-all ${heuresContrat === h ? 'bg-gray-900 border-gray-900 text-white' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}>
                    {h}h
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5 ml-auto">
                <input type="number" min={1} max={48} value={heuresContrat}
                  onChange={e => setHeuresContrat(parseInt(e.target.value) || 35)}
                  className="w-16 px-3 py-2 border-2 border-gray-200 rounded-xl text-sm font-bold text-center focus:outline-none focus:border-amber-400" />
                <span className="text-sm text-gray-400">h/sem</span>
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6 space-y-2">
          <button onClick={() => { onApply(emp.id, { debut, fin, pause }, joursOff); onClose(); }}
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
  const [employes, setEmployes]     = useState<Employe[]>([]);
  const [loading, setLoading]       = useState(true);
  const [planning, setPlanning]     = useState<Record<number, Slot[]>>({});
  const [template, setTemplate]     = useState<Record<number, Slot[]>>({});
  const [weekHasData, setWeekHasData] = useState(false);
  const [absences, setAbsences]     = useState<Record<string, AbsenceType>>({});
  const [weekMonday, setWeekMonday] = useState<Date>(() => getMondayOf(new Date()));
  const [drag, setDrag]             = useState<DragSource | null>(null);
  const [dragOver, setDragOver]     = useState<{ empId: string; jour: number } | null>(null);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [saveError, setSaveError]   = useState<string | null>(null);
  const [view, setView]             = useState<'admin' | 'equipe'>('admin');
  const [profilEmp, setProfilEmp]   = useState<Employe | null>(null);
  const [feries, setFeries]         = useState<JourFerie[]>([]);

  const planningRef     = useRef(planning);
  planningRef.current   = planning;
  const userEditedRef   = useRef(false);
  const weekMondayRef   = useRef(weekMonday);
  weekMondayRef.current = weekMonday;

  useEffect(() => {
    loadAll();
    supabase.from('jours_feries').select('*').then(({ data }: { data: JourFerie[] | null }) => setFeries(data ?? []));
  }, []);

  // Recharge shifts + absences quand la semaine change
  const isFirstLoad = useRef(true);
  useEffect(() => {
    if (isFirstLoad.current) { isFirstLoad.current = false; return; }
    userEditedRef.current = false;
    loadWeekShifts(weekMonday);
    loadAbsences(weekMonday);
  }, [weekMonday]); // eslint-disable-line

  // Auto-save planning 1.5s après modification
  useEffect(() => {
    if (!userEditedRef.current) return;
    const t = setTimeout(() => { savePlanning(planningRef.current); }, 1500);
    return () => clearTimeout(t);
  }, [planning]); // eslint-disable-line

  async function loadAll() {
    setLoading(true);
    const [{ data: emps }, { data: dispoData }] = await Promise.all([
      supabase.from('rh_employes').select('id, nom, poste, service, shift_debut, shift_fin, shift_pause_min, jours_off, heures_contrat').eq('actif', true).order('service').order('nom'),
      supabase.from('disponibilites').select('*'),
    ]);
    setEmployes((emps as Employe[]) ?? []);
    // Charger le modèle récurrent
    const tpl: Record<number, Slot[]> = {};
    ((dispoData as (Slot & { jour_semaine: number })[]) ?? []).forEach(d => {
      if (!tpl[d.jour_semaine]) tpl[d.jour_semaine] = [];
      tpl[d.jour_semaine].push({ employe_id: d.employe_id, heure_debut: d.heure_debut, heure_fin: d.heure_fin, pause_min: d.pause_min ?? 0, ferie_traitement: null });
    });
    setTemplate(tpl);
    await loadWeekShifts(weekMondayRef.current);
    await loadAbsences(weekMondayRef.current);
    setLoading(false);
    userEditedRef.current = false;
  }

  async function loadWeekShifts(monday: Date) {
    const dates = weekDatesOf(monday);
    const { data } = await supabase
      .from('planning_shifts')
      .select('employe_id, date, heure_debut, heure_fin, pause_min, ferie_traitement')
      .in('date', dates);
    const plan: Record<number, Slot[]> = {};
    ((data ?? []) as (Slot & { date: string })[]).forEach(s => {
      const jour = dates.indexOf(s.date);
      if (jour >= 0) {
        if (!plan[jour]) plan[jour] = [];
        plan[jour].push({ employe_id: s.employe_id, heure_debut: s.heure_debut, heure_fin: s.heure_fin, pause_min: s.pause_min ?? 0, ferie_traitement: s.ferie_traitement ?? null });
      }
    });
    setPlanning(plan);
    setWeekHasData((data ?? []).length > 0);
    userEditedRef.current = false;
  }

  async function loadAbsences(monday: Date) {
    const dates = weekDatesOf(monday);
    const { data } = await supabase
      .from('planning_absences')
      .select('employe_id, date, type')
      .in('date', dates);
    if (!data) return;
    const map: Record<string, AbsenceType> = {};
    (data as AbsenceRow[]).forEach(a => {
      const jour = dates.indexOf(a.date);
      if (jour >= 0) map[`${a.employe_id}_${jour}`] = a.type as AbsenceType;
    });
    setAbsences(map);
  }

  async function setAbsenceForDay(empId: string, jour: number, type: AbsenceType | null) {
    const d = new Date(weekMondayRef.current);
    d.setDate(d.getDate() + jour);
    const date = d.toISOString().split('T')[0];
    const key = `${empId}_${jour}`;

    if (type === null) {
      await supabase.from('planning_absences').delete().eq('employe_id', empId).eq('date', date);
      setAbsences(prev => { const n = { ...prev }; delete n[key]; return n; });
    } else {
      // Retirer le slot si existant
      removeSlot(empId, jour);
      await supabase.from('planning_absences').upsert(
        { employe_id: empId, date, type },
        { onConflict: 'employe_id,date' }
      );
      setAbsences(prev => ({ ...prev, [key]: type }));
    }
  }

  function getSlot(empId: string, jour: number): Slot | undefined {
    return (planning[jour] ?? []).find(s => s.employe_id === empId);
  }

  function addSlot(empId: string, jour: number) {
    if (getSlot(empId, jour)) return;
    // Supprimer l'absence si elle existe
    const absKey = `${empId}_${jour}`;
    if (absences[absKey]) setAbsenceForDay(empId, jour, null);
    userEditedRef.current = true;
    setPlanning(p => ({ ...p, [jour]: [...(p[jour] ?? []), { employe_id: empId, heure_debut: '04:00', heure_fin: '12:00', pause_min: 0, ferie_traitement: null }] }));
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

  async function savePlanning(plan: Record<number, Slot[]>) {
    setSaving(true);
    setSaveError(null);
    const dates = weekDatesOf(weekMondayRef.current);
    // Supprimer les shifts existants pour cette semaine
    const { error: delErr } = await supabase.from('planning_shifts').delete().in('date', dates);
    if (delErr) { setSaveError(delErr.message); setSaving(false); return; }
    const rows: object[] = [];
    Object.entries(plan).forEach(([jour, slots]) => {
      slots.forEach(s => rows.push({
        employe_id: s.employe_id,
        date: dates[Number(jour)],
        heure_debut: s.heure_debut,
        heure_fin: s.heure_fin,
        pause_min: s.pause_min,
        ferie_traitement: s.ferie_traitement ?? null,
      }));
    });
    if (rows.length > 0) {
      const { error: insErr } = await supabase.from('planning_shifts').insert(rows);
      if (insErr) { setSaveError(insErr.message); setSaving(false); return; }
    }
    setSaving(false);
    setSaved(true);
    setWeekHasData(rows.length > 0);
    setTimeout(() => setSaved(false), 2000);
  }

  async function saveAsTemplate(plan: Record<number, Slot[]>) {
    setSaving(true);
    setSaveError(null);
    const { error: delErr } = await supabase.from('disponibilites').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    if (delErr) { setSaveError(delErr.message); setSaving(false); return; }
    const rows: object[] = [];
    Object.entries(plan).forEach(([jour, slots]) => {
      slots.forEach(s => rows.push({ employe_id: s.employe_id, jour_semaine: Number(jour), heure_debut: s.heure_debut, heure_fin: s.heure_fin, pause_min: s.pause_min }));
    });
    if (rows.length > 0) {
      const { error: insErr } = await supabase.from('disponibilites').insert(rows);
      if (insErr) { setSaveError(insErr.message); setSaving(false); return; }
    }
    setTemplate(plan);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function applyTemplate() {
    userEditedRef.current = true;
    setPlanning(template);
  }

  async function copyPreviousWeek() {
    const prevMonday = new Date(weekMonday);
    prevMonday.setDate(prevMonday.getDate() - 7);
    const dates = weekDatesOf(prevMonday);
    const { data } = await supabase
      .from('planning_shifts')
      .select('employe_id, date, heure_debut, heure_fin, pause_min, ferie_traitement')
      .in('date', dates);
    if (!data || data.length === 0) return;
    const plan: Record<number, Slot[]> = {};
    (data as (Slot & { date: string })[]).forEach(s => {
      const jour = dates.indexOf(s.date);
      if (jour >= 0) {
        if (!plan[jour]) plan[jour] = [];
        plan[jour].push({ employe_id: s.employe_id, heure_debut: s.heure_debut, heure_fin: s.heure_fin, pause_min: s.pause_min ?? 0, ferie_traitement: null });
      }
    });
    userEditedRef.current = true;
    setPlanning(plan);
  }

  async function saveProfil(empId: string, patch: Partial<Employe>) {
    await supabase.from('rh_employes').update({
      shift_debut: patch.shift_debut, shift_fin: patch.shift_fin,
      shift_pause_min: patch.shift_pause_min, jours_off: patch.jours_off,
      heures_contrat: patch.heures_contrat,
    }).eq('id', empId);
    setEmployes(prev => prev.map(e => e.id === empId ? { ...e, ...patch } : e));
    if (profilEmp?.id === empId) setProfilEmp(p => p ? { ...p, ...patch } : p);
  }

  function applyShift(empId: string, shift: { debut: string; fin: string; pause: number }, joursOff: number[]) {
    userEditedRef.current = true;
    setPlanning(p => {
      const next = { ...p };
      JOURS.forEach((_, jour) => {
        if (joursOff.includes(jour)) {
          next[jour] = (next[jour] ?? []).filter(s => s.employe_id !== empId);
        } else {
          const existing = (next[jour] ?? []).filter(s => s.employe_id !== empId);
          next[jour] = [...existing, { employe_id: empId, heure_debut: shift.debut, heure_fin: shift.fin, pause_min: shift.pause, ferie_traitement: null }];
        }
      });
      return next;
    });
  }

  const services = [...new Set(employes.map(e => e.service ?? 'Autre'))].sort();
  const byService = new Map<string, Employe[]>();
  services.forEach(s => byService.set(s, employes.filter(e => (e.service ?? 'Autre') === s)));

  // Calcul jours fériés de la semaine
  const feriesJour = JOURS.map((_, i) => {
    const d = dayDate(weekMonday, i);
    const ds = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return getFerieFromList(ds, feries);
  });

  const heuresParEmp = new Map<string, number>();
  // Heures planifiées
  Object.values(planning).forEach(slots => slots.forEach(s => {
    heuresParEmp.set(s.employe_id, (heuresParEmp.get(s.employe_id) ?? 0) + slotNetMin(s));
  }));
  // Jours fériés non travaillés → comptés comme heures normales (contrat / 5)
  employes.forEach(emp => {
    const dailyMin = empDailyMin(emp);
    JOURS.forEach((_, jour) => {
      if (!feriesJour[jour]) return; // pas férié
      const slot = (planning[jour] ?? []).find(s => s.employe_id === emp.id);
      const absKey = `${emp.id}_${jour}`;
      const absence = absences[absKey];
      if (!slot && !absence) {
        heuresParEmp.set(emp.id, (heuresParEmp.get(emp.id) ?? 0) + dailyMin);
      }
    });
  });
  const totalSemaineMin = Array.from(heuresParEmp.values()).reduce((a, b) => a + b, 0);
  const heuresParJour = JOURS.map((_, idx) => (planning[idx] ?? []).reduce((sum, s) => sum + slotNetMin(s), 0));

  // Alertes heures : diff entre heures planifiées et contrat
  function alerteHeures(emp: Employe): { color: string; label: string } | null {
    const contrat = (emp.heures_contrat ?? 35) * 60;
    const planifie = heuresParEmp.get(emp.id) ?? 0;
    const diff = planifie - contrat;
    if (Math.abs(diff) < 15) return null; // tolérance 15 min
    if (diff > 0) return { color: 'text-orange-600', label: `+${fmtMin(diff)}` };
    return { color: 'text-red-500', label: `-${fmtMin(-diff)}` };
  }

  // Compteur absences de l'année courante depuis planning_absences (chargé dans absences semaine courante)
  // On compte les absences de type 'conge' dans le state absences
  const congesParEmp = new Map<string, number>();
  Object.entries(absences).forEach(([key, type]) => {
    const empId = key.split('_')[0];
    if (type === 'conge') congesParEmp.set(empId, (congesParEmp.get(empId) ?? 0) + 1);
  });

  return (
    <div className="space-y-4 min-w-0 w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <Link href="/production" className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-gray-900">Planning équipe</h1>
            <p className="text-sm text-gray-400">
              {view === 'admin' ? 'Cliquez + pour ajouter un shift · glissez pour copier' : 'Vue partageable par service'}
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

          <Link href="/production/personnel/recap" className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-colors">
            Récap mois
          </Link>
          <Link href="/production/personnel/calendrier" className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-colors">
            Calendrier
          </Link>
          <Link href="/production/personnel/demandes" className="relative flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-colors">
            Demandes
          </Link>
          <Link href="/production/personnel/pointages" className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-colors">
            Pointages
          </Link>
          <Link href="/charges/rh" className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors">
            <ExternalLink size={15} /> Employés
          </Link>

          {view === 'admin' && (
            <>
              <button onClick={copyPreviousWeek}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-colors"
                title="Copier le planning de la semaine précédente">
                Copier S{getISOWeek(weekMonday) - 1}
              </button>
              <button onClick={() => saveAsTemplate(planningRef.current)}
                className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-50 transition-colors"
                title="Enregistrer ce planning comme modèle récurrent">
                <Zap size={12} /> Modèle
              </button>
            </>
          )}

          {saving ? (
            <div className="flex items-center gap-2 px-4 py-2.5 text-sm text-gray-400">
              <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />Enregistrement…
            </div>
          ) : saveError ? (
            <div className="flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 font-semibold" title={saveError}>
              <X size={14} /> Erreur
            </div>
          ) : saved ? (
            <div className="flex items-center gap-2 px-4 py-2.5 text-sm text-emerald-600 font-semibold">
              <Check size={14} /> Enregistré
            </div>
          ) : null}
        </div>
      </div>

      {/* Légende absences */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-gray-400 font-semibold">Absences :</span>
        {ABSENCE_TYPES.map(at => (
          <span key={at.key} className={`text-xs font-bold px-2 py-1 rounded-lg ${at.badge}`}>{at.label}</span>
        ))}
      </div>

      {/* Bannière semaine vide */}
      {view === 'admin' && !weekHasData && (
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <span className="text-sm text-amber-700">Aucun planning enregistré pour cette semaine.</span>
          {Object.keys(template).length > 0 && (
            <button onClick={applyTemplate}
              className="text-sm font-bold text-amber-600 hover:text-amber-800 underline underline-offset-2 transition-colors">
              Copier le modèle →
            </button>
          )}
        </div>
      )}

      {/* Modal profil */}
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
        <VueEquipe employes={employes} planning={planning} absences={absences} weekMonday={weekMonday} feriesJour={feriesJour} />
      ) : (
        <div className="overflow-x-auto rounded-2xl border-2 border-gray-300 bg-white">
          <table className="w-full border-collapse" style={{ minWidth: '980px' }}>
            <thead>
              <tr className="border-b-2 border-gray-300 bg-gray-100">
                <th className="text-left px-3 py-3 text-xs font-black text-gray-500 uppercase tracking-wider sticky left-0 bg-gray-100 z-10 w-36 border-r-2 border-gray-300">
                  Employé
                </th>
                {JOURS.map((j, i) => {
                  const ferie = feriesJour[i];
                  return (
                    <th key={i} className={`text-center px-1 py-3 text-xs font-black uppercase tracking-wider border-r border-gray-300 ${ferie ? 'bg-green-100 text-green-700' : i >= 5 ? 'text-gray-400 bg-gray-200' : 'text-gray-600'}`}>
                      <div>{j.slice(0, 3)}</div>
                      <div className="text-[10px] font-semibold mt-0.5 normal-case tracking-normal" style={{ color: ferie ? '#15803d' : undefined }}>
                        {fmtDay(dayDate(weekMonday, i))}
                      </div>
                      {ferie && (
                        <div className="text-[9px] font-semibold text-green-600 mt-0.5 normal-case leading-tight max-w-[80px] mx-auto">{ferie.replace(' ★','')}</div>
                      )}
                      {heuresParJour[i] > 0 && (
                        <div className="text-[10px] font-semibold text-blue-500 mt-0.5 normal-case">{fmtMin(heuresParJour[i])}</div>
                      )}
                    </th>
                  );
                })}
                <th className="text-center px-4 py-3 text-xs font-black text-gray-500 uppercase tracking-wider w-28">Total</th>
              </tr>
            </thead>

            <tbody>
              {services.map(service => {
                const emps = byService.get(service) ?? [];
                const st = sStyle(emps[0]?.service ?? null);
                return (
                  <React.Fragment key={service}>
                    {/* Ligne groupe service */}
                    <tr className="border-y-2 border-gray-300">
                      <td colSpan={10} className={`px-4 py-2 ${st.header}`}>
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${st.dot}`} />
                          <span className={`text-xs font-black uppercase tracking-wider ${st.text}`}>{service}</span>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${st.badge}`}>{emps.length} pers.</span>
                        </div>
                      </td>
                    </tr>

                    {emps.map((emp, empIdx) => {
                      const heures = heuresParEmp.get(emp.id) ?? 0;
                      const pct = Math.min(100, (heures / CIBLE_MIN) * 100);
                      const empSt = sStyle(emp.service);
                      const isLastEmp = empIdx === emps.length - 1;

                      return (
                        <tr key={emp.id} className={`${isLastEmp ? 'border-b-2 border-gray-300' : 'border-b border-gray-200'} ${empSt.row} transition-colors`}>
                          {/* Cellule employé */}
                          <td className="px-3 py-2 sticky left-0 bg-white z-10 border-r-2 border-gray-300 w-36">
                            <button onClick={() => setProfilEmp(emp)} className="flex items-center gap-1 group text-left w-full">
                              <p className="text-sm font-bold text-gray-900 leading-tight group-hover:text-blue-600 transition-colors">{emp.nom}</p>
                              <ChevronRight size={12} className="text-gray-300 group-hover:text-blue-400 transition-colors shrink-0" />
                            </button>
                            {emp.poste && <p className="text-xs text-gray-400">{emp.poste}</p>}
                            {/* Barre heures vs contrat */}
                            {(() => {
                              const contratMin = (emp.heures_contrat ?? 35) * 60;
                              const pctContrat = Math.min(100, (heures / contratMin) * 100);
                              const alerte = alerteHeures(emp);
                              const cp = congesParEmp.get(emp.id) ?? 0;
                              return (
                                <>
                                  <div className="mt-1.5 flex items-center gap-1.5">
                                    <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
                                      <div className={`h-full rounded-full transition-all ${heures > contratMin ? 'bg-orange-400' : heures >= contratMin * 0.95 ? 'bg-emerald-400' : 'bg-blue-400'}`}
                                        style={{ width: `${pctContrat}%` }} />
                                    </div>
                                    <span className={`text-[10px] font-black shrink-0 ${alerte ? alerte.color : 'text-gray-500'}`}>
                                      {heures > 0 ? fmtMin(heures) : '—'}
                                    </span>
                                    {alerte && <span className={`text-[9px] font-bold shrink-0 ${alerte.color}`}>{alerte.label}</span>}
                                  </div>
                                  {cp > 0 && (
                                    <span className="mt-1 inline-block text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                                      {cp}j CP
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                          </td>

                          {/* Cellules jours */}
                          {JOURS.map((_, jour) => {
                            const slot = getSlot(emp.id, jour);
                            const absKey = `${emp.id}_${jour}`;
                            const absence = absences[absKey];
                            const isWeekend = jour >= 5;
                            const isOver = dragOver?.empId === emp.id && dragOver?.jour === jour;
                            const canDrop = !!drag && !slot && !absence && !(drag.empId === emp.id && drag.fromJour === jour);
                            const ferie = feriesJour[jour];
                            const dailyMin = empDailyMin(emp);

                            return (
                              <td
                                key={jour}
                                className={`px-1 py-1.5 align-top border-r border-gray-200 ${isWeekend ? 'bg-gray-50' : ''}`}
                                onDragOver={e => { if (canDrop) { e.preventDefault(); setDragOver({ empId: emp.id, jour }); } }}
                                onDragLeave={() => setDragOver(null)}
                                onDrop={() => onDrop(emp.id, jour)}
                              >
                                {/* Cellule avec absence */}
                                {absence ? (() => {
                                  const ac = absenceConfig(absence);
                                  return (
                                    <div className={`rounded-xl border-2 p-2 flex flex-col items-center justify-center min-h-[4rem] group ${ac.cell}`}>
                                      <span className={`text-xs font-black ${ac.text}`}>{ac.label}</span>
                                      <button onClick={() => setAbsenceForDay(emp.id, jour, null)}
                                        className="mt-1 text-[10px] text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">
                                        × retirer
                                      </button>
                                    </div>
                                  );
                                })() : slot ? (
                                  /* Cellule avec shift */
                                  <div
                                    draggable
                                    onDragStart={() => setDrag({ empId: emp.id, slot: { ...slot }, fromJour: jour })}
                                    onDragEnd={() => { setDrag(null); setDragOver(null); }}
                                    className={`${ferie ? 'bg-green-50 border-green-200' : empSt.cell} rounded-xl p-2 relative group cursor-grab active:cursor-grabbing transition-all border ${drag?.empId === emp.id && drag.fromJour === jour ? 'opacity-40 scale-95 border-transparent' : ferie ? '' : 'border-transparent hover:border-gray-300'}`}
                                  >
                                    <button onClick={() => removeSlot(emp.id, jour)}
                                      className="absolute top-1 right-1 p-0.5 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity rounded">
                                      <X size={10} />
                                    </button>
                                    {/* Badge nom du jour férié */}
                                    {ferie && (
                                      <div className="text-[8px] font-black text-green-700 leading-tight mb-1 truncate">{ferie.replace(' ★','')}</div>
                                    )}
                                    {/* Heures */}
                                    <div className="flex items-center gap-0.5 mb-1.5">
                                      <input type="time" value={slot.heure_debut}
                                        onChange={e => updateSlot(emp.id, jour, { heure_debut: e.target.value })}
                                        onDragStart={e => e.stopPropagation()}
                                        className="text-[11px] font-bold bg-transparent border-none outline-none w-[3.2rem] text-gray-800 cursor-text" />
                                      <span className="text-gray-300 text-[9px] font-bold leading-none">→</span>
                                      <input type="time" value={slot.heure_fin}
                                        onChange={e => updateSlot(emp.id, jour, { heure_fin: e.target.value })}
                                        onDragStart={e => e.stopPropagation()}
                                        className="text-[11px] font-bold bg-transparent border-none outline-none w-[3.2rem] text-gray-800 cursor-text" />
                                    </div>
                                    {/* Pause + total */}
                                    <div className="flex items-center gap-1">
                                      <select value={slot.pause_min}
                                        onChange={e => updateSlot(emp.id, jour, { pause_min: parseInt(e.target.value) })}
                                        onDragStart={e => e.stopPropagation()}
                                        className="text-[9px] bg-white border border-gray-200 rounded-md px-1 py-0.5 text-gray-500 cursor-pointer focus:outline-none focus:border-gray-400 leading-tight">
                                        <option value={0}>— pause</option>
                                        {[15,30,45,60,90].map(m => <option key={m} value={m}>{m}&apos;</option>)}
                                      </select>
                                      <span className={`ml-auto text-[11px] font-black ${ferie ? 'text-green-700' : empSt.text}`}>{fmtMin(slotNetMin(slot))}</span>
                                    </div>
                                    {/* Sélecteur récup / majoré sur jour férié */}
                                    {ferie && (
                                      <div className="flex gap-1 mt-1.5" onDragStart={e => e.stopPropagation()}>
                                        <button
                                          onClick={() => updateSlot(emp.id, jour, { ferie_traitement: slot.ferie_traitement === 'recup' ? null : 'recup' })}
                                          className={`flex-1 text-[8px] font-black py-0.5 rounded transition-colors ${slot.ferie_traitement === 'recup' ? 'bg-blue-500 text-white' : 'bg-white border border-blue-200 text-blue-400 hover:bg-blue-50'}`}>
                                          Récup
                                        </button>
                                        <button
                                          onClick={() => updateSlot(emp.id, jour, { ferie_traitement: slot.ferie_traitement === 'majore' ? null : 'majore' })}
                                          className={`flex-1 text-[8px] font-black py-0.5 rounded transition-colors ${slot.ferie_traitement === 'majore' ? 'bg-orange-500 text-white' : 'bg-white border border-orange-200 text-orange-400 hover:bg-orange-50'}`}>
                                          Majoré
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ) : ferie && !absence ? (
                                  /* Jour férié sans shift → heures comptées automatiquement */
                                  <div className="rounded-xl border border-green-200 bg-green-50 flex flex-col items-center justify-center min-h-[4rem] px-1 py-2 gap-0.5">
                                    <span className="text-[8px] font-black text-green-700 text-center leading-tight">{ferie.replace(' ★','')}</span>
                                    <span className="text-[11px] font-black text-green-600">{fmtMin(dailyMin)}</span>
                                    <span className="text-[8px] text-green-400">payé</span>
                                  </div>
                                ) : (
                                  /* Cellule vide : + shift ou absence */
                                  <div className={`rounded-xl border-2 border-dashed transition-all flex flex-col min-h-[4rem] overflow-hidden
                                    ${isOver && canDrop ? 'border-emerald-400 bg-emerald-50' : 'border-gray-200 hover:border-gray-300'}`}>
                                    {/* Bouton + shift */}
                                    <button onClick={() => addSlot(emp.id, jour)}
                                      className="flex-1 flex items-center justify-center text-gray-300 hover:text-gray-500 hover:bg-gray-50 transition-colors py-1">
                                      <Plus size={12} />
                                    </button>
                                    {/* Boutons absence */}
                                    <div className="flex border-t border-dashed border-gray-100">
                                      {ABSENCE_TYPES.map(at => (
                                        <button key={at.key}
                                          title={at.label}
                                          onClick={() => setAbsenceForDay(emp.id, jour, at.key)}
                                          className={`flex-1 text-[9px] font-black py-1 transition-colors ${at.pill}`}>
                                          {at.short}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </td>
                            );
                          })}

                          {/* Total */}
                          <td className="text-center px-4 py-2 border-l border-gray-200">
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
