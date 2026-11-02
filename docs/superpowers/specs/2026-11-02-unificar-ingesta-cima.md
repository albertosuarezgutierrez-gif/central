# Ingesta CIMA: CRM → central. Revisión adversarial del plan (02/11/2026)

Solo lectura. Lo he comprobado contra el código (`/home/user/asegura` y `/home/user/central`) y contra la BD `wswbehlcuxqxyinousql` (SELECT).

## Veredicto: VIABLE CON CAMBIOS

Las fases 0-1 valen tal como están. **Las fases 2 a 4 están mal planteadas en tres puntos**, y cualquiera de los tres basta para perder o corromper datos si se ejecuta tal cual:
1. «Reescribir las piezas de BD sobre Prisma» subestima el trabajo y es la fuente principal de riesgo: las tablas no están modeladas, hay upserts sobre índices parciales y transacciones largas.
2. La «sombra en paralelo con el CRM» casi no mide nada, porque el registro de ficheros (`cima_ficheros`) es compartido.
3. No hay ningún candado entre escritores, y ya hoy coinciden dos pulls a la vez.

---

## 1. Semántica TIREA/WSE (verificado en el código)

- **Orden real por fichero** (`ingest-pipeline.ts`, `processFichero` y las ramas POL/SIN/REC/CEF):
  hash → copia preventiva del crudo (`cima_cuarentena_crudo`) y cobertura → dedup → mapper → persistencia **por objeto** (una transacción por póliza, siniestro o recibo, que hace commit por separado) → `confirmarDescarga` → **ledger (`cima_ficheros`) DESPUÉS del confirm** (`recordFicheroLedger(... ackOk)`).
  El confirm va detrás del commit de los objetos, pero el ledger del fichero va detrás del confirm.
- **Si falla a mitad:**
  - Si la función muere antes del confirm, hay objetos ya guardados y el fichero no está confirmado. El siguiente pull lo vuelve a bajar y lo reprocesa; es idempotente por los índices únicos (`uq_polizas_correduria_id_poliza_entidad`, `uq_poliza_recibos_correduria_id_recibo`, `uq_siniestros_correduria_id_siniestro_entidad`, `uq_cuenta_efectivo_*`, `uq_ops_source_event`).
  - Si muere entre el confirm y el ledger, el fichero queda confirmado sin fila en el ledger. Hay crudo y hay objetos, pero `isSeenNombre` no lo ve. Esto existe hoy y no lo introduce el port.
  - Un 0/N persistido no se confirma nunca: el fichero se queda en la cola y lo recoge el reconcile.
- **Idempotencia por fichero:** `uq_cima_ficheros_nombre` (`nombre_fichero`) más `uq_cima_ficheros_xml_hash` parcial. Hay dedup dentro de la misma corrida (`seenHashesInRun`) y un pre-filtro por nombre (`isSeenNombre`) en la ruta.
  **No hay candado de concurrencia.** El `concurrency.group` de Actions solo serializa Actions; el respaldo de plataforma llama a la misma URL por su cuenta.
  Medido en la BD: **14 pares de `cima_pull_started` separados menos de 320 s en 60 días**. Daño visible hasta hoy: 0 (`cima_fichero_duplicate_replay` = 0, `cima_confirmacion_ack_fallida` = 0), pero la ventana existe.
- **Descargar sin confirmar NO consume** (ADR-024 AC#1, comprobado en producción dos veces). El fichero vuelve en el siguiente `recibirFicherosPendientes`. Un modo sombra que no confirma es seguro frente a TIREA.
  - ⚠️ Hay una contradicción documental: ADR-024 dice que el confirm consume, y LOO-700 (comentario de la ruta y de `processFichero`) dice que la cola vuelve a entregar ficheros ya confirmados («~78 fijo»). La regla de la skill, «confirmar = perdido para siempre», es la hipótesis conservadora, no un hecho medido.
  - **La caducidad de un fichero no confirmado en TIREA no está documentada en ningún sitio.** Por eso no puede haber días sin un escritor real.
- `ingerir-manual` no confirma; `reprocesar-cuarentena` sí confirma (`sinConfirmarTirea`). Hay que portar los dos con su test de guarda.

## 2. Paridad de PII: DESCARTADO como diferencia de algoritmo, NO demostrado en valores

- `field-encryption.ts` del CRM y el de `packages/module-seguros-pii` son **idénticos línea a línea** (`diff` vacío): AES-256-GCM, misma variable `PII_ENCRYPTION_KEY`.
- `blind-index.ts`: el mismo HMAC, la misma variable `PII_LOOKUP_KEY` y la misma normalización de email, teléfono y DNI. Central solo **añade** `partesEmail`, `computeEmail{Usuario,Dominio}LookupHash`.
  Consecuencia funcional: hoy el CRM da de alta clientes sin `email_usuario_hash`/`email_dominio_hash`, y la búsqueda parcial de central no los encuentra hasta que pase `backfill-contacto`. El port lo arregla si la creación de clientes usa la versión de central.
- Que los VALORES de las claves coincidan entre los dos proyectos Vercel no lo puedo afirmar sin leerlos.
  - Indicio débil: 19.720 clientes con DNI cifrado `v1:` y **0 grupos** con mismo nombre + apellidos + fecha de nacimiento y hashes de DNI distintos.
  - Esto no es prueba. Hace falta el **cepo de fase 0**: un canario que, con las claves de central-asegura, descifre N `clientes.dni` escritos por el CRM y compruebe que `computeDniLookupHash(descifrado) == dni_lookup_hash`. Debe ir con un brazo que falle con una clave alterada.
  - Sin ese canario en verde no se pasa a la fase 3: el crudo cifrado de la cuarentena también depende de la misma clave.

## 3. Drift de esquema (BD real frente a `apps/asegura/prisma/asegura.prisma`)

Los modelos de `seguros` están en **`asegura.prisma`**; `schema.prisma` solo tiene `Cuenta`. La cabecera de `asegura.prisma` todavía dice «ASEGURA-prod-eu vía ASEGURA_DATABASE_URL», y está desfasada: `asegura-url.ts` fuerza `DATABASE_URL` más `schema=seguros`.

**Tablas que escribe la ingesta y que NO tienen modelo Prisma** (9):
`cima_ficheros`, `cima_cuarentena_crudo`, `cima_cobertura_campos`, `operational_events`, `siniestro_contrarios`, `siniestro_lesionados`, `siniestro_testigos`, `liquidacion_movimientos`, y `liquidaciones` solo en parte.

**Columnas que hay en la BD y faltan en Prisma** (las escribe o depende de ellas la ingesta):
- `polizas`: `baja_cima_at`, `baja_estado_cima`, `baja_estado_previo`, `baja_motivo`, `baja_verificada_at`, `baja_verificada_por`, `anulacion_confirmada_{at,motivo,por}`, `anulacion_efecto`.
  El trigger `poliza_respeta_baja_verificada` depende de ellas.
- `siniestros`: `cima_extra` (el CRM la escribe por SQL crudo vía `columna-opcional.ts`), `resultado`, `resultado_at`, `resultado_motivo`.
- `cuenta_efectivo`: `origen` (enum `cef_origen`, NOT NULL, por defecto `'cima'`), `updated_at`.
- `liquidaciones`: `datos_extra`, `estado_liquidacion` (enum `liquidacion_estado`).

**Enums que faltan en Prisma:** `cima_fichero_estado` (confirmed, deferred, error, pending, persisted, review, review_salud), `cef_origen`, `liquidacion_estado`.
Fuera de alcance pero real: `portal_bien_tipo` en Prisma = {otro, vehiculo, vivienda} frente a la BD = {empresa, local, mascota, persona, vehiculo, vivienda}. Leer «mascota» con Prisma revienta, y escribir «otro» falla. (CORREGIDO 02/11 en asegura.prisma + cepo regression-enums-seguros-bd)

**Upserts sobre índices ÚNICOS PARCIALES** (`... WHERE id_* IS NOT NULL`, `NULLS NOT DISTINCT` en cobertura): Prisma `upsert` no puede apuntarlos. El CRM los usa con `onConflictDoUpdate({targetWhere})` y con merges SQL (`greatest(purgar_en)`, `coalesce(excluded, col)`, `jsonb_agg distinct on` en `persist-siniestro`). En Prisma todo eso sería `$executeRaw` escrito a mano, es decir, la reescritura completa de unas ~4.000 líneas (pull-persist, pull-deps, persist-*) con el mayor riesgo semántico.

**Lo que no es drift:**
- Triggers (`set_updated_at`, `polizas_recompute_segmento`, `poliza_respeta_baja_verificada`, `recibo_enlaza/respeta_devolucion`, `portal_vinculo_retira_correo`): **ninguno depende del rol** (sin `current_user`/`current_setting`).
- Grants: `prisma_seguros` tiene INSERT, UPDATE y DELETE en las 16 tablas, igual que `crm_seguros`. Los dos tienen BYPASSRLS y `search_path=seguros` a nivel de rol, así que los nombres sin schema del CRM (y `to_regclass` en `columna-opcional`) resuelven igual con `prisma_seguros`.

**Otros a vigilar:**
- `uq_clientes_email_lookup_hash` y `uq_cima_ficheros_nombre` son **GLOBALES**, no por correduría. Es una restricción multi-tenant heredada; hoy hay una sola correduría y no es un bug ahora.
- Las transacciones interactivas de Prisma tienen `timeout` de 5 s por defecto, con un pool de 3 en el pooler 6543 y una BD de 60 conexiones con ~40 ocupadas en reposo.

## 4. Efectos laterales que el plan no cubre

- **Eventos que central lee** (nombre Y claves del payload; si cambia cualquiera, el vigía se queda mudo sin dar error):
  - `cima_pull_started`, `cima_pull_completed` (payload `processed`, `durationMs`, `mode`, `reconcile`), `cima_pull_failed`, `cima_reconcile_resumen`.
  - `cima_poliza_persisted`, `cima_recibo_persisted`, `cima_siniestro_persisted`, `cima_cef_persisted`.
  - `cima_siniestro_sin_poliza_review` y `cima_recibo_sin_poliza_review` (`idPolizaEntidad`, `codigoEntidad`, `nombreFichero`, `idRecibo`, `idSiniestroEntidad`, `primaTotal`).
  - `cima_fichero_persistido_parcial` (`nombreFichero`, `tipoObjeto`, `stateTo`), `cima_residuo_resuelto_manual` (`ficheroId`).
  - `*_invalid_payload`/`*_rejected` (columna `source`), `cima_siniestro_actualizado` (lo usa `persist-siniestro` para ordenar), `cima_sincro_resumen`.
  - Consumidores: `apps/asegura/lib/ingesta.ts:211-356,700-772`, `apps/plataforma/app/api/cron/cima-pull-respaldo` (`decidirRespaldoPull` mira `ultimoPull`).
  - **Regla: emitir los mismos `event_name` y `source_event_id`.** Un `source_event_id` distinto rompe el dedup `uq_ops_source_event` y duplica avisos.
- **Respaldo de plataforma:** apunta a `ASEGURA_CRM_CIMA_PULL_URL || app.grupoasegura.com`, con Bearer `ASEGURA_CRM_CRON_SECRET`. En el corte hay que cambiar esas dos variables, no el código. Si se olvida, plataforma sigue disparando el pull del CRM aunque el cron del CRM esté apagado. **Ese es el segundo escritor que el plan no ve.**
- **Medido: Actions NO corre a su hora.** En 30 días hay 0 arranques a las 05-06 UTC y el reconcile «de las 06:00» arranca hacia las 12:56. Lo que de verdad sostiene la ingesta son las franjas de plataforma (09, 14 y 18 h: 34, 36 y 31 arranques).
- **Cuarentena y crudo:** `copiaPreventivaDeCrudo`, `promoverCrudoAIncidencia` y `CRUDO_RETENCION_DIAS = 6*366` hay que portarlos con su política de `purgar_en`. `reprocesar-cuarentena` (06:30) y `rescate-lote`/`rescate-manual` leen ese crudo y lo descifran con `PII_ENCRYPTION_KEY`.
- **Cobertura de campos:** `medirYRegistrarCobertura`, `cobertura-motivos` y `excluido_motivo` (0106). Si no se portan, `cima_cobertura_campos` deja de crecer sin que nada falle.
- **Alertas:**
  - El CRM avisa por `lib/telegram/alertas` y por el workflow `cima-health-alert` (10:00), que lee `/api/internal/cima/health` **del CRM**.
  - Plataforma ya avisa por `correduria.cima-respaldo`, `correduria.cima-siniestros-corte` y el vigía `correduria_ingesta`.
  - En el corte hay que decidir UNA sola fuente: o se apaga `cima-health-alert` o se repunta. Si no, habrá avisos dobles o falsos «pull mudo».
- PostHog (`cima_pull_*`): no portar; la fuente de verdad es `operational_events`.

## 5. Coste y límites

- Duración real: **media 54 s, p95 71 s, máximo 156 s** (178 corridas en 30 días, 54 ficheros procesados en total).
  Vercel a 300 s da margen de sobra; no hacen falta 800 s ni Fly. Se mantiene el `FETCH_BUDGET_MS=220_000` y el `batchSize` acotado.
- Memoria: lotes de ≤50 ficheros XML; no es un problema medido.
- **Actions: sacar el disparo de Actions, sin más.** Dispararlo desde `cron-dispatch` de plataforma (Vercel), que ya es quien sostiene la ingesta, o con un cron de Vercel en apps/asegura.
  Ojo: el dispatch «corta a los 280 s». Hay que verificar que cortar al cliente no mata la función de destino; si la mata, el pull debe dispararse sin esperar la respuesta.
- Fly: sin cambios. Hay que dar a `central-asegura` las variables `CIMA_ADAPTER_URL`, `CIMA_ADAPTER_INTERNAL_TOKEN`, `CIMA_ADAPTER_TIMEOUT_MS` y `CIMA_CODIGO_PLATAFORMA`. Comprobar si el adaptador filtra por IP u origen (no estaba en local, así que no lo he verificado).
- Conexiones: un pull de hasta 300 s que retiene conexiones en una BD de 60 con ~40 ocupadas. Usar una conexión dedicada (`connection_limit` 1-2 para la ingesta), no el pool de las pantallas.

## 6. Qué portar y qué no

**Puro, se copia con sus tests** (`src/lib/integrations/cima/` → `packages/module-cima/src/`):
`ingest-pipeline`, `eiac-{pol,sin,rec,cef}-mapper`, `eiac-sin-tramitacion` (test), `{poliza,recibo,siniestro,cef}-matching`, `wse-schemas`, `codigo-entidad`, `figuras-cima`, `figuras-cima-pii` (usa cripto → `@central/module-seguros-pii`), `cima-extra`, `cima-extra-denegados`, `field-coverage`, `cobertura-motivos` (separar la parte de BD), `pii-sanitizer`, `fichero-resuelto`, `quarantine-recovery`, `manual-xml`, `ingerir-manual-opts`, `ingest-flag`, `pull-config`, `config`, `client` (cliente HTTP del adaptador), `anti-duplicados` (test), `__fixtures__/`.
Dependencias del CRM a sustituir: `@/lib/crypto/field-encryption` y `@/lib/clientes/blind-index` → `@central/module-seguros-pii` (equivalentes); `@/lib/clientes/pii`, `@/lib/polizas/datos-especificos-pii`, `@/lib/geo/provincia-por-cp` (→ `core-catastro`/`module-seguros` si existe), `@/lib/polizas/labels`, `@/lib/observability/safe-log`, `@/lib/ops/events` (nombres de evento: **copiar literal**).

**BD** (`pull-deps`, `pull-persist`, `persist-{recibo,siniestro,cef}`, `pull-audit`, `columna-opcional`, `health-snapshot` solo si se usa) → `packages/module-cima/src/db/`.
PROPUESTA (opinión de diseño, no hecho): **portarlos con Drizzle y postgres-js tal como están**, más un `drizzle-schema.ts` recortado solo a las tablas de la ingesta, y conectar como `prisma_seguros` (mismo `search_path`). Es preferible a reescribir en Prisma: conserva byte a byte los `onConflict ... targetWhere`, los merges y las transacciones. A cambio cuesta un segundo ORM solo en ese paquete, y un cepo que compare las columnas del schema Drizzle recortado con `information_schema`.

**Rutas** → `apps/asegura/app/api/cron/cima-pull/route.ts`, `api/operador/cima/{reprocesar-cuarentena,ingerir-manual,quarantine}` (con `auditado()` y `exigirCorreduriaId`/`CIMA_INGESTA_CORREDURIA_ID`).

**NO portar:** `cima-dni-backfill` (puntual; comprobar antes que no está programado), `health-snapshot` y la página `/salud-cima` (central ya tiene `apps/asegura/lib/ingesta.ts`), PostHog, los 63 page.tsx, cotizador, WhatsApp, Linear, Slack, e2e Playwright y el adaptador Java.

---

## Riesgos, severidad y cómo se cubre cada uno

| # | Riesgo | Sev. | Cobertura |
|---|---|---|---|
| R1 | Dos escritores a la vez: CRM y central, o respaldo y Actions. Doble persistencia o doble confirm, y en el peor caso un confirm de un escritor sobre un fichero que el otro dejó a medias | **Crítica** | Lease en BD (fila `cima_pull_lease` con `UPDATE … WHERE expira_at < now() RETURNING`; un advisory lock de sesión no sirve en el pooler 6543) que comprueben LOS DOS endpoints. Se despliega primero en el CRM (fase 0). Test: dos invocaciones a la vez → la segunda devuelve `skipped_lease`. Cepo rojo quitando la comprobación |
| R2 | Confirm adelantado o fuera de sitio en el port | **Crítica** | Copiar `ingest-pipeline.ts` sin cambiar la lógica, más el test `ingest-pipeline-sin-confirmar` y uno nuevo: «un `confirmarDescarga` jamás precede al commit del último objeto persistido» (fake de deps que registra el orden). Romperlo (mover el confirm) y verlo en rojo |
| R3 | Claves PII con valores distintos entre proyectos | **Crítica** | Canario de la fase 0 (descifrar más recalcular hash sobre filas del CRM). Sin él en verde, la fase 3 no arranca |
| R4 | Drift Prisma/Drizzle/BD (9 tablas sin modelo, 15 columnas, 3 enums) | Alta | Cepo `information_schema` ↔ schema recortado en CI (`pnpm test:guardia`), con un brazo por tabla. Añadir a Prisma las columnas y enums que lean las pantallas |
| R5 | Sombra que no mide nada (ledger compartido; ~2 ficheros al día) | Alta | Sustituir la sombra en vivo por una REPETICIÓN desde `cima_cuarentena_crudo` (235 ficheros desde el 17/09) en una rama de Supabase (`create_branch`) o en un schema copia, con confirm simulado. Se ejecutan CRM y central en modo real sobre copias idénticas y se comparan las filas (diff por tabla y por clave natural) |
| R6 | Eventos con otro nombre, payload o `source_event_id` → vigía mudo | Alta | Test de contrato: la lista de `event_name` y claves del payload que leen `ingesta.ts`/respaldo coincide con lo que emite el pipeline. Diff de `operational_events` en la repetición de R5 |
| R7 | El respaldo de plataforma sigue llamando al CRM tras el corte | Alta | Lista de pasos del corte: cambiar `ASEGURA_CRM_CIMA_PULL_URL` y el secreto; el lease (R1) lo convierte en inofensivo si se olvida |
| R8 | Caducidad desconocida de los ficheros no confirmados en TIREA | Media | Nunca 0 escritores reales; el corte es un único cambio reversible en minutos |
| R9 | Agotar conexiones o el `timeout` de las transacciones Prisma | Media | Cliente dedicado a la ingesta con `connection_limit` pequeño; si se queda Drizzle, `postgres({max:2, prepare:false})` |
| R10 | Muerte entre el confirm y el ledger (existe hoy) | Baja | Se hereda; opcional: escribir el ledger como `persisted` antes del confirm y actualizarlo después. **No meterlo en el port**: es un cambio de semántica y va en un PR aparte |
| R11 | Avisos dobles o falsos (`cima-health-alert` del CRM más el vigía de plataforma) | Baja | Apagar `cima-health-alert` en el corte; el vigía de plataforma ya cubre |

## Plan corregido

**Fase 0 — Preparar, sin tocar la ingesta**
- Medir el uso humano del CRM y obtener el OK de Alberto para reabrir el port (hoy APARCADO).
- Congelar los cambios de schema en el CRM.
- **Lease de concurrencia desplegado en el CRM** (R1); el respaldo pasa a respetarlo.
- Canario de claves PII (R3).
- Cepo de drift en `information_schema` (R4).

Salida: lease en producción ≥7 días con `skipped_lease` observado o forzado; canario verde, con su brazo rojo visto; cepo de drift verde.
Vuelta atrás: quitar el lease (un commit del CRM).

**Fase 1 — `packages/module-cima` puro**
- Copiar el código puro y los tests (adaptados al runner de central).
- Sustituir la cripto por `module-seguros-pii` y copiar los nombres de evento literalmente.
- Test de orden del confirm (R2) y test de contrato de eventos (R6).

Salida: CI verde; los tests R2 y R6 vistos en rojo una vez.
Vuelta atrás: borrar el paquete.

**Fase 2 — Capa de BD**
- Portar `pull-deps`, `pull-persist`, `persist-*` y `columna-opcional` (Drizzle propuesto, o `$executeRaw` si Alberto prefiere un solo ORM), con conexión dedicada (R9).

Salida: repetición de R5 en la rama de Supabase con ≥235 ficheros. Diff de filas = 0 en las 16 tablas (excluidos `id`, `created_at`, `updated_at` e IV de cifrado; se comparan valores descifrados o hashes ciegos). Diff de `operational_events` (nombre + `source_event_id` + claves del payload) = 0.
Vuelta atrás: no hay nada en producción.

**Fase 3 — Endpoint en central, en sombra corta**
- `apps/asegura/app/api/cron/cima-pull` con `dryRun` **fijado en el código**, sin variable de entorno que pase a real; se cambia en el PR de la fase 4.
- Disparado desde `cron-dispatch` y protegido por el lease.
- Objetivo: comprobar conectividad con Fly, autenticación, tiempos y pool, no paridad (la paridad es la fase 2).

Salida: ≥5 días con `cima_pull_completed` de central (con `mode=dry_run` distinguible y sin escritura en `cima_ficheros`), p95 < 150 s, 0 errores de pool.
Vuelta atrás: quitar la entrada de `cron-dispatch`.

**Fase 4 — Corte (un solo PR más dos variables de entorno, en franja sin pull)**
1. Desactivar `cima-pull.yml` del CRM.
2. PR: central en modo real.
3. Cambiar `ASEGURA_CRM_CIMA_PULL_URL` y el secreto en plataforma hacia central.
4. Apagar `cima-health-alert`.

Salida: 7 días con un `cima_pull_completed` por franja, 0 `cima_confirmacion_ack_fallida`, contraste del export «Ficheros recibidos» del Portal CIMA frente a `cima_ficheros` sin huecos, y cuarentena sin crecimiento anómalo.
Vuelta atrás (minutos): revertir las variables de plataforma y reactivar el workflow del CRM. El lease impide la ventana con dos escritores; `crm_seguros` sigue vivo.

**Fase 5 — Resto y retirada**
- Reprocesar la cuarentena, `rescate-lote`/`rescate-manual` (con su guarda de confirm), y el webhook de Codeoscopic (cambio de URL, pendiente del vendor).
- Tras 2-4 semanas estables: revocar `crm_seguros`, archivar el repo y pausar (no borrar) el proyecto Vercel `asegura`.

Salida: un rescate de prueba sobre el crudo en la rama de Supabase con el mismo resultado que en el CRM.
Vuelta atrás: reactivar `crm_seguros` (revocar es reversible si no se borra el rol).

## Añadidos al plan (02/11/2026, revisados con Alberto)
- **Credenciales CIMA/TIREA: NO se tocan** (decisión de Alberto). Viven en el adaptador Java de Fly; central lo llamará igual que el CRM (`x-internal-token`, mismo valor copiado a central). Confirmar en el código del adaptador antes del corte.
- **Interruptor sin despliegue:** variable `CIMA_ESCRITOR=crm|central|ninguno` en ambos lados; el rollback es cambiarla.
- **Vigía de doble escritor:** cima-guardia alerta si el mismo día escriben los dos orígenes o salta el candado.
- **Backup antes del corte:** confirmar PITR de Supabase + volcado de `cima_*`, `polizas`, `poliza_recibos`, `siniestros`.
- **Ensayar el rollback** durante la sombra (apagar/reactivar el cron del CRM una vez).
- **Ventana de corte:** laborable por la mañana, fuera de fin de mes/renovaciones, Alberto disponible; nunca junto al cambio de URL del webhook de Codeoscopic.
- **Cierre de seguridad tras el corte:** `crm_seguros` NOLOGIN, borrar secretos del proyecto Vercel `asegura`, migrar `app_user` a su `prisma_*`.
- **Originales:** verificar que cada fichero recibido sigue copiándose a la carpeta «CIMA» de Drive.
- **Congelar el CRM** (solo el candado) durante la migración; al terminar, actualizar la skill `cima-ingesta` y `apps/asegura/CLAUDE.md`.
