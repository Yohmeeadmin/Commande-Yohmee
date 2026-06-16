// Jours fériés marocains — source de vérité : table `jours_feries` en DB
// Ce fichier expose le type et une fonction utilitaire qui prend les données chargées en paramètre.

export interface JourFerie {
  id: string;
  type: 'fixe' | 'islamique';
  label: string;
  month: number | null;
  day: number | null;
  date: string | null; // YYYY-MM-DD
}

// Retourne le nom du jour férié pour une date YYYY-MM-DD à partir des données chargées, ou null
export function getFerieFromList(dateStr: string, feries: JourFerie[]): string | null {
  const d = new Date(dateStr + 'T12:00:00');
  const month = d.getMonth() + 1;
  const day   = d.getDate();

  for (const f of feries) {
    if (f.type === 'islamique' && f.date === dateStr) return f.label;
    if (f.type === 'fixe' && f.month === month && f.day === day) return f.label;
  }
  return null;
}
