# 🧠 Memoria de sesiones — central (repo GitHub: ia.rest → renombrar)

> Contexto persistente entre sesiones de Claude Code. El entorno cloud es
> **efímero** (el contenedor se borra al acabar), así que lo único que sobrevive
> es lo commiteado aquí. Este archivo es el "estado vivo" del proyecto entre sesiones.
>
> **Cómo se mantiene:** al terminar cada sesión, Claude añade una entrada nueva
> arriba del todo y actualiza el estado si algo cambió. Un hook `Stop`
> (`.claude/hooks/persist-memoria.sh`) commitea y empuja este archivo automáticamente.
>
> **🚨 Regla de tamaño (ahorro de contexto):** cada entrada, **máximo ~8 líneas**:
> qué se hizo, decisiones, pendientes y nº de PR. El detalle ya vive en el PR y en
> el código — NO re-narrarlo aquí. Fecha SIEMPRE en la primera línea `(dd/mm/aaaa)`.

## (02/11/2026) CIMA fase 4 MERGEADA (#5407): sombra de solo lectura
- `packages/module-cima/src/sombra/` + `scripts/cima-sombra.mts` + workflow manual `cima-sombra.yml`: repite los crudos del CRM por el pipeline de central con escrituras GRABADAS (nunca ejecutadas), transacción READ ONLY, aborta si `CIMA_ESCRITOR=central`; informe con lista BLANCA de columnas + seudónimos HMAC (revisión adversarial: sin escritura ni TIREA; PII corregida).
- Para ejecutarla faltan secretos (decide Alberto): `CIMA_SOMBRA_DATABASE_URL` (rol solo lectura) y las claves PII de producción. Recomendado: NO en GitHub; correrla una vez desde una sesión con variables temporales y rotar después.
- Migración de limpieza aprobada en `migrations/20261102_archivar_respaldos_purgar_eventos.sql` (+rollback): SIN APLICAR (el MCP exige confirmación interactiva; 3 intentos caducados). Aplicar desde el SQL Editor o con Alberto delante.
- Siguiente: fase 5 (corte con `CIMA_ESCRITOR`) solo tras una sombra limpia.

## (02/11/2026) CIMA fase 3 MERGEADA (#5403) + vista corredor (#5401)
- `packages/module-cima` ya tiene capa BD (Drizzle, 18 tablas `seguros`) y red inyectadas; 1047 tests; golden de escrituras SQL = CRM. Nada lo importa aún.
- Cepos: sin `CIMA_ESCRITOR=central` no confirma/envía a TIREA ni escribe; credenciales CIMA BLOQUEADAS siempre en central; falla sin `PII_ENCRYPTION_KEY`/`PII_LOOKUP_KEY`.
- Fase 4 (sombra): la ruta debe mirar `CIMA_ESCRITOR` ANTES del candado; separar eventos `cima_pull_*` de central con otro `source`.
- #5401: asegura-portal, una identidad por apertura de vista de corredor (sin DDL).
- Pendiente OK de Alberto: mover 5 tablas `_backup_*`/`_csv_staging` a schema `archivo` + borrar 21 `seguros.operational_events` >180 d (el MCP pidió confirmación y caducó). `app_user`: sin sesiones ni logs 24 h; propuesta NOLOGIN (reversible).

## (02/11/2026) Auditoría lote 2 PR #5398 MERGEADO
- Hecho: vista de corredor con `usadoEn` atómico; `/api/acceso/solicitar` valida email; asegura-portal sin `devFallback`; bajas campana/recaptacion GET=botón, POST=ejecuta; ruta `subastas/fase3-debug` retirada; helper `secretoCoincide`/`autorizacionBearerValida` (core-identity, apto edge) en 10 crons plataforma, 5 rrhh, transporte, sivra y middleware (`?secret=` se mantiene, ahora en tiempo constante).
- Cepos: asegura-aislamiento reescrito (SQL sobre `seguros` con correduria_id o `correduriaUnica()`); nuevo rrhh `empresa_id`. Hook Stop timeout 30; `persist-memoria.sh` no empuja en main. ialimp `fetchSeguro` (SSRF); ia-rest `renderMd` escapa.
- Pendiente: identidad compartida `IDENTIDAD_CORREDOR_ID` (BD); tabla `subastas_debug_token` y `lib/subastas/portal-sesion.ts` sin uso; sivra `expenses/fijos/generar` y transporte `?key=`; comparaciones en asegura*/ialimp; `nombreEmpleado` sin filtro empresa en rrhh `notificar.ts`. Detalle: `docs/AUDITORIA-2026-11.md` §3.

## (02/11/2026) PR #5396 MERGEADO · `@central/module-cima` fase 2 (lógica pura)
- Port literal del CRM (`packages/module-cima`): parsers/mappers POL/REC/SIN/CEF, matching, cobertura, pipeline `runCimaPull` con deps inyectadas, `pull-puro.ts`; 751 tests, equivalencia golden con el CRM. Aún nada lo importa: la ingesta en producción sigue en el CRM.
- Siguiente: fase 3 capa BD Drizzle + persist/pull/candado; fase 4 sombra (replay 235 crudos en rama Supabase); fase 5 corte con interruptor `CIMA_ESCRITOR`.
- Ojo: `field-encryption` sin `PII_ENCRYPTION_KEY` fuera de production guarda EN CLARO (heredado del CRM).
## (02/11/2026) Pendiente de despliegue: edge functions de ia-rest (PR #5391 abierto, NO mergear antes)
- Hecho hoy: #5389 (enum portal_bien_tipo + CI Prisma), candado de ingesta CIMA en prod (tabla `seguros.ingesta_candado` creada; CRM `asegura` #894 mergeado), spec CIMA con añadidos (credenciales TIREA NO se tocan).
- BLOQUEO: la herramienta MCP no fija valores de secretos de Edge Functions. Alberto elige vía PERMANENTE: añadir `SUPABASE_ACCESS_TOKEN` como secreto del entorno cloud → la PRÓXIMA sesión lo hace con `npx supabase secrets set`.
- Orden obligatorio (si no, los crons alerta-ritmo/infra-monitor/eventos-entorno dan 401): 1) secretos EDGE_CRON_SECRET, TG_SEND_SECRET, IA_TRAINING_DASHBOARD_PIN (+INTERNAL_API_SECRET si falta) en Edge Functions; `edge_cron_secret` en el Vault (=EDGE_CRON_SECRET); TG_SEND_SECRET en Vercel ia-rest. 2) `migrations/20261102_crons_edge_secret.sql`. 3) desplegar las 12 funciones (+ `_shared/auth-interna.ts`). 4) verificar 200 en crons y 401 sin credencial. 5) mergear #5391.


## (02/11/2026) #5385 MERGEADO · arranca la unificación de la ingesta CIMA en central
- Auditoría completa mergeada (#5385). CRM `asegura` (app.grupoasegura.com): sin uso humano (Alberto: «Manuel no usa nada»); solo vive la ingesta CIMA.
- Decisión: NO mover el CRM entero; portar solo la ingesta (capa BD con Drizzle tal cual) y apagar el resto. Spec validada: `docs/superpowers/specs/2026-11-02-unificar-ingesta-cima.md` (+ `-fase0.md`).
- Riesgos clave: hoy ya hay 2 escritores (Actions del CRM + respaldo de plataforma) sin candado → fase 1 = candado en BD; confirmar a TIREA es irreversible; sombra = reprocesar los 235 crudos en rama Supabase.
- En curso: candado de ingesta (CRM + central) y bug enum `portal_bien_tipo` (Prisma ≠ BD, «mascota» rompe la lectura).

## (02/11/2026) Auditoría completa (12 agentes) + arreglos — docs/AUDITORIA-2026-11.md
- 🔴 cerrados: 11 server actions de /correduria sin guarda (cotización 0,50€); ia-rest con sesión forjable (x-ia-session, super/impersonate, seleccionar-restaurante); sivra/ialimp rutas sin auth; crons «Bearer undefined»; BD: `iarest.ejecutar_qa_patron` = SQL libre como postgres con la clave anon → REVOKE en 73 SECURITY DEFINER (migración APLICADA `migrations/20261102_auditoria.sql`, rollback al lado).
- Tope Codeoscopic con advisory lock; Next 15.5.28/16.4.4 (0 critical); ialimp solo cron `pms/sync` (ahora con Bearer); module-agenda borrado.
- Memoria rotada (rotar-memoria no veía `## (fecha)`): sept/oct a docs/memoria. 10 rutinas muertas borradas, 11 PRs draft cerrados.
- Proyecto Vercel `asegura` NO se borra: sirve app.grupoasegura.com (CRM de Manuel).
- Pendiente: checklist manual de Alberto en el informe (rotar ALERTA_TOKEN de 7 prompts, 5 rutinas http_api, edge functions sin auth: tg-send/test-runner/push-send/cobro-*).

## (02/11/2026) Ingresos 2026 pisos: neto real fijado · PENDIENTE cuadre Smoobu
- `incomes.amount_net_bank` (PR #5370, aplicado): si no es NULL el trigger NO recalcula comisión. Fijado en 151 Booking (Σ 82.413,08€, casando abonos banco con salidas: Duplex→BBVA …1175, resto→Kutxa …0855) + 2 Airbnb (990,37 / 524,60). Para corregir una fila: escribir `amount_net_bank`, no `amount`.
- Gastos: +30 gastos de cargos sin gasto (2.963,33€, `revisado=false`), PriceLabs a USD, 2 comisiones Booking descartadas. `expenses` obsoleta (todo está en `gastos`).
- PENDIENTE (siguiente sesión, requiere secreto `SMOOBU_API_KEY` en el entorno): cuadrar API Smoobu vs `incomes` 2026 (altas/bajas, canceladas, precio bruto vs `amount_gross`, fechas/piso) por mes y piso. Solo lectura.
- PENDIENTE Alberto: Expedia 3.398,50€ sin cobro (may–oct); CSV pagos Booking (15 reservas factor anómalo, 12 sin cobro, 36 abonos huérfanos); extractos tarjeta Kutxa …0300 (ago–oct, PSD2), N26 y BBVA …2620 (jul–oct), Pilar (cuenta jul–oct, tarjeta …0302 oct, Cajasur); Sique: 3 salidas oct sin facturar.

## (02/11/2026) Control 2026 pisos: expenses retirada · métrica «Gastos mes» sivra
- PR #5354 mergeado (lavandería redondeada). BD: 2025/421 → pagada (27/10); 2025/444 insertada en `limpieza_facturas`.
- `expenses` (34 filas, congelada 27/04) está 100 % en `gastos`; duplicados AFV NO borrados (inútil). `lib/adapters/sivra.ts` pasa a leer `gastos` (daba 0€ desde mayo) + guardián (visto en rojo).
- Hallazgo: luz/agua ene–abr con piso ROTADO entre tablas (Luxury/Duplex/Bustos); en auditoría `jefe-contabilidad` (scratchpad/anual/contabilidad). Sique 2026: 202 facturadas vs 204 salidas.

## (01/11/2026) Factura Sique Brilla octubre · cuadre por correo: lavandería redondeada
- La factura nº 2025/444 (octubre, 1.889,06€) llegó y el triaje la procesó, pero NO se guardó: lavandería venía «285 ud × 1,70 = 485,21» (kg redondeados) y `comprobarAritmetica` la marcaba.
- Arreglo en `lib/sivra/factura-cuadre.ts`: en lavandería se acepta si `round(total/precio) === unidades`; limpieza sigue estricta. Fixture octubre + brazo desviado (cepo visto en rojo).
- Cuadre real de octubre: Luxury 7 facturados vs 9 salidas, Duplex 8 vs 9, Socorro 6=6, Bustos 7=7 (faltan 3 cambios por facturar). Pendiente: tras mergear, reprocesar el correo para guardar la fila; Alberto revisa la discrepancia con Sique Brilla.

## (01/11/2026) Tarificador RPA · vehículo de referencia y presupuestos (#5321, #5326, #5332, #5337)
- Vehículo de referencia compartido por oportunidad: humano > Mapfre (matrícula) > póliza > Allianz; elección por similitud; si es supuesto → estimado. `presupuesto-rpa` se dispara con cualquier cierre (#5321).
- Generali 0.2.56 (elección a nivel modelo), 0.2.57 (procedencia por ramo: Mapfre→AUTOMOVILES), 0.2.58 (Historial Siniestral).
- Hogar en /probar desde póliza en vigor con supuestos (propietario, sin madera, UD→adosada) y número de calle ficha/Catastro/S-N. Adaptador Mapfre hogar listo pero APAGADO (`MAPFRE_HOGAR_ACTIVO=true` en el worker para la 1ª prueba).
- Decisión de Alberto: «coger el más similar, hay que dar precio y guardar presupuesto, ya iremos afinando»; regla «siniestralidad más favorable». El presupuesto NUNCA muestra «No figura»: hay que descargar el proyecto de la compañía con garantías (agente en curso para Mapfre auto).
- Presupuesto AS-26-0042 en borrador (Allianz+Mapfre auto), NO enviado.
- Pendiente: precio Generali, precio Allianz hogar, garantías Mapfre, fallo MEDIO en revisión (requiere_humano cuenta como cerrado → borrador prematuro), `probar` no vincula oportunidad en auto.

## (01/11/2026) Agente huésped: «ready before 15?» → compuerta de horarios · PR #5334 MERGEADO (`7d7c971`)
- Caso Elisa/Luxury Busto: la pregunta no traía verbo de llegada, quedó `general` y el juez LLM escaló con un falso «no está en la guía» (no ve el bloque EARLY CHECK-IN de Smoobu).
- `cambio-horario.ts`: nueva `RE_DISPONIBLE_ANTES` (EN/ES/IT, exige before/antes/prima) → `tipo:'entrada'`. Tests +2 (vistos en rojo).
- Pendiente: borrar `mensajes_guia_gaps` id 79 (hueco falso; el MCP pide confirmación que no llega desde el móvil: borrarlo a mano). Opcional: pasar la línea EARLY CHECK-IN al juez.

## (01/11/2026) Blog asegura-web · PR #5328 MERGEADO (mora art. 20 LCS)
- «No se pudo publicar» = `Tests (packages + guardián)` aún corriendo, no rojo. Graphify marcó error jurídico real.
- Corregido en `claude/blog-asegura` (`cae7a0c`): intereses de mora desde la FECHA DEL SINIESTRO (no día 41), mora también si no paga en 3 meses, sin contradicción «automática/reclamar». Cuerpo del PR actualizado (plataforma lee el artículo de ahí: `blog-pr.ts`).
- #5336: agente del blog blindado — síntesis lcs-18/20 exacta + cepo errorDeMora() (reparo `razonamiento`).
- #5328 MERGEADO (squash `8ea7844`) con CI verde, por orden de Alberto.
