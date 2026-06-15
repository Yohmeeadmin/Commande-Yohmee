-- Retours fournisseurs
CREATE TABLE IF NOT EXISTS public.supplier_returns (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  date        date NOT NULL DEFAULT current_date,
  raison      text NOT NULL DEFAULT 'Qualité non conforme',
  note        text,
  total       numeric(12,2) NOT NULL DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.supplier_return_lines (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id     uuid NOT NULL REFERENCES public.supplier_returns(id) ON DELETE CASCADE,
  stock_item_id uuid REFERENCES public.stock_items(id) ON DELETE SET NULL,
  quantite      numeric(12,3) NOT NULL,
  prix_unitaire numeric(12,4) NOT NULL DEFAULT 0
);

ALTER TABLE public.supplier_returns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON public.supplier_returns
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.supplier_return_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated full access" ON public.supplier_return_lines
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
