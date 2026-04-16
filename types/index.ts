// ============================================
// BDK COMMANDES - TYPES TYPESCRIPT V2
// ============================================

// ============================================
// ENUMS
// ============================================

export type Atelier = 'boulangerie' | 'patisserie' | 'chocolaterie' | 'traiteur' | 'autre';

export const ATELIERS: { value: Atelier; label: string; color: string; bgColor: string }[] = [
  { value: 'boulangerie', label: 'Boulangerie', color: '#92400E', bgColor: '#FEF3C7' },
  { value: 'patisserie', label: 'Pâtisserie', color: '#BE185D', bgColor: '#FCE7F3' },
  { value: 'chocolaterie', label: 'Chocolaterie', color: '#78350F', bgColor: '#FED7AA' },
  { value: 'traiteur', label: 'Traiteur', color: '#065F46', bgColor: '#D1FAE5' },
  { value: 'autre', label: 'Autre', color: '#6B7280', bgColor: '#F3F4F6' },
];

export type PackType = 'unite' | 'lot' | 'carton' | 'kg' | 'portion' | 'boite';

export const PACK_TYPES: { value: PackType; label: string }[] = [
  { value: 'unite', label: 'Unité' },
  { value: 'lot', label: 'Lot' },
  { value: 'carton', label: 'Carton' },
  { value: 'kg', label: 'Kilogramme' },
  { value: 'portion', label: 'Portion' },
  { value: 'boite', label: 'Boîte' },
];

export type ProductState = 'frais' | 'pre_cuit' | 'pre_pousse' | 'congele';

export const PRODUCT_STATES: { value: ProductState; label: string; color: string; bgColor: string }[] = [
  { value: 'frais', label: 'Frais', color: '#059669', bgColor: '#D1FAE5' },
  { value: 'pre_cuit', label: 'Pré-cuit', color: '#D97706', bgColor: '#FEF3C7' },
  { value: 'pre_pousse', label: 'Pré-poussé', color: '#7C3AED', bgColor: '#EDE9FE' },
  { value: 'congele', label: 'Congelé', color: '#2563EB', bgColor: '#DBEAFE' },
];

export type OrderStatus = 'brouillon' | 'confirmee' | 'production' | 'livree' | 'annulee';

export const ORDER_STATUSES: { value: OrderStatus; label: string; color: string; bgColor: string }[] = [
  { value: 'brouillon', label: 'Brouillon', color: '#6B7280', bgColor: '#F3F4F6' },
  { value: 'confirmee', label: 'Confirmée', color: '#2563EB', bgColor: '#DBEAFE' },
  { value: 'production', label: 'En production', color: '#D97706', bgColor: '#FEF3C7' },
  { value: 'livree', label: 'Livrée', color: '#059669', bgColor: '#D1FAE5' },
  { value: 'annulee', label: 'Annulée', color: '#DC2626', bgColor: '#FEE2E2' },
];

export type OrderType = 'normal' | 'recurring' | 'reliquat';

export type ClientType = 'hotel' | 'restaurant' | 'cafe' | 'riad' | 'particulier' | 'autre';

export const CLIENT_TYPES: { value: ClientType; label: string }[] = [
  { value: 'hotel', label: 'Hôtel' },
  { value: 'restaurant', label: 'Restaurant' },
  { value: 'cafe', label: 'Café' },
  { value: 'riad', label: 'Riad' },
  { value: 'particulier', label: 'Particulier' },
  { value: 'autre', label: 'Autre' },
];

// Jours de la semaine
export const JOURS_SEMAINE = [
  { value: 'lundi', label: 'Lundi' },
  { value: 'mardi', label: 'Mardi' },
  { value: 'mercredi', label: 'Mercredi' },
  { value: 'jeudi', label: 'Jeudi' },
  { value: 'vendredi', label: 'Vendredi' },
  { value: 'samedi', label: 'Samedi' },
  { value: 'dimanche', label: 'Dimanche' },
];

// Unités de vente (compatibilité V1)
export const UNITES = [
  { value: 'pièce', label: 'Pièce' },
  { value: 'kg', label: 'Kilogramme' },
  { value: 'g', label: 'Gramme' },
  { value: 'lot', label: 'Lot' },
  { value: 'boîte', label: 'Boîte' },
  { value: 'portion', label: 'Portion' },
];

// ============================================
// INTERFACES - BASE
// ============================================

export interface Category {
  id: string;
  nom: string;
  ordre: number;
  created_at: string;
}

// ============================================
// INTERFACES - LEGACY (Compatibilité V1)
// À remplacer progressivement par ProductReference/ProductArticle
// ============================================

/**
 * @deprecated Utiliser ProductReference + ProductArticle
 */
export interface Product {
  id: string;
  reference: string | null;
  nom: string;
  category_id: string | null;
  atelier: Atelier;
  description: string | null;
  prix: number;
  unite: string;
  delai_preparation: number;
  note_production: string | null;
  is_frequent: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  category?: Category;
}

/**
 * Commande récurrente (V1)
 */
export interface RecurringOrder {
  id: string;
  client_id: string;
  nom: string | null;
  type_recurrence: 'quotidien' | 'hebdo' | 'personnalise';
  jours_semaine: string[];
  heure_livraison: string | null;
  date_debut: string;
  is_active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
  client?: Client;
  items?: RecurringOrderItem[];
}

export interface RecurringOrderItem {
  id: string;
  recurring_order_id: string;
  product_id: string | null;
  product_nom: string | null;
  quantite: number;
  note: string | null;
  created_at: string;
  product?: Product;
}

// ============================================
// INTERFACES - PRODUITS
// ============================================

/**
 * Référence produit de base (pour la production)
 */
export interface ProductReference {
  id: string;
  code: string;
  name: string;
  category_id: string | null;
  atelier: Atelier;
  base_unit: string;
  base_unit_price: number;
  vat_rate: number;
  description: string | null;
  note_production: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Jointures
  category?: Category;
  articles?: ProductArticle[];
}

/**
 * Article commercial (ce qu'on vend)
 */
export interface ProductArticle {
  id: string;
  product_reference_id: string;
  pack_type: PackType;
  quantity: number;
  product_state: ProductState;
  custom_price: number | null;
  display_name: string; // Généré automatiquement
  is_active: boolean;
  created_at: string;
  updated_at: string;
  // Jointures
  product_reference?: ProductReference;
}

/**
 * Calcul du prix d'un article (côté application)
 */
export function calculateArticlePrice(article: ProductArticle, reference: ProductReference): number {
  // Si prix personnalisé, l'utiliser
  if (article.custom_price !== null) {
    return article.custom_price;
  }
  // Sinon, calculer: prix unitaire × quantité
  return reference.base_unit_price * article.quantity;
}

/**
 * Génération du display_name (pour preview côté app)
 * Format: Nom produit - conditionnement quantité - état
 * Exemple: Petite tradition - lot 50 - pré-cuit
 */
export function generateArticleDisplayName(
  referenceCode: string,
  referenceName: string,
  packType: PackType,
  quantity: number,
  productState: ProductState
): string {
  const packLabel = PACK_TYPES.find(p => p.value === packType)?.label.toLowerCase() || packType;
  const stateLabel = PRODUCT_STATES.find(s => s.value === productState)?.label.toLowerCase() || productState;
  return `${referenceName} - ${packLabel} ${quantity} - ${stateLabel}`;
}

// ============================================
// INTERFACES - CHAUFFEURS
// ============================================

export interface Driver {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  is_active: boolean;
  created_at: string;
}

export function driverFullName(d: Driver): string {
  return `${d.first_name} ${d.last_name}`;
}

export function driverInitials(d: Driver): string {
  return `${d.first_name.charAt(0)}${d.last_name.charAt(0)}`.toUpperCase();
}

// ============================================
// INTERFACES - LIVRAISON
// ============================================

/**
 * Créneau de livraison
 */
export interface DeliverySlot {
  id: string;
  name: string;
  start_time: string; // Format "HH:MM"
  end_time: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

// ============================================
// INTERFACES - CLIENTS
// ============================================

export interface Client {
  id: string;
  nom: string;
  contact_nom: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  adresse_livraison: string | null;
  ville: string | null;
  quartier: string | null;
  type_client: ClientType;
  jours_livraison: string[];
  horaire_livraison: string | null;
  note_interne: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================
// INTERFACES - COMMANDES
// ============================================

/**
 * Commande
 */
export interface Order {
  id: string;
  numero: string;
  client_id: string;
  // Compatibilité V1
  date_livraison: string;
  heure_livraison: string | null;
  statut: OrderStatus;
  // Nouveaux champs V2
  delivery_slot_id: string | null;
  delivery_sequence: number | null;
  driver_id: string | null;
  driver_sequence: number | null;
  note: string | null;
  total: number;
  delivered_at: string | null;
  is_fully_delivered: boolean;
  parent_order_id: string | null;
  order_type: OrderType;
  recurring_order_id: string | null;
  created_at: string;
  updated_at: string;
  // Jointures
  client?: Client;
  delivery_slot?: DeliverySlot;
  items?: OrderItem[];
  parent_order?: Order;
}

/**
 * Ligne de commande
 */
export interface OrderItem {
  id: string;
  order_id: string;
  // Compatibilité V1
  product_id: string | null;
  product_nom: string | null;
  quantite: number;
  quantite_livree: number | null;
  quantite_restante: number | null;
  prix_unitaire: number;
  // Nouveaux champs V2
  product_article_id?: string;
  quantity_ordered?: number;
  quantity_delivered?: number | null;
  unit_price?: number;
  article_unit_quantity?: number;
  units_total?: number;
  note: string | null;
  created_at: string;
  // Jointures
  product?: Product;
  product_article?: ProductArticle;
  order?: Order;
}

/**
 * Données pour créer une ligne de commande
 */
export interface OrderItemInput {
  product_article_id: string;
  quantity_ordered: number;
  unit_price: number;
  article_unit_quantity: number;
  note?: string;
}

// ============================================
// INTERFACES - REPORTING
// ============================================

/**
 * Rapport de ventes par article
 */
export interface SalesReportByArticle {
  reference_code: string;
  reference_name: string;
  atelier: Atelier;
  article_display_name: string;
  pack_type: PackType;
  unit_quantity: number;
  product_state: ProductState;
  total_ordered: number;
  total_delivered: number;
  total_units: number;
  total_revenue: number;
}

/**
 * Rapport de production par référence
 */
export interface ProductionReportByReference {
  reference_code: string;
  reference_name: string;
  atelier: Atelier;
  total_units_ordered: number;
  total_units_delivered: number;
}

/**
 * Rapport de production par atelier
 */
export interface ProductionReportByAtelier {
  atelier: Atelier;
  delivery_date: string;
  total_references: number;
  total_units_ordered: number;
  total_units_delivered: number;
}

// Alias pour compatibilité V1
export interface ProductionByAtelier {
  atelier: Atelier;
  items: {
    product_id: string;
    product_nom: string;
    reference: string | null;
    categorie: string;
    quantite_totale: number;
  }[];
  total_references: number;
  total_quantite: number;
}

/**
 * Vue livraisons
 */
export interface DeliveryView {
  order_id: string;
  numero: string;
  delivery_date: string;
  slot_id: string | null;
  slot_name: string | null;
  start_time: string | null;
  end_time: string | null;
  delivery_sequence: number | null;
  client_id: string;
  client_nom: string;
  client_telephone: string | null;
  adresse_livraison: string | null;
  status: OrderStatus;
  total: number;
  delivered_at: string | null;
  is_fully_delivered: boolean;
}

// ============================================
// INTERFACES - DASHBOARD
// ============================================

export interface DashboardStats {
  commandesAujourdhui: number;
  commandesEnAttente: number;
  commandesEnProduction: number;
  clientsActifs: number;
  produitsActifs: number;
  articlesActifs: number;
}

/**
 * Commande du jour avec détails articles
 */
export interface OrderWithDetails extends Order {
  items: (OrderItem & {
    product_article: ProductArticle & {
      product_reference: ProductReference;
    };
  })[];
}

// ============================================
// INTERFACES - FORMULAIRES
// ============================================

/**
 * Formulaire création/édition référence produit
 */
export interface ProductReferenceFormData {
  code: string;
  name: string;
  category_id: string;
  atelier: Atelier;
  base_unit: string;
  base_unit_price: number;
  vat_rate: number;
  description: string;
  note_production: string;
  is_active: boolean;
}

/**
 * Formulaire création/édition article
 */
export interface ProductArticleFormData {
  product_reference_id: string;
  pack_type: PackType;
  quantity: number;
  product_state: ProductState;
  custom_price: number | null;
  is_active: boolean;
}

/**
 * Formulaire création/édition commande
 */
export interface OrderFormData {
  client_id: string;
  delivery_date: string;
  delivery_slot_id: string | null;
  delivery_sequence: number | null;
  note: string;
  items: OrderItemInput[];
}

// ============================================
// UTILITAIRES
// ============================================

/**
 * Formater un prix en MAD
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat('fr-MA', {
    style: 'currency',
    currency: 'MAD',
    minimumFractionDigits: 2,
  }).format(price);
}

/**
 * Formater une date
 */
export function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/**
 * Formater une heure (TIME -> HH:MM)
 */
export function formatTime(time: string | null): string {
  if (!time) return '';
  return time.substring(0, 5);
}

/**
 * Obtenir le style d'un atelier
 */
export function getAtelierStyle(atelier: Atelier) {
  return ATELIERS.find(a => a.value === atelier) || ATELIERS[ATELIERS.length - 1];
}

/**
 * Obtenir le style d'un statut
 */
export function getOrderStatusStyle(status: OrderStatus) {
  return ORDER_STATUSES.find(s => s.value === status) || ORDER_STATUSES[0];
}

/**
 * Obtenir le style d'un état produit
 */
export function getProductStateStyle(state: ProductState) {
  return PRODUCT_STATES.find(s => s.value === state) || PRODUCT_STATES[0];
}

// ============================================
// CONSTANTES PÉRIODE REPORTING
// ============================================

export type ReportPeriod = 'today' | 'week' | 'month' | 'custom';

export const REPORT_PERIODS: { value: ReportPeriod; label: string }[] = [
  { value: 'today', label: "Aujourd'hui" },
  { value: 'week', label: 'Cette semaine' },
  { value: 'month', label: 'Ce mois' },
  { value: 'custom', label: 'Personnalisé' },
];

/**
 * Calculer les dates de début/fin pour une période
 */
export function getReportDateRange(period: ReportPeriod, customStart?: string, customEnd?: string): { start: string; end: string } {
  const today = new Date();

  switch (period) {
    case 'today':
      const todayStr = today.toISOString().split('T')[0];
      return { start: todayStr, end: todayStr };

    case 'week':
      const dayOfWeek = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return {
        start: monday.toISOString().split('T')[0],
        end: sunday.toISOString().split('T')[0],
      };

    case 'month':
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return {
        start: firstDay.toISOString().split('T')[0],
        end: lastDay.toISOString().split('T')[0],
      };

    case 'custom':
      return {
        start: customStart || today.toISOString().split('T')[0],
        end: customEnd || today.toISOString().split('T')[0],
      };

    default:
      return { start: today.toISOString().split('T')[0], end: today.toISOString().split('T')[0] };
  }
}
