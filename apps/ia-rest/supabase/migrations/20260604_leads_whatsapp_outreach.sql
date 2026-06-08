-- Marca de outreach por WhatsApp (wa.me manual) para no repetir el mismo lead.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS whatsapp_outreach_at TIMESTAMPTZ;
