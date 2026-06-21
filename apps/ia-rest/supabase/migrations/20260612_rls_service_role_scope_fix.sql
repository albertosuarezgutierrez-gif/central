-- Fix: rls_policy_always_true — 7 políticas nombradas service_role_* sin TO service_role
-- Recreamos con TO service_role para que solo el rol server-side tenga acceso irrestricto.
-- service_role bypassa RLS igualmente; esto solo elimina la exposición a anon/authenticated.
-- Las 17 restantes (impresoras, bridge_tokens, QR anon, sugerencias, etc.) son intencionales
-- o requieren USING expressions con filtro tenant — se dejan como están.

-- qr_division_slots
DROP POLICY IF EXISTS service_role_qr_slots ON iarest.qr_division_slots;
CREATE POLICY service_role_qr_slots ON iarest.qr_division_slots
  TO service_role USING (true) WITH CHECK (true);

-- qr_items_reclamados
DROP POLICY IF EXISTS service_role_qr_items ON iarest.qr_items_reclamados;
CREATE POLICY service_role_qr_items ON iarest.qr_items_reclamados
  TO service_role USING (true) WITH CHECK (true);

-- qr_sesiones_cliente
DROP POLICY IF EXISTS service_role_qr_sesiones ON iarest.qr_sesiones_cliente;
CREATE POLICY service_role_qr_sesiones ON iarest.qr_sesiones_cliente
  TO service_role USING (true) WITH CHECK (true);

-- qr_valoraciones (service_role variant — las anon_* son intencionales para el flujo QR)
DROP POLICY IF EXISTS service_role_qr_valoraciones ON iarest.qr_valoraciones;
CREATE POLICY service_role_qr_valoraciones ON iarest.qr_valoraciones
  TO service_role USING (true) WITH CHECK (true);

-- reglas_envio
DROP POLICY IF EXISTS service_role_all ON iarest.reglas_envio;
CREATE POLICY service_role_all ON iarest.reglas_envio
  TO service_role USING (true) WITH CHECK (true);

-- voice_profiles
DROP POLICY IF EXISTS voice_profiles_service_access ON iarest.voice_profiles;
CREATE POLICY voice_profiles_service_access ON iarest.voice_profiles
  TO service_role USING (true) WITH CHECK (true);

-- comanda_modificaciones
DROP POLICY IF EXISTS service_insert_modificaciones ON iarest.comanda_modificaciones;
CREATE POLICY service_insert_modificaciones ON iarest.comanda_modificaciones
  TO service_role WITH CHECK (true);
