# 🗺️ Arquitectura viva — casa de marcas `central`

> **Generado automáticamente** por `scripts/auditar-estructura.mjs` (2026-06-25T15:56:30Z). NO editar a mano.
> Se regenera en cada push (`.github/workflows/auditoria.yml`). Es el mapa que una sesión nueva lee del repo.
> Descripciones curadas, agentes y glosario: `apps/plataforma/lib/estructura.ts`. Visual: panel `/admin` → 🗺️ Estructura.

**Resumen:** 5 apps · 26 packages · 23 capacidades · 17 skills · 951 rutas API.

## Apps (verticales)
### ia-rest
- **Módulos que usa:** core-ai, core-fiscal, core-payments, core-push, core-receipts, module-asn, module-contabilidad, module-crm, module-feedback, module-horario, module-materiales, module-organizador-trabajo, module-presupuestos, module-proveedores, module-trazabilidad
- **Capacidades:** TPV / comanda, KDS (cocina), Eventos / catering / BEO, Reservas, QR / portal cliente, Feedback / propinas, Agenda / auto-asignación, CRM / leads / cotizador, Marketing (blog/IG/SEO), RRHH / equipo, Almacén / stock / ASN, Proveedores / compras, Contabilidad, Facturación / VeriFactu, Hardware bridge, Escáner / OCR, Notificaciones (push), Asistente / copiloto IA
- **Tablas (82):** arqueos_caja_empleado, beo_eventos, camareros, clientes_fiscales, cobro_config, comanda_items, comandas, config_horario, config_tienda, contract_acceptances, documentos_escaneados, facturas_cliente, feedback_visita, formularios_demo_recibidos, iarest.checklist_ejecuciones, iarest.checklist_plantillas, iarest.produccion_tareas, iarest.produccion_tiempos_estandar, iarest.recibos_digitales, incidencias_sistema, inventario_menaje, inventario_menaje_evento, leads, leads_eventos, leads_unsubscribes, leads_web_tracking, manual_voz_novedades, marchar_log, marketing_consentimientos, materiales…
- **Rutas API:** 490
### ialimp
- **Módulos que usa:** core-ai, core-email, core-firma, core-fiscal, core-identity, core-payments, core-push, core-receipts, core-storage, module-contabilidad, module-crm, module-documental, module-materiales, module-proveedores, module-rrhh
- **Capacidades:** Equipo limpiadoras, Agenda / auto-asignación, CRM / leads / cotizador, RRHH / equipo, Almacén / stock / ASN, Proveedores / compras, Contabilidad, Facturación / VeriFactu, Escáner / OCR, Informes, Notificaciones (push), Asistente / copiloto IA
- **Tablas (31):** apuntes_recurrentes, auth_rate_limit, biblioteca_documentos, catalogo_tarifas, cliente_auth_tokens, cliente_consentimientos, concursos, concursos_licitaciones, concursos_perfil_empresa, concursos_radar_anuncios, concursos_seguidos, cuentas, documentos_contables, documentos_limpiadora, firma_otps_limpiadora, firmas_limpiadora, ingresos_manuales, mailing_campanas, mailing_envios, mailing_eventos, mailing_pasos, mailing_prospectos, negocios, partes_trabajo, protocolo_fotos, protocolo_items, protocolos, recordatorios_impagos, sociedades, stock_consumos…
- **Rutas API:** 180
### plataforma _(matriz)_
- **Módulos que usa:** core-ai, core-email, core-identity, core-telegram, module-concursos, module-contabilidad
- **Capacidades:** Equipo limpiadoras, Agenda / auto-asignación, Pricing dinámico, Mercado / ingest, CRM / leads / cotizador, Marketing (blog/IG/SEO), RRHH / equipo, Almacén / stock / ASN, Proveedores / compras, Facturación / VeriFactu, Asistente / copiloto IA, Concursos públicos
- **Tablas (24):** ai_usos, banca_destino_reglas, cima_liquidaciones, comunicacion_categorias, comunicacion_conversacion_participantes, comunicacion_conversaciones, comunicacion_grupo_miembros, comunicacion_grupos, comunicacion_mensajes, comunicacion_nodos, comunicacion_reglas, conexiones_banco, correduria_reglas, cuentas_bancarias, mensajes_aprendizaje, mensajes_auto_config, mensajes_guia_cache, mensajes_guia_gaps, mensajes_log, mensajes_pendientes_tg, mensajes_procesados, movimientos_bancarios, pricing_flight_demand, secrets_audit
- **Rutas API:** 160
### rrhh
- **Módulos que usa:** core-ai, core-email, core-firma, core-identity, core-storage, module-chat, module-documental, module-rrhh
- **Capacidades:** Notificaciones (push), Asistente / copiloto IA
- **Tablas (9):** rrhh.documentos, rrhh.empleados, rrhh.empresas, rrhh.firma_otps, rrhh.firmas, rrhh.mensajes, rrhh.push_subscriptions, rrhh.solicitudes, rrhh.usuarios_rrhh
- **Rutas API:** 28
### sivra
- **Módulos que usa:** core-ai, core-email, core-push, core-storage, module-contabilidad, module-materiales, module-proveedores
- **Capacidades:** Eventos / catering / BEO, Equipo limpiadoras, Agenda / auto-asignación, Pricing dinámico, Mercado / ingest, Marketing (blog/IG/SEO), Almacén / stock / ASN, Proveedores / compras, Asistente / copiloto IA
- **Tablas (1):** gastos_fijos
- **Rutas API:** 93

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
  - Lo usan: ialimp, plataforma, rrhh
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
  - Lo usan: ia-rest
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
- **module-trazabilidad** (module) → `@central/module-trazabilidad`
  - Lo usan: ia-rest
  - Depende de: —

## Skills del proyecto
- **auditoria-central** — Auditoría CON CONTEXTO del monorepo `central` (casa de marcas). Úsala tras renames de scope, migraciones de BD, reestructuras de packages/apps, o antes de un corte de infraestructura — cuando Alberto pregunte "¿se ha roto algo?", "haz una auditoría", "revisa que todo está bien" o pida pruebas/testeo del proyecto. NO es un checklist genérico: aprovecha la matriz de consumo, la BD compartida multi-tenant y la infra real (Supabase/Vercel por MCP).
- **brainstorming** — "You MUST use this before any creative work - creating features, building components, adding functionality, or modifying behavior. Explores user intent, requirements and design before implementation."
- **central-maestro** — >
- **facturas-correo** — Agente PROGRAMADO que revisa el Gmail de Alberto buscando facturas/justificantes de gasto, los clasifica (personal vs negocio deducible), archiva en Google Drive los deducibles y los concilia con los movimientos bancarios de plataforma. Úsala cuando Alberto pida "revisa mis correos/facturas", o cuando la dispare el trigger diario de Claude Code web. NO es un proceso 24/7: se despierta, hace una pasada sobre lo nuevo y deja un resumen.
- **fiscal-novedades** — Agente PROGRAMADO que vigila cambios en las deducciones del IRPF (estatales en el BOE y autonómicas de Andalucía en el BOJA/AEAT) y los contrasta con los importes que usa el módulo /finanzas de plataforma (IMPORTES_POR_ANIO en apps/plataforma/lib/fiscal-deducciones.ts). Cuando un importe cambia, abre un PR draft que actualiza la constante e inserta una fila en fiscal_novedades para que la app avise EN PANTALLA si el cambio beneficia a Alberto. Úsala cuando Alberto pida "revisa si han cambiado las deducciones" o cuando la dispare su trigger (mensual + antes de la campaña de renta). NO se cuelga del agente de concursos (ese sondea PLACSP por CPV).
- **ia-rest-maestro** — >
- **ialimp-maestro** — >
- **perfil-fiscal** — Router de contexto FISCAL y PATRIMONIAL de Alberto (persona física) + la sociedad Punto y Coma SL. Úsalo SIEMPRE que Alberto pida algo de su renta/IRPF, declaración, gastos deducibles, qué piso tributa dónde, su asesoría, o cuando trabajes con `facturas-correo`, `fiscal-novedades` o el módulo `/finanzas`. NO duplica los datos personales (esos viven en la BD `fiscal_perfil`/`fiscal_descendientes`); aquí está la ESTRUCTURA: qué entidad declara qué, las reglas de gasto y los caveats. Sin cifras ni datos sensibles.
- **plataforma-maestro** — >
- **pricing-agente** — >
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

## Novedades recientes (de `docs/CONTEXTO-SESIONES.md`)
- (25/06/2026) 🔎 AGENTE SEO: fix crash + visibilidad de errores — 25/06/2026 (rama `claude/agent-error-visibility-k4ayma`)
- (25/06/2026) ⚡ PRICING: salto directo en eventos + apply 3x/día — 25/06/2026 (rama `claude/dynamic-pricing-uhvnak`)
- (25/06/2026) 🐛 AGENTE HUÉSPEDES SIVRA · "se respondía a sí mismo" — 25/06/2026 — branch `claude/luxury-busto-kitchen-amenities-14rz2x`
- (25/06/2026) 🧹 LIMPIEZA · revisión correos GitHub + barrido de envs/credenciales muertas — 25/06/2026 — branch `claude/github-noreply-email-review-lbzv7k` · PR draft #512
- (25/06/2026) 📘 MANUAL + datos demo + fix login para reunión Catering JJ — 25/06/2026 (rama `claude/jj-logistica-materiales-k5eko3`)
- (25/06/2026) 🔧 AGENTE HUÉSPEDES SIVRA · BOTÓN "RETOCAR SOBRE EL BORRADOR" — 25/06/2026 (branch `claude/luxury-busto-guest-reply-n8ltqp`)
- (25/06/2026) 📦 RECEPCIÓN DE MERCANCÍA MULTI-MODAL (cocina central) · IMPLEMENTADO Y MERGEADO — 25/06/2026 — PR #511 (branch `claude/information-extraction-orls7m`)
- (25/06/2026) 📦 RECEPCIÓN DE MERCANCÍA MULTI-MODAL (cocina central) · SPEC — 25/06/2026 — branch `claude/information-extraction-orls7m`
- (25/06/2026) 👻 AGENTE HUÉSPED · fix "escalado fantasma" (recordatorio horario de un mensaje ya respondido) — 25/06/2026 — branch `claude/busto-reform-guest-reply-imltis`
- (24/06/2026) 💬 AGENTE HUÉSPED · responder a lo que escribe el huésped (no soltar horarios) — 24/06/2026 — branch `claude/busto-reform-guest-reply-imltis`

