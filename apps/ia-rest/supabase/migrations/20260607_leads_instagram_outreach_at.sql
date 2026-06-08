-- Marca de outreach por Instagram (DM manual a catering de Sevilla), espejo de
-- whatsapp_outreach_at: se fija al PROPONER el DM en Telegram para no reproponerlo.
alter table public.leads add column if not exists instagram_outreach_at timestamptz;
