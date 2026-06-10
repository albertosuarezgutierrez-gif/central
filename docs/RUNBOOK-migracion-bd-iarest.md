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

**✅ Edge Functions — RESUELTO (43/43 migradas).** El proyecto viejo tenía **43 Edge Functions
ACTIVAS** (QR, VeriFactu sign, Stripe/MONEI webhooks, voz, crons). Todas migradas al compartido,
parcheadas a schema `iarest`, verify_jwt cuadrando con origen. Sigue pendiente que **Alberto
re-introduzca los secrets** (Stripe, MONEI, NIM, Telegram…) en el proyecto compartido (no son
legibles por API). **NO cambiar las envs de Vercel hasta meter secrets + exponer schema** (ver
"CORTE FINAL" más abajo), o la app llamará a funciones sin credenciales.

**ORDEN DEL CORTE (pendiente):**
1. (Agente) Migrar las 43 Edge Functions al proyecto compartido (fetch→parchear schema→deploy).
2. (Alberto) Re-introducir secrets de Edge Functions en el compartido.
3. (Alberto) Supabase compartido → Settings → API → **Exposed schemas** → añadir `iarest`.
4. (Alberto) Vercel proyecto ia-rest → cambiar `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (valores del compartido)
   **+ añadir `NEXT_PUBLIC_SUPABASE_SCHEMA=iarest`** → Redeploy.
5. (Juntos) Smoke test (login, leer, escribir) + plataforma lee iarest nativo + DROP `_mig_ddl`.
6. (Alberto) Resetear la password de BD de ia-rest (quedó en el chat) y jubilar el proyecto viejo.

### Estado Edge Functions (2026-06-10, 3ª pasada) — ✅ COMPLETO 43/43
- Alberto liberó hueco borrando las funciones basura (de ~100 → 44). Se reanudó el deploy y se
  completaron **las 43/43** al proyecto compartido `wswbehlcuxqxyinousql`, todas ACTIVE, cada
  `createClient` parcheado a `db: { schema: 'iarest' }`.
- **verify_jwt ya correcto en el deploy** (el MCP acepta el flag): `true` SOLO en `monitor-health`,
  `stripe-checkout`, `analizar-cv`, `lead-research`; `false` en las otras 39 (webhooks Stripe/MONEI,
  QR públicos, crons, ASN…). `nim-sentiment` y `contact-lead` se redeployaron a `false` (v2) para
  cuadrar con origen. → **No hace falta tocar ningún toggle de Verify JWT en el Dashboard.**
- Desglose: 16 con fuente en repo (`apps/ia-rest/supabase/functions`, parcheadas en `/tmp/efns`) +
  27 recuperadas del proyecto viejo `efncqyvhniaxsirhdxaa` vía `get_edge_function`.

### ⏭️ CORTE FINAL — pasos pendientes SOLO de Alberto (en este orden)
1. **Secrets de Edge Functions** en el proyecto compartido (Supabase → compartido → Edge Functions →
   Manage secrets). Re-mete los que usan las funciones de ia-rest (cifrados/no legibles por API ni
   dashboard — hay que pegarlos del origen). **LISTA MAESTRA DEFINITIVA** (extraída de los
   `Deno.env.get` de las 43 funciones; NO incluye `SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY/DB_URL`,
   que Supabase inyecta solo):
   - **Stripe:** `STRIPE_SECRET_KEY`, `STRIPE_SECRET_KEY_TEST`, `STRIPE_WEBHOOK_SECRET`,
     `STRIPE_WEBHOOK_SECRET_TEST`, `STRIPE_CLIENT_ID`, `STRIPE_READER_ID`, `STRIPE_MODE` (test/live),
     `STRIPE_PRICE_BASE`, `STRIPE_PRICE_BASE_TEST`, `STRIPE_PRICE_EXTRA_15`, `STRIPE_PRICE_EXTRA_15_TEST`,
     `STRIPE_PRICE_EXTRA_20`, `STRIPE_PRICE_EXTRA_20_TEST`.
   - **MONEI (Bizum):** `MONEI_API_KEY`, `MONEI_WEBHOOK_SECRET`.
   - **IA:** `ANTHROPIC_API_KEY`, `NVIDIA_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, `EAR_PROVIDER` (groq/openai).
   - **Email/Notif:** `RESEND_API_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`,
     `CALLMEBOT_APIKEY`, `CALLMEBOT_PHONE`.
   - **Otros:** `VERIFACTU_PRODUCCION` (true/false), `TICKETMASTER_API_KEY`, `INTERNAL_API_SECRET`,
     `IP_HASH_SALT`, `APP_URL`, `NEXT_PUBLIC_APP_URL`.
   - **Atajo:** los que estén también como env var en **Vercel → ia-rest** se pueden revelar (botón ojo)
     y copiar; el resto, de su dashboard de origen (Stripe, MONEI, Anthropic, NVIDIA, OpenAI, Groq, Resend).
2. **Exposed schemas:** Supabase compartido → **Settings → API → Exposed schemas** → añade `iarest`
   (deja `public` también). ✅ HECHO (3/3 schemas activos).
3. **Vercel → proyecto `ia-rest` → Settings → Environment Variables** → cambia estas 3 a los valores
   del proyecto **compartido** (Supabase compartido → Settings → API) **y añade la 4ª**:
   - `NEXT_PUBLIC_SUPABASE_URL` → URL del compartido
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → anon key del compartido
   - `SUPABASE_SERVICE_ROLE_KEY` → service_role del compartido
   - **AÑADIR** `NEXT_PUBLIC_SUPABASE_SCHEMA` = `iarest`
   (Si hay `DATABASE_URL`/`DIRECT_URL`, cámbialas también.) Luego **Redeploy** de ia-rest.
4. Avísame ("**corte hecho**") y hago el smoke test + cierro el puente de plataforma + DROP `_mig_ddl`.
5. Después: resetear la password de BD de ia-rest (quedó en el chat) y jubilar el proyecto viejo.
