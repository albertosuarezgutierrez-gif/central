# Auditoría completa — monorepo `central` (02/11/2026)

**Alcance:** correduría (asegura, asegura-portal, asegura-web, `/correduria` de plataforma), BD compartida
(proyecto `central`), las 13 apps, CI y estructura, rutinas programadas de Claude, flujo de trabajo y docs.
Lectura salvo lo marcado como ARREGLADO. Este documento no contiene valores de tokens ni secretos.
**Rango de cambios:** PR de esta rama (migración de BD ya aplicada en el proyecto `central`).

---

## 1. Resumen

- **Código:** cerrados en este lote 11 acciones de servidor de `/correduria` sin puerta (una cotizaba 0,50 €
  por llamada), 14 rutas de ia-rest que confiaban en una cabecera de sesión sin firma (cross-tenant), y las
  rutas sin auth de sivra, ialimp y plataforma.
- **BD (aplicada):** `REVOKE EXECUTE` en 73 funciones SECURITY DEFINER de `iarest`, incluida
  `ejecutar_qa_patron`, que permitía ejecutar SQL de lectura libre como `postgres` con la clave anon pública.
- **Dependencias y CI:** Next subido (15.5.28 / 16.4.4), 0 vulnerabilidades critical, y el total de
  `pnpm audit --prod` baja de 88 a 41.
- **Pendiente:** 9 edge functions sin auth (una con secreto literal en el repo), aislamiento de asegura que
  depende de `correduriaUnica()` y no del cepo, y la lista de acciones manuales de Alberto (sección 4).
- **Verificado sin acción:** la cuarentena CIMA (249 filas) es copia cruda, no una cola atascada.

---

## 2. ARREGLADO en este lote (PR de esta rama)

### 2.1 Correduría (`apps/plataforma` `/correduria`, `apps/asegura`)
- 11 server actions sin `exigirCorreduria()`. Incluye `pedirCotizacionPack` (POST real a Codeoscopic, 0,50 €).
  Ahora cada export exige correduría. Cepo nuevo: recorre los `'use server'` bajo `app/(usuario)/correduria`
  y exige la puerta en cada export.
- `?secret=<CRON_SECRET>` ya no abre `/correduria`.
- Cabecera de ficha de cliente: `esCliente` deja de salir de `clientes.tipo` y pasa a `esCarteraEnVigor()`.
- `codeoscopic/product-form`: lista blanca de `path` y método, sujeto al interruptor de emisión.
- Tope de gasto Codeoscopic: `pg_advisory_xact_lock` por correduría alrededor de comprobación y reserva
  (cierra la carrera de N peticiones en paralelo, exceso de N×0,50 €).
- `requireSecret()` en `apps/asegura/lib/auth.ts`: sin literal de desarrollo como secreto de sesión.

### 2.2 ia-rest
- 14 rutas que leían `x-ia-session` sin firma (turnos, kds/asistente, comanda, cron/seo-agent, cron/blog-seo,
  super/impersonate, entre otras) pasan a `getSession()` firmado. Cierra la lectura/escritura cross-tenant y la
  suplantación de camarero o de super_admin.
- `seleccionar-restaurante` ya no entrega sesión de owner.
- Firma de sesión obligatoria siempre (se acabó el modo sin verificar).
- Crons fail-closed con helper común (sin `Bearer undefined` cuando falta la variable).
- `webhooks/vercel-deploy`: sin firma → 401 (antes se saltaba omitiendo la cabecera).
- `onboarding/extract-carta`: sesión y límite de uso.
- `push/send`: protegido.
- `BlogSEOTab.tsx` borrado (sin importadores; llevaba `NEXT_PUBLIC_CRON_SECRET` en el bundle).

### 2.3 sivra / ialimp / plataforma
- Rutas sin auth: borradas o protegidas según su uso real.
- `limpiadora_token` se valida en BD (antes bastaba con que la cookie existiera).
- `mercado/ingest`: Bearer y sin `?secret=`.
- `ialimp/pms/sync`: exige Bearer (el cron de Vercel ya lo envía). `vercel.json` de ialimp reducido a `pms/sync`.
- Webhooks fail-closed (Smoobu en plataforma, Resend en ialimp, mercado en sivra).
- Comparación de secretos de cron en tiempo constante, con cepo `regression-cron-secret-a-pelo`.

### 2.4 Dependencias, transpilación y CI
- Next 15.5.28 en las apps 15 y 16.4.4 en ia-rest. `overrides` en el `package.json` raíz para transitivas.
  Vulnerabilidades de `pnpm audit --prod`: 88 → 41, 0 critical.
- `transpilePackages` completado en asegura (`core-direccion`, `core-telegram`) y asegura-web (`core-consent`).
- `packages/module-agenda` borrado (sin consumidores).
- CI: `tsc` duplicado de `ci.yml` retirado (queda en `tests.yml`), Node 22 unificado, CLI de Vercel fijada,
  timeout en gitleaks.

### 2.5 Base de datos (APLICADA: `migrations/20261102_auditoria.sql`)
- `search_path` fijo en 30 funciones (27 de `seguros`, 3 de `public`).
- 2 crons de pg_cron duplicados retirados.
- `REVOKE EXECUTE` a PUBLIC/anon/authenticated en 73 funciones SECURITY DEFINER de `iarest`. Un REVOKE solo
  de `anon` no habría servido: las 79 tenían EXECUTE a PUBLIC. Verificado: quedan 6 abiertas a propósito.
- Rollback: `migrations/20261102_auditoria_rollback.sql`.

### 2.6 Docs y memoria
- `scripts/rotar-memoria.mjs` arreglado: reconoce entradas `## (dd/mm/aaaa)`. Septiembre y octubre
  archivados en `docs/memoria/`.
- `MATRIZ.md` al día (asegura-portal, asegura-web, almacen, housesevillana, sivra).
- Cifra de apps corregida a 13 (`tests.yml` y `ls apps`) en CLAUDE.md, skills y AGENTES-MAPA.
- 12 auditorías antiguas archivadas.

### 2.7 Rutinas de Claude (`list_triggers`)
- 10 tareas muertas o superadas borradas, incluida «Seguimiento campaña portal» (corría 6 veces al día).
- SEO semanal de ASegura deduplicado (el prompt estaba escrito dos veces).
- 11 PRs draft obsoletos cerrados.

---

## 3. PENDIENTE (no hecho)

| Sev | Ámbito | Hallazgo | Acción propuesta |
|---|---|---|---|
| ALTO | Edge functions | Sin auth o con auth débil: `tg-send` (compara con un secreto literal escrito en el repo público; manda Telegram a cualquiera), `push-send` (push a cualquier camarero), `test-runner` (sin auth, llama a LLM con service_role), `notify-error`, `infra-monitor-cron`, `cobro-stripe` / `cobro-monei` (crean cobros en datáfono), `error-ingest` (fail-open si no hay secreto), `enviar-verifactu`, `import_csv` (placeholder). | Rotar el secreto del repo y moverlo a env (`tg-send`, `push-send`, `error-ingest`). Llamar `tg-send` desde una ruta de servidor. Borrar `test-runner` e `import_csv`. Cobros: exigir firma o secreto propio. |
| ALTO | Aislamiento asegura | El cepo `regression-asegura-aislamiento` (47 ficheros) exige el import de `lib/tenant`, que solo re-exporta Prisma. La garantía real es `correduriaUnica()`, que lanza si hay más de una correduría. Las consultas Prisma por modelo no las mira ningún cepo. | Documentar la garantía en `apps/asegura/CLAUDE.md`. Cambiar el cepo para exigir `correduria_id` en el SQL, no el import. |
| MEDIO | Vista de corredor (asegura-portal) | Identidad compartida `IDENTIDAD_CORREDOR_ID`: abrir la vista del cliente B borra el vínculo de A. `usadoEn` se marca sin `usadoEn: null`, así que dos aperturas simultáneas pasan. | Identidad por corredor y cliente. Marcar `usadoEn` solo si es null. |
| MEDIO | Formularios públicos (asegura-web → plataforma) | `x-forwarded-for` lo sobrescribe Vercel, así que plataforma ve la IP de salida y el tope 6/h por IP es compartido o inútil. El limitador está en memoria. | Verificar en logs. Cabecera propia firmada con HMAC, o limitar en asegura-web. |
| MEDIO | Guard de Fidelidade (tarificador) | Avance «sin rótulo» por patrón de `name` (`OPI_Theme_wt…` + `$block$wtMainContent$`), no por nombre exacto. Sin camino a «Contratar» observado. | Fijar el `name` exacto. Si OutSystems lo renumera, parar y aprobar a mano. |
| MEDIO | Bajas públicas (asegura) | `campana/baja` y `recaptacion/baja` dan de baja por GET; los escáneres de correo corporativo lo ejecutan. | GET muestra un botón, POST ejecuta. |
| MEDIO | Middleware de plataforma | Sigue aceptando `?secret=` para otras rutas, comparado con `===`. | Quitar el query string; comparación en tiempo constante. |
| MEDIO | Relé de Codeoscopic | Confirmar que `product-form` ya no admite rutas que muten o coticen (lista blanca aplicada, no verificada contra el vendor). | Probar con sesión `rol=empresas` y con rutas fuera de la lista. |
| MEDIO | Crons sin uso humano | ialimp: 15 crons (mailing, informes, alertas-gastos, impagos, alertas-pendientes, contabilidad, fotos-cleanup) sin usuarios desde 29/08. ia-rest: 35 crons por revisar. `alerta-ritmo` cada 2 min; `infra-monitor` y `monitor-health` cada 5 min. | Apagar lo que no haga falta, tras confirmar en BD. |
| MEDIO | Timeouts plataforma | 300 s en crons (`facturas-conciliar-gmail`, `agentes-latido`, `idealista-correos`, `trading-universo`) y `/api/ai/chat`. 13 desde junio. | Subir `maxDuration` o trocear. |
| MEDIO | tarificador-traza | «El worker no mandó ningún paso» 3 veces (01-02/11): imagen antigua del worker en Fly en algún adaptador (probable). | Redesplegar el worker y revisar adaptadores. |
| MEDIO | asegura-portal SMTP | 3 fallos «Bad recipient address syntax» en `/api/acceso/solicitar` (26/10-01/11). | Validar sintaxis antes de enviar. |
| MEDIO | Comparaciones de secreto | 48 comparaciones con `===`/`!==` (4 usan `timingSafeEqual`). Patrón `Bearer ${CRON_SECRET}` en ~29 rutas. | Helper común en `@central/core-identity` (fail-closed y tiempo constante). |
| MEDIO | Duplicación | `smoobu-firma.ts` idéntico en ialimp y sivra; `cron-auth` en 3 apps; `rate-limit` en 3 apps (rrhh en memoria); `direccion/cp` y `vias` en ia-rest e ialimp. | Mover a `packages/core-smoobu`, `core-identity` y `core-direccion`. |
| MEDIO | `app_user` (BD) | Rol con BYPASSRLS y login, EN USO (32.524 llamadas Prisma a `public.incomes`, `properties`, `gastos`, `rate_snapshots`). | Localizar en Vercel qué `DATABASE_URL` lo usa, pasarlo a su `prisma_*`, después `NOLOGIN`. Rollback: `LOGIN`. |
| MEDIO | ALTER DEFAULT PRIVILEGES (iarest) | Las funciones nuevas de `iarest` nacen con EXECUTE a PUBLIC. | Revocar el default. |
| MEDIO | Rendimiento BD | 1.838 `multiple_permissive_policies` y 345 `auth_rls_initplan` en iarest (`auth.uid()` → `(select auth.uid())`). 167 FKs sin índice en seguros (priorizar polizas/recibos/siniestros por cliente). | Por lotes, con tests. No borrar los 562 índices «sin uso» a ciegas. |
| MEDIO | Vulnerabilidades restantes | `xlsx` high sin parche (ialimp, solo exporta). `nodemailer` <10.1.4 (ialimp). Transitivas high: axios/follow-redirects, qs, ip-address, deepmerge-ts (los `overrides` no bastan: audit pide axios ≥1.20). `next/og` en ia-rest: revisar si renderiza entrada de usuario. | Subir nodemailer; ajustar overrides; documentar xlsx. |
| MEDIO | Tarificador RPA | Duplicados intencionados `tarificador-humo` ×2 en asegura. | Confirmar que es intencionado. |
| MEDIO | Middleware sivra `/api/limpiadoras` | Cookie validada en BD solo en algunas rutas. | Revisar que todas las rutas validen. |
| BAJO | asegura-portal `lib/auth.ts` | `requireSecret(..., devFallback)` aún con fallback de desarrollo (no es producción). | Quitar `devFallback`. |
| BAJO | ia-rest `lib/supabase.ts` y `lib/email.ts` | Fallback `'placeholder'` enmascara variables ausentes. | Usar `requireSecret`. |
| BAJO | rrhh (aislamiento) | Sin red de RLS: el aislamiento por `empresa_id` depende solo del código. | Test guardia: todo `FROM rrhh.*` debe filtrar `empresa_id`. |
| BAJO | plataforma `subastas/fase3-debug` | Ruta pública con token en BD, marcada temporal. | Retirar. |
| BAJO | ialimp SSRF y XSS | `fetch` sigue redirecciones sin revalidar destino. `renderMd` de salida LLM sin escapar en paneles super-admin. | Revalidar destino tras cada redirect. Escapar la salida. |
| BAJO | kds/voz | URL relativa. | Pasar a URL absoluta de la app. |
| BAJO | Tablas de respaldo | `public._backup_*` y `_csv_staging` (mayo/sept); `seguros.cliente_emails_borrados_20260904` sin PK. | Exportar y `DROP` (decisión de Alberto). |
| BAJO | Purga de tablas | Sin purga: `operational_events` (2.905 filas >90 días, crece ~135/semana), `historial_interno`, `correo_evento`, `oportunidad_historial`. | Purgar `operational_events` >180 días solo si Alberto lo pide. `auditoria` es evidencia legal: no purgar. |
| BAJO | Migraciones | No hay carpeta única versionada de `seguros`/`plataforma`; la fuente de verdad es la BD (~660 aplicadas). | Decidir volcado `supabase db dump --schema-only`. |
| BAJO | Edge functions (limpieza) | Desplegadas sin referencia en código, pg_cron ni `vercel.json`: lista en sección 4. | Borrar tras el checklist. |
| BAJO | Solapes de cron | 4 jobs de aviso de trial solapados; `fuera-carta` duplicado (ya retirado). | Unificar en un solo job. |
| BAJO | Ramas remotas | 852 ramas en origin, casi todas de PRs cerrados o fusionados. | Script: borrar ramas de PR cerrado con más de 14 días sin commits. Activar auto-delete (sección 4). |
| BAJO | Contexto de sesión | `CLAUDE.md` raíz (~3 KB prescindibles). `asegura-portal/CLAUDE.md` 24,5 KB (→ ≤10 KB). `ialimp/CLAUDE.md` 17 KB (→ ≤6 KB). Descripciones de skills >250 caracteres (`seo-house-sevillana` 875). `auditoria-diaria.md` 47 KB (trocear). Skills duplicadas (`seo-house-sevillana`, `ia-rest`). | Recortar; los «completos» ya están en `docs/claude-md/`. |
| BAJO | Docs | `docs/uso-herramientas/` 1,8 MB de telemetría commiteada (→ .gitignore del detalle >30 días). 24 `AUDITORIA-*.md` sin referencias entrantes (→ `docs/memoria/auditorias/`). Planes ya ejecutados en `docs/superpowers/` (→ `docs/memoria/planes/`). `AUTO-APLICADOS.md` 59 KB (archivar >30 días). `CONTEXTO-SESIONES.md`: comprobar tras la rotación que solo quedan entradas vivas. | Mover con `git mv`. |
| BAJO | Hooks | `Stop` sin `timeout` en `.claude/settings.json`. `persist-memoria.sh` hace push a HEAD también en `main`. Sentinel en shadow sobre todas las tools (coste ~100 ms/llamada). | Poner `timeout: 30`. Excluir `main` del push. Decidir el matcher del sentinel. |
| BAJO | CI (coste) | `qa.yml` sin filtro de app afectada. 17 `pnpm install --no-frozen-lockfile` por PR (no detecta drift; cambiar a frozen). `rutinas-automerge` en cada `check_suite`. `ready-to-merge` solo hace echo. | Copiar el filtro `ci-app-afectada.mjs`. Frozen lockfile. Filtrar por app y conclusión. |
| BAJO | Rutinas: conectores | buscador-ia 18 conectores, pricing 15, facturas 15, entrenador 15, cima-guardia 4 (usa 1-2), trading (IBKR con órdenes + Vercel + OpenRouter). Rutinas sin el conector que su prompt pide (SEO mensual, posición vs mercado). | Recortar. Ver sección 4. |
| BAJO | Rutinas: prompts y fichas | pricing-agente dice «en vivo solo busto_reform» (desde 08/08 van los 4 pisos). Prospección usa `TELEGRAM_BOT_TOKEN` directo (contradice la regla). Faltan fichas en `RUTINAS-PROGRAMADAS.md` (cima-guardia, médico del bot, SEO ASegura). Doc dice `ALERTA_TOKEN` «en el entorno» y está en 7 prompts. | Reescribir y actualizar el doc. Prospección: avisos a `/api/internal/alerta`. |
| BAJO | Rutinas: frecuencia | mercado-booking 2/día (doc: 1/día). buscador-ia y agentes-entrenador más frecuentes de lo útil. trading-analista falló por USAGE_LIMIT (30/10). | Bajar cadencias (sección 4). |
| BAJO | Rutinas: PR de bitácora | Casi todas abren un PR draft por pasada. #4493 mezcla código de dinero con registro. #5133 es la causa de las repescas de trading. | Separar #4493 y revisar con `agente-architect`. Mergear o cerrar #5133. |
| BAJO | Auditorías, cuota | Diaria, profunda, cima-guardia y vigía solapan. | Cima-guardia absorbe el bloque de correduría y CIMA. |

---

## 4. CHECKLIST MANUAL DE ALBERTO

1. **Rotar `ALERTA_TOKEN`** (el valor de 48 hex está pegado en el prompt de 7 rutinas: SEO semanal, github-vigia,
   CFO, Radar España, vigía de conectores, buscador-ia, agentes-entrenador). Ponerlo en el entorno de la rutina,
   no en el prompt. Rotar también el token de invitado de trading que va en la URL de «Seguimiento quincenal» y
   «Hito 4 meses» (antes del 16/11).
2. **Editar o borrar en claude.ai/code/routines:**
   - `ialimp-client-health` (trig_01SrhM2UBs8pSsA29XsBbp8z): borrar (ialimp sin uso humano).
   - `limit_wake` (trig_01HpgpzPwXpkKdd7iwXpsbz6): borrar.
   - `pricing-agente` (trig_019xCRktx8USAeX7msKBM7DD): reescribir el paso 5 (4 pisos en vivo) y recortar conectores.
   - `buscador-ia` (trig_017HKFjQFjBTRJXt1fmF2D7P): cron mensual `CRON_TZ=Europe/Madrid 43 7 3 * *`, sin conectores.
   - `mercado-booking` (trig_01Sr5KXErpEhGCtT1F16hv4W): 1/día `30 8 * * *`, y `ALERTA_TOKEN` vacío: ponerlo en el entorno.
3. **Borrar en el panel de edge functions (lista A):** `github-commit`, `trigger-deploy`, `trigger-redeploy`,
   `deploy-dashboard`, `deploy-agente`, `upload-photo-github`, `upload-landing`, `merge-landing-to-main`,
   `push-clean-page`, `push-route-ga4`, `inject-ga4`, `drive-folder-list`, `drive-photos-publish`,
   `drive-upload-factura`, `add-smoobu-booking`, `import_csv`, `test-runner`, `nim-catalogo-temp`, `img-b64`,
   `daily-briefing`. Borrar no rota PAT ni contraseñas que hayan estado en ellas: eso sigue pendiente.
4. **Activar leaked password protection** en Supabase Auth (panel, no SQL).
5. **Re-vincular BBVA y Kutxabank en `/banca`** (sesión BBVA caducada desde 12/09; Kutxabank desde 28/09).
6. **Activar «Automatically delete head branches»** en GitHub (repo).
7. **`RESEND_WEBHOOK_SECRET` no existe:** el webhook de ialimp responde 401. Aceptable mientras no se use.
8. **Proyecto Vercel `asegura`: NO se borra.** Sirve `app.grupoasegura.com` (CRM de Manuel). El duplicado con
   `central-asegura` no es un proyecto muerto.
9. **Rollback de la migración:** `migrations/20261102_auditoria_rollback.sql`.

---

## 5. Verificado sin acción

- Cuarentena CIMA: 249 filas, 245 sin `reprocesado_at`. Es la copia cruda de todo fichero desde el 17/09
  (`motivo` NULL, ficheros `confirmed`, `purgar_en` en 2032). El cuadro ya filtra `con_incidencia` = 0 pendientes.
- 54 tablas de `seguros` con RLS sin políticas = deny-all por diseño (acceso por roles BYPASSRLS).
- `prisma_asegura_portal` sin BYPASSRLS: correcto (el aislamiento lo da el código).
- Anon key JWT en `ia-rest/scripts/bridge-v6` y en una migración: pública por diseño (role anon). No hay secretos
  reales en el repo (fuera del `tg-send` del punto 1 de la sección 3).
- Webhooks de Stripe y Monei verifican firma. `bridge-agent` valida token contra BD.
- Correduría: las ~180 rutas de `/api/correduria/**` pasan por `exigirCorreduria()`. PII con AES-256-GCM e índice
  ciego HMAC.
- Tests: `pnpm test` 1919 pass / 0 fail; tsc de las 13 apps 0 errores; `vercel.json` 13/13 con `ignoreCommand`.
- Cero escrituras en la BD por la auditoría de solo lectura, salvo la migración `20261102_auditoria.sql`, aplicada.
