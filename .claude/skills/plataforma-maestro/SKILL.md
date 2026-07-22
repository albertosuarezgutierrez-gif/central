---
name: plataforma-maestro
description: >
  Router de contexto de la vertical PLATAFORMA (cuadro de mando consolidado de la casa de
  marcas + god-panel de operador; jerarquía Cuenta → Sociedad → Negocio). NO duplica los docs:
  dice qué existe, dónde vive y qué NO romper antes de tocar nada. USAR SIEMPRE que Alberto
  pida cualquier cosa de plataforma: dashboard consolidado, god-panel `/admin`, adaptadores por
  vertical, resumen financiero cross-negocio, registro de cuentas, o el puerto HTTP a ia-rest.
  Sin secretos: solo nombres de variable.
---

# PLATAFORMA — router de contexto

> Esto es un **índice/puente**, no una copia. La fuente de verdad es
> `apps/plataforma/CLAUDE.md` y los diseños apuntados abajo. Si algo de aquí
> contradice al código, manda el código: corrige este router en el mismo commit.

## Antes de tocar nada (gate obligatorio)
1. Lee `apps/plataforma/CLAUDE.md` — qué es, BD, envs, estado y god-panel.
2. Identifica el objetivo: dashboard del dueño vs **god-panel `/admin`** (operador Alberto).
3. Toda query **scopeada por `cuenta_id`**. El god-panel se auto-protege en los handlers (`getAdmin`).
4. Si tocas datos de ia-rest: recuerda que **NO** se leen por Prisma sobre `iarest.*` (clon vacío)
   sino por **puerto HTTP** (`${IAREST_URL}/api/operador/*`, Bearer `OPERADOR_SHARED_SECRET`).

## Dónde vive cada cosa
| Tema | Fuente |
|---|---|
| Qué es, BD, envs, estado, reglas | `apps/plataforma/CLAUDE.md` |
| **Tema UI: CLARO por defecto, oscuro SOLO a mano** (PR #707, 03/07/2026) | `app/globals.css` (tokens; SIN `@media prefers-color-scheme` — el ahorro de batería del móvil oscurecía el panel solo; `:root` con `color-scheme: only light` veta además el auto-dark forzado de Chrome/Samsung) + `[data-theme="dark"]` manual (`ThemeToggle.tsx` binario ☀️/🌙, `localStorage('theme')`) + script anti-parpadeo en `app/layout.tsx`. ⚠️ NO reintroducir modo "auto" ni hex fijos mezclados con `var(--text)` en componentes. Detalle en `apps/plataforma/CLAUDE.md` |
| **Concursos / licitaciones** (agente, sección de usuario `🏛️ Concursos`, scope CUENTA) | Portado de ialimp (jun-2026). Páginas `app/(usuario)/concursos/*`, API `app/api/concursos/**`, módulo puro `@central/module-concursos`. **Buscador** sobre corpus compartido `concursos_licitaciones`; ingesta PLACSP en `lib/concursos-ingesta.ts` (cron `concursos-ingesta` 6 h + botón "⟳ Actualizar ahora"). **PLACSP da 403 fuera de Vercel** → la ingesta solo trae datos en preview/prod. **Provincia** = del **código postal del órgano** (`provinciaDeCP` del módulo; el feed solo trae ubicación en ~56% → filtro de zona **estricto**, el resto sale solo en "Toda España"). Shims `lib/{prisma,tenant,mailer}.ts`; IA por `aiComplete` (NVIDIA). **Emails** (avisos/cierre) requieren `SMTP_*`/`RESEND_API_KEY` en el Vercel de plataforma. Detalle en `apps/plataforma/CLAUDE.md` |
| **Personas a través de verticales** (god-panel, RR.HH., solo lectura) | `/operador/personas` + `lib/personas.ts`; consolida por `persona_id` (ialimp por prisma + rrhh por puerto `/api/operador/personas`), sugiere enlaces por DNI/email (`@central/core-identity`). Enlace MANUAL pendiente. Detalle en `apps/plataforma/CLAUDE.md` |
| **Concursos públicos / licitaciones** (movido desde ialimp el 19/06/2026, PR #403) | Sección usuario **🏛️ Concursos** (`/concursos`, sidebar *Mi negocio*). Scope = CUENTA (`lib/tenant.ts` shim). Corpus `concursos_licitaciones` GLOBAL. Consume `@central/module-concursos`. Crons: `concursos-ingesta`, `concursos-radar`, `concursos-avisos`, `concursos-cierre` (en `vercel.json`). **OJO PLACSP da 403 a IPs no-Vercel** → ingesta solo en preview/prod. **PENDIENTE env**: `SMTP_*`/`RESEND_API_KEY` en el proyecto Vercel plataforma para que salgan los emails. Detalle en `apps/plataforma/CLAUDE.md` |
| **Pasarela de IA central** (keys de proveedor solo aquí) | `/api/ai/{chat,search,vision,tools}` (Bearer `AI_GATEWAY_SECRET`) + `lib/ai-gateway.ts` (`verificarSecreto`/`registrarUso`/`dentroDePresupuesto`/`resumenIA`) + tabla `public.ai_usos`. Panel **god-panel → 🤖 IA · gasto** (`/operador/ia`). Las verticales (rrhh/ialimp/sivra/**ia-rest**) llaman con `gatewayChat`/`gatewaySearch`/`gatewayVision`/`gatewayTools` de `@central/core-ai`; conexión por envs Team-shared `AI_GATEWAY_URL`+`AI_GATEWAY_SECRET`. ia-rest 100% conectado el 16/06/2026 — las 4 vías (`callAI`/`callAISearch`/`callAIVision`/`callAITools`) pasan por la pasarela (`/api/ai/tools` = function-calling NIM con presupuesto+registro). **OpenRouter primario (09/07/2026, PR #794):** `aiComplete`/`aiTools` de `@central/core-ai` prueban **OpenRouter (si hay `OPENROUTER_API_KEY`) → NIM → Groq → Gemini → Kimi** (sin key, cadena gratis idéntica a antes). **Agente Director** (`lib/ia-director.ts` + tabla `ia_director_prompt`) elige modelo por petición con salida estructurada; **modo SOMBRA por defecto** (`DIRECTOR_MODO=activo` para enrutar de verdad). Meta-agente cron semanal `/api/cron/ia-director-refresh` (lunes 05:00) refresca catálogo/ranking y avisa por Telegram de créditos bajos. **Fiabilidad OpenRouter (PRs #828/#829, 11/07/2026):** incidente de "IA no disponible" intermitente (Reel IA daba 504) causado por `SUPLENTES_DEFAULT` con `:free`/modelo muerto y por el sufijo `:floor` (host más barato → proveedor rate-limited). Arreglado: suplentes de pago fiables (`llama-3.3-70b-instruct` + `deepseek-chat`), `:floor` pasa a **opt-in** (`DIRECTOR_USAR_FLOOR=true`, default OFF), y `lib/pasarela.ts` reintenta una vez con un modelo seguro de un solo tiro (`PASARELA_MODELO_SEGURO`, default `meta-llama/llama-3.3-70b-instruct`) antes de caer a la cadena clásica si OpenRouter da 429. Presupuesto diario también **por cliente** (`ai_usos.cliente_ref` + tabla `ia_presupuestos`, refacturación). Caché semántica pgvector opt-in (`ia_cache_semantica`). Detalle en `apps/plataforma/CLAUDE.md` y skill `buscador-ia`. |
| **Secretos · inventario + edición blindada** (god-panel → 🔑 Secretos, `/operador/secretos`) | MAPA de todas las credenciales (`lib/secrets-registry.ts` — metadatos, NUNCA valores). Claves `editable` (solo `api-externa`) se **sobrescriben en Vercel desde el panel**: `api/operador/secretos/set` (6 candados: `getAdmin` + 2º factor `loginAdmin` + allow-list `editable`+`vercelProject` + bloqueo `firma-sesion` + write-only + auditoría `secrets_audit`) → `lib/vercel-env.ts` (`upsertProjectEnv` write-only + `redeployProjectProduction` auto). Inerte sin `VERCEL_ADMIN_TOKEN`. **Para hacer gestionable una clave nueva: añadir su fila en `secrets-registry.ts` con `editable:true`+`vercelProject`** (el panel no crea nombres arbitrarios). 2º factor → TOTP es un PENDIENTE elegido. Fase 2 = #502/#503/#504 |
| **Correduría CIMA LIQ** (integración TIREA/CIMA WSE Estándar → liquidaciones de seguros → cruce BBVA → alerta Telegram) | Cron `cima-liq` (`30 7 * * *`) en `apps/plataforma/vercel.json`. Cliente SOAP: `lib/cima.ts` (`recibirFicherosPendientes` + `confirmarFicherosRecibidos`, parsea EIAC 6.0, base64 latin1, mapeo códigos CIMA → compañías). Handler: `app/api/cron/cima-liq/route.ts` (upsert `cima_liquidaciones` por `nombre_fichero`, cruce ±45d contra `movimientos_bancarios WHERE destino='seguros'`, Telegram `🟡` si \|diff\| > 5€). BD: tabla `cima_liquidaciones` + `idx_cima_liq_cuenta_periodo` (migración aplicada 24/06 en `wswbehlcuxqxyinousql`). Envs: `CIMA_WSE_USER`, `CIMA_WSE_PLATAFORMA`, `CIMA_WSE_PASSWORD`. PR #508. ⚠️ `SERPER_API_KEY` ausente en plataforma → `mercado/cron` mudo (añadir a Vercel plataforma) |
| **P&L mensual por piso turístico** (PR #611 mergeado 30/06/2026) | Cruza ingresos Smoobu con costes reales para calcular beneficio real por piso. `lib/sivra/pl-mensual.ts`: lógica de cálculo; usa `v_movimientos_activos` (deduplica); reparte El Giraldillo entre los 3 pisos Kutxa con fórmula `maxGuests × reservas_del_mes` (pesos mayo-2026: House Sevillana 62,7%, Luxury Busto 29,9%, Busto Reform 9,0%); Dúplex Center (BBVA) es independiente. Movimientos ya en `movimiento_reparto` se suman directo. Constante `LAVANDERIA_CONTRAPARTE = 'LAVANDERIA EL GIRANDILLO'`. Constante `KUTXA_PISOS = ['prop_house_sevillana', 'prop_busto_reform', 'prop_luxury_busto']`. Endpoint `GET /api/sivra/pl-mensual?mes=YYYY-MM`. UI `app/(usuario)/sivra/resultado-pisos/page.tsx`. **Gastos de tarjeta por piso (PR #638, 01/07/2026):** 5ª query en Promise.all suma `movimientos_bancarios` con `destino='turistico_pisos' AND propiedad_id IS NOT NULL AND destino_confirmado=true AND importe < 0` → se añaden a `mGastos[propiedad_id].otros` directamente (sin fórmula de reparto). `propiedad_id TEXT` = columna nueva en `movimientos_bancarios` (migración `2026-07-01_mov_propiedad_id.sql`). |
| **Import de tarjeta por PDF + cuadre tarjetas y justificantes en health-check** (PR #671 mergeado 02/07/2026) | `/api/banca/importar` acepta `.pdf` («Movimientos de tarjeta» de Kutxabank): `lib/extracto-tarjeta-pdf.ts` (parser puro + wrapper `pdf-parse` por subpath; `origen='pdf'`; `ccc` del PAN → `TARJETA-KUTXA-<últ.4>` casa con la cuenta existente y el `dedupe_hash` es idéntico al de Excel/manual → reimportar NO duplica; 4 tests `node --test`). `health-check` **Check 7 cuadre tarjetas**: liquidación `TARJ.CRDTO`/`PAGO DE TARJETA` en una corriente sin espejo `PAGO RECIBO` (mismo día/importe/PAN) en otra cuenta = falta el extracto de ese mes → 🔴 Telegram. **Check 8 justificantes**: últimos 10 días del trimestre, deducibles sin `conciliado`/`factura_ref` (sin amortizables/duplicados) → aviso con total y link a `/finanzas?tab=gastos`. Contexto: la tarjeta de Pilar (…650302, cuenta `💳 Tarjeta Kutxabank Pilar` ****0302) estuvo 6 meses sin detalle (~3.500€ invisibles) hasta el PDF del 02/07. |
| **Agente Telegram revisión movimientos tarjeta** (PR #638 mergeado 01/07/2026) | Tras importar Excel o PDF de tarjeta → `enviarResumenTarjeta()` en `lib/banca.ts` envía un Telegram por movimiento dudoso. **`lib/agente-movimientos.ts`**: `getMovimientosDudosos(cuentaBancariaIds,mes)` — hasta 15 movs con `requiere_revision=true` O (`destino='seguros'` AND no confirmado AND no BBVA), orden `abs(importe) DESC`. `sugerirDestinoConContexto(mov,movsMes)` — filtra contexto ±10d/>20€, llama `aiComplete([{role:'user',content}])`, devuelve `{destino,confianza,explicacion}`. `enviarMensajeDudoso(mov,sug)` — confianza≥0.8: `[✅ Sí,{label}] [✏️ Cambiar] [⏭️ Saltar]`; sino: `[✅ Pisos] [✅ Correduría] [❌ Personal] [⏭️ Saltar]`. `aprenderReglaMovimiento(cuentaId,concepto,destino)` — upsert `banca_destino_reglas` (clave = concepto limpio, max 40 chars). `PROP_LABELS = { prop_house_sevillana:'House Sevillana', prop_busto_reform:'Busto Reform', prop_luxury_busto:'Luxury Busto', prop_duplex_center:'Dúplex Center' }`. **Webhook Telegram** prefijo `mov_`: `mov_saltar`, `mov_cambiar`, `mov_confirmar_ia:<id>:<destino>` (si turistico_pisos → pide piso), `mov_pisos:<id>` (botones por piso), `mov_prop:<id>:<propId>` (UPDATE `propiedad_id`+aprende), `mov_correduria:<id>`, `mov_personal:<id>`. Todos aprenden regla. |
| **Agente conversacional de contabilidad/finanzas** (chat `/contable` + Telegram; `lib/contable/cerebro.ts`) | `responder(cuentaId, mensaje, canal)`. **1) Camino DETERMINISTA primero** (`intencion.ts` puro → `respuestas-directas.ts`, SQL SIN LLM, inmune a saturación IA): gasto/ingreso de un mes o año, por concepto con sinónimos (luz→endesa/iberdrola…), por destino (pisos vs correduría, **el Dúplex/Villasís** → `turistico_duplex` desde PR #807 — antes "duplex" no casaba y el comodín anual devolvía el total, cifra imposible), facturas pendientes y **`tramo_fiscal`** ("¿en qué tramo estamos?" → reutiliza `getResumenFinanciero`, PR #737). NUNCA secuestra ÓRDENes (clasifica/amortiza/concilia → van al LLM). **1-bis) IA ENRUTA, SQL CALCULA** (PR #808, 10/07/2026 — `clasificar-ia.ts::clasificarIntencionIA`): si el router determinista no reconoce una pregunta de datos, la IA la MAPEA a una intención estructurada (mismos tipos que `intencion.ts`) y el SQL de `respuestas-directas.ts` hace la cuenta EXACTA (la IA aporta lenguaje, NUNCA cifras). Salvaguardas: (a) el router deja de contestar el total a ciegas cuando hay una **entidad sin resolver** (`entidadesResiduales` — raíz del incidente del Dúplex: el comodín anual tapaba el filtro), (b) solo se dispara en preguntas de datos (no en charla, para no añadir latencia). **APRENDE**: la palabra que la IA resuelve a un segmento se guarda en `contable_memoria` (clave `sinonimo_negocio:<palabra>`, SIN migración; excluida del contexto del LLM por `getMemoria`) → `detectarIntencion(…, extras)` la usa como determinista la próxima vez (instantánea/gratis). Validador puro `intencionDesdeJSON`. **2) Si no casa nada → LLM con contexto** (`construirContexto` → `formato.ts`): resumen del año por destino + **PANORAMA DE NEGOCIOS** (sociedades+negocios, saldos bancarios) + **bloque fiscal IRPF** (tramo, base, tipo efectivo) + facturas + memoria (`getMemoria`) + historial (`getHistorial`). Modelo configurable **`CONTABLE_MODEL`** (default `deepseek-ai/deepseek-v3`, NIM). **`stripThink()`** (`parse.ts`) quita `<think>…</think>` de modelos de razonamiento antes de parsear. **Protocolo side-channel** (regex puro en `parse.ts`): `APRENDER: {json}` (hábitos → `guardarInsight`) y `ACCION: {json}` (propuestas → `contable_accion`, las CONFIRMA Alberto en pantalla, ejecuta `acciones.ts`). Adjuntos (📎 `documentos.ts` reusa `agente-facturas/extraer`) y voz (🎤 `aiTranscribe`/Groq Whisper). Prompt del sistema = "agente FINANCIERO" con visión transversal (PR #737). **Conocimiento de dominio en el prompt (12/07/2026):** alias de OTAs (`TRAVELSCAPE`=Expedia, `AGODA`, `BOOKING`/`LIQ. OP. Nº`, `STRIPE` → pisos); correduría=SIEMPRE BBVA (comisiones + códigos de agente `SALDO. M00171`/`M1454`/`LIQ.COMISIONES`/`-FRA-COMIS`/`REMSALDO`/`PD005` → seguros); `PAGO RECIBO 466…`/`TARJ.CRDTO` = liquidación de tarjeta = **traspaso_interno**, NO ingreso/gasto; **prestaciones EXENTAS** (`subcategoria='exento'`, paternidad Art. 7.h LIRPF) se cobran en la correduría pero NO tributan → fuera de la base (el contexto le pasa `fiscal.exento` con la cifra). |
| **Agente de pago de facturas a proveedores** (Gmail → OCR → Telegram → PIS/SEPA XML, PRs #605+#606 mergeados 30/06/2026) | Flujo completo: cron 06:15 → Gmail IMAP → OCR (`aiVision`) → `facturas_proveedor` → Telegram con botones → Enable Banking PIS (flag `EB_PIS_ENABLED`) o SEPA XML pain.001 → auto-conciliación con `v_movimientos_activos`. **Módulo puro `@central/module-pagos`** (tipos + generador SEPA XML + validador IBAN). **Tabla `facturas_proveedor`** (estados: nueva→pago_iniciado→pagada→rechazada→aplazada; dedupe por `(cuenta_id,proveedor,numero_factura)`). **Tabla `presupuesto_proveedores`** (budget anual por proveedor; línea en Telegram "lleva €X este año · N%"). Crons: `facturas-scan` (`15 6 * * *`) + `facturas-resumen-semanal` (`15 9 * * 1`). Callbacks Telegram prefijo `pago_`: `aprobar`, `rechazar`, `aplazar`, `pagartodo`, `revisarunauna`, `vincular`, `novinc`. `lib/finanzas.ts` incluye `ivaSoportado` desde `facturas_proveedor WHERE estado='pagada'` en trimestres. Envs pendientes por Alberto: `EB_PIS_ENABLED=true`, `EB_DEBTOR_IBAN`. |
| **⚠️ DOS TABLAS DE FACTURAS — no confundir** | `facturas_drive` (usada por `/sivra/facturas-control`): control de presencia/estado mensual de las facturas de proveedores recurrentes en Google Drive. Columnas clave: `(proveedor, anio, mes, drive_url, drive_file_id, importe, fuente)`. Constraint `fuente IN ('agente','manual')`. `facturas_proveedor` (usada por el agente Gmail): facturas para el flujo de pago OCR→Telegram→banco. **Son tablas independientes** — el agente Gmail no escribe en `facturas_drive`. **REGLA:** toda factura subida a Drive debe registrarse en `facturas_drive` para que `/sivra/facturas-control` lo muestre como ✅. El flujo correcto es usar el botón "Subir PDF" en la plataforma (`POST /api/sivra/facturas-control`). Si se sube directo a Drive (fuera de la plataforma), hay que insertar manualmente: `INSERT INTO facturas_drive (proveedor, anio, mes, drive_url, drive_file_id, importe, nombre_archivo, fuente) VALUES (..., 'manual')`. Backfill Sique Brilla ene–jun 2026 hecho el 30/06/2026 vía SQL. **`alertarFacturasAusentes(cuentaId)` lee `facturas_proveedor` (NO `facturas_drive`)** — para que el agente detecte ausencias de un proveedor, sus facturas históricas deben estar en `facturas_proveedor` (≥2 meses anteriores, `created_at` en el mes correspondiente). El backfill manual en `facturas_drive` solo sirve para el panel `/sivra/facturas-control`. |
| **Pepephone — proveedor personal registrado** (PR #653, 02/07/2026) | Pepephone (fibra 600Mb + 3 móviles + Netflix) añadido a `PROVEEDORES_RECURRENTES` en `lib/sivra/facturas-control.ts` con `destino='personal'`, `carpetaDrive='pepephone'`, `diaHabitual=1`. Facturas ene–jun 2026 (6 PDFs subidos a Drive en carpeta "pepephone") registradas en **ambas tablas**: `facturas_drive` (para panel ✅) y `facturas_proveedor` (para agente alertas; `created_at` = día 15 del mes de cada factura para que el histórico cuente). `presupuesto_proveedores` → budget_anual=720€ para proveedor='pepephone', anno=2026. IVA 21% en todas. Destino en movimientos bancarios = `personal` (no deducible actualmente — pendiente si Alberto quiere un bucket "personal deducible"). |
| **Agente de triaje de correo** (cron, no sesión Claude; PR #718, 03/07/2026) | Separa ruido de lo importante en el Gmail de Alberto: `*/10 * * * *` → IMAP incremental (`lib/correo/imap.ts`) → clasificador `correo_reglas`→regex OTP→IA (`lib/correo/clasificador.ts`) → acción por `lib/correo/rutas.ts` (FUENTE ÚNICA categoría→etiqueta+archivar+aviso). Tablas `correo_triaje`/`correo_cursor`/`correo_reglas`. Reutiliza `GMAIL_*`/`TELEGRAM_*`/`NVIDIA_API_KEY`/`CRON_SECRET` (sin envs nuevas). Flag `TRIAJE_DRY_RUN`. Skill router dedicado: `.claude/skills/correo-triaje`. Detalle en `apps/plataforma/CLAUDE.md`. |
| **Domótica Tuya — ventilador de techo Socorro** (PR #714, 03/07/2026) | `/api/sivra/domotica/programador` (cron `25,55 8-15 * * *`, decisión pura en `lib/domotica/programador.ts`): día de LLEGADA a las 15:00 hora Madrid, si en Sevilla hace >30°C (`lib/domotica/meteo.ts`) → ENCIENDE solo el ventilador (la luz no se toca); día de SALIDA a las 11:30 → APAGA siempre (idempotente, cubre el desfase del mando RF). Reservas desde Smoobu. `lib/domotica/tuya.ts` = cliente API Tuya. UI `/sivra/domotica` (`DomoticaClient.tsx`). Tablas `domotica_dispositivos` + `domotica_log` (dedupe por `${accion}:${reservaRef}`, evita reenviar el mismo comando). Detalle en `apps/plataforma/CLAUDE.md`. |
| **Flota del holding · mapa consolidado** (god-panel → 🛰️ Flota (mapa), `/operador/flota-mapa`) | Posición en vivo de los vehículos de TODAS las cuentas del grupo en un mapa Leaflet+OSM (CDN, sin dep). `lib/flota-holding.ts` lee por `$queryRaw` (`DISTINCT ON (vehiculo_id)` última posición + join `flota_vehiculos`/`cuentas`); polling `GET /api/operador/flota-mapa` (`getAdmin`). Es el consumidor consolidado del GPS de `apps/transporte` (tabla `flota_posiciones`); `prisma_plataforma` con `GRANT SELECT`. Lógica geo pura en `@central/module-geo`. |
| **Empresas en dificultad** (sección usuario 🏢 Empresas, scope cuenta `accesoEmpresas`, 17/07/2026) | Radar de empresas en concurso/preconcurso por provincia sobre corpus **BORME** (`lib/borme.ts` parser + `lib/borme-ingesta.ts` + cron `borme-ingesta` 06:00). UI `app/(usuario)/empresas/{page,EmpresasClient,EmpresaCard}.tsx`. **Búsqueda web gratis** (`lib/empresas-websearch.ts`, Gemini grounding): investigar empresa, analizar sector, toggle web en el agente. **Agente conversacional** (`lib/empresas-agente.ts`) + **scoring financiero** por umbrales de Alberto (`lib/empresas-senales.ts::enriquecimientoASenales`) sobre capa de **enriquecimiento eInforma** (`lib/empresas-einforma.ts`) — COMPLETA en código, **PENDIENTE que Alberto contratación eInforma** (envs `EINFORMA_CLIENT_ID/SECRET`). **Acceso invitado por token** (Pablo): tabla `empresas_acceso_token` (rotable sin redeploy, NO env), canjeado en `/invitado/empresas` → cookie httpOnly, gate en `middleware.ts` + `lib/empresas-acceso.ts`. Detalle en `docs/CONTEXTO-SESIONES.md` (entradas 17/07/2026). |
| **Director de código / orquestador "caro planifica, barato ejecuta"** (17/07/2026) | Acota archivos candidatos por similitud (`lib/ia-director-codigo.ts`, pg_trgm sobre tabla `mapa_arquitectura`, endpoint `/api/ai/codigo`) → planifica con modelo fuerte → ejecuta con modelo barato de OpenRouter (`/api/ai/ejecutar`, `scripts/ai-ejecutar.mjs`) con guardia antidestructiva (`lib/reescritura-guardia.ts`, rechaza truncados/exports desaparecidos) y escalado automático a modelo fuerte si el barato falla. Orquestado por la Action `.github/workflows/ai-programar.yml` (`scripts/ai-programar.mjs`) → PR draft automático. Sesión-lado: skill `code-map` (consulta) + `delegar-codigo` (delega). Detalle en `docs/DIRECTOR-CODIGO.md`. |
| **`trading-analista`** — agente de inversión asistida sobre Interactive Brokers, Fase 1 técnica cerrada + Fase B por SELECCIÓN en marcha (17-19/07/2026) | Paquete puro `@central/module-trading` (indicadores, torneo de estrategias, motor paper, factores value+quality+momentum+FCF yield, Piotroski/magic formula, riesgo/atribución, radar del universo S&P 500). Endpoints `/api/trading/**` (analizar/puntuar/factores/gurus/fundamentales/insiders/seleccion/validar-oos/paper/saldo/descubrir/screener/fmp). UI `app/(usuario)/trading/**` (radar + explorador con buscador/filtros + satélite 🚀 caza-cohetes + forward paper con curva/riesgo/atribución). Modelos Prisma `trading_*` + `BrokerSaldo` (RLS ON). Resumen por Telegram (`lib/trading-notify.ts`, `lib/trading/paper-tracker.ts`). Skill `.claude/skills/trading-analista`. **Sin autonomía hasta ser rentable; nunca ejecuta órdenes reales.** **✅ Trigger corriendo de punta a punta** (el bloqueo de infra — `ALERTA_TOKEN` + 403 de red hacia Vercel — se resolvió el 19/07/2026, ver `docs/RUTINAS-PROGRAMADAS.md`). |
| **💶 Saldo de Interactive Brokers en la vista Dinero** (`/banca` tab dinero, 18/07/2026) | Tarjeta «📈 Inversión · Interactive Brokers» junto a BBVA/Kutxabank, suma al «Saldo total del grupo». Tabla `broker_saldos` (persistida, la app en Vercel no habla con IBKR); la refresca la pasada del agente `trading-analista` (`POST /api/trading/saldo`, Bearer `ALERTA_TOKEN`/`CRON_SECRET`). `lib/broker.ts` (`getBrokerSaldos`/`getBrokerTotal`/`upsertBrokerSaldo`). |
| **Acceso invitado por token al Laboratorio de inversión** (`/trading`, 20/07/2026) | Mismo patrón que el de Empresas: tabla `trading_acceso_token` (rotable sin redeploy, NO env), canjeado en `/invitado/trading` → cookie httpOnly `trading_invitado`, `lib/trading-acceso.ts`. `/trading` es 100% lectura → la vista de invitado reutiliza tal cual `TradingDashboard.tsx` (extraído de `page.tsx`), sin exponer nada más de la plataforma. Para pasarle el enlace a un amigo: pedir/rotar el token por Supabase MCP y compartir `…/invitado/trading?token=<valor>`. Detalle en `apps/plataforma/CLAUDE.md`. |
| Diseño del god-panel | `docs/DISEÑO-god-panel.md` |
| Plataforma modular (roadmap) | `docs/PLAN-plataforma-modular.md` |
| Radiografía del repo (pestaña 🗺️ Estructura) | `docs/ESTRUCTURA.md` |
| Estado vivo del proyecto | `docs/CONTEXTO-SESIONES.md` |
| Estructura del monorepo | `MATRIZ.md` |

## Infra (sin secretos — nombres de variable)
- **Supabase** `wswbehlcuxqxyinousql` (schema `public`) — **COMPARTIDA con sivra y ialimp**.
  Tablas propias: `cuentas`, `sociedades`, `negocios`.
- Stack: Next 15 · Prisma · JWT (jose/bcryptjs, cookie `plataforma_session`) · sin Tailwind (CSS vars).
- God-panel: auth propia (cookie `plataforma_admin`, 8h) contra tabla `superadmins` (mismo login que `/superadmin` de ialimp).
- Envs: `DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `IAREST_URL`, `IALIMP_URL`,
  `OPERADOR_SHARED_SECRET` (mismo valor en el proyecto Vercel `ia-rest`).
  - `SIVRA_URL`: **YA NO se usa en runtime** (Fase 1 retirada de sivra, 21/06/2026 — el aviso de early
    check-in pasó a llamada interna y el dashboard enlaza a `/sivra/income`). Env muerta; no se borra
    porque la app standalone `apps/sivra` se mantiene como web pública (ver `sivra-maestro`).
- Root Directory Vercel: `apps/plataforma`.

## Pilar autónoma — `/finanzas/pilar` (23/06/2026, PR #462)
- **Cuentas bancarias de Pilar:** se importan con `titular='conyuge'` (campo en `cuentas_bancarias`). El select "Titular de la cuenta" en `BancaClient.tsx` lo recoge y lo pasa a `lib/banca.ts::importarExtracto(titular)`.
- **Auto-clasificación:** `clasificarDestinoDetalle(banco, concepto, contraparte, importe, titular)` acepta `titular` como 5º parámetro. Para `titular='conyuge'`: TGSS/Seg.Social → `actividad_pilar` + `subcategoria='cuota_autonomos'`; abono → `actividad_pilar` + `cobro_cliente`; cargo → `actividad_pilar` + `gasto_profesional`. `lib/categorizar.ts` lee `cb.titular` y persiste `subcategoria` en BD.
- **BD:** `movimientos_bancarios.subcategoria TEXT` (nuevo). `fiscal_perfil` + 5 campos cónyuge autónoma: `conyuge_es_autonomo`, `conyuge_ingresos_brutos`, `conyuge_gastos_deducibles`, `conyuge_cuota_autonomos`, `conyuge_retenciones`. Migración: `prisma/sql/2026-06-23_pilar_autonoma.sql`.
- **`getResumenPilar(cuentaId, year, quarter)`** en `lib/finanzas.ts`: 4 queries paralelas — totales (cobros/gastos_prof/cuota_ss), clientes top, evolución mensual, recientes. Calcula concentración (>75% = alerta Hacienda), Modelo 130 por trimestre, badges de plazo (✅/🟡/⬜). Fechas M130: Q1→20 abr · Q2→20 jul · Q3→20 oct · Q4→30 ene.
- **`compararDeclaracion()`** en `lib/fiscal-deducciones.ts`: conjunta vs separada — cuota ambas, ahorro y recomendación. **⚠️ Firma corregida en PR #686 (02/07/2026):** recibe `retencionesTitular` (retenciones REALES — antes estimaba 15% de TODA la base e inventaba miles de € de pagos a cuenta) y `baseTitular` debe llegar **SIN** la reducción por conjunta (la función la aplica ella sola; pasarla ya reducida la duplicaba). El route pasa `fiscal.baseImponibleSinReduccion` + `correduria.retencionesEstimadas`.
- **`/finanzas/pilar`** (page.tsx + PilarClient.tsx): KPIs morado, evolución mensual, Modelo 130 por trimestre, tabla clientes con alerta concentración (banner naranja si >75%), movimientos recientes con badges subcategoría.
- **`/finanzas`:** card compacta "🟣 Actividad de Pilar" en el grid de accesos rápidos → enlace a `/finanzas/pilar`.
- **`/api/finanzas/perfil`:** GET/PUT incluye los 5 campos `conyuge_*`.

## Sidebar Finanzas — Gastos/Fiscal/Proyección (01/07/2026, PR #646)
`UserSidebar.tsx` (grupo *Mi negocio*) ya no enlaza `/finanzas`, `/finanzas/tarjeta-credito`,
`/correduria` ni `/apartamentos` — esas rutas **siguen existiendo y funcionando** (no se
borraron páginas), solo se quitaron del menú. En su lugar hay tres ítems nuevos:
- **`/finanzas/gastos`** (`GastosPageClient.tsx`): filtros trimestre/mes/rango libre desde–hasta,
  4 buckets de deducibilidad, reutiliza `GastosTab` extendido y `getGastosControl(desde?, hasta?)`.
  **Rendimiento (PR #666, 02/07/2026):** `GastosTab.tsx` es el patrón de referencia para listas
  largas — buckets cerrados por defecto con **montaje perezoso** (las filas NO se renderizan hasta
  abrir; un `<details>` cerrado igualmente montaba todo el DOM), paginación client-side de 50 filas
  + «Ver más» (+100), auto-apertura con filtros activos, y recargas tras una acción que mantienen la
  lista visible atenuada en vez del loader a pantalla completa. NO volver a `<details open>` ni a
  renderizar todos los movimientos del periodo de golpe.
- **`/finanzas/fiscal`** (`FiscalPageClient.tsx`): barra visual de tramos IRPF con cursor + alerta
  de proximidad al siguiente tramo, bloque **«🧾 Mi declaración»** (PR #686, 02/07/2026 — carga solo,
  sin botón): cards **📍 Hoy** y **🔮 Fin de año (estimación)**, cada una con filas 👤 Solo yo /
  🤝 Conjunta con Pilar (✓ mejor) + palanca de gasto (ahorro por 1.000 € deducibles al marginal,
  gasto para bajar de tramo antes del 31/12, aviso de que NO hay efecto acantilado entre tramos).
  `GET /api/finanzas/comparativa` devuelve `{hoy, finAnio, bases, palanca, mesesRestantes}` (contrato
  NUEVO del PR #686; la proyección sale de `lib/proyeccion-fiscal.ts::getProyeccionFiscal()`, helper
  extraído del route de proyección — reservas futuras sivra + patrones recurrentes). Además: desglose
  deducciones/retenciones y tabla trimestral. (El tracker Modelo 179 se ELIMINÓ el 03/07/2026, PR #698:
  el 179 lo presentan las plataformas intermediarias tipo Booking/Airbnb, no el propietario/cedente.)
- **🧭 Consejo breve «Qué haría yo» ARRIBA de «Mi declaración» (22/07/2026, PR #1072):** helper PURO y
  **DETERMINISTA sin IA** `lib/consejo-fiscal.ts::consejoFiscal(estado, hoy)` — cifras del propio
  `EstadoDeclaracion` (cero riesgo de alucinar importes; patrón "determinista primero"). Da un titular en
  llano (vas camino de pagar/que te devuelvan X en la modalidad recomendada) y, si sale a pagar y el
  ejercicio sigue abierto, una **PROVISIÓN de tesorería** = importe / meses hasta junio del año siguiente
  (`mesesHastaPagoRenta`) → "aparta ~Y€/mes y no te llevas el susto en la campaña". NO repite la palanca de
  tramo (ya la da la tarjeta verde). Componente presentacional compartido
  `app/(usuario)/finanzas/ConsejoFiscalBox.tsx` enchufado en las DOS puertas: `FiscalPageClient.tsx`
  (`/finanzas/fiscal`) y `banca/FiscalResumen.tsx` (segmento 🧾 Fiscal de `/banca`) → no se desincronizan.
  Umbral mínimo 300€ para sugerir provisión; sin cambios de BD/endpoints. 7 tests en `lib/consejo-fiscal.test.ts`.
- **`/finanzas/proyeccion`** (`ProyeccionClient.tsx`): KPIs base real/futura/proyectada,
  reservas futuras sivra (`incomes WHERE "checkIn" > hoy`) vía `GET /api/finanzas/proyeccion`,
  simulador "¿qué pasa si…?" client-side, alerta <8.000€ del siguiente tramo.
- **`CategoriasTab.tsx`** (dentro de `/finanzas`, PR #639-#642 mismo rango) ganó drill-down por
  comerciante (`getMerchantsForCategoria()` en `lib/finanzas.ts`, rutas
  `GET /api/finanzas/categorias/comerciantes` e `insights`), panel "✨ Análisis IA" on-demand y
  botón "🤖 Auto-clasificar" (`POST /api/finanzas/categorias/auto-tag`).
- **Categorización AUTOMÁTICA de gasto personal (06/07/2026, rama `claude/ia-categorization-issue-6a534b`):**
  fuente ÚNICA **`lib/subcategoria-barrido.ts`** (`barrerSubcategoriasPersonal`) — keyword primero (gratis)
  + IA de la pasarela GRATIS solo para lo ambiguo, y **rescata `otros_gasto`** (`subcategoria IS NULL OR
  ='otros_gasto'`). La usan la ingesta (`analizarMovimientos` reparte por keyword), el cron diario
  `categorizar-movimientos` (`0 7 * * *`) y el botón `auto-tag`. **`lib/categoria-ia.ts` (Anthropic de pago)
  ELIMINADO**; `normalizarContraparte`→`lib/normalizar-contraparte.ts`. Baja confianza → columna
  **`subcategoria_revisar`** (≠ `requiere_revision`, que es del destino) → panel "🔎 Por revisar" (`?revisar=1`).
  Taxonomía **🏠 Vivienda** (Montecarmelo): subcategorías `comunidad`/`ibi` + `GRUPO_VIVIENDA` en
  `lib/categorias-personales.ts`. Extras: panel "sin clasificar grandes" (`?orden=importe`), badge ±% mes vs
  media 6m, presupuestos con Telegram scoped por `cuenta_id` (`categoria_alertas.cuenta_id`, migración
  `2026-07-06_subcategoria_control.sql`, aviso proactivo desde el barrido). ⚠️ `subcategoria` es el eje de
  gasto PERSONAL (`destino='personal' AND importe<0`), distinto de `categoria`/PGC.
- **Reestructura "💸 En qué gasto" (07/07/2026):** la pestaña 📊 Categorías pasó a llamarse **"En qué gasto"**
  en el sidebar (icono 💸, tras Banca) y 🧾 Gastos → **"Deducciones"** (separa eje personal vs fiscal).
  Estructura: titular del mes (total + ±% vs media 6m) → **UNA** cola "🔎 Necesitan tu atención"
  (`?atencion=1`, fusiona los 3 paneles antiguos) → dona → categorías (grupo Vivienda) → comercios; insights/
  alertas al fondo; sin tabla de Ingresos. Drill-down de comercio filtra por subcategoría (`?categoria=`).
  Comercio derivado con **`lib/comercio.ts::comercioDe`** (quita prefijo "COMPRA EN…"; fusiona filas con/sin
  contraparte); `getMerchantsForCategoria` agrupa en JS por él; `movimientos`/`asignar` casan igual.
- **Formato de dinero (regla global):** todo importe en € usa **`lib/dinero.ts::eur`** → `2.162,49€` (español,
  € detrás, millar con punto también en 4 cifras). Pantalla + Telegram + email. Nada de `€${x.toFixed(2)}`.
- **Recurrentes conocidos ya revisados (07/07/2026) — NO re-preguntar:** el diccionario `lib/subcategoria-keywords.ts`
  ya cubre los recibos fijos de la vivienda Montecarmelo y otros recurrentes de Alberto. Mapeos confirmados:
  `MONTECARMELO`/`MONTE CARMELO` → **comunidad** (recibo comunidad ~110€/mes); `TOTAL GAS Y ELECT`/`TOTALENERGIES`
  → **suministros_piso**; `TEMU`/`SHEIN` → **ocio**; `TUSSAM`/`SEVICI` → **transporte**; `PRIMAPRIX` → **supermercado**.
  El **IBI** y tributos MUNICIPALES están en `ibi` (` IBI `, patronato/recaudación, tasa basura, `AYTO. SEVILLA`).
  Amazon lo escribe el banco como `AMZN Mktp` → `AMZN` va a **ocio** (no casaba con `AMAZON`).
  Al reclasificar histórico usar SQL **set-based** (WITH scope + ILIKE + `CASE`), NUNCA transcribir UUIDs a mano.
- **Categoría `impuestos` (IRPF/Hacienda estatal) — 07/07/2026:** los pagos de la RENTA (IRPF de junio +
  2º plazo de noviembre, ~20k) NO son consumo del día a día; tienen su propia subcategoría `impuestos`
  (🧾) DENTRO de personal (`destino='personal'`), para que se vean pero no inflen ninguna categoría de
  consumo. Keywords ESPECÍFICAS (`IMPUESTO DE HACIENDA`, `TRIBUT HACIENDA`, `AGENCIA TRIBUTARIA`, `AEAT`,
  ` IRPF `) — NO usar `HACIENDA`/`IMPUESTO` a secas (chocarían con IBI `IMPUESTO BIENES INMUEBLES` o con un
  local llamado 'Hacienda …'). Ojo: la **cuota de autónomos TGSS** es profesional (`destino` ≠ personal),
  NO va aquí. Los **Bizums** a personas se dejan sin categoría de consumo (agrupados como 'Bizum').
- **Bizums unificados:** `comercioDe` devuelve un único grupo **"Bizum"** para cualquier envío Bizum
  (`\bBIZUM\b`), en vez de partirlos por destinatario — así el total enviado por Bizum se ve de un vistazo.
  **Subcategoría propia `bizum` (18/07/2026):** además del agrupado por comercio, cada movimiento Bizum
  (gasto) lleva `subcategoria='bizum'` — regla PRIMERA prioridad en `lib/subcategoria-keywords.ts`
  (gana siempre, antes que cualquier keyword de otra categoría, porque el motivo libre del Bizum puede
  mencionar cualquier cosa: "ENVIO BIZUM padel" NO es deporte) + asignada ya en la ingesta por
  `lib/destino.ts`. Solo gasto (Bizum enviado); los recibidos siguen en `otros_ingreso`.
- **Keyword AUTORITATIVO + la IA gratis NO es de fiar (07/07/2026):** la pasarela IA gratis metía
  gasolineras/súper/tributos dentro de 'seguro' con confianza alta. Regla nueva: **la keyword manda**.
  `barrerSubcategoriasPersonal` barre ahora TODO el gasto personal (no solo NULL/otros_gasto) y el paso
  keyword **SOBREESCRIBE** la etiqueta cuando discrepa; la IA solo ve lo que la keyword no clasifica y
  nunca pisa una etiqueta ya puesta. El re-barrido histórico se hace por SQL generado DESDE el
  diccionario real (`reglasOrdenadas()` → CASE ILIKE con `translate()` para plegar acentos y bordes de
  espacio), NUNCA duplicando el diccionario a mano. Si Alberto recategoriza a mano algo que una keyword
  contradice, la vía correcta es **añadir/ajustar la keyword**. Prioridad de comercio específico sobre
  categoría genérica: `CIRCULO MERCANTIL` (club) va ANTES que `deporte` aunque el recibo diga 'GYM'.
- **`destino='personal'` en TODO el eje personal:** las queries de "En qué gasto" (cabecera, drill-down
  de movimientos Y `getMerchantsForCategoria` en `lib/finanzas.ts`) filtran `COALESCE(destino,'personal')
  ='personal'`. Sin ese filtro, costes profesionales que comparten subcategoría (cuota autónomos TGSS,
  tributos del negocio…) se colaban en el desglose personal y descuadraban el contador de la cabecera.

**`/finanzas` desmantelada a lo no-duplicado (02/07/2026, Fase 1 des-duplicación):** sus tabs
Gastos y Fiscal eran copias 1:1 de `/finanzas/gastos` y `/finanzas/fiscal` (byte a byte, por eso
un fix a una se quedaba corto de la otra) — **borradas**. `FinanzasClient` ya solo sirve **Ingresos**
y **Categorías** (contenido único); `?tab=gastos|fiscal` redirigen a las páginas nuevas; el KPI
"Base imponible est." de cabecera se quitó (vive en `/finanzas/fiscal`).

## Deducciones de cuota IRPF (01/07/2026, PR #647)
3 tipos de deducción de cuota (nivel 2 — reducen cuota directamente, no base imponible):
- **Mecenazgo** (`tipo='mecenazgo'`): Ley 49/2002 — 80% primeros €150 + 40% resto. Donativos a entidades certificadas.
- **Guardería** (`tipo='guarderia'`): Art. 81bis LIRPF — hasta €1.000 adicional para hijos <3 años en centro autorizado.
- **Deportiva Andalucía** (`tipo='deportiva_and'`): D.A. 1ª Ley 7/2021 — 15% sobre base máx. €100 = máx. €15.

**BD nuevas columnas** (migración `2026-07-01_deduccion_cuota.sql`):
- `movimientos_bancarios.deduccion_cuota_tipo TEXT` — tipo asignado al movimiento.
- `banca_destino_reglas.deduccion_cuota_tipo TEXT` — aprendizaje por comercio.
- `fiscal_perfil.gasto_deportivo_anual NUMERIC(10,2)` — acumulado año para el límite deportivo.

**`lib/categorizar.ts`**: `detectarDeduccionCuotaTipo(concepto, contraparte)` — heurística automática al ingestar movimientos.
**`lib/fiscal-deducciones.ts`**: `gastoDeportivoAnual` en `PerfilFiscal`; `deduccionDeportiva()`; tramo mecenazgo corregido (80%/€150, 40% resto; el límite real de Ley 49/2002, no el antiguo 35%).

**`GastosTab.tsx`**: badge verde por tipo de cuota, tracker de ahorro fiscal estimado vs límites, selector inline de tipo.

**API routes:**
- `POST /api/banca/deduccion-cuota` (`{id, tipo}`) — asigna tipo, aprende regla, sincroniza `fiscal_perfil`.
- `POST /api/finanzas/gastos/revisar-cuota-batch` — barre movimientos personales sin tipo, aplica reglas + heurística, sincroniza `fiscal_perfil`.
- `POST /api/cron/pre-renta` — cron 1 marzo 9:00 CEST (`0 9 1 3 *` en `vercel.json`) — informe deducciones año anterior + consejo IA → Telegram.

**Webhook Telegram**: prefijo `deduccion_` ANTES del bloque `mov_`. Handlers: `deduccion_mecenazgo:<id>`, `deduccion_guarderia:<id>`, `deduccion_deportiva:<id>`, `deduccion_ninguna:<id>` (todos aprenden regla + sincronizan `fiscal_perfil`).

## 🏠 Inicio único = Resumen + Banca FUSIONADOS (16/07/2026, Fase 2; segmento Fiscal 18/07/2026; segmento Personal 18/07/2026)
Alberto: "Resumen y Banca hacían prácticamente lo mismo". **`/banca` es ahora la home unificada** con un
control segmentado por navegación **`app/(usuario)/banca/SegTabs.tsx`**: **💶 Dinero** (el cuerpo de
banca — saldos + movimientos + IA, segmento por defecto) · **🏢 Negocios** (la foto del holding — negocios
con resultado + consolidado intercompany + Modelo 130 + alertas) · **🧾 Fiscal** (previsión de la
declaración de la renta — `banca/FiscalResumen.tsx`: «Mi declaración» Hoy/Fin de año, Solo yo/Conjunta con
Pilar, palanca de gasto, tramos IRPF; enlace a `/finanzas/fiscal` para detalle+deducciones; `tab==='fiscal'`
en `page.tsx` con carga perezosa, año completo, reusa `getResumenFinanciero`+`calcularEstadoDeclaracion`) ·
**🏠 Personal** (desglose de gasto personal por categoría/comercio — `tab==='personal'` monta **tal cual**
`../finanzas/CategoriasTab.tsx`, sin reimplementar nada; el componente gestiona su propio filtro de fechas).
La fiscalidad había quedado huérfana al fusionar (la radiografía —que tenía la lente fiscal— redirige a
`/banca`); el 3er segmento la reintegra al Inicio, y el 4º (Personal) le da acceso directo a una vista que
ya existía completa en `/finanzas?tab=categorias` pero se había quedado sin entrada en el menú. El contenido de Negocios se **movió** del
antiguo dashboard a **`banca/NegociosResumen.tsx`** (server component autocontenido, `safe()`).
**`dashboard/page.tsx` ya solo REDIRIGE** a `/banca?tab=negocios` (se conserva por ser destino de
login/register y de ~15 `redirect('/dashboard')` de operador). Aterrizajes (`app/page.tsx`/login/register/
CommandPalette) → `/banca`. **Sidebar:** una sola entrada **🏠 Inicio** (`UserSidebar.tsx`, fusiona
Resumen+Banca). **Ficha de movimiento (PR2):** tocar el concepto de una fila del libro (`MovimientosTabla`,
`BancaClient.tsx`) abre un bottom-sheet (negocio/deducible/factura + 🤖 ¿Qué es?). **Conmutador PEREZOSO por
navegación** (`banca/SegTabs.tsx`, dos `next/link` con prefetch): `page.tsx` ramifica por `?tab` → cada
pestaña computa SOLO sus datos (Dinero no toca el holding y viceversa; sin render-both). Trade-off: cambiar
de pestaña es navegación (no conserva los filtros del libro). ⚠️ La sección de abajo describe el estado
ANTERIOR del dashboard (ya solo redirige); su lógica de widgets vive ahora en `NegociosResumen`.

## Home `/dashboard` = RESUMEN de verdad (02/07/2026 — ⚠️ SUPERADO por la fusión del 16/07/2026, ver arriba)
Decisión de Alberto: la home había acumulado 10+ widgets que duplicaban páginas dedicadas
("no mucha información, sino un resumen de mis negocios y cuentas bancarias"). **Todos los
widgets de detalle del PR #523 se ELIMINARON** (incl. `CobrosPisosChart.tsx` y
`EvolucionChart.tsx`, archivos borrados): strip Hoy, Correduría, Apartamentos, Pendiente
cobrar OTA, Top gastos del mes, Reservas ±7d, Comparativa mes vs anterior, Gastos por
categoría. Cada uno vive ahora SOLO en su página dedicada (`/correduria`, `/apartamentos`,
`/finanzas/gastos`, `/sivra/calendario`…).
**Lo que queda** en `app/(usuario)/dashboard/page.tsx` (Server Component): KPI bar
(Ingresos/Resultado/Negocios/Saldo del grupo) · consolidado intercompany (`getConsolidadoIntercompany`,
solo si hay operaciones internas) · aviso Modelo 130 (`getAvisoModelo130`/`getResumenPilar`) ·
`AlertasBanner` (accionables) · **Saldo por cuenta SOLO saldos** (`getCuentasConMovimientos(id, 0)`,
sin movimientos — el detalle vive en `/banca`; excluye `titular='conyuge'` y cuentas ocultas) ·
tarjetas Sociedades+Negocios. El `Promise.all` de datos pasó de 16 fetches a 5.
**⚠️ NO volver a añadir widgets de detalle a la home** — enlazar a la página dedicada en su lugar.
Funciones `lib/banca.ts` sin consumidor tras el recorte (`getCobradoPisos`, `getSerieCobrosPisos`,
`getTopGastosMes`, `getEvolucionMensual`, `getComparativaMensual`, `getGastosPorCategoria`) se
dejaron sin borrar, a la espera de la Fase 2 de des-duplicación (ver `docs/CONTEXTO-SESIONES.md`).
**Icono deducibilidad IRPF en movimientos (PR #655, 02/07/2026):** función pura
`iconoDeducible(destino,importe)` — ✅ (deducible: `seguros`/`turistico_*`/`actividad_pilar`) o
❌ (no deducible: `personal`) en cada gasto de `MovRow`. Ingresos y `traspaso_interno` sin icono.
**LANDMINE (igual que el resto de widgets):** las funciones `getResumen*`/`getAviso*` del dashboard
deben replicar la lógica de las páginas/APIs correspondientes; no simplificar con SQL puro.

## Sistema de diseño "paquete moderno" — `dashboard/ui.tsx` (02/07/2026)
Primitivas Tremor-look compartidas y **server-safe** (sin hooks): `cardStyle`, `CardHeader`, `Stat`
(con `DeltaBadge` ▲/▼), `ThinBar`, `BarListRow`, `LegendDot`, `EMERALD`/`ROSE`. Patrón a copiar
al tocar cualquier otra página de plataforma. Va con una pasada transversal de identidad visual:
**Inter** vía `next/font` (`var(--font-inter)`), **tokens semánticos** (`--positive/--negative/--warning/--info`
+ variantes `-bg`, cero hex inline), **modo oscuro automático** (`prefers-color-scheme: dark` +
`ThemeToggle.tsx` en el pie del sidebar — 🌗 Auto → ☀️ Claro → 🌙 Oscuro, `localStorage('theme')` +
`html[data-theme]`, script anti-parpadeo en `layout.tsx`) y **veto al oscurecimiento forzado del
navegador** (`[data-theme="light"] { color-scheme: only light }` — sin esto, Chrome/Samsung Internet
en ahorro de batería repintan a oscuro aunque el usuario elija Claro). Recharts adaptado por CSS
(`.recharts-cartesian-grid line` / `.recharts-cartesian-axis-tick text`) para que la rejilla siga
los tokens en oscuro. **plataforma NO usa Tailwind** (CSS vars) — este sistema es propio, no Tremor
copy-paste; sivra/ialimp/rrhh/ia-rest sí tienen Tailwind y ahí Tremor entraría literal. Adopción por
goteo: traer el patrón cuando una pantalla lo necesite, no migrar todo de golpe.

<!-- verificado: 2026-07-19 -->

## Agente facturas proveedores (PRs #605+#606, 30/06/2026)
- **Flujo:** Gmail IMAP (carpeta `FACTURAS_PENDIENTES`) → OCR `aiVision` → upsert `facturas_proveedor` (dedupe por número) → Telegram botones `pago_aprobar/rechazar/aplazar` → Enable Banking PIS (`POST /v3/payments`, JWT RS256) o SEPA XML pain.001.001.03 → auto-conciliación con `v_movimientos_activos` (cruce proveedor+importe+fecha±3d).
- **Módulo puro `@central/module-pagos`** (`packages/module-pagos`): tipos `FacturaProveedor`/`EstadoFactura`/`PagoParams`, generador `generarSepaXml()`, `validarIban()`. Sin BD ni secretos.
- **`lib/agente-facturas/pagos.ts`**: `escanearNuevasFacturas(cuentaId)`, `aprobarPago(facturaId)`, `aplazarPago(facturaId,dias)`, `rechazarFactura(facturaId)`, `verificarPagosPendientes()`, `conciliarConBanco(cuentaId)`, `pagarTodo(cuentaId)`, `resumenSemanal(cuentaId)`, `alertarFacturasAusentes(cuentaId)`.
- **`lib/enablebanking.ts`**: `iniciarPago()`, `estadoPago()`, `disponiblePis()`. Flag `EB_PIS_ENABLED=true` activa PIS (off por defecto).
- **Telegram** (prefijo `pago_`): `aprobar:<id>`, `rechazar:<id>`, `aplazar:<id>`, `pagartodo:<cuentaId>`, `revisarunauna:<cuentaId>`, `vincular:<facturaId>:<propertyId>:<checkOut>`, `novinc:<facturaId>`. Manejados en `app/api/sivra/mensajes/telegram-webhook/route.ts`.
- **Vínculo factura↔reserva**: tras scan, si hay checkout en `incomes` ±2d de la fecha factura → Telegram "¿Asociar con estancia X?" → guarda `reserva_id='propertyId:checkOut'` en la fila.
- **IVA soportado**: `lib/finanzas.ts::getResumenFinanciero` suma `cuota_iva` de `facturas_proveedor WHERE estado='pagada'` al `ivaSoportado` de cada trimestre.
- **Crons** en `vercel.json`: `facturas-scan` `15 6 * * *` + `facturas-resumen-semanal` `15 9 * * 1`.
- **API routes**: `POST /api/banca/pago/{aprobar,rechazar,aplazar}`, `GET /api/banca/pago/callback` (exento en `middleware.ts`), `GET|PUT /api/banca/pago/presupuesto`.
- **Fase 3 backlog** (no implementada): foto ticket (`photo` en webhook Telegram), aplazar con email (`core-email`, col `email_proveedor`), scoring proveedores (vista `v_scoring_proveedores`), pago fraccionado (>€500).
- **Envs pendientes (Alberto):** `EB_PIS_ENABLED=true`, `EB_DEBTOR_IBAN=<IBAN Kutxabank>`.

## Módulo banca y finanzas (18/06/2026)
- **`lib/destino.ts`** (puro, testeable `node --test`): clasifica el destino de un movimiento. En ABONOS recibidos (Norma 43), la contraparte es el TITULAR propio → clasificar por CONCEPTO, NO por nombre (de lo contrario, las comisiones de seguros quedan como 'traspaso_interno' y desaparecen del P&L). En CARGOS, el nombre sí identifica traspasos internos. `lib/categorizar.ts` reexporta.
  - **ABONOS de BBVA (23/06/2026):** los que casan comisión (`RE_COMISIONES`/`RE_SEGUROS`/`RE_LIQUID_SEGUROS` = saldo agente/remsaldo/saldo cuenta/pago saldo cta/PD005) → `seguros`; `RECIBIDO:` (Bizum particular) → `personal`; **Booking del Dúplex se reconoce por el marcador fiable `LIQ. OP. Nº`** (lo trae el feed PSD2) → `turistico_duplex`. Lo que **no casa nada** ya NO cae a Dúplex por descarte: va a `personal` + **`requiere_revision`** (`clasificarDestinoDetalle` → `{destino,revisar}`). **Cerrado "capturar el ordenante":** BBVA NUNCA lo da (ni Excel ni PSD2, que pone el titular en `debtor.name`); el discriminante es `LIQ. OP.`. Excel↔PSD2 se solapaban → depurado el doble conteo (22 cobros, 8.459€; `prisma/sql/2026-06-23_dedupe_booking_psd2_xls.sql`). El cuadre `/cuadre-booking` cuenta por `destino`, no por el concepto.
- **Correduría `/correduria`** (`app/(usuario)/correduria/`; **ya no está en el sidebar** desde el
  01/07/2026 — accesible solo por URL directa, ver sección "Sidebar Finanzas" más abajo): matriz comisiones por compañía×mes desde `movimientos_bancarios` con `destino='seguros'`. **La correduría es SIEMPRE BBVA** — `lib/destino.ts` solo asigna `seguros` en BBVA; un recibo de aseguradora en Kutxa/otros es seguro PROPIO (coche/hogar) → `personal` (o `turistico_pisos` si es de un piso). No clasificar `seguros` fuera de BBVA. `lib/correduria.ts` (puro): `detectarCompania`, `motivoSeguros`, `claveReferencia`, `COMPANIAS_CONOCIDAS`. Importe formato `1.543€`; celdas clicables → desglose (`/api/correduria/detalle`) con confirmar/reclasificar.
  - **Aprendizaje (clave de referencia → …):** dos tablas en BD compartida. `correduria_reglas (cuenta_id,clave,compania)`: al asignar compañía en el desglose se aprende por código (M1454→Asisa, M00171/8-92361→Occident, PD005→Caser) y se aplica a todos los iguales. `banca_destino_reglas (cuenta_id,clave,destino)`: al sacar de seguros ("No es de seguros") se aprende el negocio (p.ej. DNI de la pensión→personal). `lib/categorizar.ts` consulta `banca_destino_reglas` al ingestar; matriz/detalle consultan `correduria_reglas`. Override por movimiento: columna `movimientos_bancarios.compania_seguros`.
  - **🚨 LANDMINE — reglas aprendidas NUNCA con clave genérica (12/07/2026, PR #840):** `banca_destino_reglas` se aplica por **SUBSTRING** y con **prioridad sobre `destino.ts`**. Una regla-trampa `"TRANSF"→turistico_pisos` (substring de "TRANSFERENCIA RECIBIDA") secuestró TODAS las transferencias entrantes de BBVA → la correduría cobró **0€ en silencio** (el agente contable lee `destino='seguros'` y tampoco las veía). Guardia obligatoria **`lib/correduria.ts::claveReglaValida()`** en todos los puntos de aprendizaje + como filtro al aplicar (`categorizar.ts`). Borrar reglas malas desde el panel «🧠 Reglas aprendidas» de `/banca` (`/api/banca/reglas`). `RE_LIQUID_SEGUROS` (destino.ts) debe conocer los mismos códigos de agente que `detectarCompania` (M00171/M1454/8-92361/`SALDO. <cód>`). Saneo: `prisma/sql/2026-07-12_limpiar_reglas_destino.sql`.
  - **Ver TODOS los movimientos (PR #840):** `/banca` = libro completo. `listarMovimientosLedger()` + `GET /api/banca/movimientos` (paginado servidor: cuenta/fechas/signo/texto), `MovimientosTabla` con «Ver más» + reclasificar el negocio EN LÍNEA por fila. Bandeja «🔎 Ingresos por revisar» (`listarIngresosPorRevisar`) para abonos con negocio sin confirmar (la revisión de gastos es solo `importe<0`). Health-check Check 10 vigila la correduría muda. **🚨 Invariante `requiere_revision` (PR #906, 15/07/2026):** ese flag es del DESTINO (no de categoría/subcategoría); confirmar destino DEBE limpiarlo y toda bandeja «por revisar» DEBE filtrar `destino_confirmado=false` — si no, un cargo ya confirmado sale como zombie (pasó con CORTEFIEL). Detalle+landmine en `apps/plataforma/CLAUDE.md`.
  - **`/banca` = cuadro financiero unificado + extras IA GRATIS (13-14/07/2026, PRs #882/#886-894/#900):** period-driven (`?year/quarter/desde/hasta`, default mes en curso) con `ResumenPeriodo.tsx` (reusa `getResumenFinanciero`), gráficas Recharts y P&L de pisos (`getPLMensual`). Paneles bajo demanda, todos con la regla "la IA solo sugiere/narra, los importes SIEMPRE salen de `lib/banca.ts`/`lib/finanzas.ts`": 🧾 Cazador de deducciones (`lib/cazador-deducciones.ts`), 💬 Mini-chat (embebe `/api/contable/chat`), 🤖 Sugerir por fila (`/api/finanzas/gastos/sugerir`), 📈 Benchmark entre pisos (`/api/banca/benchmark-pisos`), ✂️ Fugas en recurrentes (`/api/banca/fugas`), 🚨 Antifraude — **reglas DETERMINISTAS sin IA** (`/api/banca/antifraude`, reusa `lib/vigilantes-tarjeta.ts`), 📤 Cierre de mes narrado (`lib/resumen-mensual.ts`, cron día 1 08:00 `/api/cron/resumen-mensual`), 🛒 Tickets de súper F5a — OCR con IA de visión (`lib/tickets.ts`, `POST/GET /api/banca/ticket`, `TicketsSuper.tsx`; **⚠️ tabla `tickets_compra`/`tickets_lineas` aún sin aplicar por Supabase MCP** — el endpoint degrada mientras tanto). Pendiente: desviación explicada, aviso fiscal proactivo, foto de factura en banca, F5b comparador de precios de tickets. **`/finanzas/radiografia` ahora REDIRIGE a `/banca`** (14/07/2026, #900 — Banca es la puerta única; el componente `RadiografiaClient.tsx` no se borró, sigue reversible) y `periodoLabel`/`Periodo` viven en `app/(usuario)/finanzas/periodo.ts` (SIN `'use client'`) — no importar funciones de un módulo `'use client'` desde un server component.
  - **⚠️ LANDMINE — widgets resumen en el dashboard:** NO hacer GROUP BY sobre `compania_seguros` directamente en SQL. La compañía se resuelve en 3 pasos JS: `compania_seguros || reglas.get(claveReferencia(concepto)) || detectarCompania(...)`. Un GROUP BY en SQL solo ve el campo manual → todas las compañías detectadas por nombre/código caen en "Otras" y desaparecen del widget. La función `getResumenCorreduria` en `dashboard/page.tsx` aplica esta cadena sobre filas raw (PR #480, jun-2026).
- **`/sivra/facturas-control`** (sidebar Mis pisos → 🗂️ Facturas): estado mensual por proveedor recurrente (✅/⏳/❌). API `GET/POST /api/sivra/facturas-control`. Alerta `facturasFaltantes` en `lib/banca.ts::getAlertas` → banner dashboard.

## Landmines (no romper — detalle en CLAUDE.md)
- **🚨 INGRESO turístico POR PISO = tabla `incomes` (INGLÉS), NO el banco (11/07/2026):** el ingreso real por
  piso/reserva vive en **`incomes`** (`propertyId, date≈check-in, amount` NETO, `amount_gross`, `portal`, `nights`);
  gastos por piso en `expenses`/`gastos`. Enlace **`negocios.ref_ext` (`prop_*`) = `incomes.propertyId`**. Reutiliza
  **`lib/financiero.ts::getResumenSivra(anio, propertyId)`** — es lo que pinta el dashboard por negocio (cuadra
  al céntimo). El **banco (`movimientos_bancarios`) agrega todos los pisos en `destino='turistico_pisos'`** (el
  Dúplex además `turistico_duplex` solo en gastos) → **inútil para "ingreso del piso X"**. El agente contable
  hoy lee el banco → por eso "ingresos del Dúplex" daba 0; para responder por piso hay que leer `incomes`.
  **TRAMPA:** `propiedades`(español)/`propietario_ingresos`/`negocios "[seed-demo]"` son DEMO, no la contabilidad
  real. **Incidente:** se buscó por nombres en español, no salió `incomes` (inglés), se creó una tabla duplicada
  (`ingresos_negocio_mensual`, ya borrada). Antes de tocar ingresos: cargar `sivra-maestro` y buscar en inglés Y español.
- **🔐 Roles de BD — DEUDA DE SEGURIDAD (26/06/2026):** La BD compartida `wswbehlcuxqxyinousql` tiene 4
  roles de acceso: `prisma_sivra` (sivra), `rrhh_app` (rrhh), y **`postgres` (ialimp + plataforma + transporte
  — SUPERUSUARIO, deuda temporal tras resetear la contraseña al desplegar transporte)**. Hay 3 roles preparados
  DB-side sin contraseña: `prisma_ialimp`, `prisma_plataforma`, `prisma_transporte`. **PENDIENTE (Alberto):**
  asignar contraseña a los 3 y apuntar `DATABASE_URL`/`DIRECT_URL` de cada app a su rol propio + redeploy.
  Después rotar `postgres` y `prisma_sivra`. Hasta que se haga, las 3 apps se saltan RLS (no hay riesgo práctico
  ya que los handlers tienen scope de `cuenta_id`, pero es deuda).
- **`middleware.ts` deja pasar los crons por `CRON_SECRET`** (Bearer o `?secret=`) ANTES del gate de
  cookie de sesión. **Es lo que permite que corran los crons `/api/sivra/*`** (snapshot, apply-auto,
  updates/sync, mercado, guard, limpiadoras, mensajes…): el cron de Vercel llega sin cookie, y sin esa
  excepción se redirige **307 → /login** y el handler nunca se ejecuta (así estuvieron **5 días mudos**
  en jun-2026, #429). NO quitar esa excepción ni meter rutas de cron tras el gate sin el secreto. Los
  handlers ya revalidan (`isCronAuthorized` o `secretOk || getSession()`), así que no abre datos.
  Heartbeat de vigilancia: paso 2-bis de `/auditoria-diaria`.
- **ia-rest vive en OTRA BD**: la unificación quedó a medias; `iarest.*` del compartido es un **clon vacío del DDL**.
  Los datos vivos están en el proyecto Supabase propio de ia-rest (`efncqyvhniaxsirhdxaa`). Léelo por el **puerto HTTP**.
- **Adaptadores por vertical** (`lib/adapters/*`, contrato `VerticalAdapter`): ialimp+sivra → BD directa (SQL raw);
  iarest → puerto HTTP. **No se fusiona nada.**
- Sin `OPERADOR_SHARED_SECRET` correcto, el panel no ve los clientes de ia-rest (ialimp+sivra sí).
- 🏠 Mis propiedades: "Resumen" lee `properties` (sivra Smoobu), **NO** `propiedades` (multi-tenant limpiadoras).
- **Dashboard widgets vs páginas completas:** los widgets del dashboard usan funciones `getResumen*` en `dashboard/page.tsx` (Server Components). Estas funciones DEBEN replicar EXACTAMENTE la lógica de detección de las páginas/APIs correspondientes. No simplificar con SQL puro si la página aplica lógica JS post-query (p.ej. correduría aplica cadena manual→regla→auto en JS). Si el API route y el widget producen números distintos, el widget está mal.
- **Dedupe PSD2 = por CONTENIDO, NO por entry_reference (#524, 25/06/2026):** `lib/psd2.ts::hashMov` deduplica con `dedupe_hash` = `cuenta_bancaria_id|fecha|importe(2dec)|upper(trim(concepto))`. **NUNCA volver a usar el `entry_reference`/`accountUid` de Enable Banking como clave:** el banco (BBVA/Kutxa) los ROTA entre sesiones → el mismo movimiento reaparece con otro hash y burla el `ON CONFLICT (cuenta_bancaria_id, dedupe_hash)` (así se duplicaron cuota PTMO, recibos de tarjeta, etc.). El hash JS debe coincidir BYTE A BYTE con el backfill SQL (`prisma/sql/2026-06-25_psd2_dedupe_contenido.sql`); si tocas uno, toca el otro y re-backfillea. Matiz aceptado: dos movimientos idénticos el mismo día se colapsan en uno.
- **🚨 PSD2 cuenta fantasma — IBAN=UUID (30/06/2026, fix en PR #613):** En `lib/psd2.ts::sincronizarSesion()` el fallback `detalle?.iban || accountUid` usaba el UUID opaco de Enable Banking como IBAN cuando `getDetalleCuenta` fallaba. Ese UUID se insertaba como `cuentas_bancarias.iban`, creando una fila fantasma que **nunca colisionaba** con el IBAN real en `ON CONFLICT (sociedad_id, iban)` → doble `cuenta_bancaria_id` → el `dedupe_hash` (que incluye `cuenta_bancaria_id` como prefijo) generaba hashes distintos para los mismos movimientos → 75 duplicados en BD (mayo–jun 2026). **FIX aplicado:** guard `if (!/^[A-Z]{2}[0-9]{2}/.test(iban)) continue` antes del INSERT en `psd2.ts` — se salta la cuenta si el IBAN no tiene formato real; el siguiente sync lo creará con el IBAN correcto. **⚠️ LANDMINE permanente:** el `dedupe_hash` incluye `cuenta_bancaria_id` → NO detecta duplicados cross-cuenta (mismo movimiento importado bajo dos `cuenta_bancaria_id` distintos da hashes distintos y ambos entran). Si una cuenta se migra/duplica, hacer `UPDATE SET duplicado_estado='ignorado'` en la cuenta fantasma como limpieza manual.
- **🚨 Cuota RETA (TGSS) con `destino='personal'` en vez de `seguros` — zombies `destino_confirmado` (18/07/2026):**
  `lib/destino.ts` ya clasifica una cuota TGSS de Alberto en BBVA como `destino='seguros'` (deducible,
  Art. 30.2.1ª LIRPF), pero **4 movimientos** de 2026 (marzo-junio, 1.314,95€) tenían `destino='personal'`
  con `destino_confirmado=true` — quedaron fijados así ANTES de que existiera esa regla (o por un error
  manual) y nunca se volvieron a re-analizar: el flag `confirmado` los saca del camino de clasificación
  automática Y de la bandeja «por revisar», así que un backfill de datos es la única forma de arreglarlos
  (mismo patrón que el LANDMINE `requiere_revision` del PR #906, pero aquí en el flag `destino_confirmado`).
  Backfill: `prisma/sql/2026-07-18_fix_cuota_autonomos_personal.sql`. **Auditoría recomendada tras cualquier
  cambio a `lib/destino.ts`:** buscar en `movimientos_bancarios` filas `destino_confirmado=true` cuyo
  concepto casaría hoy una regla distinta a la que tienen — esas filas NUNCA se corrigen solas.
  **Bonus del mismo hallazgo:** una fila tenía `subcategoria='seguro_salud'` (código reservado a pólizas
  de correduría) con `destino='personal'` — `seguro_salud`/`cuota_autonomos` NO están en
  `SUBCATEGORIAS_GASTO` de `lib/categorias-personales.ts` (son subcategorías de NEGOCIO que
  `clasificarDestinoDetalle` asigna junto a `destino='seguros'`/`'actividad_pilar'`), así que si aparecen
  bajo `destino='personal'` en «En qué gasto» salen con el icono genérico "•" — es señal de fuga, no de
  categoría legítima. Corregida a `otros_gasto` (gasto médico puntual con tarjeta, no una póliza).
- **🚨 Duplicados cross-cuenta tarjeta↔corriente (01/07/2026, PR #640):** Kutxabank exporta los cargos de tarjeta en DOS extractos: el de la **cuenta corriente** (`tipo='corriente'`) Y el **propio de la tarjeta** (`tipo='tarjeta'`). Al importar ambos Excels la misma compra entra bajo dos `cuenta_bancaria_id` distintos → gastos duplicados. Incidente: 47 cargos duplicados, **3.764€ inflados** (backfill `2026-07-01_dedupe_cross_cuenta.sql` — marcó `duplicado_estado='ignorado'` en los de la corriente). **FIX en código:** `importarExtracto` tiene un nuevo bloque anti-dedup cross-cuenta: si se importa `tipo='corriente'` y ya existe el mismo (fecha, importe) en una `tipo='tarjeta'` de la misma sociedad (o viceversa), el de la corriente se marca ignorado. `getDuplicadosSospechosos` añade UNION cross-cuenta con etiqueta de cuenta (`DupMovimiento.cuentaLabel`). **REGLA:** `tipo='tarjeta'` gana siempre sobre `tipo='corriente'`. Esto es DISTINTO al LANDMINE anterior (cross-origen psd2 vs xls, que opera DENTRO de la misma cuenta).

## Frontera multi-tenant
Scope `cuenta_id` siempre. BD compartida con sivra/ialimp: cambios transversales de BD → `auditoria-central`.
