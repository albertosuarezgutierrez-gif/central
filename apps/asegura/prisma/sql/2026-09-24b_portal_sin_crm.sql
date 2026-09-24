-- El CRM de Manuel (rol `crm_seguros`) no toca NINGUNA tabla del portal: medido el 24/09/2026 en
-- pg_stat_statements, 101 consultas distintas / 17.462 llamadas y ninguna sobre `portal_*`. Pero los
-- privilegios por defecto del schema `seguros` le daban DML en las 21: con INSERT en `portal_vinculo`
-- se ata cualquier identidad a cualquier ficha y se ve su cartera; en `portal_enlace_directo`, se
-- fabrica una llave de entrada. Quien tiene esa credencial hoy: el proyecto Vercel `asegura` y quien
-- tenga `write` en ese repo. Se revoca todo; `backup_seguros` (solo lectura) se queda.
--
-- 🚨 Los privilegios por DEFECTO siguen dándole DML a cada tabla nueva del schema: toda tabla
-- `portal_*` nueva lleva su `REVOKE ALL ... FROM crm_seguros` en su propio SQL (lo vigila
-- `test/regression-portal-sin-crm.test.ts`).
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'seguros' AND tablename LIKE 'portal\_%' LOOP
    EXECUTE format('REVOKE ALL ON seguros.%I FROM crm_seguros', t);
  END LOOP;
END $$;
