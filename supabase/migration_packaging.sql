-- Migration: coût packaging par article
ALTER TABLE product_articles
  ADD COLUMN IF NOT EXISTS packaging_cost NUMERIC DEFAULT 0;
