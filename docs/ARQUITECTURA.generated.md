# 🗺️ Arquitectura viva — casa de marcas `central`

> **Generado automáticamente** por `scripts/auditar-estructura.mjs` (2026-06-13T22:00:36Z). NO editar a mano.
> Se regenera en cada push (`.github/workflows/auditoria.yml`). Es el mapa que una sesión nueva lee del repo.
> Descripciones curadas, agentes y glosario: `apps/plataforma/lib/estructura.ts`. Visual: panel `/admin` → 🗺️ Estructura.

**Resumen:** 4 apps · 16 packages · 23 capacidades · 13 skills · 735 rutas API.

## Apps (verticales)
### ia-rest
- **Módulos que usa:** core-ai, core-fiscal, core-push, module-asn, module-contabilidad, module-crm, module-feedback, module-materiales, module-presupuestos, module-proveedores
- **Capacidades:** TPV / comanda, KDS (cocina), Eventos / catering / BEO, Reservas, QR / portal cliente, Feedback / propinas, Agenda / auto-asignación, CRM / leads / cotizador, Marketing (blog/IG/SEO), RRHH / equipo, Almacén / stock / ASN, Proveedores / compras, Contabilidad, Facturación / VeriFactu, Hardware bridge, Escáner / OCR, Notificaciones (push), Asistente / copiloto IA
- **Tablas (72):** beo_eventos, camareros, clientes_fiscales, cobro_config, comanda_items, comandas, config_tienda, contract_acceptances, documentos_escaneados, facturas_cliente, feedback_visita, formularios_demo_recibidos, iarest.checklist_ejecuciones, iarest.checklist_plantillas, iarest.produccion_tareas, iarest.produccion_tiempos_estandar, incidencias_sistema, inventario_menaje, inventario_menaje_evento, leads, leads_eventos, leads_unsubscribes, leads_web_tracking, manual_voz_novedades, marchar_log, marketing_consentimientos, materiales, materiales_asignacion, materiales_categorias, materiales_clientes…
- **Rutas API:** 443
### ialimp
- **Módulos que usa:** core-ai, core-email, core-fiscal, core-identity, core-push, core-storage, module-concursos, module-contabilidad, module-crm, module-materiales, module-proveedores
- **Capacidades:** Equipo limpiadoras, Agenda / auto-asignación, CRM / leads / cotizador, RRHH / equipo, Almacén / stock / ASN, Proveedores / compras, Contabilidad, Facturación / VeriFactu, Escáner / OCR, Informes, Notificaciones (push), Asistente / copiloto IA, Concursos públicos
- **Tablas (26):** apuntes_recurrentes, auth_rate_limit, biblioteca_documentos, catalogo_tarifas, cliente_auth_tokens, cliente_consentimientos, concursos, concursos_licitaciones, concursos_perfil_empresa, concursos_radar_anuncios, cuentas, documentos_contables, ingresos_manuales, mailing_campanas, mailing_envios, mailing_eventos, mailing_pasos, mailing_prospectos, negocios, partes_trabajo, protocolo_fotos, protocolo_items, protocolos, sociedades, stock_consumos, tenant_modulos
- **Rutas API:** 183
### plataforma _(matriz)_
- **Módulos que usa:** core-ai, core-identity, module-contabilidad
- **Capacidades:** —
- **Tablas (8):** comunicacion_categorias, comunicacion_conversacion_participantes, comunicacion_conversaciones, comunicacion_grupo_miembros, comunicacion_grupos, comunicacion_mensajes, comunicacion_nodos, comunicacion_reglas
- **Rutas API:** 23
### sivra
- **Módulos que usa:** core-ai, core-email, core-push, core-storage, module-contabilidad, module-materiales, module-proveedores
- **Capacidades:** Equipo limpiadoras, Agenda / auto-asignación, Pricing dinámico, Mercado / ingest, Marketing (blog/IG/SEO), Almacén / stock / ASN, Proveedores / compras, Asistente / copiloto IA
- **Tablas (0):** —
- **Rutas API:** 86

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
  - Lo usan: ialimp, sivra
  - Depende de: —
- **module-agenda** (module) → `@central/module-agenda`
  - Lo usan: —
  - Depende de: —
- **module-asn** (module) → `@central/module-asn`
  - Lo usan: ia-rest
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
- **module-feedback** (module) → `@central/module-feedback`
  - Lo usan: ia-rest
  - Depende de: —
- **module-materiales** (module) → `@central/module-materiales`
  - Lo usan: ia-rest, ialimp, sivra
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
- ⚠️ **TPV / comanda**: en ia-rest; falta en ialimp, sivra.
- ⚠️ **KDS (cocina)**: en ia-rest; falta en ialimp, sivra.
- ⚠️ **Eventos / catering / BEO**: en ia-rest; falta en ialimp, sivra.
- ⚠️ **Reservas**: en ia-rest; falta en ialimp, sivra.
- ⚠️ **QR / portal cliente**: en ia-rest; falta en ialimp, sivra.
- ⚠️ **Feedback / propinas**: en ia-rest; falta en ialimp, sivra.
- ⚠️ **Equipo limpiadoras**: en ialimp, sivra; falta en ia-rest.
- ⚠️ **Pricing dinámico**: en sivra; falta en ia-rest, ialimp.
- ⚠️ **Mercado / ingest**: en sivra; falta en ia-rest, ialimp.
- ⚠️ **CRM / leads / cotizador**: en ia-rest, ialimp; falta en sivra.
- ⚠️ **Marketing (blog/IG/SEO)**: en ia-rest, sivra; falta en ialimp.
- ⚠️ **RRHH / equipo**: en ia-rest, ialimp; falta en sivra.
- ⚠️ **Contabilidad**: en ia-rest, ialimp; falta en sivra.
- ⚠️ **Facturación / VeriFactu**: en ia-rest, ialimp; falta en sivra.
- ⚠️ **Hardware bridge**: en ia-rest; falta en ialimp, sivra.
- ⚠️ **Escáner / OCR**: en ia-rest, ialimp; falta en sivra.
- ⚠️ **Informes**: en ialimp; falta en ia-rest, sivra.
- ⚠️ **Notificaciones (push)**: en ia-rest, ialimp; falta en sivra.
- ⚠️ **Concursos públicos**: en ialimp; falta en ia-rest, sivra.

## Novedades recientes (de `docs/CONTEXTO-SESIONES.md`)
- (13/06/2026) ⏰ Cron huérfano arreglado: `instagram-ideas` (ia-rest) — branch `claude/agents-missing-schedules-u838j3`
- (13/06/2026) 🧾 Agente de facturas de SIVRA — branch `claude/invoice-processing-agent-7fwjst`
- (12/06/2026) 📦 module-materiales Fase B — PR #189 mergeado
- (12/06/2026) 🧱 Config de build compartida en la MATRIZ — PR #180
- (12/06/2026) 🧭 SKILLS-ROUTER DE CONTEXTO POR VERTICAL — rama `claude/project-scope-agent-validation-ip9f8b`
- (12/06/2026) 🤖 NUEVOS AGENTES IA + mejoras — PR #175 mergeado
- (12/06/2026) 🗑️ plataforma/admin: quita pestaña "Mis propiedades", acceso directo a ialimp — PR #171 mergeado
- (12/06/2026) 📦 REFACTOR `@central/module-inventario` → `@central/module-materiales` — PR #172
- (12/06/2026) 🔒 SEGURIDAD BD compartida — COMPLETO — 500 → 318 advisories, 0 ERROR
- (12/06/2026) 🔍 AUDITORÍA CON CONTEXTO del monorepo (post-reestructuración) — PR #164

