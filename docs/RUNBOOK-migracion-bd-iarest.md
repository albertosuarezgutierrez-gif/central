# RUNBOOK — Migrar la BD de ia-rest a la compartida (Fase A2 de la unificación)

> Objetivo: unificar en **un solo proyecto Supabase** (`wswbehlcuxqxyinousql`, el compartido que
> ya usan plataforma + ialimp + sivra) la BD de ia-rest, que hoy vive separada en
> `efncqyvhniaxsirhdxaa`. Decisión tomada en `docs/INFORME-unificacion-central.md`.
>
> **Por qué AHORA es buen momento:** ia-rest **no tiene clientes activos** → sus datos son de
> prueba/demo, desechables. El riesgo de mover el esquema es mínimo si se hace additivamente.
>
> **Por qué NO lo ejecuta el agente solo:** (1) el esquema es grande de verdad —**215 tablas, 47
> vistas, 156 funciones, 5 enums, 32 triggers + RLS**— se porta con `pg_dump`, no a mano; (2) el
> paso final **repointa las envs de Vercel del proyecto ia-rest**, que solo puedes hacer tú (no hay
> API/MCP para cambiar env vars de Vercel); (3) se aplica sobre el proyecto que aloja a **Sique
> Brilla EN VIVO**, así que se hace con cuidado y reversible.

## Enfoque: un schema de Postgres por vertical (sin colisiones)
La BD compartida tiene sus tablas en el schema `public` (ialimp/sivra/plataforma). ia-rest trae
nombres que **chocarían** (`clientes`, `proveedores`, `facturas`, `eventos`…). Solución: meter todo
ia-rest en un **schema propio `iarest`**. Joins nativos entre schemas, una sola auth/backup, cero
colisiones. ia-rest solo necesita **una línea de código**: su cliente Supabase con
`db: { schema: 'iarest' }`.

---

## Pasos (marcado quién hace cada uno)

### 1. (TÚ) Connection string de la BD vieja de ia-rest
Supabase → proyecto **ia-rest** (`efncqyvhniaxsirhdxaa`) → **Settings → Database → Connection string
(URI, modo "Session")**. Lo necesitamos para el `pg_dump`. (Es un secreto: pásamelo en privado o
ejecuta tú el dump del paso 2.)

### 2. (TÚ o JUNTOS) Volcar el esquema (solo estructura, sin datos)
```bash
pg_dump "postgresql://...conexión-ia-rest..." \
  --schema=public --schema-only --no-owner --no-privileges \
  -f iarest_schema.sql
```
> Solo estructura (`--schema-only`): los datos demo no se migran (empezamos limpio). Si quisieras
> algún dato, sería `--data-only` selectivo después.

### 3. (YO) Reescribir al schema `iarest`
Antepongo `CREATE SCHEMA IF NOT EXISTS iarest;` y reescribo las referencias `public.` → `iarest.`
del dump (con cuidado: solo objetos del esquema, no toco `auth.`, `storage.`, `extensions.`).
Reviso a mano enums, funciones (search_path), triggers y RLS. Te dejo el `.sql` final en el repo.

### 4. (YO, con tu OK explícito — additivo, NO toca a Sique Brilla)
Aplico el `.sql` a la BD compartida por Supabase MCP. Crea **schema `iarest` + sus 215 tablas/47
vistas/…** SIN tocar nada de `public` (ialimp/sivra). Verifico con un `\dt iarest.*`.

### 5. (YO) Cambio de código en ia-rest (1 sitio)
`apps/ia-rest/src/lib/supabase.ts` → los `createClient(url, key, { db: { schema: 'iarest' } })`
(cliente normal y service-role). Así todos los `from('tabla')` apuntan a `iarest.tabla` sin tocar
las ~400 rutas. Reviso Edge Functions y SQL crudo que asuman `public`.

### 6. ⚠️ (TÚ) Repointar las envs de Vercel — **EL PASO CLAVE QUE SOLO PUEDES HACER TÚ**
En **Vercel → proyecto `ia-rest` → Settings → Environment Variables**, cambia estas **3** para que
apunten a la BD compartida (sus valores están en Supabase → proyecto **compartido**
`wswbehlcuxqxyinousql` → Settings → API):

| Variable | Valor nuevo (del proyecto compartido) |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto `wswbehlcuxqxyinousql` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon/public key del compartido |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key del compartido |

(Si hay `DATABASE_URL`/`DIRECT_URL` en ia-rest, cámbialas también al compartido.) Luego **Redeploy**
del proyecto ia-rest. **Avísame cuando esté hecho** para verificar.

### 7. (YO) Limpiar el puente de HITO 3 en plataforma
Una vez ia-rest vive en la compartida, `apps/plataforma/lib/financiero.ts::getResumenIaRest` pasa a
leer **nativo** (mismo proyecto) y se retira el cliente service-role a la 2ª BD. Queda más simple.

### 8. (YO + TÚ) Verificación
- `next build` de ia-rest en verde.
- **Smoke test en la preview**: login, abrir una pantalla que lea datos, y una que escriba (p. ej.
  crear un lead) → confirmar que va contra `iarest.*` de la BD compartida.
- Cuadro de mando de plataforma sigue mostrando el financiero de ia-rest.

### 9. Rollback (si algo falla)
**Revertir las 3 envs de Vercel** a la BD vieja (`efncqyvhniaxsirhdxaa`, que queda intacta) +
Redeploy → ia-rest vuelve al estado anterior al instante. El schema `iarest` añadido a la compartida
no estorba (se puede borrar luego con `DROP SCHEMA iarest CASCADE`).

---

## Avisos técnicos a revisar en el paso 3/5
- **RLS**: portar las policies; si alguna usa `auth.uid()` y ia-rest no usa Supabase Auth, revisar.
- **Funciones**: `search_path` (que apunten a `iarest`, no `public`).
- **Secuencias/identidades, extensiones** (`uuid-ossp`, `pgcrypto`…): la compartida ya las tendrá;
  no duplicar.
- **Nombres de tipos/enums** que pudieran chocar con `public` (van en `iarest`, así que aislados).

## Estado
Pendiente de arrancar. Bloqueante = **paso 6 (envs de Vercel, tu mano)**. El resto lo ejecuta el
agente. Cuando quieras, hacemos pasos 1→4 y tú haces el 6.

---

## ✅ ESTADO REAL (actualizado 2026-06-10, ejecutado por dblink server-to-server)

**HECHO — esquema migrado con paridad verificada** (BD compartida, schema `iarest`):
- 215/215 tablas · 47/47 vistas · 121/121 funciones (las ~35 restantes eran internas de
  pg_trgm/unaccent → extensiones instaladas en `extensions`) · 32/32 triggers ·
  428/428 policies RLS · 428/428 FKs · 448 índices · 3 secuencias + ownership.
- Auditoría de aislamiento: ninguna función con `search_path=public` (todas → `iarest, extensions`).
- 6 buckets de Storage creados (chat-audio, cobros-imagenes, cobros-pdfs, cvs, iarest-app, logos).
- **Código ia-rest listo:** `SB_OPTS`/`SB_SCHEMA` en `src/lib/supabase.ts` + 8 ficheros con
  `createClient` propio. Con `NEXT_PUBLIC_SUPABASE_SCHEMA` sin definir → `public` (igual que hoy).
  `next build` verde.
- Tabla de trabajo `iarest._mig_ddl` se conserva hasta verificar el corte (luego DROP).

**⚠️ BLOQUEANTE NUEVO DESCUBIERTO — Edge Functions:** el proyecto viejo tiene **43 Edge
Functions ACTIVAS** (QR, VeriFactu sign, Stripe/MONEI webhooks, voz, crons). Solo 16 tienen
fuente en el repo (`apps/ia-rest/supabase/functions/`); las otras 27 hay que recuperarlas del
proyecto viejo (MCP `get_edge_function`) y redesplegarlas en el compartido, parcheadas para el
schema `iarest`, y **Alberto debe re-introducir los secrets** (Stripe, MONEI, NIM, Telegram…)
en el proyecto compartido (no son legibles por API). **NO cambiar las envs de Vercel hasta
migrar las functions**, o la app llamará a funciones inexistentes.

**ORDEN DEL CORTE (pendiente):**
1. (Agente) Migrar las 43 Edge Functions al proyecto compartido (fetch→parchear schema→deploy).
2. (Alberto) Re-introducir secrets de Edge Functions en el compartido.
3. (Alberto) Supabase compartido → Settings → API → **Exposed schemas** → añadir `iarest`.
4. (Alberto) Vercel proyecto ia-rest → cambiar `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (valores del compartido)
   **+ añadir `NEXT_PUBLIC_SUPABASE_SCHEMA=iarest`** → Redeploy.
5. (Juntos) Smoke test (login, leer, escribir) + plataforma lee iarest nativo + DROP `_mig_ddl`.
6. (Alberto) Resetear la password de BD de ia-rest (quedó en el chat) y jubilar el proyecto viejo.

### Estado Edge Functions (2026-06-10, 2ª pasada)
- **Migradas y parcheadas a `iarest` (5/43):** nim-sentiment, contact-lead, cobro-monei, webhook-monei, alerta-ritmo-cron.
- **BLOQUEADO (38/43):** el proyecto compartido está en el **tope de ~100 Edge Functions** del plan →
  todo deploy devuelve `PaymentRequiredException` (incluso updates). **Acción de Alberto:** borrar en
  el Dashboard (~40 funciones basura de sesiones antiguas: prefijos `income-`, `fix-`, `read-`,
  `write-`, `updates-`, `test-`, `list-`, `check-`, `push-landing`, `landing-`, `deploy-landing`,
  `debug-landing`, `insert-html`, `repair-chunks`, `mobile-commit`, `commit-dashboard-fix`,
  `create-api-routes`, `create-landing-repo`, `add-domain-vercel`, `middleware-patch`,
  `delete-conflicting-route`). **NO borrar:** `sync-smoobu` (cron vivo de sivra), `github-commit`,
  `trigger-*`, `deploy-agente`, `deploy-dashboard`, `drive-*`, `upload-*`, `merge-landing-to-main`,
  `add-smoobu-booking`, `import_csv`, `inject-ga4`, `push-route-ga4`, ni las 5 migradas.
- **Tras liberar hueco:** relanzar los 2 agentes (14 del repo desde `/tmp/efns` si la sesión vive, o
  re-parchear desde `apps/ia-rest/supabase/functions`; + 27 vía get_edge_function del proyecto viejo).
- **verify_jwt:** el deploy por MCP fija `true`; el origen usa `false` en casi todas (webhooks
  Stripe/MONEI, QR públicos, ASN... lo necesitan). **Checklist final de Alberto:** en el Dashboard del
  compartido, poner "Verify JWT" en **OFF** en todas las migradas **salvo `monitor-health`,
  `stripe-checkout`, `analizar-cv` y `lead-research`** (esas 4 van con `true`, como en origen).
