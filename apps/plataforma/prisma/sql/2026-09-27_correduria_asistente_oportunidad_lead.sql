-- Oportunidad para un LEAD que aún no tiene ficha (27/09/2026). Alberto sube la póliza de alguien que no
-- está en la cartera: asegura lee el tomador, busca su DNI y devuelve un sello cifrado con el alta. La
-- propuesta nace sin ficha (`cliente_id` NULL) y con `lead` = {nombre, sello}; al pulsar se crea la ficha
-- con ese sello y después la oportunidad. El DNI no se guarda aquí en claro: el sello solo lo abre asegura.
ALTER TABLE correduria_asistente_oportunidad ALTER COLUMN cliente_id DROP NOT NULL;
ALTER TABLE correduria_asistente_oportunidad ADD COLUMN IF NOT EXISTS lead jsonb;
ALTER TABLE correduria_asistente_oportunidad DROP CONSTRAINT IF EXISTS correduria_asistente_oportunidad_ficha_o_lead;
ALTER TABLE correduria_asistente_oportunidad ADD CONSTRAINT correduria_asistente_oportunidad_ficha_o_lead
  CHECK (cliente_id IS NOT NULL OR lead IS NOT NULL OR estado <> 'propuesta');
