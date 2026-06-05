import ExcelJS from 'exceljs';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface StockItemXL {
  id: string; nom: string; unite: string;
  poids_unitaire_g: number | null; prix_moyen_pondere: number;
}

export interface IngredientLineXL {
  id: string; quantite: number;
  stock_item_id: string | null; sous_recipe_id: string | null;
  stock_item: StockItemXL | null;
  sous_recipe?: RecipeSheetXL | null;
}

export interface RecipeSheetXL {
  id: string; nom: string;
  rendement: number; perte_pct: number;
  atelier: string | null; categorie: string | null;
  product_reference_id: string | null;
  product_reference?: {
    id: string; name: string; base_unit_price: number;
    articles?: { prix_pro: number | null; prix_particulier: number | null; custom_price: number | null; quantity: number }[];
  } | null;
  ingredients: IngredientLineXL[];
}

export interface ExcelSettings {
  logo_url?: string | null;
  company_name?: string | null;
  company_tagline?: string | null;
}

// ─── Calculs coût ─────────────────────────────────────────────────────────────

const GRAM_FACTORS: Record<string, number> = {
  kg: 1000, g: 1, mg: 0.001,
  l: 1000, litre: 1000, litres: 1000, cl: 10, ml: 1,
};

function poidsKg(ing: IngredientLineXL): number {
  if (ing.stock_item) {
    const key = (ing.stock_item.unite || '').toLowerCase().trim();
    const f = GRAM_FACTORS[key];
    if (f) return ing.quantite * f / 1000;
    if (ing.stock_item.poids_unitaire_g) return ing.quantite * ing.stock_item.poids_unitaire_g / 1000;
    return 0;
  }
  if (ing.sous_recipe_id) return ing.quantite;
  return 0;
}

function coutSR(sr: RecipeSheetXL, allSR: RecipeSheetXL[]): number {
  return (sr.ingredients || []).reduce((s, ing) => {
    if (ing.stock_item) return s + ing.quantite * ing.stock_item.prix_moyen_pondere;
    if (ing.sous_recipe_id) {
      const n = allSR.find(x => x.id === ing.sous_recipe_id);
      if (n) return s + ing.quantite * coutSRParKg(n, allSR);
    }
    return s;
  }, 0) / (sr.rendement || 1);
}

function coutSRParKg(sr: RecipeSheetXL, allSR: RecipeSheetXL[]): number {
  const cout = coutSR(sr, allSR);
  const kg = (sr.ingredients || []).reduce((s, i) => s + poidsKg(i), 0);
  const perte = (sr.perte_pct || 0) / 100;
  const kgFini = (kg * (1 - perte)) / (sr.rendement || 1);
  return kgFini > 0 ? cout / kgFini : cout;
}

function prixVenteRef(ref: RecipeSheetXL['product_reference']): number | null {
  if (!ref) return null;
  if (ref.base_unit_price > 0) return ref.base_unit_price;
  for (const a of [...(ref.articles || [])].sort((x, y) => x.quantity - y.quantity)) {
    const p = a.prix_pro ?? a.prix_particulier ?? a.custom_price;
    if (p && p > 0) return p / a.quantity;
  }
  return null;
}

function fmt(n: number, dec = 2): number {
  return Math.round(n * Math.pow(10, dec)) / Math.pow(10, dec);
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const THIN = { style: 'thin'   as const };
const MED  = { style: 'medium' as const };
const BORDER_ALL: Partial<ExcelJS.Borders> = { top: THIN, left: THIN, bottom: THIN, right: THIN };

function outerBorder(ws: ExcelJS.Worksheet, r1: number, c1: number, r2: number, c2: number) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getRow(r).getCell(c);
      const b: Partial<ExcelJS.Borders> = { ...(cell.border || {}) };
      if (r === r1) b.top    = MED;
      if (r === r2) b.bottom = MED;
      if (c === c1) b.left   = MED;
      if (c === c2) b.right  = MED;
      cell.border = b;
    }
  }
}

function styleHeader(cell: ExcelJS.Cell) {
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E2E2' } };
  cell.font = { bold: true, size: 10 };
  cell.border = BORDER_ALL;
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
}

function styleData(cell: ExcelJS.Cell) {
  cell.border = BORDER_ALL;
  cell.alignment = { vertical: 'middle' };
}

function styleTotal(cell: ExcelJS.Cell) {
  cell.font = { bold: true, size: 10 };
  cell.border = BORDER_ALL;
  cell.alignment = { vertical: 'middle' };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
}

function styleLabel(cell: ExcelJS.Cell) {
  cell.border = BORDER_ALL;
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  cell.font = { bold: true, size: 10 };
}

// ─── Nom d'onglet sécurisé (max 31 chars, sans chars interdits) ───────────────

export function safeSheetName(nom: string): string {
  return nom.replace(/[:\\\/?*\[\]]/g, '').trim().substring(0, 31) || 'Recette';
}

// ─── Constructeur de feuille ─────────────────────────────────────────────────

export async function buildRecipeSheet(
  wb: ExcelJS.Workbook,
  recipe: RecipeSheetXL,
  allSR: RecipeSheetXL[],
  quantite: number,
  settings: ExcelSettings,
  logoBuffer?: ArrayBuffer,
): Promise<void> {
  const facteur = quantite / (recipe.rendement || 1);
  const annee = new Date().getFullYear();

  // Calcul des lignes
  type Ligne = { nom: string; poidsKg: number; pu: number; cout: number };
  const lignes: Ligne[] = recipe.ingredients.map(ing => {
    if (ing.stock_item) {
      const pKg = poidsKg({ ...ing, quantite: ing.quantite * facteur });
      const cout = ing.quantite * facteur * ing.stock_item.prix_moyen_pondere;
      return { nom: ing.stock_item.nom.toUpperCase(), poidsKg: pKg, pu: ing.stock_item.prix_moyen_pondere, cout };
    }
    if (ing.sous_recipe) {
      const pKg = ing.quantite * facteur;
      const pu = coutSRParKg(ing.sous_recipe, allSR);
      return { nom: ing.sous_recipe.nom.toUpperCase(), poidsKg: pKg, pu, cout: pKg * pu };
    }
    return { nom: '—', poidsKg: 0, pu: 0, cout: 0 };
  });

  const totalPoidsKg = lignes.reduce((s, l) => s + l.poidsKg, 0);
  const coutMatiere  = lignes.reduce((s, l) => s + l.cout, 0);
  const pertePct     = recipe.perte_pct || 0;
  const perteCout    = coutMatiere * (pertePct / 100);
  const totalCoutFood = coutMatiere + perteCout;
  const coutParPortion = quantite > 0 ? totalCoutFood / quantite : 0;
  const pv    = prixVenteRef(recipe.product_reference);
  const pvTTC = pv ? pv * 1.1 : null;
  const ratio = pv && pv > 0 ? (coutMatiere / (pv * quantite)) * 100 : null;

  // Workbook — onglet nommé avec le nom de la recette
  const ws = wb.addWorksheet(safeSheetName(recipe.nom), {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true,
      margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 } },
  });

  ws.columns = [
    { key: 'A', width: 26 },
    { key: 'B', width: 14 },
    { key: 'C', width: 8  },
    { key: 'D', width: 11 },
    { key: 'E', width: 8  },
    { key: 'F', width: 16 },
    { key: 'G', width: 18 },
  ];

  // Row 1 vide
  ws.addRow([]).height = 6;

  // Rows 2-7 : zone logo + bloc recette
  for (let r = 2; r <= 7; r++) ws.addRow([]).height = r <= 5 ? 24 : 16;

  // Nom recette E2:G4
  const cellNom = ws.getCell('E2');
  cellNom.value = recipe.nom.toUpperCase();
  cellNom.font = { bold: true, size: 14 };
  cellNom.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  ws.mergeCells('E2:G4');
  outerBorder(ws, 2, 5, 4, 7);

  // Nbre de portions E6:F6 + G6
  ws.mergeCells('E6:F6');
  const clbl = ws.getCell('E6');
  clbl.value = 'Nbre de portions'; clbl.font = { bold: true, size: 10 };
  clbl.border = BORDER_ALL; clbl.alignment = { horizontal: 'center', vertical: 'middle' };
  const cval = ws.getCell('G6');
  cval.value = quantite; cval.font = { bold: true, italic: true, size: 12 };
  cval.border = BORDER_ALL; cval.alignment = { horizontal: 'center', vertical: 'middle' };

  // Année A7
  ws.getCell('A7').value = String(annee);
  ws.getCell('A7').font = { bold: true, size: 10 };

  // Bordure logo
  outerBorder(ws, 2, 1, 7, 3);

  // Séparateurs
  ws.addRow([]).height = 5;
  ws.addRow([]).height = 5;

  // En-têtes tableau
  const headerRow = ws.addRow(['Détail de la recette', '', '', 'Poids', 'Unité', 'P.U.', 'COÛT']);
  headerRow.height = 20;
  ws.mergeCells(`A${headerRow.number}:C${headerRow.number}`);
  ['A', 'D', 'E', 'F', 'G'].forEach(col => styleHeader(ws.getCell(`${col}${headerRow.number}`)));

  // Lignes ingrédients
  const MAX_LINES = Math.max(10, lignes.length);
  for (let i = 0; i < MAX_LINES; i++) {
    const l = lignes[i];
    const row = ws.addRow(l ? [l.nom, '', '', fmt(l.poidsKg), 'kg', fmt(l.pu), fmt(l.cout)] : ['', '', '', '', '', '', '']);
    row.height = 16;
    ws.mergeCells(`A${row.number}:C${row.number}`);
    ['A', 'D', 'E', 'F', 'G'].forEach(col => {
      const cell = ws.getCell(`${col}${row.number}`);
      styleData(cell);
      if (col === 'A' && l) cell.font = { bold: true, size: 10 };
      if (['D', 'F', 'G'].includes(col)) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.numFmt = '#,##0.00';
      }
    });
  }

  // Ligne total
  const totalRow = ws.addRow(['total', '', '', fmt(totalPoidsKg), '', '', '']);
  totalRow.height = 16;
  ws.mergeCells(`A${totalRow.number}:C${totalRow.number}`);
  ['A', 'D', 'E', 'F', 'G'].forEach(col => {
    const cell = ws.getCell(`${col}${totalRow.number}`);
    styleTotal(cell);
    if (col === 'D') { cell.alignment = { horizontal: 'right', vertical: 'middle' }; cell.numFmt = '#,##0.00'; }
  });
  outerBorder(ws, headerRow.number, 1, totalRow.number, 7);

  // Séparateurs
  ws.addRow([]).height = 6;
  ws.addRow([]).height = 6;

  // Récap — r1
  const r1 = ws.addRow([]); r1.height = 16;
  const cPVlbl = ws.getCell(`A${r1.number}`);
  cPVlbl.value = 'Prix de\nvente'; cPVlbl.font = { bold: true, size: 11 };
  cPVlbl.border = BORDER_ALL; cPVlbl.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  styleLabel(ws.getCell(`B${r1.number}`)); ws.getCell(`B${r1.number}`).value = 'Prix HT';
  const cRatioLbl = ws.getCell(`D${r1.number}`);
  cRatioLbl.value = 'Ratio'; cRatioLbl.font = { bold: true, size: 10 };
  cRatioLbl.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
  cRatioLbl.border = BORDER_ALL; cRatioLbl.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells(`E${r1.number}:F${r1.number}`);
  styleLabel(ws.getCell(`E${r1.number}`)); ws.getCell(`E${r1.number}`).value = 'Coût Matière';
  const cCM = ws.getCell(`G${r1.number}`);
  cCM.value = fmt(coutMatiere); cCM.numFmt = '#,##0.00 "MAD"';
  cCM.font = { bold: true, color: { argb: 'FF0070C0' } };
  cCM.border = BORDER_ALL; cCM.alignment = { horizontal: 'right', vertical: 'middle' };

  // r2
  const r2 = ws.addRow([]); r2.height = 16;
  const cPVht = ws.getCell(`B${r2.number}`);
  cPVht.value = pv ? fmt(pv) + ' MAD' : '—';
  cPVht.font = { bold: true, color: { argb: 'FF7030A0' } };
  cPVht.border = BORDER_ALL; cPVht.alignment = { horizontal: 'center', vertical: 'middle' };
  const cRatioVal = ws.getCell(`D${r2.number}`);
  cRatioVal.value = ratio ? fmt(ratio, 2) + '%' : '—';
  cRatioVal.font = { bold: true, italic: true, size: 12 };
  cRatioVal.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } };
  cRatioVal.border = BORDER_ALL; cRatioVal.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells(`E${r2.number}:F${r2.number}`);
  styleLabel(ws.getCell(`E${r2.number}`)); ws.getCell(`E${r2.number}`).value = 'Perte';
  const cPerte = ws.getCell(`G${r2.number}`);
  cPerte.value = fmt(perteCout); cPerte.numFmt = '#,##0.00 "MAD"';
  cPerte.font = { bold: true, color: { argb: 'FFFF0000' } };
  cPerte.border = BORDER_ALL; cPerte.alignment = { horizontal: 'right', vertical: 'middle' };

  // r3
  const r3 = ws.addRow([]); r3.height = 16;
  styleLabel(ws.getCell(`B${r3.number}`)); ws.getCell(`B${r3.number}`).value = 'Prix TTC';
  ws.mergeCells(`E${r3.number}:F${r3.number}`);
  styleLabel(ws.getCell(`E${r3.number}`)); ws.getCell(`E${r3.number}`).value = 'Total Coût Food';
  const cTCF = ws.getCell(`G${r3.number}`);
  cTCF.value = fmt(totalCoutFood); cTCF.numFmt = '#,##0.00 "MAD"';
  cTCF.font = { bold: true, color: { argb: 'FF00B050' } };
  cTCF.border = BORDER_ALL; cTCF.alignment = { horizontal: 'right', vertical: 'middle' };

  // r4
  const r4 = ws.addRow([]); r4.height = 16;
  const cPVttc = ws.getCell(`B${r4.number}`);
  cPVttc.value = pvTTC ? fmt(pvTTC) + ' MAD' : '—';
  cPVttc.font = { bold: true, color: { argb: 'FF7030A0' } };
  cPVttc.border = BORDER_ALL; cPVttc.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells(`E${r4.number}:F${r4.number}`);
  styleLabel(ws.getCell(`E${r4.number}`)); ws.getCell(`E${r4.number}`).value = 'Coût Par Portion';
  const cCPP = ws.getCell(`G${r4.number}`);
  cCPP.value = fmt(coutParPortion); cCPP.numFmt = '#,##0.00 "MAD"';
  cCPP.font = { bold: true }; cCPP.border = BORDER_ALL;
  cCPP.alignment = { horizontal: 'right', vertical: 'middle' };

  ws.mergeCells(`A${r1.number}:A${r4.number}`);
  outerBorder(ws, r1.number, 1, r4.number, 7);

  // Logo
  const buf = logoBuffer ?? (settings.logo_url ? await fetch(settings.logo_url).then(r => r.arrayBuffer()).catch(() => null) : null);
  if (buf) {
    try {
      const ext = (settings.logo_url ?? '').toLowerCase().includes('.png') ? 'png' : 'jpeg';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const imageId = wb.addImage({ buffer: buf as any, extension: ext });
      ws.addImage(imageId, {
        tl: { col: 0, row: 1 } as ExcelJS.Anchor,
        br: { col: 3, row: 7 } as ExcelJS.Anchor,
        editAs: 'oneCell',
      });
    } catch {
      ws.getCell('A2').value = settings.company_name || 'BDK';
      ws.getCell('A2').font = { bold: true, size: 18 };
      ws.getCell('A4').value = settings.company_tagline || 'Boulangerie | Pâtisserie | Chocolat';
      ws.getCell('A4').font = { size: 9, color: { argb: 'FF666666' } };
    }
  } else {
    ws.getCell('A2').value = settings.company_name || 'BDK';
    ws.getCell('A2').font = { bold: true, size: 18 };
    ws.getCell('A4').value = settings.company_tagline || 'Boulangerie | Pâtisserie | Chocolat';
    ws.getCell('A4').font = { size: 9, color: { argb: 'FF666666' } };
  }
}
