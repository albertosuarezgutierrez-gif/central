# 🗺️ Arquitectura viva — casa de marcas `central`

> **Generado automáticamente** por `scripts/auditar-estructura.mjs` (2026-07-15T10:34:06Z). NO editar a mano.
> Se regenera en cada push (`.github/workflows/auditoria.yml`). Es el mapa que una sesión nueva lee del repo.
> Descripciones curadas, agentes y glosario: `apps/plataforma/lib/estructura.ts`. Visual: panel `/admin` → 🗺️ Estructura.

**Resumen:** 7 apps · 34 packages · 23 capacidades · 28 skills · 1070 rutas API.

## Apps (verticales)
### alquiler
- **Módulos que usa:** core-identity, module-alquiler
- **Capacidades:** Almacén / stock / ASN
- **Tablas (3):** alquiler_alquileres, alquiler_lineas, alquiler_materiales
- **Rutas API:** 4
### ia-rest
- **Módulos que usa:** core-ai, core-fiscal, core-payments, core-push, core-receipts, module-asn, module-contabilidad, module-crm, module-feedback, module-flota, module-horario, module-materiales, module-organizador-trabajo, module-presupuestos, module-proveedores, module-trazabilidad
- **Capacidades:** TPV / comanda, KDS (cocina), Eventos / catering / BEO, Reservas, QR / portal cliente, Feedback / propinas, Agenda / auto-asignación, CRM / leads / cotizador, Marketing (blog/IG/SEO), RRHH / equipo, Almacén / stock / ASN, Proveedores / compras, Contabilidad, Facturación / VeriFactu, Hardware bridge, Escáner / OCR, Notificaciones (push), Asistente / copiloto IA
- **Tablas (82):** arqueos_caja_empleado, beo_eventos, camareros, clientes_fiscales, cobro_config, comanda_items, comandas, config_horario, config_tienda, contract_acceptances, documentos_escaneados, facturas_cliente, feedback_visita, formularios_demo_recibidos, iarest.checklist_ejecuciones, iarest.checklist_plantillas, iarest.produccion_tareas, iarest.produccion_tiempos_estandar, iarest.recibos_digitales, incidencias_sistema, inventario_menaje, inventario_menaje_evento, leads, leads_eventos, leads_unsubscribes, leads_web_tracking, manual_voz_novedades, marchar_log, marketing_consentimientos, materiales…
- **Rutas API:** 493
### ialimp
- **Módulos que usa:** core-ai, core-email, core-firma, core-fiscal, core-identity, core-payments, core-push, core-receipts, core-storage, module-contabilidad, module-crm, module-documental, module-materiales, module-proveedores, module-rrhh
- **Capacidades:** Equipo limpiadoras, Agenda / auto-asignación, CRM / leads / cotizador, RRHH / equipo, Almacén / stock / ASN, Proveedores / compras, Contabilidad, Facturación / VeriFactu, Escáner / OCR, Informes, Notificaciones (push), Asistente / copiloto IA
- **Tablas (33):** apuntes_recurrentes, auth_rate_limit, biblioteca_documentos, catalogo_tarifas, cliente_auth_tokens, cliente_consentimientos, concursos, concursos_licitaciones, concursos_perfil_empresa, concursos_radar_anuncios, concursos_seguidos, cuentas, documentos_contables, documentos_limpiadora, firma_otps_limpiadora, firmas_limpiadora, ingresos_manuales, mailing_campanas, mailing_envios, mailing_eventos, mailing_pasos, mailing_prospectos, negocios, partes_trabajo, protocolo_fotos, protocolo_items, protocolos, recordatorios_impagos, repartidor_checklist_plantillas, repartidor_parada_items…
- **Rutas API:** 198
### plataforma _(matriz)_
- **Módulos que usa:** core-ai, core-email, core-identity, core-telegram, module-concursos, module-contabilidad, module-intercompany, module-pagos
- **Capacidades:** Feedback / propinas, Equipo limpiadoras, Agenda / auto-asignación, Pricing dinámico, Mercado / ingest, CRM / leads / cotizador, Marketing (blog/IG/SEO), RRHH / equipo, Almacén / stock / ASN, Proveedores / compras, Facturación / VeriFactu, Asistente / copiloto IA, Concursos públicos
- **Tablas (49):** agente_salud, ai_usos, banca_destino_reglas, categoria_alertas, categoria_alertas_log, cima_liquidaciones, comunicacion_categorias, comunicacion_conversacion_participantes, comunicacion_conversaciones, comunicacion_grupo_miembros, comunicacion_grupos, comunicacion_mensajes, comunicacion_nodos, comunicacion_reglas, conexiones_banco, contable_accion, contable_feedback, contable_log, contable_memoria, correduria_reglas, correo_cursor, correo_reglas, correo_triaje, cuentas_bancarias, domotica_acceso_pin, domotica_dispositivos, domotica_log, facturas_proveedor, ia_cache_semantica, ia_director_aprendizaje…
- **Rutas API:** 222
### rrhh
- **Módulos que usa:** core-ai, core-email, core-firma, core-identity, core-storage, module-chat, module-documental, module-geo, module-horario, module-nominas, module-rrhh
- **Capacidades:** Notificaciones (push), Asistente / copiloto IA
- **Tablas (12):** rrhh.contratos_laborales, rrhh.documentos, rrhh.empleados, rrhh.empresas, rrhh.firma_otps, rrhh.firmas, rrhh.incidencias_mes, rrhh.mensajes, rrhh.nominas, rrhh.push_subscriptions, rrhh.solicitudes, rrhh.usuarios_rrhh
- **Rutas API:** 51
### sivra
- **Módulos que usa:** core-ai, core-email, core-push, core-storage, module-contabilidad, module-materiales, module-proveedores
- **Capacidades:** Eventos / catering / BEO, Equipo limpiadoras, Agenda / auto-asignación, Pricing dinámico, Mercado / ingest, Marketing (blog/IG/SEO), Almacén / stock / ASN, Proveedores / compras, Asistente / copiloto IA
- **Tablas (1):** gastos_fijos
- **Rutas API:** 93
### transporte
- **Módulos que usa:** core-identity, module-flota, module-geo, module-transporte
- **Capacidades:** —
- **Tablas (9):** flota_conductores, flota_documentos, flota_mantenimientos, flota_posiciones, flota_repostajes, flota_vehiculos, transporte_paradas, transporte_portes, transporte_servicios
- **Rutas API:** 9

## Packages compartidos (`@central/*`)
- **core-ai** (core) → `@central/core-ai`
  - Lo usan: ia-rest, ialimp, plataforma, rrhh, sivra
  - Depende de: —
- **core-email** (core) → `@central/core-email`
  - Lo usan: ialimp, plataforma, rrhh, sivra
  - Depende de: —
- **core-firma** (core) → `@central/core-firma`
  - Lo usan: ialimp, rrhh
  - Depende de: —
- **core-fiscal** (core) → `@central/core-fiscal`
  - Lo usan: ia-rest, ialimp
  - Depende de: —
- **core-identity** (core) → `@central/core-identity`
  - Lo usan: alquiler, ialimp, plataforma, rrhh, transporte
  - Depende de: —
- **core-payments** (core) → `@central/core-payments`
  - Lo usan: ia-rest, ialimp
  - Depende de: —
- **core-push** (core) → `@central/core-push`
  - Lo usan: ia-rest, ialimp, sivra
  - Depende de: —
- **core-receipts** (core) → `@central/core-receipts`
  - Lo usan: ia-rest, ialimp
  - Depende de: —
- **core-storage** (core) → `@central/core-storage`
  - Lo usan: ialimp, rrhh, sivra
  - Depende de: —
- **core-telegram** (core) → `@central/core-telegram`
  - Lo usan: plataforma
  - Depende de: —
- **module-agenda** (module) → `@central/module-agenda`
  - Lo usan: —
  - Depende de: —
- **module-alquiler** (module) → `@central/module-alquiler`
  - Lo usan: alquiler
  - Depende de: module-encargo, module-intercompany, module-materiales
- **module-asn** (module) → `@central/module-asn`
  - Lo usan: ia-rest
  - Depende de: —
- **module-chat** (module) → `@central/module-chat`
  - Lo usan: rrhh
  - Depende de: —
- **module-concursos** (module) → `@central/module-concursos`
  - Lo usan: plataforma
  - Depende de: —
- **module-contabilidad** (module) → `@central/module-contabilidad`
  - Lo usan: ia-rest, ialimp, plataforma, sivra
  - Depende de: —
- **module-crm** (module) → `@central/module-crm`
  - Lo usan: ia-rest, ialimp
  - Depende de: —
- **module-documental** (module) → `@central/module-documental`
  - Lo usan: ialimp, rrhh
  - Depende de: —
- **module-encargo** (module) → `@central/module-encargo`
  - Lo usan: —
  - Depende de: —
- **module-feedback** (module) → `@central/module-feedback`
  - Lo usan: ia-rest
  - Depende de: —
- **module-flota** (module) → `@central/module-flota`
  - Lo usan: ia-rest, transporte
  - Depende de: —
- **module-geo** (module) → `@central/module-geo`
  - Lo usan: rrhh, transporte
  - Depende de: —
- **module-horario** (module) → `@central/module-horario`
  - Lo usan: ia-rest, rrhh
  - Depende de: —
- **module-intercompany** (module) → `@central/module-intercompany`
  - Lo usan: plataforma
  - Depende de: module-flota, module-materiales
- **module-materiales** (module) → `@central/module-materiales`
  - Lo usan: ia-rest, ialimp, sivra
  - Depende de: —
- **module-nominas** (module) → `@central/module-nominas`
  - Lo usan: rrhh
  - Depende de: —
- **module-organizador-trabajo** (module) → `@central/module-organizador-trabajo`
  - Lo usan: ia-rest
  - Depende de: —
- **module-pagos** (module) → `@central/module-pagos`
  - Lo usan: plataforma
  - Depende de: —
- **module-presupuestos** (module) → `@central/module-presupuestos`
  - Lo usan: ia-rest
  - Depende de: —
- **module-proveedores** (module) → `@central/module-proveedores`
  - Lo usan: ia-rest, ialimp, sivra
  - Depende de: —
- **module-revenue** (module) → `@central/module-revenue`
  - Lo usan: —
  - Depende de: —
- **module-rrhh** (module) → `@central/module-rrhh`
  - Lo usan: ialimp, rrhh
  - Depende de: core-firma, module-documental
- **module-transporte** (module) → `@central/module-transporte`
  - Lo usan: transporte
  - Depende de: module-encargo, module-flota, module-intercompany
- **module-trazabilidad** (module) → `@central/module-trazabilidad`
  - Lo usan: ia-rest
  - Depende de: —

## Skills del proyecto
- **adobe-diseno** — >
- **agentes-entrenador** — Agente PROGRAMADO semanal que mejora los prompts de los agentes del monorepo por RENDIMIENTO (qué hicieron de verdad, qué falló, qué corrigió Alberto) y por CALIDAD transversal (contradicciones/redundancias entre skills). NO vigila frescura factual (eso es de /auditoria-diaria). Lee docs/AGENTES-BITACORA.md, docs/FEEDBACK-AGENTES.md, git/PRs de la semana y BD (solo lectura). Entrega cambios de comportamiento SIEMPRE por PR draft + aviso Telegram; solo lo factual trivial directo a main. Úsala cuando Alberto pida "revisa/mejora los prompts de los agentes" o cuando la dispare su trigger semanal (domingo). Sin secretos, solo nombres de variable.
- **alquiler-maestro** — >
- **auditoria-central** — Auditoría CON CONTEXTO del monorepo `central` (casa de marcas). Úsala tras renames de scope, migraciones de BD, reestructuras de packages/apps, o antes de un corte de infraestructura — cuando Alberto pregunte "¿se ha roto algo?", "haz una auditoría", "revisa que todo está bien" o pida pruebas/testeo del proyecto. NO es un checklist genérico: aprovecha la matriz de consumo, la BD compartida multi-tenant y la infra real (Supabase/Vercel por MCP).
- **brainstorming** — "You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation."
- **buscador-ia** — Agente PROGRAMADO SEMANAL que vigila el ecosistema de LLMs gratis/baratos que alimentan la cadena de fallback del monorepo (`@central/core-ai`). Tres patas en una pasada — (1) WATCH DE DEPRECACIÓN de los modelos que están REALMENTE cableados (NIM llama-3.3-70b, Groq, Gemini 2.0-flash, Kimi) para cazar retiradas de catálogo ANTES de que rompan producción (como el `meta/llama-3.1-405b-instruct` que NVIDIA retiró y dejó "IA no disponible" a un huésped), (2) DESCUBRIMIENTO de modelos/proveedores gratis nuevos que merezca meter en la cadena, y (3) MINI-EVAL de los candidatos con 2 prompts fijos. Actualiza `docs/BUSCADOR-IA.md` (estado entre ejecuciones), avisa por Telegram si algo merece ojo humano y abre PR draft solo para cambios pequeños y seguros (swap de id de modelo muerto, plumbing de un proveedor nuevo). Úsala cuando Alberto pida "revisa las novedades de IA / si hay una IA gratis que meter" o cuando la dispare su trigger semanal. Sin secretos: solo nombres de variable.
- **central-maestro** — >
- **code-map** — Úsala al EMPEZAR cualquier tarea de CÓDIGO en el monorepo `central` cuando haya que localizar QUÉ archivo o función maneja algo (arreglar un bug, tocar una feature, "¿dónde está X?"), ANTES de hacer Grep/Read a ciegas. Consulta la tabla Supabase `mapa_arquitectura` (índice de firmas de todo el repo, poblado por scripts/auditar-estructura.mjs) para acotar a coste ~0 tokens los archivos candidatos, y así leer SOLO esos en vez de barrer medio repositorio. Es el gemelo "lado sesión" del endpoint `/api/ai/codigo` (Director de código). NO reemplaza a Grep/Read: los enfoca. Si la tabla no está disponible o no devuelve candidatos, degrada al método clásico.
- **correo-triaje** — Router de contexto del AGENTE DE TRIAJE DE CORREO de Alberto. A diferencia de otros agentes programados, NO corre como sesión Claude sino como CRON de Vercel en apps/plataforma (cada ~10 min): lee lo nuevo del Gmail por IMAP, clasifica cada correo con la pasarela IA, y actúa — ruido a Triaje/Ruido+archivado, contabilidad etiquetada como buzón puente de facturas-correo, personal/huéspedes/leads con aviso Telegram inmediato, phishing marcado con cautela. Úsala cuando Alberto pida "revisa/ajusta el triaje de correo", quiera añadir una categoría o remitente, o cuando /auditoria-diaria reconcilie la tabla de rutas. NO duplica el código: dice qué existe, dónde vive y cómo extenderlo. Sin secretos.
- **facturas-correo** — Agente PROGRAMADO que revisa el Gmail de Alberto buscando facturas/justificantes de gasto, los clasifica (personal vs negocio deducible), archiva en Google Drive los deducibles y los concilia con los movimientos bancarios de plataforma. Úsala cuando Alberto pida "revisa mis correos/facturas", o cuando la dispare el trigger diario de Claude Code web. NO es un proceso 24/7: se despierta, hace una pasada sobre lo nuevo y deja un resumen.
- **fiscal-novedades** — Agente PROGRAMADO que vigila cambios en las deducciones del IRPF (estatales en el BOE y autonómicas de Andalucía en el BOJA/AEAT) y los contrasta con los importes que usa el módulo /finanzas de plataforma (IMPORTES_POR_ANIO en apps/plataforma/lib/fiscal-deducciones.ts). Cuando un importe cambia, abre un PR draft que actualiza la constante e inserta una fila en fiscal_novedades para que la app avise EN PANTALLA si el cambio beneficia a Alberto. Úsala cuando Alberto pida "revisa si han cambiado las deducciones" o cuando la dispare su trigger (mensual + antes de la campaña de renta). NO se cuelga del agente de concursos (ese sondea PLACSP por CPV).
- **github-vigia** — Agente PROGRAMADO que vigila el ecosistema GitHub/OSS que le interesa al monorepo. Tres patas en una pasada mensual — (1) releases de la lista curada de repos vigilados en docs/VIGIA-OSS.md (VROOM, OSRM, openrouteservice, Leaflet, Traccar, web-push…), (2) descubrimiento de herramientas/repos nuevos por vertical, y (3) dependencias npm desactualizadas o con CVE. Actualiza docs/VIGIA-OSS.md (estado entre ejecuciones), avisa por Telegram si algo merece ojo humano y abre PR draft solo para bumps pequeños y seguros. Úsala cuando Alberto pida "revisa las novedades de GitHub / del ecosistema" o cuando la dispare su trigger mensual (día 15). Sin secretos: solo nombres de variable.
- **ia-rest-maestro** — >
- **ialimp-client-health** — Monitorización semanal de la salud de la cuenta de Sique Brilla (único cliente en producción de ialimp). Comprueba PMS sync, programaciones sin asignar, impagos activos y errores recientes. Genera un resumen de viernes para cerrar la semana operativa. Úsala en la rutina semanal o cuando Alberto quiera un pulso rápido del cliente. Sin secretos: solo nombres de variable.
- **ialimp-maestro** — >
- **perfil-fiscal** — Router de contexto FISCAL y PATRIMONIAL de Alberto (persona física) + la sociedad Punto y Coma SL. Úsalo SIEMPRE que Alberto pida algo de su renta/IRPF, declaración, gastos deducibles, qué piso tributa dónde, su asesoría, o cuando trabajes con `facturas-correo`, `fiscal-novedades` o el módulo `/finanzas`. NO duplica los datos personales (esos viven en la BD `fiscal_perfil`/`fiscal_descendientes`); aquí está la ESTRUCTURA: qué entidad declara qué, las reglas de gasto y los caveats. Sin cifras ni datos sensibles.
- **plataforma-maestro** — >
- **pricing-agente** — >
- **psd2-health-check** — Guardián de la sincronización bancaria (Enable Banking / PSD2). Verifica que los movimientos bancarios llegan frescos (< 48h) a `movimientos_bancarios`. Si la última importación es antigua o hay una caída >50% en volumen, alerta por Telegram y anota en CONTEXTO-SESIONES.md. Úsala en la rutina semanal de salud financiera o cuando Alberto sospeche que el sync está roto. Sin secretos: solo nombres de variable.
- **receiving-code-review** — Use when receiving code review feedback, before implementing suggestions, especially if feedback seems unclear or technically questionable - requires technical rigor and verification, not performative agreement or blind implementation
- **requesting-code-review** — Use when completing tasks, implementing major features, or before merging to verify work meets requirements
- **rrhh-compliance-calendar** — Recordatorio mensual de obligaciones legales pendientes de implementar en la vertical RRHH (Portal del Empleado). Lee el roadmap, filtra los ítems 🔴 obligatorios no completados y genera un informe de plazos. Úsala el primer día de cada mes o cuando Alberto quiera un pulso del estado de compliance de RRHH.
- **sivra-maestro** — >
- **systematic-debugging** — Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes
- **transporte-maestro** — >
- **using-superpowers** — Use when starting any conversation - establishes how to find and use skills, requiring Skill tool invocation before ANY response including clarifying questions
- **verification-before-completion** — Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims; evidence before assertions always
- **writing-plans** — Use when you have a spec or requirements for a multi-step task, before touching code

## Avisos de arquitectura
- 🔴 **Almacén / stock / ASN**: duplicada en alquiler (debería usar `module-materiales`).
- ⚠️ **TPV / comanda**: en ia-rest; falta en alquiler, ialimp, rrhh, sivra, transporte.
- ⚠️ **KDS (cocina)**: en ia-rest; falta en alquiler, ialimp, rrhh, sivra, transporte.
- ⚠️ **Eventos / catering / BEO**: en ia-rest, sivra; falta en alquiler, ialimp, rrhh, transporte.
- ⚠️ **Reservas**: en ia-rest; falta en alquiler, ialimp, rrhh, sivra, transporte.
- ⚠️ **QR / portal cliente**: en ia-rest; falta en alquiler, ialimp, rrhh, sivra, transporte.
- ⚠️ **Feedback / propinas**: en ia-rest; falta en alquiler, ialimp, rrhh, sivra, transporte.
- ⚠️ **Equipo limpiadoras**: en ialimp, sivra; falta en alquiler, ia-rest, rrhh, transporte.
- ⚠️ **Agenda / auto-asignación**: en ia-rest, ialimp, sivra; falta en alquiler, rrhh, transporte.
- ⚠️ **Pricing dinámico**: en sivra; falta en alquiler, ia-rest, ialimp, rrhh, transporte.
- ⚠️ **Mercado / ingest**: en sivra; falta en alquiler, ia-rest, ialimp, rrhh, transporte.
- ⚠️ **CRM / leads / cotizador**: en ia-rest, ialimp; falta en alquiler, rrhh, sivra, transporte.
- ⚠️ **Marketing (blog/IG/SEO)**: en ia-rest, sivra; falta en alquiler, ialimp, rrhh, transporte.
- ⚠️ **RRHH / equipo**: en ia-rest, ialimp; falta en alquiler, rrhh, sivra, transporte.
- ⚠️ **Almacén / stock / ASN**: en alquiler, ia-rest, ialimp, sivra; falta en rrhh, transporte.
- ⚠️ **Proveedores / compras**: en ia-rest, ialimp, sivra; falta en alquiler, rrhh, transporte.
- ⚠️ **Contabilidad**: en ia-rest, ialimp; falta en alquiler, rrhh, sivra, transporte.
- ⚠️ **Facturación / VeriFactu**: en ia-rest, ialimp; falta en alquiler, rrhh, sivra, transporte.
- ⚠️ **Hardware bridge**: en ia-rest; falta en alquiler, ialimp, rrhh, sivra, transporte.
- ⚠️ **Escáner / OCR**: en ia-rest, ialimp; falta en alquiler, rrhh, sivra, transporte.
- ⚠️ **Informes**: en ialimp; falta en alquiler, ia-rest, rrhh, sivra, transporte.
- ⚠️ **Notificaciones (push)**: en ia-rest, ialimp, rrhh; falta en alquiler, sivra, transporte.
- ⚠️ **Asistente / copiloto IA**: en ia-rest, ialimp, rrhh, sivra; falta en alquiler, transporte.

## Novedades recientes (de `docs/CONTEXTO-SESIONES.md`)
- (14/07/2026) 🔧 Auditoría completa de `/banca` + arreglo de hallazgos (14/07/2026, rama `claude/bank-movements-filters-1p7ns0`).
- (15/07/2026) ⚠️ INFRAVENTA en noche KAROL G + corrección (15/07/2026, rama `claude/dynamic-pricing-uhvnak`).
- (15/07/2026) 💸 CORTE del cargo excesivo de Vercel — Build CPU Minutes (15/07/2026, rama `claude/vercel-excessive-charges-06p4a6`).
- (14/07/2026) 🐛 FIX crash de `/banca` + unificación real con Radiografía (14/07/2026, rama `claude/bank-movements-filters-1p7ns0`).
- (14/07/2026) 🔍 Auditoría contable completa (14/07/2026).
- (14/07/2026) 🧹 Limpieza de tarjetas Kutxabank + fix del cron facturas-scan (14/07/2026, rama `claude/ai-accounting-agent-3a9o22`).
- (13/07/2026) 🛒 Tickets de súper — F5a: OCR + guardado + subir/listar en /banca (13/07/2026, rama `claude/bank-movements-filters-1p7ns0`).
- (13/07/2026) 📤 Cierre de mes narrado → Telegram (13/07/2026, rama `claude/bank-movements-filters-1p7ns0`, fase 4 de la banca unificada — 5º corte).
- (13/07/2026) 🚨 Cargos raros / antifraude en /banca (13/07/2026, rama `claude/bank-movements-filters-1p7ns0`, fase 4 de la banca unificada — 4º corte).
- (13/07/2026) ✂️ Fugas en recurrentes en /banca (13/07/2026, rama `claude/bank-movements-filters-1p7ns0`, fase 4 de la banca unificada — 3er corte).

