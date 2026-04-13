import { ProductArticle, ProductReference, Client, DeliverySlot, Category } from '@/types';

export interface ArticleWithRef extends ProductArticle {
  product_reference: ProductReference & { category?: Category };
}

export interface OrderLine {
  id: string;
  article_id: string;
  article_display_name: string;
  quantite: number;
  prix_unitaire: number;
  unit_quantity: number;
}

export interface OrderForm {
  client_id: string;
  date_livraison: string;
  delivery_slot_id: string;
  note: string;
  reminder_days: number | null;
}

export interface HistoryItem {
  product_article_id: string;
  quantity_ordered: number;
  unit_price: number;
  article_unit_quantity: number;
  product_article: { id: string; display_name: string } | null;
}

export interface HistoryOrder {
  id: string;
  numero: string;
  delivery_date: string;
  total: number;
  items: HistoryItem[];
}

export interface MobileFlowProps {
  clients: Client[];
  articles: ArticleWithRef[];
  categories: Category[];
  deliverySlots: DeliverySlot[];
  lines: OrderLine[];
  setLines: React.Dispatch<React.SetStateAction<OrderLine[]>>;
  form: OrderForm;
  setForm: React.Dispatch<React.SetStateAction<OrderForm>>;
  onSubmit: (status: 'brouillon' | 'confirmee') => Promise<void>;
  submitting: boolean;
}
