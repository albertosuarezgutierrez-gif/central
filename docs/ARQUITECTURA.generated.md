# 🗺️ Arquitectura viva — casa de marcas `central`

> **Generado automáticamente** por `scripts/auditar-estructura.mjs` (2026-06-15T20:42:07Z). NO editar a mano.
> Se regenera en cada push (`.github/workflows/auditoria.yml`). Es el mapa que una sesión nueva lee del repo.
> Descripciones curadas, agentes y glosario: `apps/plataforma/lib/estructura.ts`. Visual: panel `/admin` → 🗺️ Estructura.

**Resumen:** 5 apps · 20 packages · 23 capacidades · 13 skills · 786 rutas API.

## Apps (verticales)
### ia-rest
- **Módulos que usa:** core-ai, core-fiscal, core-push, module-asn, module-contabilidad, module-crm, module-feedback, module-horario, module-materiales, module-presupuestos, module-proveedores
- **Capacidades:** TPV / comanda, KDS (cocina), Eventos / catering / BEO, Reservas, QR / portal cliente, Feedback / propinas, Agenda / auto-asignación, CRM / leads / cotizador, Marketing (blog/IG/SEO), RRHH / equipo, Almacén / stock / ASN, Proveedores / compras, Contabilidad, Facturación / VeriFactu, Hardware bridge, Escáner / OCR, Notificaciones (push), Asistente / copiloto IA
- **Tablas (81):** arqueos_caja_empleado, beo_eventos, camareros, clientes_fiscales, cobro_config, comanda_items, comandas, config_horario, config_tienda, contract_acceptances, documentos_escaneados, facturas_cliente, feedback_visita, formularios_demo_recibidos, iarest.checklist_ejecuciones, iarest.checklist_plantillas, iarest.produccion_tareas, iarest.produccion_tiempos_estandar, iarest.recibos_digitales, incidencias_sistema, inventario_menaje, inventario_menaje_evento, leads, leads_eventos, leads_unsubscribes, leads_web_tracking, manual_voz_novedades, marchar_log, marketing_consentimientos, materiales…
- **Rutas API:** 457
### ialimp
- **Módulos que usa:** core-ai, core-email, core-fiscal, core-identity, core-push, core-storage, module-concursos, module-contabilidad, module-crm, module-materiales, module-proveedores
- **Capacidades:** Equipo limpiadoras, Agenda / auto-asignación, CRM / leads / cotizador, RRHH / equipo, Almacén / stock / ASN, Proveedores / compras, Contabilidad, Facturación / VeriFactu, Escáner / OCR, Informes, Notificaciones (push), Asistente / copiloto IA, Concursos públicos
- **Tablas (27):** apuntes_recurrentes, auth_rate_limit, biblioteca_documentos, catalogo_tarifas, cliente_auth_tokens, cliente_consentimientos, concursos, concursos_licitaciones, concursos_perfil_empresa, concursos_radar_anuncios, cuentas, documentos_contables, ingresos_manuales, mailing_campanas, mailing_envios, mailing_eventos, mailing_pasos, mailing_prospectos, negocios, partes_trabajo, protocolo_fotos, protocolo_items, protocolos, recordatorios_impagos, sociedades, stock_consumos, tenant_modulos
- **Rutas API:** 187
### plataforma _(matriz)_
- **Módulos que usa:** core-ai, core-identity, module-contabilidad
- **Capacidades:** Facturación / VeriFactu
- **Tablas (11):** comunicacion_categorias, comunicacion_conversacion_participantes, comunicacion_conversaciones, comunicacion_grupo_miembros, comunicacion_grupos, comunicacion_mensajes, comunicacion_nodos, comunicacion_reglas, conexiones_banco, cuentas_bancarias, movimientos_bancarios
- **Rutas API:** 38
### rrhh
- **Módulos que usa:** core-storage, module-chat, module-documental
- **Capacidades:** Notificaciones (push)
- **Tablas (7):** rrhh.documentos, rrhh.empleados, rrhh.empresas, rrhh.mensajes, rrhh.push_subscriptions, rrhh.solicitudes, rrhh.usuarios_rrhh
- **Rutas API:** 15
### sivra
- **Módulos que usa:** core-ai, core-email, core-push, core-storage, module-contabilidad, module-materiales, module-proveedores
- **Capacidades:** Eventos / catering / BEO, Equipo limpiadoras, Agenda / auto-asignación, Pricing dinámico, Mercado / ingest, Marketing (blog/IG/SEO), Almacén / stock / ASN, Proveedores / compras, Asistente / copiloto IA
- **Tablas (1):** gastos_fijos
- **Rutas API:** 89

## Packages compartidos (`@central/*`)
- **core-ai** (core) → `@central/core-ai`
  - Lo usan: ia-rest, ialimp, plataforma, sivra
  - Depende de: —
- **core-email** (core) → `@central/core-email`
  - Lo usan: ialimp, sivra
  - Depende de: —
- **core-fiscal** (core) → `@central/core-fiscal`
  - Lo usan: ia-rest, ialimp
  - Depende de: —
- **core-identity** (core) → `@central/core-identity`
  - Lo usan: ialimp, plataforma
  - Depende de: —
- **core-push** (core) → `@central/core-push`
  - Lo usan: ia-rest, ialimp, sivra
  - Depende de: —
- **core-storage** (core) → `@central/core-storage`
  - Lo usan: ialimp, rrhh, sivra
  - Depende de: —
- **module-agenda** (module) → `@central/module-agenda`
  - Lo usan: —
  - Depende de: —
- **module-asn** (module) → `@central/module-asn`
  - Lo usan: ia-rest
  - Depende de: —
- **module-chat** (module) → `@central/module-chat`
  - Lo usan: rrhh
  - Depende de: —
- **module-concursos** (module) → `@central/module-concursos`
  - Lo usan: ialimp
  - Depende de: —
- **module-contabilidad** (module) → `@central/module-contabilidad`
  - Lo usan: ia-rest, ialimp, plataforma, sivra
  - Depende de: —
- **module-crm** (module) → `@central/module-crm`
  - Lo usan: ia-rest, ialimp
  - Depende de: —
- **module-documental** (module) → `@central/module-documental`
  - Lo usan: rrhh
  - Depende de: —
- **module-feedback** (module) → `@central/module-feedback`
  - Lo usan: ia-rest
  - Depende de: —
- **module-horario** (module) → `@central/module-horario`
  - Lo usan: ia-rest
  - Depende de: —
- **module-materiales** (module) → `@central/module-materiales`
  - Lo usan: ia-rest, ialimp, sivra
  - Depende de: —
- **module-organizador-trabajo** (module) → `@central/module-organizador-trabajo`
  - Lo usan: —
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

## Skills del proyecto
- **auditoria-central** — Auditoría CON CONTEXTO del monorepo `central` (casa de marcas). Úsala tras renames de scope, migraciones de BD, reestructuras de packages/apps, o antes de un corte de infraestructura — cuando Alberto pregunte "¿se ha roto algo?", "haz una auditoría", "revisa que todo está bien" o pida pruebas/testeo del proyecto. NO es un checklist genérico: aprovecha la matriz de consumo, la BD compartida multi-tenant y la infra real (Supabase/Vercel por MCP).
- **brainstorming** — "You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation."
- **central-maestro** — >
- **ia-rest-maestro** — >
- **ialimp-maestro** — >
- **plataforma-maestro** — >
- **receiving-code-review** — Use when receiving code review feedback, before implementing suggestions, especially if feedback seems unclear or technically questionable - requires technical rigor and verification, not performative agreement or blind implementation
- **requesting-code-review** — Use when completing tasks, implementing major features, or before merging to verify work meets requirements
- **sivra-maestro** — >
- **systematic-debugging** — Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes
- **using-superpowers** — Use when starting any conversation - establishes how to find and use skills, requiring Skill tool invocation before ANY response including clarifying questions
- **verification-before-completion** — Use when about to claim work is complete, fixed, or passing, before committing or creating PRs - requires running verification commands and confirming output before making any success claims; evidence before assertions always
- **writing-plans** — Use when you have a spec or requirements for a multi-step task, before touching code

## Avisos de arquitectura
- ⚠️ **TPV / comanda**: en ia-rest; falta en ialimp, rrhh, sivra.
- ⚠️ **KDS (cocina)**: en ia-rest; falta en ialimp, rrhh, sivra.
- ⚠️ **Eventos / catering / BEO**: en ia-rest, sivra; falta en ialimp, rrhh.
- ⚠️ **Reservas**: en ia-rest; falta en ialimp, rrhh, sivra.
- ⚠️ **QR / portal cliente**: en ia-rest; falta en ialimp, rrhh, sivra.
- ⚠️ **Feedback / propinas**: en ia-rest; falta en ialimp, rrhh, sivra.
- ⚠️ **Equipo limpiadoras**: en ialimp, sivra; falta en ia-rest, rrhh.
- ⚠️ **Agenda / auto-asignación**: en ia-rest, ialimp, sivra; falta en rrhh.
- ⚠️ **Pricing dinámico**: en sivra; falta en ia-rest, ialimp, rrhh.
- ⚠️ **Mercado / ingest**: en sivra; falta en ia-rest, ialimp, rrhh.
- ⚠️ **CRM / leads / cotizador**: en ia-rest, ialimp; falta en rrhh, sivra.
- ⚠️ **Marketing (blog/IG/SEO)**: en ia-rest, sivra; falta en ialimp, rrhh.
- ⚠️ **RRHH / equipo**: en ia-rest, ialimp; falta en rrhh, sivra.
- ⚠️ **Almacén / stock / ASN**: en ia-rest, ialimp, sivra; falta en rrhh.
- ⚠️ **Proveedores / compras**: en ia-rest, ialimp, sivra; falta en rrhh.
- ⚠️ **Contabilidad**: en ia-rest, ialimp; falta en rrhh, sivra.
- ⚠️ **Facturación / VeriFactu**: en ia-rest, ialimp; falta en rrhh, sivra.
- ⚠️ **Hardware bridge**: en ia-rest; falta en ialimp, rrhh, sivra.
- ⚠️ **Escáner / OCR**: en ia-rest, ialimp; falta en rrhh, sivra.
- ⚠️ **Informes**: en ialimp; falta en ia-rest, rrhh, sivra.
- ⚠️ **Notificaciones (push)**: en ia-rest, ialimp, rrhh; falta en sivra.
- ⚠️ **Asistente / copiloto IA**: en ia-rest, ialimp, sivra; falta en rrhh.
- ⚠️ **Concursos públicos**: en ialimp; falta en ia-rest, rrhh, sivra.

## Novedades recientes (de `docs/CONTEXTO-SESIONES.md`)
- (15/06/2026) 🧑‍💼 NUEVA VERTICAL `apps/rrhh` · Portal del Empleado — Fase 1 cimiento IMPLEMENTADO — 15/06/2026 — PR #269
- (15/06/2026) 🏦 PLATAFORMA · Banca: análisis + fiscal + operativa — 15/06/2026 — PR #272 (MERGED)
- (15/06/2026) 🧾 IA-REST · E-recibo digital MVP IMPLEMENTADO (QR en ticket de cuenta) — 15/06/2026 — PR #256
- (15/06/2026) 🏨 PLATAFORMA: detalle completo por apartamento — PR #255 (MERGED)
- (14/06/2026) 🔑 SIVRA: Smoobu key unificada → fuente única en BD (14/06/2026)
- (14/06/2026) 🚨 SIVRA pricing: PAUSA GLOBAL activada — bug de techo en fechas de evento (14/06/2026)
- (15/06/2026) 🧾 IA-REST · IDEA (no implementada): ticket moderno + e-recibo digital
- (15/06/2026) 🎛️ PLATAFORMA: panel unificado — un solo shell (Mi negocio + Operador) — PR #249 (MERGED)
- (14/06/2026) 🏦 PLATAFORMA: conexión bancaria PSD2 EN VIVO (Enable Banking) + categorización IA diaria
- (14/06/2026) 🧹 IALIMP: portal del propietario responsive en escritorio (sidebar fija) — PR #239

