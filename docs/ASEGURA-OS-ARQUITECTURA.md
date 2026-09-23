# ASegura OS — Auditoría arquitectónica y propuesta (sin código)

## Contexto
Alberto pide convertir la correduría (Grupo ASegura) en un «sistema operativo» event-driven con agentes IA, human-in-the-loop y auditoría. Antes, había pedido esquematizar el ciclo CRM: oportunidad → presupuesto → emisión o pérdida → póliza en vigor → anulación firmada y comunicada. Este documento es la auditoría y la arquitectura propuesta. **No hay implementación hasta que se apruebe.**

Decisiones de Alberto (23/09):
- **Fondos**: todo lo domicilia la compañía. La correduría solo cobra comisiones, así que **no hace falta un ledger de fondos de terceros**.
- **Alcance**: solo Grupo ASegura. Un tenant, pero se conserva `corredurias.id`.
- **Colaboradores**: el contrato Pactrebol es de momento un modelo. Se modela, pero no se construye hasta que haya un colaborador firmado.

Ronda 2 de respuestas (23/09):
1. **Firma**: sí, se reutiliza la de rrhh. `FirmaPropia` de `@central/core-firma` es genérica por puertos: rrhh solo implementa los suyos sobre `rrhh.documentos/firmas/firma_otps` (`apps/rrhh/lib/firma.ts:3,16-35`). Para seguros basta con implementar esos mismos puertos sobre `seguros.firma` (ya existe) y el OTP del portal (ya existe, `apps/asegura-portal/lib/canal.ts`). **No hay que desarrollar firma nueva.**
2. **WhatsApp Business y telefonía**: se sacan del roadmap activo y pasan a «más adelante». El puerto de canal del portal ya deja el hueco hecho.
3. **Control de CIMA**: ver sección siguiente. **Hay avería activa.**

## 🚨 CIMA — estado medido el 23/09 a las 05:26 UTC y qué falta para tener el control

**No funciona desde el 22/09 a las 10:10 UTC.** Datos:
- Último `cima_pull_completed`: 21/09 17:09. Cero pulls el 22/09.
- Último `cima_health_alert_run`: 21/09 16:10. El vigilante **también** está caído, así que nadie ha avisado.
- En Actions del repo `asegura`, **todos** los workflows (cima-pull ×3, cima-health-alert, cima-reprocesar-cuarentena, codeoscopic-polling, e2e-smoke, pre-launch-checklist…) fallan en 3-4 s con `runner_id: 0`, es decir, **sin llegar a tener máquina**. El código no llega a ejecutarse.
- Los Actions de `central` (misma cuenta) sí corren.

Causa [Probable]: **minutos de Actions agotados o límite de gasto en el repo PRIVADO `asegura`**. Lleva 11.636 runs, con crons como `codeoscopic-polling` cada pocas horas y e2e. El mensaje exacto solo sale en la página del run («The job was not started because…»), no en la API.

Pérdida de datos: [Probable] **ninguna todavía**. TIREA retiene lo no confirmado y entrará en el próximo pull, pero ojo con el TTL/purga (skill `cima-ingesta`).

✅ **RESUELTO el 23/09 a las 07:15 UTC** (Alberto, con Claude en Chrome). Verificado en BD:
- `cima_pull_completed` 07:15:14 y `cima_health_alert_run` 07:16:00.
- Entraron 15 siniestros, 1 póliza y 1 recibo.

Causa confirmada: **presupuesto de Actions de la cuenta a 0 $ con «Stop usage» y sin método de pago**. Al agotarse el uso incluido, GitHub bloqueaba los jobs antes de asignar runner. Ahora hay tarjeta y 20 $/mes, con «Stop usage» activo.

🚨 **Pero volverá a pasar si no se actúa.** El presupuesto es **de la cuenta, compartido entre repos**, y el que se lo come es **`central`: ~71.700 min (~430 $ de valor) este mes, frente a ~2.070 min de `asegura`**. Con 20 $, central agotará otra vez el margen y **CIMA se volverá a quedar sin runner** en el próximo ciclo. Por eso:
- el punto 2 de abajo (sacar CIMA de Actions) pasa a ser **la primera pieza de código**;
- se añade el punto 9: **reducir el consumo de Actions de `central`**.

Qué hace falta para tener el control de CIMA, por orden:
1. **YA — Alberto**: abrir un run fallido (p. ej. `actions/runs/35748415513`) y leer el banner. Si son minutos o gasto: subir el límite de gasto de Actions o esperar al reset del ciclo. En cuanto corra, lanzar `cima-pull` a mano.
2. **Quitar la dependencia de GitHub Actions** (recomendado; cambio pequeño en central):
   - Mover el disparo de `cima-pull` (hoy un `curl` desde Actions al CRM) a un job del `cron-dispatch` de plataforma (05:30/11:30 UTC), con el mismo secreto.
   - Actions deja de ser un punto único de fallo y deja de gastar minutos.
3. **El vigilante no puede correr en la misma infraestructura que vigila.** Alerta de «pull mudo > 26 h» (`HORAS_PULL_MUDO` ya existe en `module-seguros/src/ingesta.ts`) desde el cron-dispatch de plataforma → Telegram. Hoy solo se pinta en pantalla; si Actions cae, cae con él.
4. **Crons programados a nombre de Manuel**: los runs `schedule` salen con actor `manuelsuarez` (GitHub los atribuye a quien editó el cron por última vez). Al quitarle el `write` (pendiente, ya dio el OK), hay que re-guardar los workflows desde la cuenta de Alberto o dejarlos muertos si se hace el punto 2.
5. **Secretos TIREA de PRODUCCIÓN**: conseguir la copia de Manuel (enlace de un solo uso) y guardarla en un gestor. Sin ella no se puede reconstruir el adaptador.
6. **Webhook de Codeoscopic**: 34 `webhook_signature_invalid` en 36 h contra el CRM. Repuntarlo al receptor propio de central (`apps/asegura/app/api/webhooks/codeoscopic`) y revisar el secreto.
7. **Datos**:
   - Aplicar el SQL de pólizas duplicadas (19 números, pendiente de tu OK, `docs/CIMA-CUARENTENA.md`).
   - Llamar a **Mapfre**: 0 ficheros desde el 23/06 y es la compañía con más pólizas. El problema es aguas arriba.
9. **Consumo de Actions de `central`** (~71.700 min/mes). Sospechosos [Probable, por medir]:
   - la matriz de typecheck de 13 apps en cada push de PR;
   - `rutinas-automerge` cada hora;
   - la auditoría y las rutinas.

   Medirlo sumando la duración de los runs por workflow en 30 días (un agente económico, solo lectura). Palancas típicas: `paths` / `paths-ignore` en `tests.yml` (que solo typechequee las apps tocadas), `concurrency` con cancelación, y bajar la frecuencia del automerge. **Cuidado**: los 9 typechecks son checks REQUERIDOS del ruleset. Filtrar por `paths` los dejaría en «Expected» y bloquearía el merge, así que hay que resolverlo con jobs que se saltan a sí mismos pero reportan éxito, no quitando el trigger.
10. **Alberto**: corregir el país de facturación de GitHub (pone Suecia; debe ser España) por el IVA.
8. **Port de `cima-pull` a central**: sigue aparcado. Con los puntos 2 y 3 no hace falta todavía; se reevalúa si el CRM de Manuel vuelve a dar guerra.

En el roadmap, los puntos 1-3 entran en la **Fase 0** (antes que ninguna otra cosa: sin ingesta no hay eventos de cartera).

---

## ⚠️ Lo incómodo primero

1. **La escala no justifica la arquitectura pedida.** La cartera en vigor son **67 clientes / 105 pólizas** [Seguro, `esCarteraEnVigor`]. Un workflow engine externo, 8 agentes autónomos, replay y sandbox generalizados hoy serían construir por construir. Propuesta: **eventos + workflows deterministas en Postgres, y la IA como herramienta dentro de pasos concretos**. Un «agente» es un *perfil de permisos + prompt* asociado a unos workflows, no un proceso autónomo.
2. **El origen principal de los datos, la ingesta CIMA, vive fuera de central.** La cadena es Actions en el repo `asegura` → CRM de Manuel → adaptador Java → TIREA, y escribe en `seguros` con el rol `crm_seguros`. Central no puede emitir eventos en el origen. Ninguna automatización fiable de pólizas y recibos es posible hasta resolverlo. Dos salidas: (a) traer el port de `cima-pull` (hoy aparcado a propósito), o (b) **detectar cambios en central** con un snapshot/diff periódico sobre `seguros`. Recomiendo **(b) primero**: es barato y no toca la cadena que funciona. (a) queda para cuando la cadena dé problemas.
3. **La auditoría actual no permite reconstruir el «por qué».**
   - `historial_interno` no guarda valor anterior ni nuevo, a propósito, y el autor va en texto libre.
   - `polizas`, `poliza_recibos` y `siniestros` no tienen historial de cambios.
   - El puerto `/api/operador/*` usa **un único Bearer compartido**, así que asegura no sabe qué humano ni qué agente actúa.

   Sin arreglar esto, meter agentes que escriben es inaceptable.
4. **Riesgos de seguridad vivos**, independientes de ASegura OS:
   - `verifyTelegramWebhook` **deja pasar todo si falta el secreto** (`packages/core-telegram/src/index.ts:122`), y los callbacks de botones no validan el emisor. Los botones de Telegram van a ser el canal de aprobación, así que esto es bloqueante.
   - Las llamadas directas a `aiComplete` (recaptación en asegura, agente de huéspedes) **no quedan registradas** en `ai_usos`.
   - Groq ha dejado de ser gratis y está en la cadena de fallback sin presupuesto (21/09).
5. **El ciclo comercial que pediste está a medias y la anulación no existe.**
   - `seguros.oportunidades` es legacy y nadie la lee.
   - No hay motivo de pérdida estructurado.
   - El presupuesto va por el PR 2 de 6.
   - La emisión no marca `presupuesto.emitido_at`.
   - **No hay flujo de anulación**: ni firma del cliente, ni aviso a la compañía, ni reflejo en el portal.

   La firma no hay que construirla: `@central/core-firma` (eIDAS art. 26) y la tabla `seguros.firma` ya existen, pero sin conectar.
6. **BD compartida en el plan Free** (284 MB de 500 tras la limpieza). Hay documentos guardados como `bytea` dentro de la BD. Cualquier tabla de eventos o auditoría necesita **retención/TTL desde el día 1**, y los documentos deben migrar a Storage.

---

## A. Estado actual (lo que existe de verdad)

| Área | Estado | Dónde |
|---|---|---|
| Datos de cartera (≈90 tablas, schema `seguros`) | ✅ | `apps/asegura/prisma/asegura.prisma`, DDL `apps/asegura/prisma/sql/2026-09-01_seguros_volcado_ddl.sql` |
| Reglas puras: vigencia, cartera viva, recibos, siniestros, retención, presupuesto, emisión | ✅ | `packages/module-seguros/src/*` (`cartera-viva.ts:56,108`, `vigencia.ts:22`, `presupuesto-cliente.ts:61`) |
| PII cifrada + blind index | ✅ | `packages/module-seguros-pii` |
| Ingesta CIMA/EIAC (cuarentena `review`, dedupe por hash) | ✅ fuera de central | `docs/ASEGURA-CIMA-INGESTA-INVENTARIO.md` |
| Tarificación / emisión Codeoscopic (interruptores + topes + libro de gasto) | ✅ con compuertas | `apps/asegura/lib/retarificar-cartera.ts`, `lib/emision.ts:33`, `codeoscopic_consumo` |
| Webhook Codeoscopic tipo «inbox» (guarda primero, procesa después) | ✅ sin repuntar | `apps/asegura/app/api/webhooks/codeoscopic` |
| Presupuesto al cliente (append-only `presupuesto_evento`) | 🟡 PR 1-2 de 6 | spec `docs/superpowers/specs/2026-09-21-asegura-presupuesto-al-cliente-design.md` |
| Portal cliente (OTP por puerto de canal, pólizas, recibos, partes, declaradas, autorizaciones) | ✅ | `apps/asegura-portal`, `module-seguros-portal` |
| Libro de comisiones (devengado → liquidado → cobrado) y cuadre de 9 estados | ✅ | `apps/plataforma/prisma/sql/2026-09-01_comisiones_devengo.sql`, `lib/correduria/cuadre.ts:52` |
| Banca: PSD2 (Enable Banking), Norma 43, conciliación por importe/fecha | ✅ (sin score) | `apps/plataforma/lib/psd2.ts`, `lib/norma43.ts:57`, `lib/conciliacion.ts:59` |
| Triaje de correo con `confianza` y resolución por nº de póliza | ✅ parcial | `apps/plataforma/lib/correo/triaje.ts`, `correduria-resolver.ts` |
| Extracción IA de pólizas y facturas | ✅ | `apps/asegura/lib/documentos/extraer-poliza.ts`, `plataforma/lib/agente-facturas/extraer.ts` |
| Capa IA multi-proveedor + gateway + coste + router por categoría | ✅ | `packages/core-ai/src/client.ts:166`, `plataforma/lib/pasarela.ts`, `lib/ia-director.ts`, `ai_usos` |
| Aprobación por botones de Telegram | ✅ ad hoc | `core-telegram`, webhook `plataforma/app/api/sivra/mensajes/telegram-webhook/route.ts` (1.038 líneas de `if`) |
| Crons: dispatcher de 1 min con 80 jobs y lock | ✅ | `apps/plataforma/lib/cron-dispatch.ts` |
| Firma electrónica | 🟡 existe, no conectada | `packages/core-firma`, `seguros.firma` |
| Tareas (`seguros.gestiones`) | 🟡 tabla sin código | DDL |
| Oportunidades / motivo de pérdida | ❌ | `seguros.oportunidades` legacy sin uso |
| Anulación de póliza | ❌ | solo carta de no renovación en el portal (`carta-no-renovacion.ts`), sin envío ni firma |
| Eventos / outbox / workflow engine | ❌ | solo tablas de dominio sueltas (`operational_events`, `presupuesto_evento`) |
| Audit trail genérico (antes/después, actor, agente) | ❌ | más de 10 tablas de log fragmentadas |
| RBAC por usuario / permisos por agente | ❌ | `cuentas.rol` a null en todas; allowlist por email |
| WhatsApp Business, telefonía | ❌ | solo enlaces `wa.me` |
| Colaboradores | ❌ | solo `comercial_id` → `seguros.usuarios` |
| IPS / Consorcio / CLEA como campos | ❌ | solo en un prompt |
| Observabilidad (Sentry) | ❌ | `console.*` + latidos + health-check |

## B. Mapa de arquitectura actual

```text
TIREA ⇄ adaptador Java (Fly, grupo-asegura) ⇄ CRM Manuel (Vercel, repo asegura) ← Actions 05:30/11:30
                                                   │ rol crm_seguros
Codeoscopic ──webhook──► CRM Manuel (aún)          ▼
                                   ┌──────── Supabase compartida (schema seguros + public) ───────┐
                                   │                                                               │
 apps/asegura (trastienda) ── prisma_seguros (BYPASSRLS) ── /api/operador/* (Bearer único)       │
      crons: avisos-vencimiento, avisos-intranet, revision-anual                                   │
 apps/plataforma /correduria (ÚNICA pantalla) ──HTTP──► puerto asegura                             │
      cron-dispatch (80 jobs): cima-liq, renovaciones, siniestros, partes, sustituciones, ingesta,  │
      correo-triaje (IMAP), psd2-sync, facturas… ; comisiones_devengo en public                    │
 apps/asegura-portal ── prisma_asegura_portal (SIN BYPASSRLS) ── OTP email                         │
 apps/asegura-web ── sin BD ── lead → plataforma → asegura → Telegram                              │
 packages: module-seguros(-portal,-pii), core-ai, core-telegram, core-firma, core-email, core-identity
```

Juicio:
- **Bien diseñado, mantener:**
  - Reglas puras en `module-seguros` con tests.
  - asegura como único dueño de la escritura en `seguros`.
  - plataforma como pantalla única.
  - Interruptores de gasto *fail-closed*.
  - Tablas append-only con trigger.
  - `esCarteraViva` / `esCarteraEnVigor` como fuente única.
  - Webhook tipo inbox.
- **Mal o frágil:**
  - Bearer único sin identidad de actor.
  - Historial sin antes/después.
  - Webhook de Telegram monolítico y *fail-open*.
  - Documentos en `bytea`.
  - Ingesta fuera de central.
  - Cada agente con su propia tabla de propuestas.

## C. ASegura OS objetivo

```text
ENTRADAS: CIMA(diff) · Codeoscopic webhook · email(triaje) · portal · web · Norma43/PSD2 · documentos · Telegram
    │  (adaptadores en apps/asegura/lib/integraciones/* — desacoplados del dominio)
    ▼
INBOX (seguros.entrada: payload hash + origen + idempotency_key)  ← normaliza y deduplica
    ▼
EVENTOS (seguros.evento, outbox en la MISMA transacción que el cambio de dominio)
    ▼
DISPATCHER (job del cron-dispatch de plataforma → POST asegura /api/operador/eventos/procesar, lotes, reintentos, lock)
    ▼
WORKFLOWS (código TS en module-seguros/workflows: definición versionada = lista de pasos puros)
    ├── REGLAS (funciones puras existentes + seguros.regla versionada)
    ├── HERRAMIENTAS (catálogo tipado: leerPoliza, crearTarea, proponerCambio, redactarEmail…)
    │       └── IA vía core-ai/gateway (clasificar, extraer, redactar) → devuelve {valor, confianza, fuentes}
    ▼
POLÍTICA HITL (seguros.politica_accion: accion → auto | aprobar | prohibido, por perfil de agente)
    ├── auto → ACCIÓN (escritura vía repositorio de asegura)
    └── aprobar → seguros.aprobacion (cola ÚNICA) → cockpit plataforma / botón Telegram firmado
    ▼
SEGUIMIENTO (seguros.tarea = gestiones reutilizada, con SLA)
    ▼
AUDITORÍA (seguros.auditoria: actor humano|agente, workflow+versión, regla+versión, antes/después, fuentes, aprobación)
    ▼
COCKPIT (/correduria/hoy en plataforma: lo que necesita a Alberto)
```

Principios:
1. **Postgres es el bus.** Sin Inngest, Trigger.dev ni colas externas mientras el volumen lo permita; revisar si se superan ~10k eventos/día o hay latencias <1 min.
2. **Workflows como código versionado**, no como configuración en BD. Así son testeables con `node --test` y hacen posible el replay.
3. **La IA nunca decide sola una escritura crítica.** Propone; la política decide.
4. **Una sola cola de aprobaciones y una sola tabla de auditoría** para todos los agentes.
5. **Todo pasa por asegura.** plataforma solo lee y llama al puerto.

## D. Gap analysis

| Área | Existe | Parcial | Falta | Prioridad | Riesgo |
|---|---|---|---|---|---|
| Identidad del actor en el puerto | | Bearer único | actor humano/agente firmado por llamada | P0 | Alto (sin él no hay auditoría) |
| Audit trail genérico | logs sueltos | `historial_interno` | `seguros.auditoria` antes/después | P0 | Alto |
| Seguridad del webhook de Telegram | | valida chat en mensajes | fail-closed + validar emisor en callbacks | P0 | Alto |
| Registro de uso de IA | gateway | directos sin log | forzar todo por el gateway | P1 | Medio (coste/trazabilidad) |
| Eventos / outbox | tablas de dominio | `presupuesto_evento`, `operational_events` | `seguros.evento` + dispatcher | P1 | Medio |
| Detección de cambios CIMA | ingesta externa | `operational_events` | diff/snapshot en central | P1 | Alto (fugas de cartera invisibles) |
| Oportunidad + motivo de pérdida | | `presupuesto.retirado_motivo` libre | enum de motivos + competidor + prima rival | P1 | Bajo |
| Presupuesto → emisión | PR 1-2 | emisión sin enlazar | PR 3-6 + enlazar `emitido_at` | P1 | Medio |
| Anulación con firma y aviso | | carta de no renovación | workflow completo | P1 | Alto (contractual) |
| Firma electrónica en seguros | core-firma, tabla | | conectar | P1 | Bajo |
| Cola de aprobaciones única | 6 tablas ad hoc | | `seguros.aprobacion` | P1 | Medio |
| Tareas / incidencias | `gestiones` | | usarla + SLA | P2 | Bajo |
| Confidence engine | `confianza` en triaje/facturas | | contrato `{valor, confianza, fuentes, regla}` | P2 | Medio |
| Documental (Storage, versionado, retención) | extracción IA | `seguros.documentos` bytea | Storage + versión + retención | P2 | Medio (BD Free) |
| Zero inbox | triaje + resolver póliza | | workflow `DOCUMENTO/EMAIL_RECIBIDO` | P2 | Medio |
| Cockpit / Next Best Action | pantallas sueltas | avisos de renovación, retención | `/correduria/hoy` | P2 | Bajo |
| Fugas de cartera | aviso de sustituciones | estados CIMA | detector sobre el diff | P2 | Alto (negocio) |
| Data quality | merges, cuarentena | | reglas de calidad como workflow | P2 | Medio |
| Financiero (comisiones) | libro + cuadre | `banco_total` NULL | conciliación banco↔liquidación con score | P3 | Medio |
| Ledger de fondos de terceros | | | **no necesario** (lo domicilia la compañía) | — | — |
| IPS/Consorcio/CLEA | | prompt | campos si CIMA los trae | P3 | Bajo |
| Colaboradores | | | modelo (sin construir) | P4 | — |
| RBAC multiusuario | | allowlist | roles básicos (Alberto/empleado/lectura) | P3 | Medio |
| WhatsApp Business | | wa.me | WABA vía puerto de canal ya existente | P3 | Medio (coste/Meta) |
| Replay / sandbox | | interruptores de gasto | modo `simular` del dispatcher | P4 | Bajo |
| Aprendizaje controlado | aprendizaje en triaje/huéspedes | | `regla_candidata` desde correcciones | P4 | Bajo |
| Telefonía | | | fuera de alcance por ahora | P5 | — |

## E. Cambios arquitectónicos (qué y por qué)

1. **Identidad del actor en el puerto (P0).** El puerto sigue con el Bearer, pero cada llamada lleva además un `X-Actor` firmado (JWT corto de `core-identity` con `tipo: humano|agente`, `id`, `workflow?`). asegura lo verifica y lo propaga a la auditoría. *Por qué*: es la precondición de todo lo demás.
2. **`seguros.auditoria` + helper `auditar()` en asegura (P0).**
   - Todas las escrituras de `lib/cartera-*.ts` pasan por él: entidad, id, campo, antes/después (PII como hash, nunca en claro), actor, workflow y versión, regla y versión, `evento_id`, `aprobacion_id`, fuentes.
   - Retención de 24 meses en caliente; después, un volcado mensual comprimido a Storage.
   - `historial_interno` se queda como vista legible, alimentada desde aquí.
3. **Outbox en la misma transacción (P1).** `seguros.evento` (tipo, entidad, id, payload mínimo, `idempotency_key`, estado, intentos, `procesado_at`). El dispatcher es un job más del `cron-dispatch` de plataforma que llama a `POST asegura/api/operador/eventos/procesar` (lote de 50, `FOR UPDATE SKIP LOCKED`). Retención de 90 días para los procesados.
4. **Detector de cambios de cartera (P1).** Un job en asegura compara el snapshot de `polizas`/`poliza_recibos`/`siniestros` (hash por fila) con el anterior y emite `POLIZA_ACTUALIZADA`, `POLIZA_CANCELADA`, `POLIZA_DESAPARECIDA`, `RECIBO_DEVUELTO`… Así se obtienen eventos sin tocar la ingesta de Manuel.
5. **Motor de workflows mínimo en `packages/module-seguros/src/workflows/`.** Cada workflow es `{id, version, disparadores: TipoEvento[], pasos: Paso[]}`, y cada paso es una función pura que devuelve una lista de *intenciones* (`crearTarea`, `proponerCambio`, `enviarComunicacion`…). asegura ejecuta las intenciones aplicando la política. Puro significa testeable y reproducible (replay gratis más adelante).
6. **Política HITL y cola única (P1).** `seguros.politica_accion` (acción × perfil → auto/aprobar/prohibido) y `seguros.aprobacion` (intención serializada, confianza, fuentes, caducidad, decidida_por).
   - Se aprueba desde el cockpit o desde un botón de Telegram (prefijo nuevo `aos_`, ya con webhook fail-closed y validación del emisor).
   - Las colas actuales de sivra y trading no se migran: no son de este dominio.
7. **Documentos a Supabase Storage (P2).** `seguros.documentos` guarda metadatos, `sha256`, `version`, `sustituye_a`, `retener_hasta`; el binario va vía `core-storage`. La migración de los `bytea` existentes se hace en un lote.
8. **Refactor del webhook de Telegram (P1, acotado).** Extraer un router por prefijo (`Map<prefijo, handler>`) desde el `if` de 1.038 líneas, y solo lo necesario para añadir `aos_` con seguridad. El resto de prefijos no cambia de comportamiento.
9. **Qué NO cambiaría:**
   - La separación asegura (datos) / plataforma (pantalla) / portal.
   - `core-ai` y el gateway (ya cumplen «IA intercambiable»).
   - La cadena CIMA.
   - Los interruptores de gasto de Codeoscopic.
   - Crear una app o un microservicio nuevo: **innecesario**.

Qué va en cada sitio:

| Pieza | Tipo | Ubicación |
|---|---|---|
| Tipos de evento, workflows, reglas, política por defecto | package (puro) | `packages/module-seguros/src/{eventos,workflows,politica}` |
| Outbox, dispatcher genérico, `auditar()`, JWT de actor | package reutilizable | `packages/core-eventos` (nuevo, pequeño) o dentro de `core-identity` para el actor |
| Ejecutor de intenciones, repositorios, endpoints | servicio | `apps/asegura/lib/os/*`, `/api/operador/eventos/*`, `/api/operador/aprobaciones/*` |
| Adaptadores CIMA-diff, email, Codeoscopic, banco | integración | `apps/asegura/lib/integraciones/*` (el email y la banca siguen en plataforma y publican un evento vía puerto) |
| Disparo periódico | worker | un job en `apps/plataforma/lib/cron-dispatch.ts` |
| Cockpit y aprobaciones | UI | `apps/plataforma/app/(usuario)/correduria/hoy` |
| «Agentes» | configuración | perfil (permisos) + prompts en `module-seguros/src/agentes/*.ts` |

## F. Modelo de datos (entidades nuevas o cambiadas; el resto se reutiliza)

```text
corredurias 1─* clientes 1─* polizas 1─* poliza_recibos
                 │            │ └─* siniestros
                 │            └── poliza_padre_id / poliza_origen_id (renovación / sustitución)
                 ├─* oportunidad (NUEVA, sustituye a la legacy)
                 │     estado: abierta|presupuestada|ganada|perdida|descartada
                 │     motivo_perdida: precio|competidor|cobertura|cliente_desiste|sin_respuesta|otro (+ texto)
                 │     competidor_compania_dgs, prima_competidor, poliza_actual_id?, origen (renovacion|lead|cross_sell|recaptacion)
                 │     1─* presupuesto (existe; + oportunidad_id) 1─* presupuesto_opcion ─ poliza_emitida_id
                 ├─* anulacion (NUEVA): poliza_id, tipo (a_vencimiento|inmediata|no_renovacion LCS 22|sustitucion),
                 │     solicitada_por (cliente|correduria|compania), motivo, fecha_efecto, estado,
                 │     firma_id → firma (existe), comunicada_compania_at, acuse_compania_doc_id, confirmada_cima_at
                 ├─* tarea (reutiliza gestiones: + sla_at, origen_evento_id, workflow_id)
                 └─* documentos (existe; + version, sustituye_a, storage_path, retener_hasta, tipo_doc, confianza_clasif)
companias_dgs 1─* compania_contactos (+ canal_anulaciones: email/portal/api)
evento · entrada(inbox) · aprobacion · auditoria · politica_accion · regla(versionada) · regla_candidata  (NUEVAS, transversales)
comisiones_devengo/cobertura (public, existen) ── liquidaciones/cuenta_efectivo (seguros, existen) ── movimientos_bancarios
colaborador · contrato_colaboracion · cesion_comision   (SOLO MODELADAS, no se construyen: decisión 23/09)
```

Nota: sin ledger de fondos de terceros (lo domicilia la compañía). El «ledger» se limita a comisiones: devengo → liquidación → cobro en banco, que ya existe; falta el tramo del banco.

## G. Eventos (lista inicial, tipados en `module-seguros/src/eventos`)

- **Cartera**: `CLIENTE_CREADO`, `CLIENTE_FUSIONADO`, `POLIZA_CREADA`, `POLIZA_ACTUALIZADA`, `POLIZA_EMITIDA`, `POLIZA_RENOVADA`, `POLIZA_SUSTITUIDA`, `POLIZA_CANCELADA`, `POLIZA_DESAPARECIDA` (sin rastro en CIMA), `POLIZA_VENCE_EN_60D`, `POLIZA_VENCE_EN_30D`
- **Comercial**: `LEAD_RECIBIDO`, `OPORTUNIDAD_CREADA`, `PRESUPUESTO_PREPARADO`, `PRESUPUESTO_ENVIADO`, `PRESUPUESTO_VISTO`, `PRESUPUESTO_ACEPTADO`, `PRESUPUESTO_CADUCADO`, `OPORTUNIDAD_GANADA`, `OPORTUNIDAD_PERDIDA`
- **Anulación**: `ANULACION_SOLICITADA`, `ANULACION_FIRMADA`, `ANULACION_COMUNICADA`, `ANULACION_CONFIRMADA`
- **Recibos**: `RECIBO_IMPORTADO`, `RECIBO_COBRADO`, `RECIBO_DEVUELTO`, `RECIBO_PENDIENTE_VENCIDO`
- **Siniestros**: `SINIESTRO_ABIERTO`, `PARTE_PORTAL_RECIBIDO`, `SINIESTRO_SIN_MOVIMIENTO_Nd`, `SINIESTRO_CERRADO`
- **Documental**: `DOCUMENTO_RECIBIDO`, `DOCUMENTO_CLASIFICADO`, `DOCUMENTO_VALIDADO`, `EMAIL_CORREDURIA_RECIBIDO`
- **Financiero**: `LIQUIDACION_IMPORTADA`, `MOVIMIENTO_BANCARIO_IMPORTADO`, `CONCILIACION_PROPUESTA`, `CONCILIACION_APROBADA`, `DESCUADRE_COMISION`
- **Sistema**: `APROBACION_SOLICITADA`, `APROBACION_RESUELTA`, `INGESTA_DEGRADADA`, `CALIDAD_DATO_INCIDENCIA`

## H. Workflows prioritarios

1. **WF-Presupuesto→Cierre**, tu primer encargo:
   - `OPORTUNIDAD_CREADA` → tarificar (con el interruptor de gasto) → `PRESUPUESTO_PREPARADO` → enviar (aprobación) → seguimiento a los 3 y 7 días (tarea).
   - Si `PRESUPUESTO_ACEPTADO`: firma (core-firma) → emisión Codeoscopic (aprobación) → `POLIZA_EMITIDA` → enlazar `presupuesto.emitido_at` → aparece en el portal.
   - Si hay caducidad o rechazo: `OPORTUNIDAD_PERDIDA` con **motivo obligatorio** (precio/competidor + prima rival) → se programa recaptación a los 11 meses.
2. **WF-Anulación**:
   - `ANULACION_SOLICITADA` (portal, email o Alberto) → validar plazo (LCS art. 22: 1 mes antes del vencimiento para el tomador) → generar carta → **firma del cliente** (OTP, core-firma) → `ANULACION_FIRMADA`.
   - Comunicar a la compañía por su canal (`compania_contactos.canal_anulaciones`). Es comunicación sensible, **requiere aprobación**. → `ANULACION_COMUNICADA` → tarea «esperar acuse».
   - El diff de CIMA detecta `cancelada`/`anula_al_vencimiento` → `ANULACION_CONFIRMADA` → el portal muestra «anulada con efecto X» → si el motivo es precio o competencia, se crea una oportunidad de recaptación.
   - Si CIMA no lo confirma en N días, se abre una incidencia.
3. **WF-Renovación**:
   - `POLIZA_VENCE_EN_60D` → comparar la prima nueva con la histórica (si CIMA la trae) → si sube más de X%, se propone retarificar (**aprobación**, cuesta dinero) → se crea oportunidad → se prepara comunicación (aprobación) → cockpit.
   - Reutiliza `correduria-renovaciones` y `correduria_avisos_renovacion`.
4. **WF-Fuga de cartera**: `POLIZA_CANCELADA` o `POLIZA_DESAPARECIDA` sin anulación ni sustitución registrada → incidencia «pérdida sin explicar» → Alberto clasifica el motivo, que vuelve a la oportunidad.
5. **WF-Recibo devuelto**: `RECIBO_DEVUELTO` → reloj de LCS art. 15 (ya existe en `retencion.ts`) → comunicación rutinaria (**automática** tras N días de rodaje en modo aprobación) → tarea.
6. **WF-Email/Documento (zero inbox)**:
   - `EMAIL_CORREDURIA_RECIBIDO` (triaje) → resolver cliente y póliza (ya existe) → clasificar el tipo con IA (`{tipo, confianza}`) → si es un adjunto, `DOCUMENTO_RECIBIDO` → extraer → asociar.
   - Si la confianza es ≥ umbral **y** una regla lo confirma, se archiva sin intervención; si no, va a revisión. Nunca sobrescribe datos de CIMA.
7. **WF-Comisiones**: `LIQUIDACION_IMPORTADA` → cuadre (existe) → buscar el movimiento bancario (compañía + importe ± tolerancia) → `CONCILIACION_PROPUESTA` con score → **auto** si score ≥ 0,95 e importe exacto; si no, aprobación.

## I. Agentes (perfiles de permisos sobre workflows, no procesos autónomos)

No propongo 8 agentes. Con esta escala, **4 perfiles** cubren lo pedido; separar más multiplica prompts y permisos sin ganancia.

| Perfil | Workflows | Herramientas | Auto | Requiere aprobación | Prohibido |
|---|---|---|---|---|---|
| **Comercial** (+ renovaciones) | 1, 3 | leer cartera, crear oportunidad/tarea, redactar propuesta, tarificar* | crear oportunidad/tarea, redactar borrador | enviar presupuesto, tarificar (gasto), emitir | cambiar prima o comisión |
| **Operativo** (+ siniestros, anulaciones) | 2, 4, 5 | leer, crear tarea/incidencia, generar carta, pedir firma | tareas, recordatorios, pedir firma al cliente | comunicar a la compañía, cambiar el estado de la póliza | cancelar sin firma |
| **Documental / Atención** (+ zero inbox, portal) | 6 | clasificar, extraer, asociar, responder FAQ | clasificar, asociar con confianza alta, acusar recibo | modificar datos de póliza o cliente, responder algo no rutinario | sobrescribir datos de CIMA |
| **Financiero / Calidad** (+ compliance, data quality) | 7, calidad | cuadre, conciliación, detectores | conciliar con score ≥ 0,95, abrir incidencias | conciliar con score bajo, marcar comisión cobrada | mover dinero (no existe la herramienta) |

- El **orquestador** no es un LLM: es el dispatcher. Evento → workflows suscritos. El LLM solo interviene dentro de un paso, y cuando el evento es ambiguo (email sin clasificar).
- Compliance (IDD/RGPD) va como **reglas** dentro de los workflows: consentimiento antes de comunicar, IPID y análisis objetivo antes de emitir, retención documental. No como un agente aparte.

## J. Human-in-the-loop (política por defecto)

- **Automático**: leer, clasificar, extraer, crear tareas o incidencias, recordatorios internos, acuses de recibo, conciliar con score ≥ 0,95 e importe exacto, actualizar campos no críticos (etiquetas, notas).
- **Aprobación**:
  - Enviar cualquier comunicación a un cliente o una compañía (regla vigente de comunicaciones salientes; se relaja por tipo solo tras un periodo medido).
  - Anular o cancelar, emitir, tarificar (gasto), cambiar prima, comisión o datos de identidad.
  - Conciliar con score bajo, fusionar clientes.
- **Prohibido para agentes**: transferir dinero, borrar clientes o pólizas, tocar tablas de CIMA, cambiar la política o las reglas en producción.
- Cada aprobación caduca; si caduca, se abre una incidencia, no se ejecuta.

## K. Seguridad y auditoría: riesgos detectados

1. Bearer único sin actor → **P0** (E1).
2. Webhook de Telegram *fail-open* y callbacks sin validar emisor → **P0** (E8).
3. Historial sin antes/después → **P0** (E2).
4. Roles BYPASSRLS (`prisma_seguros`, `crm_seguros`): el aislamiento depende del código. Se acepta con un tenant, pero hay que añadir un test de regresión que exija `correduria_id` en toda query nueva de `lib/cartera-*` (como `regression-portal-aislamiento`).
5. Manuel conserva permiso `write` en el repo `asegura` (ya dio su OK para quitarlo) y los secretos de TIREA siguen sin copia → quitarle el acceso ya.
6. PII en prompts: extracción y redacción envían datos al LLM vía OpenRouter. Hay que definir una **clase de privacidad por tarea** en el router (`privado` → solo proveedores con ZDR/UE) y minimizar campos (sin DNI completo ni IBAN).
7. Documentos `bytea` sin retención → E7 + `retener_hasta`.
8. Llamadas IA sin registrar → obligar a pasar por el gateway (guardián de regresión: prohibir `aiComplete` directo en asegura).
9. Sin Sentry: los fallos de workflow deben verse. Mínimo: evento `FALLO_WORKFLOW` → Telegram + fila en el cockpit.

## L. IA intercambiable

Ya existe y es la parte más madura: `core-ai` (cadena de fallback) + gateway (coste, presupuesto, `ai_usos`) + director (categorías `logica`, `codigo`, `redaccion`…). Qué añadiría:
1. **Contrato de salida estándar** en las herramientas IA: `{valor, confianza, fuentes[], modelo, prompt_version}`, validado con schema. Si no cumple el schema, confianza 0 y a revisión.
2. **La confianza no la dice el LLM.** Se calcula en código: coincidencias deterministas (NIF, nº de póliza, importe exacto) × acuerdo entre extractor y regla × autoconfianza del modelo (peso bajo). Los umbrales van por acción en `politica_accion`.
3. **Categorías nuevas en el director**: `extraccion` (visión), `clasificacion` (barato), `redaccion_cliente` (calidad), cada una con una **clase de privacidad**.
4. Prompts versionados en código (`module-seguros/src/agentes/*.prompt.ts`) y la versión anotada en la auditoría. Si el modelo cambia, la regla no cambia.
5. Anthropic u OpenAI directos solo como proveedor adicional en `core-ai` si hace falta ZDR contractual. Hoy basta con OpenRouter.

## M. Roadmap por dependencias (sin fechas)

- **Fase 0 — Arquitectura + recuperar CIMA**
  - Desbloquear Actions de `asegura` (Alberto).
  - Disparo de `cima-pull` y vigilante de pull mudo movidos al `cron-dispatch` de plataforma, con Telegram.
  - Aprobar este documento.
  - Commitearlo como `docs/ASEGURA-OS-ARQUITECTURA.md`, con la entrada en `CONTEXTO-SESIONES.md`.
  - Quitar el `write` de Manuel.
  - Decidir la clase de privacidad de la IA.
- **Fase 1 — VENDER: vencimientos y seguimiento** (prioridad de Alberto del 23/09; ver sección P)
  - Primero las maquetas; luego la construcción sobre el cron-dispatch actual, con `oportunidad` + `tarea`.
  - No espera al bus de eventos: se migra a eventos en la Fase 2.
  - Solo exige de la Fase 1b la auditoría de sus propias escrituras.
  - Incluye en el portal (§Q): «Tus vencimientos» + «Mejórame el precio», consentimiento en las declaradas, centro de preferencias e invitación al portal en cada contacto de renovación.
- **Fase 1b — Core mínimo (en paralelo; bloquea a los agentes, no a vender)**
  - ✅ Webhook de Telegram fail-closed (#3330). Pendiente: router por prefijo.
  - ✅ Actor en el puerto (23/09): cabecera `x-actor` (`humano:<cuentaId>` · `agente:<id>` · `sistema:<origen>`) desde `cabecerasPuerto()` de plataforma, y una fila en `seguros.auditoria` por cada escritura autorizada vía `auditado()` (guardián en `apps/asegura/lib/auditoria.test.ts`). **No es JWT**: firmarlo con una clave derivada del mismo Bearer no añadía nada frente a quien ya tiene el secreto; es atribución, no autorización, hasta que los agentes tengan credencial propia (Fase 5). Sin cabecera queda como `desconocido`, sin rechazar.
  - ✅ Antes/después por campo (pieza c, 23/09): `anotarCambio()` en las escrituras críticas (cliente, siniestro, póliza, relaciones, autorizaciones, supresiones, intervinientes, documentos, emisión) → columna `cambios` de la misma fila de `seguros.auditoria`. Solo guardan valor los campos de la lista blanca de `lib/cambios.ts` (estados, tipos, fechas, importes); lo personal consta como «tocado». Las oportunidades ya tenían su `oportunidad_historial`. Pendiente: router de Telegram por prefijo, cuando exista `aos_` (Fase 2).
  - ✅ Todo el uso de IA de asegura por el gateway (1-6, #3327).
  - Los tres con su test o cepo visto fallar.
- **Fase 2 — Eventos/Workflows** (depende de F1)
  - ✅ **2-a (23/09):** `seguros.evento` + `cartera_foto` + detector por foto (`detectarCambios`, module-seguros) lanzado por el cron `correduria-eventos` (06:15 y 12:15 UTC) → pérdidas sin sustitución por Telegram (`correduria.fuga-cartera`) y en «Hoy» (bloque «Pérdidas de cartera», resolución cerrada: pérdida con motivo o no es pérdida). Sin despachador todavía: los demás eventos quedan guardados para los flujos siguientes.
  - ✅ **2-b (23/09):** retención automática — póliza anulada (baja o «anula al vencimiento»; CIMA solo escribe activa/cancelada y no las distingue) sin sustitución y con el vencimiento por delante → oportunidad `en_negociacion` (`origen='retencion_cima'`) + llamada alta para hoy, en la misma transacción del detector (`abrirRetencion` en `apps/asegura/lib/eventos-cartera.ts`, regla pura `decidirRetencion`).
  - ✅ **2-c (23/09):** cola única de aprobaciones `seguros.aprobacion` + política en código (`POLITICA`, module-seguros: `enviar_correo_cliente → aprobar`). Primer productor: recibo devuelto → borrador de aviso al cliente con el reloj del art. 15 LCS. Se aprueba (retocando el texto) o descarta en «Hoy · Esperan tu OK»; el envío reclama la fila antes de mandar (sin dobles) y lee el correo de la ficha; caduca a los 7 días.
  - ✅ **2-d (23/09):** expediente de anulación `seguros.anulacion` (solicitada → firmada → comunicada → confirmada | desistida; sin firma no se comunica, CHECK en BD). Reglas puras en `module-seguros/anulacion.ts` (plazo art. 22 LCS como advertencia, transiciones, siguiente paso). «Tramitar anulación» en la ficha de póliza y abiertas en «Hoy». El detector la confirma cuando CIMA trae la póliza no vigente, resuelve la baja con el motivo y no abre retención. Pendiente: 2-d-2 firma del cliente en el portal (`core-firma` + `seguros.firma`) y 2-d-3 comunicación a la compañía por la cola de aprobaciones.
  - ✅ **2-d-2 (23/09):** el cliente firma la anulación en el portal («Pendiente de tu firma»): carta compuesta en código, OTP al correo de su ficha, `FirmaPropia` sobre el texto guardado en `anulacion.carta_texto`, evidencia en `seguros.firma`. Puente `/api/portal/anulacion`. Pendiente: 2-d-3 comunicación a la compañía por la cola.
  - ✅ **2-d-3 (23/09):** la anulación firmada se propone en la cola (`enviar_correo_compania`, aprobar) al buzón de su compañía que elige Alberto en la tarjeta (recordado en `compania_contactos.recibe_anulaciones`), con la carta firmada adjunta; al salir → `comunicada`; si la anulación deja de estar firmada, la propuesta se retira. WF-Anulación completo salvo la confirmación, que ya hace CIMA.
  - `seguros.evento` + dispatcher + detector diff de CIMA.
  - `oportunidad` + `motivo_perdida`.
  - `aprobacion` + `politica_accion`.
  - Cockpit mínimo (aprobaciones + incidencias).
  - Después, **WF-Anulación** (conecta core-firma) y **WF-Presupuesto→Cierre** (cierra los PR 3-6 del spec).
- **Fase 3 — Financiero** (depende de F2): WF-Comisiones con el tramo del banco (`banco_total`), score de conciliación y descuadres como incidencias. Sin ledger de terceros.
- **Fase 4 — Documental** (depende de F1; puede ir en paralelo a F3): Storage + versionado + retención, migración de los `bytea`, WF-Email/Documento.
- **Fase 5 — Agentes** (depende de F2 + F4): los 4 perfiles con herramientas tipadas, contrato de confianza y rodaje en «todo con aprobación» antes de liberar acciones a auto.
- **Fase 6 — Automatización avanzada**: fugas de cartera, Next Best Action por cliente (ordenada por reglas, no por LLM), data quality. (WhatsApp Business y telefonía quedan **fuera del roadmap activo**, decisión del 23/09.)
- **Fase 7 — Optimización**:
  - Replay: los workflows son puros sobre eventos guardados, así que se pueden reejecutar en modo `simular`.
  - `regla_candidata` a partir de correcciones.
  - RBAC multiusuario.
  - Colaboradores (cuando haya contrato firmado).
  - Revisar si hace falta un engine externo.

## N. Lo que faltaba (revisión del 23/09)

1. **Obligaciones regulatorias como workflows con plazo** (no como agente de compliance). El sistema debería producirlas, no solo guardar datos. Las que conviene modelar [Probable, a validar con la asesoría]:
   - **Servicio de Atención al Cliente / registro de quejas y reclamaciones** (Orden ECO/734/2004): plazo de respuesta e informe anual.
   - **Documentación estadístico-contable anual a la DGSFP**: sale casi entera del libro de comisiones y de la cartera.
   - **Libro registro de operaciones / pólizas intermediadas**.
   - **IDD antes de vender**: test de demandas y necesidades, entrega del IPID, información previa del mediador. Todo con evidencia enlazada al presupuesto (PR 4-6 del spec).
   - **Formación continua IDD** (horas por persona y año): una tabla y un aviso.
   - **Prevención de blanqueo**: solo si hay vida-ahorro. Si no, se declara fuera de alcance.
2. **Medir antes de automatizar** (la regla de la casa: «mide el ahorro, no lo supongas»). Antes de la Fase 5 hay que tener una línea base semanal: correos de correduría, documentos, tareas manuales, minutos de Alberto por proceso. Sin ella, «mínimo trabajo administrativo» no se puede verificar y los agentes no se pueden justificar.
3. ✅ **(23/09: copia semanal cifrada con prueba de restauración — `docs/COPIA-SEGUROS.md`; falta que Alberto ponga la contraseña del rol y los dos secrets)** **Continuidad y copias.** La cartera vive en una Supabase **Free** sin copias restaurables [Probable]. **Decisión de Alberto (23/09): pasar a Pro más adelante.** Mitigación barata mientras tanto: un export semanal de `seguros` (pg_dump comprimido) a Storage/Drive con un job del cron-dispatch, y una prueba de restauración una vez. El riesgo que queda hasta Pro es perder hasta una semana de cambios manuales; lo de CIMA se puede volver a pedir, lo manual no.
4. **Retención documental legal.** Definir plazos por tipo (póliza, recibo, siniestro, identidad, comunicaciones) para `retener_hasta`, y cómo encajan con la supresión RGPD. Hoy `supresion.ts` está marcado `PENDIENTE_REVISION_LEGAL`.
5. **Limpieza de tablas legacy sin uso** (`oportunidades`, `gestiones`, `recordatorios`, `ofertas_automaticas`, `mediator_audit_log`, `lead_estado`). Para cada una: decidir reutilizar (`gestiones` → `tarea`) o renombrar a `_legacy_*`. Si no se decide, el siguiente agente o sesión escribirá en la equivocada.
6. **Control del gasto de IA** (Alberto, 23/09: «analizar y educar al agente para que use las baratas, pero controlar el saldo de OpenRouter»). Lo que hay hoy [Seguro]:
   - El saldo de OpenRouter se mira **solo los lunes** (`app/api/cron/ia-director-refresh/route.ts:236-255`, cron `0 5 * * 1`, umbral fijo `AI_CREDITOS_UMBRAL`=5 $).
   - `ia_presupuestos` solo tiene **límite diario**.
   - Groq pasó a ser de pago el 21/09 y **no tiene presupuesto**.

   Qué cambiaría:
   - **Saldo diario con previsión**: job diario que lee `/api/v1/credits` y calcula el gasto medio de 7 días y los **días de saldo restantes**. Aviso por Telegram a los ≤7 días, no a un importe fijo. El dato se pinta en la intranet (sección O).
   - **Tope mensual por app** además del diario: columna `limite_mensual_eur` en `ia_presupuestos`. Al llegar al 80 %, aviso; al 100 %, solo cadena gratis. Igual que el diario, que ya funciona así.
   - **Tope duro en el proveedor** [Probable, verificar en el panel]: una **API key de OpenRouter propia para asegura con límite de crédito** configurado en OpenRouter. Si el código falla, el gasto no puede pasar de ahí.
   - **«Educar» al agente para usar las baratas**: el director ya elige modelo por categoría (`lib/ia-director.ts:256`). Se añaden categorías de tarea con modelo por defecto barato: `clasificacion` y `extraccion` → modelos flash/mini; `redaccion_cliente` → uno mejor, solo en borradores que se aprueban. La regla va en código, no en el prompt: **el modelo caro solo se usa si el barato falla la validación del esquema** (mismo patrón que `/api/ai/ejecutar`, `codigo`→`plan`). El `buscador-ia` semanal sigue proponiendo cambios de modelo por PR.
   - **Todo pasa por el gateway**, incluido el `aiComplete` directo de asegura (hoy no queda registrado). Es la única forma de que el coste sea real.
   - Groq entra en el mismo control o sale de la cadena de fallback.
7. **Estrategia de pruebas de los workflows**: fixtures a partir de ficheros EIAC reales anonimizados (lección del 31/07: los fixtures escritos a mano repiten el error del código), tests puros por workflow y un cepo visto fallar por cada regla de la política HITL.
8. **Capacidad de revisión de Alberto**: una sola persona aprueba. La cola de aprobaciones necesita prioridad, caducidad y un tope diario, o se convierte en la nueva bandeja de entrada.

## O. Diseño: qué cambia en tu intranet `/correduria` (plataforma)

Principio: **no se crea pantalla nueva ni cockpit aparte.** La pantalla ya está pensada así («Hoy» = lo único que hay que hacer, contadores con `!` si no se sabe; `secciones.ts`). Se evoluciona lo que hay y **se juntan piezas hoy dispersas**. Todo responsive (≥320 px), con listas paginadas y montaje perezoso.

### Pantalla principal: hoy 8 secciones → 8 (una nueva, una fusionada)

| Sección hoy | Cambio | Qué se ve |
|---|---|---|
| **Hoy** | Pasa a ser el **cockpit** | Franja superior: «ayer: N automáticas · N esperan tu OK · N incidencias · saldo IA: X días». Debajo, tres bloques en este orden: **① Aprobaciones** (la cola única: qué propone, por qué, confianza, fuentes, caducidad; botones Aprobar / Corregir / Rechazar; lo mismo que el botón de Telegram) · **② Incidencias** (pérdida de cartera sin explicar, anulación sin confirmar por CIMA, ingesta muda, descuadre de comisión) · **③ Tareas de hoy** con su vencimiento. Las tarjetas actuales (renovaciones <30 días, retención, partes del portal, sustituciones) **siguen**, pero ahora las generan los workflows y caen en ② o ③; ya no son bloques sueltos. |
| — | **NUEVA: Comercial** | Embudo de oportunidades: abierta → presupuestada → enviada → vista → aceptada → **emitida / perdida**. Al marcar perdida, el **motivo es obligatorio** (precio · competidor + compañía + prima rival · coberturas · desiste · sin respuesta). Arriba, tres cifras: tasa de cierre, top motivos de pérdida, prima media perdida por precio. **Absorbe** hoy `Recaptacion`, `LeadsPortal` y `LeadsWebConversion`, que están repartidos. |
| **Actividad** | Pasa a ser **«Qué ha hecho el sistema»** | El feed de `seguros.auditoria`: quién (tú / agente X / CIMA), qué, antes→después, regla y versión, confianza, aprobado por. Filtro por agente, por humano y por «solo lo que requirió OK». Es la respuesta a «¿por qué pasó esto?». |
| **Clientes / Cartera** | Sin cambio de estructura | En cada fila, un chip de **siguiente acción** (renovar, recibo devuelto, falta documento, venta cruzada). |
| **Comisiones** | Crece en la Fase 3 | Se añade la columna «entró al banco» con el score de conciliación; los descuadres suben a Hoy como incidencia. |
| **Datos** | Crece | Además de duplicadas y sin canal: las reglas de calidad (NIF inválido, fechas o primas incoherentes, CIMA y Codeoscopic que no cuadran), como lista de incidencias. |
| **Ingesta** | Pequeño cambio | Alarma de pull mudo >26 h con aviso por Telegram (Fase 0); hoy solo se pinta. |
| **Redes** | Sin cambio | — |
| — | **NUEVA (Fase 5): Automatización** | Tabla de la política (acción → auto / pedir OK / prohibido, editable por ti y auditada), estado de cada perfil de agente (latido, acierto y correcciones), **gasto de IA del mes contra tope y días de saldo de OpenRouter**, y las reglas candidatas pendientes de revisar. Va al final: se mira poco, pero es donde se decide qué se automatiza. |

### Ficha de cliente (hoy: resumen, pólizas, recibos, siniestros, contactos, documentos, historial)
- **Resumen**: tarjeta **«Siguiente acción»** arriba del todo (una sola, la que más vale, con su porqué) + oportunidades abiertas + incidencias del cliente.
- **Nueva pestaña Oportunidades**: presupuestos enviados, vistos, aceptados y perdidos con motivo. Botón «Nueva oportunidad» (hoy los `*-nuevo` crean directamente la tarificación).
- **Historial** → **línea de tiempo 360**: auditoría real (antes→después, actor, aprobación) + correos de compañía (ya llegan) + comunicaciones enviadas + firmas.
- **Documentos**: versión, tipo detectado y confianza; «pendiente de revisar» cuando la IA no está segura.

### Ficha de póliza
- **Botón «Tramitar anulación»** → asistente de cuatro pasos:
  1. Tipo: a vencimiento, inmediata o por sustitución.
  2. Fecha de efecto, con el aviso del art. 22 LCS si ya no llega.
  3. Motivo: precio, competidor, etc.
  4. Carta generada → **firma del cliente** (le llega al portal) → tú apruebas el envío a la compañía.

  Después, una tarjeta de estado: *solicitada → firmada → comunicada → confirmada por CIMA*, con alarma si CIMA no la confirma en N días.
- **Tarjeta «Cambios»**: auditoría de esa póliza (hoy no existe ninguna).
- Enlace a la oportunidad o renovación de la que viene, o que la sustituyó.

### Portal del cliente (lo que ve el asegurado)
- La anulación aparece como **«Pendiente de tu firma»** → firma con código → «Anulación enviada a [compañía]» → «Anulada con efecto dd/mm».
- Presupuesto: elegir opción y firmar (PR 4 del spec del presupuesto).

**Orden en que aparece cada pieza**:
- Fase 0/1: alarma de ingesta, Actividad con auditoría real, tarjeta «Cambios».
- Fase 2: Hoy como cockpit, Comercial, asistente de anulación, pestaña Oportunidades.
- Fase 3: columna de banco en Comisiones.
- Fase 4: documentos con versión y confianza.
- Fase 5: sección Automatización y «Siguiente acción».

Antes de construir cada pantalla, maqueta en HTML para que la valides (no se toca código de UI sin tu OK visual).

## P. PRIORIDAD: vender — vencimientos de clientes y leads, con seguimiento

Alberto (23/09): «dale importancia al diseño… a los vencimientos actuales tanto clientes como leads y hacer seguimiento. Importante es vender seguros».

**Estoy de acuerdo, y cambia el orden.** El plan anterior ponía la infraestructura (auditoría, eventos) antes de nada que venda. Vencimientos y seguimiento **no necesitan el bus de eventos**: son lecturas, tareas y comunicaciones con tu OK. Pasan a ser la Fase 1 y la infraestructura va en paralelo. Lo único que sigue antes es arreglar CIMA: las renovaciones de clientes salen de ahí.

### Los números reales (medidos el 23/09)
| Grupo | Próximos 60 días | Comentario |
|---|---|---|
| Pólizas de **clientes** (cartera viva) que vencen | **15** | Fecha real de CIMA. Trabajo de renovación y mejora. |
| **Leads** con aniversario estimado de su póliza antigua | **7.884** | [Suposición] la fecha es el día y mes de una póliza de 2013-2018: sirve como pista de cuándo renueva, no es un dato. |
| …de esos, **con teléfono o email** | **216** | 🚨 **El cuello de botella para vender a leads es el dato de contacto, no el software.** 97 % no se puede contactar. |
| Pólizas declaradas en el portal que vencen | 0 | El imán de leads del portal aún no ha dado volumen. |
| Envíos de recaptación hechos hasta hoy | 94 | Ya existe el módulo. |

Consecuencia: en leads, primero **216 contactables bien trabajados** que 7.884 a ciegas. Y hay que abrir una línea para **conseguir canal**: portal, web, formulario en la carta de no renovación, referidos de clientes.

### ⚠️ Riesgo legal antes de escribir a leads [Probable, validar con la asesoría]
Contactar comercialmente a personas del volcado histórico (ex clientes de 2013-2018 de otra fuente) necesita base legal. Por email, LSSI art. 21.2 solo lo permite con relación contractual previa y productos similares, con opción de baja en cada envío. Si la base no está clara, el canal seguro es **teléfono con registro** o una **primera comunicación de consentimiento**. El módulo de recaptación ya envía; hay que comprobar qué base de consentimiento usa antes de escalar el volumen.

### Qué se construye (reutilizando lo que ya hay)
Hoy existen **piezas sueltas**:
- `Renovaciones.tsx`, cron `correduria-renovaciones` y `correduria_avisos_renovacion` (clientes).
- `Recaptacion.tsx` y `recaptacion_envios` (leads).
- `DeclaradasVencer`, `LeadsPortal`, `LeadsWebConversion`, `Retencion`.
- Retarificar (Codeoscopic) y presupuesto (PR 1-2).

Lo que falta es **un embudo único con seguimiento**:

1. **Vencimientos** (sección nueva y protagonista, o el corazón de «Comercial»): dos carriles, **Clientes** y **Leads**, por ventanas **<30 · 30-60 · 60-90 días**, con filtros por ramo, compañía y prima, y un distintivo **fecha real / fecha estimada**.
2. **Cada fila es una oportunidad con su estado de seguimiento**: *por contactar → contactado → propuesta enviada → vista → aceptada → emitida* / *renovada sin cambios* / *perdida (motivo obligatorio)*. **Siempre con próxima acción y fecha**: nada queda sin siguiente paso. Esa es la regla que evita que se pierdan.
3. **Secuencias de seguimiento** (reglas, no IA):
   - **Clientes**:
     - A 60 días: revisar la prima de renovación. Si CIMA la trae y sube más de X %, proponer retarificar (tu OK, cuesta 0,50 €).
     - A 45 días: contacto con propuesta.
     - A 30 días: llamada (tarea); ahí se cierra el plazo del art. 22 LCS para cambiar de compañía.
   - **Leads**:
     - A 60 días de su aniversario: primer contacto (plantilla por ramo).
     - Sin respuesta: recordatorio a los +7 días y llamada a los +14.
     - Si no hay nada en 3 intentos: se aparca hasta el año siguiente, con motivo.
   - **Toda comunicación sale como borrador y tú la apruebas** (regla vigente). Cuando se mida que tus aprobaciones son siempre «sí» para un tipo, se propone pasarlo a automático.
4. **Priorización con puntuación simple por reglas**: tiene canal, fue cliente, ramo y prima, respondió antes, la subida de prima de su renovación. La lista sale **ordenada por probabilidad de venta × prima**, no por fecha.
5. **La IA, donde vende**:
   - Redactar el mensaje personalizado (modelo barato, borrador).
   - Resumir la ficha antes de llamar («qué tiene, qué le falta, qué le vence»).
   - Sugerir venta cruzada (el «hueco de venta cruzada» ya existe en Clientes).
6. **Medición comercial** (arriba de la sección): contactados → respondieron → presupuestos → emitidas → **prima nueva del mes** y tasa de renovación de clientes. Es la única métrica que dice si ASegura OS sirve.

### Diseño (con peso propio, como pides)
- **Se diseña antes de programar**: maquetas navegables en HTML (móvil y escritorio) de **Hoy/cockpit**, **Vencimientos** (los dos carriles), **Ficha de cliente con «Siguiente acción»** y **asistente de anulación**. Las validas tú, y solo entonces se construye.
- **Sistema visual común**: tokens de `MARCA_ASEGURA` (`@central/brand`), el mismo que la web y el portal. Jerarquía clara: una acción principal por pantalla. Estados de seguimiento con color y texto (no solo color). Contadores con los tres estados (número / 0 / `!`).
- **Modo «llamada»**: desde Vencimientos, abrir un lead muestra en una pantalla lo necesario para llamar (resumen, póliza que le vence, guion corto, botones de resultado de la llamada que actualizan el seguimiento y crean la siguiente tarea). Es lo que más ahorra al vender.
- Móvil primero para Hoy y Vencimientos: se trabaja con el teléfono en la mano.
- Revisión de diseño de las pantallas actuales de `/correduria` en el mismo paquete (jerarquía, densidad, coherencia), sin cambiar su lógica.

## Q. La intranet del CLIENTE (`apps/asegura-portal`) en ASegura OS

**Qué hay hoy** [Seguro, auditoría del 23/09]:
- Acceso con código por email.
- Pólizas, recibos, siniestros y coberturas; pólizas de terceros autorizadas.
- Dar parte de un siniestro.
- Subir pólizas de otras compañías (el imán de leads).
- Calendario, recordatorios, campana, avisos push y la hoja QR para la nevera.
- Datos de contacto, sugerencias, derecho de supresión.
- Ver un presupuesto (solo lectura) y el borrador de carta de no renovación.

**Uso real (medido)**: 10 identidades y 8 vinculadas a ficha sobre **67 clientes en vigor (~12 %)**. 18 accesos en total, 7 pólizas declaradas, 0 partes.

**Medido de nuevo el 23/09 a las 07:40 UTC**:
- **0 invitaciones enviadas en toda la historia** (`portal_invitacion` vacía), con 51 clientes invitables (tienen correo y su ficha se resuelve sin ambigüedad).
- **0 presupuestos** creados (el PR 1-2 del presupuesto está construido pero sin usar).
- 0 suscripciones push y 0 peticiones de acceso; 15 autorizaciones entre familiares y 40 códigos de acceso emitidos.

El portal no falla por diseño: **nunca se ha invitado a nadie**.

🚨 **El portal está bien construido y casi nadie lo usa.** Antes de añadir funciones, lo que más rinde es **activarlo**. Cada cambio de abajo está pensado para que el cliente tenga un motivo para entrar y para que **venda**.

### Q-0. Lo primero, antes de construir nada: INVITAR
Enviar la invitación a los **51 clientes invitables**. El botón ya existe en la ficha → pestaña Contactos → «Portal del cliente». En lote hace falta una acción masiva con previsualización. Es una comunicación a clientes, así que **sale solo con OK explícito de Alberto sobre el texto y la lista**. Coste ~0 y es la palanca que más mueve el uso del portal. Los 29 clientes sin correo se atienden en la llamada de renovación de §P, pidiéndoles el correo.

### Qué cambia, por orden de impacto en ventas
1. **«Tus vencimientos» como portada.** Qué renueva, cuándo y a qué prima, con un botón **«Quiero que me mejores el precio»**. Crea una oportunidad en el embudo de Vencimientos (§P) con origen `portal`. **Es la venta iniciada por el cliente, la más barata que existe.**
2. **Seguros de otras compañías → consentimiento y canal.** Al subir una póliza de fuera: «¿Te avisamos un mes antes de que venza con una comparativa?», con casilla de consentimiento comercial. **Resuelve a la vez los dos problemas de §P**: la base legal para escribir y la falta de canal. Esas declaradas entran en el carril de leads con **fecha real**, no estimada.
3. **Centro de preferencias de comunicación** (RGPD/LSSI): qué acepta recibir y por qué canal, revocable en un clic. Queda auditado (`portal_consentimiento` ya existe) y es la fuente que consulta el workflow antes de enviar nada.
4. **«Pendiente de ti»**: una sola lista con lo que la correduría necesita del cliente, generada por los workflows:
   - firmar una anulación o un presupuesto;
   - subir el DNI o el carnet que falta;
   - completar datos de un presupuesto (PR 5 del spec);
   - confirmar la dirección del riesgo.

   Cada elemento con su botón. **Es el sustituto del «te mando un email y espero»**: menos trabajo administrativo en los dos lados.
5. **Presupuesto completo** (PR 4-6 del spec): comparar opciones, elegir, **firmar con código** (core-firma, como rrhh) y firmar la carta de nombramiento de mediador. Estado visible hasta «emitida».
6. **Anulación**: pendiente de tu firma → enviada a la compañía → anulada con efecto dd/mm (§O).
7. **Mensajes con tu corredor**: un hilo por tema (póliza o siniestro), trazable y guardado en la ficha. Cubre lo que WhatsApp cubrirá más adelante. Cada mensaje que entra dispara `MENSAJE_PORTAL_RECIBIDO` y cae en tu Hoy.
8. **Siniestros vivos**: el estado que llega de CIMA traducido a lenguaje claro («la compañía ha asignado perito», «pendiente de pago») y lo que se espera del cliente. Menos llamadas preguntando «¿cómo va lo mío?».
9. **Recibo devuelto**: aviso con qué pasa si no se paga (reloj del art. 15 LCS, ya calculado en `retencion.ts`) y cómo pagarlo con la compañía.
10. **Recomienda a alguien**: un invitado con consentimiento propio entra como lead con canal y con quién lo recomendó. Más adelante, reseña en Google tras una buena gestión de siniestro o de renovación.

### Activación (sin esto, lo anterior no sirve)
- Invitación al portal en **cada contacto de renovación** del §P («revisa aquí tu renovación») y en la **bienvenida tras emitir**. La plantilla de invitación ya existe (`portal_invitacion`).
- Métrica en tu Hoy: **% de clientes con portal activo**. Objetivo, no promesa: pasar del 12 % a la mayoría de la cartera en vigor.
- El canal de acceso sigue siendo el email. El SMS o WhatsApp para el código queda con WhatsApp: más adelante.

### Diseño del portal
- Mismo sistema visual (`MARCA_ASEGURA`) que la web pública y tu intranet: el cliente reconoce la marca.
- **Móvil primero** de verdad: el asegurado entra desde el móvil.
- Portada con **tres bloques** como mucho: *Pendiente de ti* · *Tus vencimientos* · *Tus seguros*. El resto va en menú.
- Maqueta antes de construir, junto con las de §P.

### Qué no cambia (y por qué)
- **El aislamiento**: rol `prisma_asegura_portal` **sin BYPASSRLS**, identidad por vínculo y el test `regression-portal-aislamiento`. Cada función nueva añade su caso a ese test.
- **El portal no escribe en la cartera**: crea *peticiones* (oportunidad, mensaje, documento subido, firma) que asegura procesa. **Nada del cliente cambia una póliza sin pasar por ti.**

## R. Cómo ejecutarlo gastando el mínimo de tokens

**Dónde se van los tokens.** En contexto acumulado (sesiones largas que releen todo en cada turno), en releer código y documentos que ya se leyeron, en auditorías repetidas y en pushes de ida y vuelta. Esta sesión es el contraejemplo: tres auditorías de ~650k tokens de subagente más una conversación larga. **No se repite.**

### Reglas de ejecución
1. **Este plan se guarda en el repo una sola vez** (`docs/ASEGURA-OS-ARQUITECTURA.md`) y las próximas sesiones **leen solo la sección de su pieza**. Nadie vuelve a auditar: el estado actual ya está escrito con `archivo:línea`.
2. **Una sesión nueva por PR**, con un prompt corto que apunte a su sección («implementa P-2 según `docs/ASEGURA-OS-ARQUITECTURA.md §P`»). Sin arrastrar esta conversación.
3. **Reparto por coste**:
   - **Sesión principal**: solo el diseño de la pieza central y lo que toca auth, datos o dinero.
   - **`agente-mecanico`** (modelo económico): boilerplate, UI repetitiva, tests, renombrados.
   - **`delegar-codigo`** (coder barato por OpenRouter): bloques voluminosos sin lógica fina.
   - **`agente-architect`** (el caro): solo la revisión de la auditoría (Fase 1b) y de la política de aprobaciones.
4. **Localizar sin leer**: `code-map` → `rastreador-codigo`, en ese orden. Los ficheros grandes (`CorreduriaClient.tsx` tiene 912 líneas) se leen por tramos, nunca enteros.
5. **Verificar en local y empujar una sola vez** (typecheck + tests de la app). Cada push cuesta 11 deployments de Vercel y un ciclo de CI.
6. **Maquetas baratas**: un HTML estático por pantalla, generado una vez, que corriges con comentarios sobre el artefacto. Nada de iterar el diseño en código React.
7. **Lo que se repite a diario lo hace CÓDIGO, no un agente**: el vigilante de CIMA, el saldo de OpenRouter, las secuencias de seguimiento y las alertas son jobs del cron-dispatch (0 tokens por ejecución). Solo es IA lo que redacta o clasifica, y con el modelo barato.
8. **Memoria mínima**: al cerrar cada PR, 3-5 líneas en `CONTEXTO-SESIONES.md` y marcar la pieza como hecha en el doc. La siguiente sesión arranca de ahí.

### El trabajo troceado (Fase 0 + Fase 1), con quién lo hace
| # | Pieza | Quién | Tamaño |
|---|---|---|---|
| 0-a | ~~Desbloquear Actions de `asegura`~~ ✅ hecho el 23/09 (tarjeta + presupuesto de 20 $) | Alberto | — |
| 0-d | Medir y reducir el consumo de Actions de `central` (sin romper los checks requeridos) | `agente-mecanico` mide; la sesión decide | M |
| 0-b | Disparo de `cima-pull` y alarma de pull mudo en el cron-dispatch + Telegram | sesión (pequeño, 2-3 ficheros) | S |
| 0-c | Commit del doc de arquitectura + memoria | sesión | S |
| 1-0 | Invitación masiva al portal de los 51 invitables, con previsualización y OK de Alberto | sesión (S) | S |
| 1-M | Maquetas HTML: Hoy, Vencimientos (dos carriles), modo llamada, portada del portal | sesión, un artefacto | M |
| 1-1 | Tablas `oportunidad` (+motivo de pérdida) y `tarea` (reutiliza `gestiones`) + auditoría de sus escrituras | sesión (datos) + revisión de `agente-architect` | M · 🟡 PR #3309 |
| 1-2 | Motor de vencimientos: carriles de clientes y leads, ventanas, puntuación y secuencias como job | sesión la lógica pura; `agente-mecanico` los tests | M · ✅ carril de leads (#3307) |
| 1-3 | Pantalla Vencimientos + modo llamada (según la maqueta aprobada) — ✅ **Vencimientos + seguimiento construidos (23/09)**: `/correduria/vencimientos` (carriles clientes/leads, canal LSSI por lead) y `/correduria/oportunidad/[id]` (estado, perder/aparcar, tareas, historial). ✅ **Modo llamada (23/09)**: `/correduria/vencimientos/llamada` (cola de hoy por teléfono, guion, 4 resultados → `planLlamada` en una transacción de asegura; una tarea pendiente manda sobre la secuencia, `pasoConTarea`) | `agente-mecanico` / `delegar-codigo` sobre la maqueta | M |
| 1-4 | Hoy como cockpit (aprobaciones, incidencias, tareas) — ✅ **construido (23/09)**: franja (llamadas hoy · tareas · esperan tu OK · incidencias) + línea de CIMA, tareas de hoy cerrables (`GET /api/operador/tareas-hoy`), «esperan tu OK» con las colas que existen (recaptación y blog; la cola única de aprobaciones es Fase 2), portal 24 h con embudo; las incidencias son los bloques de siempre | `agente-mecanico` | M |
| 1-5 | Portal: «Tus vencimientos» + «Mejórame el precio» + consentimiento en declaradas — ✅ **construido (23/09)**: bloque «Tus vencimientos» en «Mis seguros» (pólizas PROPIAS en vigor que renuevan en 60 días), `/boveda/mejorar/[id]` → puente `POST /api/portal/mejorar-precio` → oportunidad `en_negociacion` + tarea de hoy alta (sale en «Hoy · Tareas de hoy») + historial + Telegram; idempotente por póliza; casilla comercial corta junto al alta | sesión (aislamiento) + mecánico (UI) | M |
| 1-6 | ✅ Control de IA: saldo diario con previsión + tope mensual + IA de asegura por la pasarela (23/09/2026) | sesión (pequeño) | S |
| 1-7 | **Aviso por Telegram de TODO lo que hace un cliente** (§S) | sesión (pequeño, 2-3 ficheros) | S · 🟡 construido (cron `correduria-actividad`) |

Cada fila es un PR y una sesión. Las filas 1-3/1-4 y 1-5/1-6 no se pisan y pueden ir en paralelo.

## S. Aviso por Telegram de todo lo que hace un cliente (Alberto, 23/09)

> «Que cuando entre cliente me llegue aviso por Telegram; al principio hay que hacer seguimiento de todo.»

Hoy lo que hace un cliente (entrar al portal, cambiar su dirección, dar un parte, declarar una póliza, pedir
un código y no poder entrar, pedir la supresión…) **solo se ve si Alberto abre `/correduria` → Actividad**. El
feed ya existe y junta las seis fuentes (`GET /api/operador/actividad`, `lib/actividad-cartera.ts`); lo que
falta es que **empuje**. Diseño:

- **Qué avisa, en la fase inicial: TODO.** Cada evento del feed de un cliente (no los del corredor) → un
  Telegram, con quién, qué pasó y el enlace a su ficha. Incluye además la **entrada de un cliente nuevo por
  CIMA** (póliza nueva de alguien que no era cliente) y el **lead de la web**, que hoy ya avisa. Sin
  filtrar: se mide el volumen durante unas semanas y solo entonces se decide qué pasa a resumen diario.
- **Cómo:** un job más del `cron-dispatch` de plataforma (cada 5 min), que pide al puerto los eventos
  desde el último sello y los manda con `core-telegram` (prefijo propio, p. ej. `act_`). **Sello
  persistente** (último `id`/fecha enviados, en BD, no en memoria): sin él, cada pasada repetiría los
  avisos o, peor, se saltaría los que caen entre dos instancias.
- **Datos que viajan:** nombre y qué hizo — **nunca** teléfono, correo, DNI ni dirección (el Telegram se
  lee con gente delante y no es un canal cifrado de extremo a extremo). Para el detalle, el enlace.
- **Avisos que llevan acción** (como el «El domicilio tarifica en hogar y auto: revisa si afecta a alguna de
  sus pólizas» del cambio de dirección): el aviso lleva esa misma advertencia y, cuando exista la cola de
  tareas (1-1), **crea la tarea de revisarlo** en vez de quedarse en texto.
- **Fallo visible:** si el job no puede leer el feed, avisa del fallo una vez; nunca «0 novedades».
- **Construido (23/09):** alcance «todo lo del portal»; póliza declarada y sugerencia se saltan porque el portal
  ya las avisa al instante (el primer acceso llega duplicado, aceptado). Puerto `GET /api/operador/actividad-nueva`
  (asegura), cron `correduria-actividad` cada 5 min (plataforma), regla pura `actividad-aviso.ts`. Un mensaje por
  pasada agrupado por cliente. Fuera: subida de documentos, peticiones de acceso, autorizaciones, «confirmó sus
  datos» (no están en el feed) y cliente nuevo por CIMA (sin señal fiable).
- **Cuando moleste:** agrupar en ráfagas (varios eventos del mismo cliente en 10 min → un mensaje) y, más
  adelante, pasar los de baja señal a un resumen diario. Esa decisión se toma con datos, no a priori.

## Verificación de esta fase

No hay código que probar. Hay que:
- Contrastar cada afirmación de A y B con los `archivo:línea` citados (los recogieron tres barridos de solo lectura del 23/09).
- Comprobar que cada fase del roadmap tiene su dependencia satisfecha.

Al aprobar, lo primero es crear `docs/ASEGURA-OS-ARQUITECTURA.md` con este contenido, la entrada en `CONTEXTO-SESIONES.md`, y el commit y push a `claude/crm-policy-process-k0n65l` con PR draft. Después, en este orden:
1. Arreglo de CIMA fuera de GitHub Actions (disparo y vigilante en el cron-dispatch).
2. **Maquetas de Hoy y Vencimientos** para tu validación.
3. Construcción de la Fase 1 (vender), un PR por pieza.
4. En paralelo, la Fase 1b.
