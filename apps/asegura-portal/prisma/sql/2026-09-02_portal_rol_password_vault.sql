-- Contraseña del rol `prisma_asegura_portal` (portal del cliente) — APLICADO el 02/09/2026.
--
-- Por qué así: la contraseña se genera DENTRO de Postgres, se asigna al rol y se guarda en el
-- Vault de Supabase en el mismo bloque. El valor no pasa por ningún transcript, chat ni repo
-- (regla de apps/asegura-portal/CLAUDE.md: «ningún valor va nunca al repo ni a un transcript»;
-- incidente 26/06/2026: contraseñas expuestas en chat que hubo que rotar).
--
-- Dónde leerla: Supabase → proyecto wswbehlcuxqxyinousql → Vault → secreto
-- `prisma_asegura_portal_password` (o `select decrypted_secret from vault.decrypted_secrets
-- where name = 'prisma_asegura_portal_password'` como postgres).
--
-- Va en `DATABASE_URL` del proyecto Vercel `asegura-portal` (prj_MNrsMRVrBft6KLq1skgi8XU9s9y9):
--   postgresql://prisma_asegura_portal.wswbehlcuxqxyinousql:<VAULT>@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true
--
-- ⚠️ ROTAR = repetir este bloque (create_secret crea OTRA fila en el Vault: borra la vieja después)
-- Y actualizar DATABASE_URL en Vercel EN EL MISMO PASO. Una sin la otra deja la app muerta en
-- silencio con `password authentication failed` (lección de prisma_seguros, 02/09/2026).
--
-- Verificado el 02/09/2026 con dblink desde la propia BD, sin exponer el valor:
--   · login por el pooler (6543, usuario `prisma_asegura_portal.wswbehlcuxqxyinousql`) y por el host
--     directo (5432): OK, lee seguros.polizas y seguros.clientes;
--   · `select count(dni) from seguros.clientes` → 42501 permission denied (las columnas PII no
--     están concedidas; ver 2026-09-02_portal_rol_vinculo_grants.sql).
--   · por 127.0.0.1 NO se puede probar: pg_hba entra por trust y dblink rechaza conexiones sin
--     contraseña (2F003).

DO $$
DECLARE p text := encode(gen_random_bytes(24), 'hex');  -- 48 hex: sin caracteres que haya que escapar en la URL
BEGIN
  EXECUTE format('ALTER ROLE prisma_asegura_portal WITH PASSWORD %L', p);
  PERFORM vault.create_secret(
    p,
    'prisma_asegura_portal_password',
    'Contraseña del rol prisma_asegura_portal (portal del cliente, apps/asegura-portal). Generada en la BD el 02/09/2026; va en DATABASE_URL del proyecto Vercel asegura-portal. Rotar = repetir el bloque y actualizar Vercel en el mismo paso.'
  );
END $$;
