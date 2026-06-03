---
name: ia-rest-maestro
description: >
  Documento MAESTRO de ia.rest (Voice POS para hostelería española). Un solo
  archivo que contiene: el mapa de todas las fuentes de conocimiento (GitHub,
  Supabase, Vercel, Drive, proyecto Claude), el contexto core del proyecto, y
  los 4 módulos (QR, VeriFactu, Supabase-patterns, Hardware Bridge).
  USAR SIEMPRE que Alberto pida cualquier cosa de ia.rest: código, Edge Functions,
  migraciones SQL, componentes React/Next.js, diseño UI, integraciones, módulos,
  arquitectura, despliegue, agentes, o dudas sobre dónde vive cada cosa.
  Sin secretos: solo nombres de variable. Los valores están en Vercel env /
  Supabase secrets / .env.local (gitignored).
---

# ia.rest — DOCUMENTO MAESTRO

> Un solo documento con todo. Secciones:
> 0) Mapa de fuentes · 1) Contexto core · 2) QR · 3) VeriFactu ·
> 4) Supabase patterns · 5) Hardware Bridge.
> **Regla de oro:** al crear/mover una fuente de conocimiento, actualizar la
> sección 0 en el mismo commit. Así nada se pierde.


# ═══════════════════════════════════════════════
# SECCIÓN 0 — MAPA DE FUENTES DE CONOCIMIENTO
# ═══════════════════════════════════════════════


> Este archivo es el **puente** entre todas las fuentes del proyecto. No duplica
> contenido: dice **qué existe, dónde vive y cómo acceder**. Si algo no está en
> el repo, aquí está apuntado con su ubicación e ID.
>
> **Regla de oro:** cuando crees/muevas/elimines una fuente de conocimiento,
> actualiza este archivo en el mismo commit. Así nada se pierde.

Última actualización: 01/06/2026

---

## CÓMO USAR ESTE ÍNDICE (para Claude Code)

1. Lee `CLAUDE.md` (raíz) — contexto core, se carga solo.
2. Para un módulo concreto, consulta su skill en `.claude/skills/`.
3. Si necesitas un doc que NO está en el repo (arquitectura extensa, histórico,
   material pesado), búscalo en **Google Drive** con el ID de la tabla de abajo.
4. Datos en vivo → Supabase (CLI). Secretos → `vercel env pull`.

---

## 1. GITHUB — el código (fuente de verdad del software)

| Dato | Valor |
|---|---|
| Repo | github.com/albertosuarezgutierrez-gif/ia.rest |
| Repo ID | 1227087279 |
| Rama principal | main |

**Qué contiene:**
- App Next.js (App Router): `app/`, `components/`, `lib/`, `hooks/`
- API routes y crons: `app/api/**` (incluye `app/api/cron/**`, `app/api/super/**`)
- Edge Functions (Deno): `supabase/functions/**`
- Config despliegue/cron: `vercel.json`
- Contexto Claude Code: `CLAUDE.md` + `.claude/skills/**`
- Documentación ligera: `docs/**` (incluido este índice)

**Qué NO contiene (a propósito):** secretos, datos de BD, backups, binarios,
docs pesados de Drive.

---

## 2. SUPABASE — la base de datos y las Edge Functions desplegadas

| Dato | Valor |
|---|---|
| Proyecto | efncqyvhniaxsirhdxaa |
| Región | eu-west-1 |
| Postgres | 17 |

**Qué vive aquí (solo aquí):**
- Todas las tablas y datos de producción (ver listado de tablas en `CLAUDE.md`)
- RLS policies, RPCs, vistas (`v_*`)
- `pg_cron` job #6 (alerta-ritmo)
- Edge Functions ya desplegadas (el código fuente está en el repo; aquí corre)

**Acceso:** Supabase CLI / dashboard. Secretos de EF con `supabase secrets set`.
Nunca volcar datos de BD al repo.

---

## 3. VERCEL — despliegue y secretos

| Recurso | Valor |
|---|---|
| Team | team_f4gPpt6dPuNcd5YyMt3q27uf |
| Proyecto app | prj_A0xZtqWcH6dtNEmlRiOwgj52GTRo |
| Proyecto docs | prj_eKC4r06S5svI3mwJJUbZmLVnbiQE |
| Dominio | www.iarest.es |

**Qué vive aquí (solo aquí):**
- **Todos los secretos** en Environment Variables (cifrados) — fuente de verdad.
- Crons de producción (definidos en `vercel.json`, ejecutados por Vercel).
- Historial de despliegues.

**Usar secretos en local/Claude Code:** `vercel env pull .env.local`
(`.env.local` está gitignored, nunca se sube).

---

## 4. GOOGLE DRIVE — documentación viva y material pesado

Acceso programático: service account vía REST. Credencial en env `GOOGLE_SA_JSON`
(el `.json` NUNCA al repo). NUNCA usar conector MCP para escribir; PATCH al mismo ID.

| Doc / Carpeta | ID Drive | Dónde vive el contenido | Resumen |
|---|---|---|---|
| **Carpeta raíz** | `1Bq34Z3Kle8ERuSN_1F1QxTk9SDukl69z` | Solo Drive | Contenedor de todo lo de abajo |
| **INDICE** (Drive) | `1hgHx25u_5HTw9rA9bk1CWKHuQR8SX3CY` | Solo Drive | Índice maestro de docs en Drive. _(este `_INDICE.md` del repo es su espejo ligero)_ |
| **MASTER** | `1SDQ-BG0fy8XJKLszKFg282VBmfvGMogk` | Drive (resumen en repo ↓) | Arquitectura, módulos y patrones completos. Fuente de verdad de la arquitectura |
| **log-cambios** | `1D16FFJDVdeOLWQQf1jHUuanZaFDuiJcr` | Solo Drive | Changelog histórico completo (largo → se queda en Drive) |
| **reglas-dev** | `1-Mr5FTRkmIxN5mNfeiUMIEuza2idZTqx` | Drive (resumen en `CLAUDE.md`) | Reglas de desarrollo. Lo esencial ya está en `CLAUDE.md` / skills |
| **BORRAR** | `147Wyu07E3wIh38XUPnwXvBMtesrhrHsa` | Solo Drive | Papelera: duplicados MCP y archivos a eliminar |

**MASTER:** documento completo ya disponible en el repo / Claude Code
(Alberto lo pasó directamente). El ID de Drive de arriba queda como copia/backup.

---

## 5. PROYECTO CLAUDE (chat) — skills + memoria

**Qué vive aquí:**
- Versión original de los skills (ya espejados en el repo: `CLAUDE.md` + `.claude/skills/`).
- Mi memoria de proyecto (contexto acumulado de sesiones de chat).

**Relación con el repo:** el repo manda. Si un skill cambia, se actualiza en el
repo (`.claude/skills/`) y se refleja aquí. El repo es la fuente versionada.

---

## 6. BACKUPS

| Backup | Origen | Destino | Frecuencia |
|---|---|---|---|
| Backup automático | `/api/backup/drive` | Google Drive | Diario `0 3 * * *` |

> Los backups son **pesados → solo Drive**, nunca al repo.
> _(Verificar/documentar qué vuelca exactamente: código, BD, o ambos.)_

---

## 7. SECRETOS — dónde están (sin valores)

Detalle y nombres completos en `CLAUDE.md` → sección "SECRETOS".
Resumen de ubicación:

| Secreto | Vive en |
|---|---|
| Env de la app (Stripe, Groq, Gemini, NIM, SESSION_SECRET, CRON_SECRET...) | Vercel env |
| Secretos de Edge Functions (SERVICE_ROLE_KEY...) | Supabase secrets |
| GOOGLE_SA_JSON (service account Drive) | Vercel env / `.env.local` |
| GITHUB_PAT, VERCEL_TOKEN, SUPER_SHIELD_KEY | Gestor + env (pendiente rotar) |
| Acceso git de Claude Code | SSH / `gh auth` (no en archivo) |

---

## 8. RESUMEN VISUAL — quién guarda qué

```
GitHub      → código + CLAUDE.md + skills + docs ligeros
Supabase    → BD (datos, RLS, RPCs, vistas) + EF en ejecución
Vercel      → secretos (env) + despliegue + crons
Drive       → docs vivos (MASTER, log-cambios) + material pesado + backups
Proyecto Claude → skills (origen) + memoria
```

**Puente entre todos:** este `docs/_INDICE.md`. Si está actualizado, Claude Code
(y tú) sabéis dónde está cada cosa sin tener que duplicar nada.

# ═══════════════════════════════════════════════
# SECCIÓN 1 — CONTEXTO CORE
# ═══════════════════════════════════════════════


> Voice POS para hostelería española. Este archivo se carga automáticamente.
> Los skills por módulo están en `.claude/skills/` y se consultan al tocar ese módulo.
> **Ningún secreto vive aquí**: solo nombres de variables. Los valores están en Vercel env / `.env.local` (gitignored).

---

## REGLAS DE OUTPUT (CRÍTICO)

1. Archivos siempre completos — nunca diffs ni fragmentos parciales.
2. Ante cualquier duda de patrón: consultar la sección PATRONES CRÍTICOS o el skill del módulo.
3. Pre-push obligatorio: `npx tsc --noEmit` con 0 errores.

---

## SECRETOS — NO COMMITEAR NUNCA

Estos valores van SOLO en Vercel env vars / `.env.local` (gitignored). En el repo solo el nombre:

```
GITHUB_PAT                       # acceso repo (rotar)
VERCEL_TOKEN                     # Bearer Vercel API (rotar)
SESSION_SECRET                   # HMAC firma sesión
SESSION_ENFORCE=true             # corte de sesiones sin firma activo
CRON_SECRET                      # x-ia-cron-secret
SUPABASE_SERVICE_ROLE_KEY        # service role (solo Edge Functions / server)
SUPABASE_URL
STRIPE_SECRET_KEY  STRIPE_MODE  STRIPE_WEBHOOK_SECRET_*  STRIPE_CLIENT_ID
GROQ_API_KEY  GEMINI_API_KEY  NIM / NVIDIA key
SUPER_ACCESS_KEY                 # cookie escudo __super_shield (acceso emergencia; el nombre real de la var es SUPER_ACCESS_KEY)
GOOGLE_SA_JSON                   # service account Drive — el .json NUNCA al repo
```

`.gitignore` debe incluir: `*.json` de credenciales, `.env*`, `ia-rest-drive-*.json`.

---

## INFRAESTRUCTURA

| Recurso | Valor |
|---|---|
| Supabase | efncqyvhniaxsirhdxaa (eu-west-1, Postgres 17) |
| Vercel team | team_f4gPpt6dPuNcd5YyMt3q27uf |
| Vercel app | prj_A0xZtqWcH6dtNEmlRiOwgj52GTRo |
| Vercel docs | prj_eKC4r06S5svI3mwJJUbZmLVnbiQE |
| Repo | github.com/albertosuarezgutierrez-gif/ia.rest |
| Dominio | www.iarest.es |
| GitHub PAT | → env `GITHUB_PAT` (no en repo) |
| Vercel Bearer | → env `VERCEL_TOKEN` (no en repo) |
| SUPER login | `/super` → email + contraseña (bcrypt en `personal`). Emergencia: `/api/auth/super-shield?k=<SUPER_ACCESS_KEY>` + PIN |
| DEMO token | `/login?t=<token rotativo>` |

Vercel env API (añadir variable):
```
POST https://api.vercel.com/v10/projects/{projectId}/env?teamId={teamId}
Authorization: Bearer {VERCEL_TOKEN}
{"key","value","type":"encrypted","target":["production","preview"]}
```

---

## STACK IA

- ASR: Groq Whisper turbo (verbose_json) — NUNCA cambiar a NIM
- LLM texto: NVIDIA NIM meta/llama-3.3-70b-instruct → fallback Claude Haiku
- LLM visión: NVIDIA NIM meta/llama-3.2-11b-vision-instruct → fallback Claude Haiku
- Centralizado en: `lib/ai-client.ts` → `callAI()`, `callAIVision()`, `cleanJSON()`
- `callAI(system, user, maxTokens, timeoutMs, noFallback=false)`
  - `noFallback=false` (default) → NIM primario, fallback Haiku si falla
  - `noFallback=true` → NIM puro, lanza error si falla, NUNCA toca Anthropic
  - Usar `noFallback=true` en crons/agentes independientes de créditos externos
- NUNCA llamar NIM o Anthropic directamente desde componentes o API routes
- Brain: lib/brain.ts + lib/brain-cache.ts + lib/brain-patron.ts + lib/brain-router.ts
- Cache menú: 5min por restaurante. Few-shot con comandas del turno activo vía ia_training_log

---

## ROLES Y ACCESOS

| Rol | Ruta | PIN demo |
|---|---|---|
| super_admin | /super | **email + contraseña** (bcrypt, `personal.password_hash`). PIN 9999 + shield = solo emergencia |
| owner | /owner | 1369 |
| jefe_sala | /jefe | 2566 |
| camarero | /edge | 7672 |
| cocina | /kds | 3297 |
| running | /running | 5310 |
| comercial | /comercial | email + PIN |
| gestor | /portal | sin PIN fijo (backoffice) |
| contable ext. | /asesoria | email + PIN tabla `contables` |
| gestor almacén | /almacen-central | email + PIN tabla `contables` |

> PINs = entorno DEMO. Para producción se generan por restaurante. Si prefieres, sácalos del repo.

Un mismo contable puede acceder a `/asesoria` Y `/almacen-central` con el mismo PIN
si tiene `contables.modulos = ['contabilidad', 'almacen']`.
El rol `comercial` solo ve /comercial. El jefe_sala puede ser transversal: restaurante + eventos según perfil_id.

---

## PATRONES CRÍTICOS (NO NEGOCIABLES)

### Auth en API routes
```typescript
import { getSession, getRestauranteId } from '@/lib/session'
import { createServerClient } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const session = getSession(req)
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = getRestauranteId(req)
  const supabase = createServerClient() // service role, bypasa RLS
}
// NUNCA: x-session-token (deprecated), sesiones_activas directas
// Cron sin sesión usuario: header x-ia-restaurante-id + x-ia-cron-secret=CRON_SECRET
```

### Sesión firmada HMAC (CRÍTICO)
La sesión vive en cliente (localStorage `ia_rest_session`) y se reenvía en `x-ia-session`.
DEBE ir firmada o se falsifica rol/restaurante. `getSession()` verifica la firma.
```typescript
import { firmarSesion, firmarObjeto, sesionAceptable } from '@/lib/session-sign'
// App (x-ia-session): subconjunto authz
return NextResponse.json({ camarero: firmarSesion({ id, camarero_id, rol, restaurante_id }) })
// Portales asesoria/almacen: objeto completo
return NextResponse.json({ session: firmarObjeto({ contable_id, email, restaurantes, modulos }) })
// Consumidor portal: const p = JSON.parse(raw); if (!sesionAceptable(p, 'objeto')) return null
```
REGLA: TODA ruta NUEVA que emita sesión DEBE envolverla con `firmarSesion()` (app) o `firmarObjeto()` (portales).
Con `SESSION_ENFORCE=true` las sesiones sin firma → 401.
`getRestauranteId()`: el header `x-ia-restaurante-id` solo vale con `x-ia-cron-secret=CRON_SECRET`.

### Tabla personal / view camareros
```typescript
// Tabla real = 'personal'. VIEW 'camareros' = retrocompat PostgREST.
supabase.from('personal').select('id, nombre, rol, modulos_gestion')
supabase.from('comandas').select('*, camarero:camareros(id, nombre)')
// ❌ NUNCA: supabase.from('x').select('camareros:personal(count)')
```

### Turnos — 2 tipos distintos, nunca mezclar
```typescript
// Turno SERVICIO (sala): camarero_id IS NULL
.is('camarero_id', null).maybeSingle()
// Turno FICHAJE (personal): camarero_id = uuid
.eq('camarero_id', uuid).maybeSingle()
```

### Impresión — reglas absolutas
```
NUNCA llamar /api/marchar tras /api/comanda — el courier ya genera el push marchar.
Guard dedup 30s filtrando payload->>'tipo' = 'marchar'.
```

### Dynamic routes App Router
```typescript
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params  // SIEMPRE await params
}
```

### comanda_items — campos obligatorios
```typescript
{ comanda_id, producto_id,
  nombre: producto.nombre,        // OBLIGATORIO — desnormalizado
  restaurante_id: restauranteId,  // OBLIGATORIO — RLS
  cantidad, precio_unitario,
  formato_nombre: 'tapa'|'media'|'ración'|null }
```

### comandas.estado — valores exactos (vs CHECK constraint real)
```typescript
'nueva' | 'en_cocina' | 'lista' | 'entregada' | 'cancelada' | 'cerrada' | 'cuenta_pedida' | 'pendiente_confirmacion'
// ❌ NO existen: 'en_curso' (usar 'en_cocina'), 'pendiente' (usar 'nueva'), 'abierta'
```

### comanda_items.estado — valores exactos
```typescript
'pendiente' | 'en_proceso' | 'listo'
// ❌ NO existen aquí: 'nueva', 'lista', 'en_curso'
```

### Stripe
```typescript
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16' as never  // cast obligatorio
})
// init SIEMPRE lazy (dentro de función, nunca a nivel de módulo)
```

### Telegram (SIEMPRE parse_mode HTML, texto plano al llamar)
```typescript
import { tgAlert } from '@/lib/telegram'
await tgAlert('Mensaje en texto plano', 'info')
// tipos: 'info' | 'aviso' | 'critico' | 'resuelto'  — NUNCA 'warn'. NUNCA MarkdownV2.
// tgAlert escapa HTML internamente → pasar texto plano, no tags.
```

### Cron jobs — SIEMPRE Promise.allSettled
```typescript
await Promise.allSettled(restaurantes.map(async rid => { ... }))
// ❌ NUNCA for...await secuencial → 504 timeout
```

### useSearchParams — SIEMPRE Suspense boundary
```typescript
export default function Page() {
  return <Suspense fallback={<div>Cargando...</div>}><Inner /></Suspense>
}
function Inner() { const searchParams = useSearchParams() }
```

### HelpChat — automático en pantallas nuevas
```
Al crear rol/pantalla nueva: 1) entrada en ROLE_PROMPTS de help-prompts.ts  2) <HelpChat /> en header (junto avatar, nunca FAB flotante)
```

### Notificaciones — principio absoluto
```
Operador (Alberto) → SIEMPRE Telegram (tgAlert())
Usuarios finales   → Email (Resend): valoraciones, portales, presupuestos
NUNCA email para alertas internas del sistema
```

---

## GIT / DEPLOY

```bash
# Flujo pre-push OBLIGATORIO
npx tsc --noEmit                          # 0 errores TS
git fetch origin && git merge origin/main --no-edit
git push origin main                      # → verificar READY en Vercel
```
**NUNCA** `git pull --rebase` — pierde archivos nuevos.
**NUNCA** push sin `tsc --noEmit` limpio primero.

---

## DESIGN SYSTEM

### Colors — importar de `src/lib/colors.ts`
```typescript
import { C, SE, SN, SM, SC } from '@/lib/colors'
C.dark  #14110E · C.bg2 #1E1A15 · C.bg3 #2A221A · C.paper #F6F1E7
C.ink2 #D8CDB6 · C.ink3 #9C8E7E · C.ink4 #6B5F52
C.red #D9442B · C.amber #E8A33B · C.green #3F7D44 · C.rule #2E2720
```
Tipos: SE = Newsreader (titulares/KPIs) · SN = Inter Tight (UI) · SC = Caveat (microcopy).
Tema claro (C.bg2/bg3/paper como fondo): texto con C.ink/ink2/ink3. `C.paper` solo como texto sobre fondo oscuro. `DARK_C` para paneles oscuros.

### Responsive (check antes de push)
```
repeat(auto-fit, minmax(Xpx, 1fr)) · overflowX:auto en tablas · flexWrap:wrap en botones
```

---

## MÓDULOS EN PRODUCCIÓN

Operaciones: Voice+Brain (PTT, few-shot), KDS cocina, Turnos servicio+fichaje, Supervisor tiempos, QR mesa, Storefront v1.0 (4 canales), Bridge v6.0.1 + APK v2.0, Impresión ESC/POS.
Almacén: escandallos, Peso v1.0, SmartScanFAB, Etiquetado, Recepción v2 (OCR albarán), ciclo compras 100% (Sugerir→ASN→recepción→RECADV→factura→3-way→SEPA), stock central grupo.
Contabilidad: cierre diario auto, PGC, IS/IRPF/módulos, IVA 303, export A3/Sage/Holded/CSV, SEPA + Stripe Connect, VeriFactu, propinas digitales.
Comercial/CRM: CRM v2 Kanban, Propuestas /propuesta/[slug] (sin precios), Módulo Menús, Feedback post-visita.
Eventos v2: espacios+mantenimiento+gastos, barra libre tiers, check-in QR, briefing wizard, presupuestos con márgenes, cierre con informe NIM.
Analytics/BI: turno/7d/mes/trim, ForecasterTab (90d+NIM), dashboard KPIs.
Marketing/web: MiWeb v4.0, /r/[slug], directorio SEO, Blog SEO (cron lunes), Instagram agente v5.
Sistema/agentes: Auto-Healer v1.0 (97.9%), QA Agent v3, Lead Hunter, Pipeline Comercial v1.0, Briefing semanal, Multi-cuenta, Contrato SaaS v1.0, RRHH v1.0.

---

## BASE DE DATOS — TABLAS CLAVE

Operaciones: turnos, comandas, comanda_items, mesas, zonas, secciones_cocina, tickets, facturas_verifactu, clientes_fiscales, facturas_cliente
Personal: personal (VIEW camareros), sesiones_activas, voice_profiles, fichajes, candidatos, cv_analisis
Almacén/compras: stock_articulos, stock_movimientos, stock_rendimientos, stock_central, transferencias_stock, pedidos_proveedor, recepciones_mercancia, etiquetas_config, incidencias_proveedor, ordenes_pago_proveedor, facturas_compra, proveedores
Contabilidad: config_contabilidad, arqueos_caja, asientos_contables, liquidaciones_iva, exportaciones_contables, propinas
CRM/comercial: leads, leads_locales, leads_contactos, leads_comunicacion, leads_landing, instagram_semana, instagram_posts, blog_borradores, blog_portales, blog_outreach
Portales: contables (email, pin, modulos[], activo), contable_clientes
Eventos v2: config_eventos, perfiles_acceso, espacios_evento, espacio_franjas, espacio_disponibilidad, espacio_mantenimiento, espacio_gastos, barra_tiers, barra_tier_productos, evento_barra_personalizacion, evento_briefing, presupuestos_evento, personal_evento_asignacion, vehiculos_grupo, evento_transporte, plantillas_evento, evento_checklist_item, evento_valoracion, evento_galeria, evento_referidos, evento_alergenos_declaracion, evento_informe_ia, evento_historico_precios, comercial_agenda, nodo_fuentes_suministro, menu_evento_bloques, menu_evento_opciones
Storefront: storefront_config, pedidos_online
QR mesa: qr_sesiones_cliente
Sistema: restaurantes, cuentas, bridge_tokens, bridge_devices, bridge_commands, alerta_reglas, alerta_log, ia_training_log, contract_acceptances, documentos_escaneados, sugerencias, print_jobs, impresoras
Módulo Menús: menus, menu_platos, rappels_proveedor, menu_cliente_sesiones, menu_cliente_mensajes, menu_cliente_documentos
Vistas: v_stock_critico_grupo, v_pedidos_pendientes_grupo, v_stock_resumen, v_cuentas_con_restaurantes, v_eventos_calendario, v_pipeline_eventos, v_comisiones_comercial, v_stock_eventos_proximos

---

## EDGE FUNCTIONS ACTIVAS (Deno)
check-elaboraciones · contact-lead · daily-briefing · eventos-entorno · monitor-health · nim-diagnostico · nim-sentiment · notify-error · qr-call-waiter · qr-cobro · qr-connect · qr-order · qr-session · qr-split · verifactu-sign · courier-route · bridge-agent

Patrón EF: service role siempre, bloque OPTIONS CORS, incrementar versión en comentario (`// v1`, `// v2`...). Ver skill `ia-rest-supabase-patterns`.

---

## CRON JOBS (vercel.json)
alertas */2 · cobro-inactividad */5 · feedback-visita */10 · lead-onboarding */30 · reservas-noshow */5 · cobro-descuento `0 2 1 * *` · backup/drive `0 3 * * *` · completar-locales `0 4 * * *` · mantenimiento-espacios `0 8 * * *` · instagram-metricas `0 7 * * *` · qa-agent `0 6 * * *` + `0 7 * * 1` · pipeline-comercial `0 8 * * 1-5` · crm-recordatorios `0 9 * * 1-5` · eventos-entorno `0 7 * * 1` · briefing-semanal `30 8 * * 1` · prospeccion-leads `0 9 * * 1` · instagram `0 9 * * 3` + `0 9 * * 5` · instagram-refresh `0 6 1 * *`

---

## PENDIENTES CRÍTICOS
| # | Tarea | Impacto |
|---|---|---|
| P1 | STRIPE_MODE=live en Vercel | Sin esto no hay cobro real |
| P2 | STRIPE_CLIENT_ID + WEBHOOK_SECRET_QR | QR pago inline bloqueado |
| P3 | STRIPE_WEBHOOK_SECRET_STOREFRONT | Storefront pagos online |
| #12 | API pública | Integraciones externas |
| RGPD | DPIA + DPA + RAT | Obligación legal — necesita abogado |
| Azure | AZURE_SPEECH_KEY + REGION | Voice profiles |
| SEG | Rotar GITHUB_PAT, VERCEL_TOKEN, SUPER_SHIELD_KEY | Tras fix sesión 30/05 |

---

## PRICING Y COMERCIAL
Pricing: 59€ base + 20€/usuario (2-6) + 15€/usuario (7+) + 12€/mesa QR/mes. Trial 14d. Anual −18%. Sin comisión.
Cuentan usuarios: camarero + cocina + jefe_sala + contable + RRHH + gestor (owner NO).
PROPUESTAS: NUNCA incluir precios — solo valor/módulos/diferenciadores.
BLOG/LANDING: NUNCA nombrar competidores. Usar "sistemas tradicionales" / "TPV convencional".

---

## MÓDULOS SISTEMA (useModulo)
```typescript
import { useModulo, moduloActivo, invalidarCacheModulos } from '@/hooks/useModulo'
const almacenActivo = useModulo('almacen', session.restaurante_id)
```

---

## SKILLS POR MÓDULO (`.claude/skills/`)
- **ia-rest-qr** → pedidos/cobro QR desde mesa, /q/[token]
- **ia-rest-verifactu** → facturación AEAT, hash SHA-256 encadenado
- **ia-rest-supabase-patterns** → 401, dynamic routes, RLS, multi-tenant, EF, pg_cron, Realtime, RPCs
- **ia-rest-hardware-bridge** → impresoras ESC/POS, Cashdro, bridge-local.js, bridge-agent

Consultar el skill correspondiente ANTES de tocar código de ese módulo.

# ═══════════════════════════════════════════════
# SECCIÓN 2 — MÓDULO QR
# ═══════════════════════════════════════════════

# ia.rest — Módulo QR

Lee este archivo ANTES de tocar cualquier código del módulo QR.

---

## Concepto

El cliente escanea un QR en su mesa → accede al menú digital → hace su pedido
→ la comanda llega al KDS exactamente igual que si la hubiera dictado el camarero.
Opcionalmente puede pagar desde el mismo flujo.

**Es un add-on al plan base:** +12 €/mesa/mes.

---

## Estado real (mayo 2026)

| Modo | Estado |
|---|---|
| `sin_pago` | ✅ Completamente funcional |
| `opcional` | 🔴 Bloqueado — falta STRIPE_CLIENT_ID + WEBHOOK_SECRET_QR en Vercel |
| `obligatorio` | 🔴 Bloqueado — mismo bloqueo que opcional |

**Split UI cliente:** Edge Function `qr-split` operativa, pero sin UI cliente implementada.
**Rotación token por turno:** pendiente implementar.

---

## Ruta del cliente

```
/q/[token]
```

El `token` identifica la sesión QR de la mesa. Se genera en `qr_sesiones_cliente`.
Un token distinto por mesa y turno — nunca reutilizar entre servicios.

---

## Edge Functions del módulo QR

| EF | Versión | Qué hace |
|---|---|---|
| `qr-session` | v2 | Crea/valida sesión QR de mesa. Devuelve config del restaurante y modo de pago |
| `qr-order` | v4 | Recibe pedido del cliente, crea comanda + comanda_items, notifica KDS |
| `qr-cobro` | v1 | Procesa cobro QR (Stripe) desde la sesión del cliente |
| `qr-connect` | v1 | Vincula sesión QR con comanda activa existente |
| `qr-split` | v1 | División de cuenta desde QR — EF ok, sin UI cliente |
| `qr-call-waiter` | v2 | El cliente llama al camarero — genera push al camarero asignado |

---

## Tabla: `qr_sesiones_cliente`

```sql
id UUID PRIMARY KEY,
restaurante_id UUID NOT NULL,
mesa_id UUID NOT NULL,
token TEXT UNIQUE NOT NULL,         -- token del QR en la URL /q/[token]
estado TEXT DEFAULT 'activa',       -- 'activa' | 'cerrada' | 'expirada'
modo_pago TEXT NOT NULL,            -- 'obligatorio' | 'opcional' | 'sin_pago'
comanda_id UUID,                    -- comanda asociada (puede ser null al inicio)
importe_minimo DECIMAL(10,2),       -- para modo obligatorio
created_at TIMESTAMPTZ DEFAULT now(),
expires_at TIMESTAMPTZ,             -- TTL de la sesión (por defecto turno activo)
metadata JSONB                      -- config extra: idioma, nombre_mesa, etc.
```

---

## Modos de pago QR

| Modo | Comportamiento |
|---|---|
| `obligatorio` | El cliente DEBE pagar desde el QR para confirmar. Útil para menú cerrado con precio mínimo |
| `opcional` | El cliente puede pagar desde el QR o pedir que venga el camarero |
| `sin_pago` | Solo pedido — el cobro siempre lo hace el camarero en mesa |

---

## Schema crítico — reglas que NO se pueden romper

### comanda_items en pedidos QR
```typescript
// ✅ SIEMPRE incluir nombre, restaurante_id y origen
const item = {
  comanda_id: sesion.comanda_id,
  producto_id: producto.id,
  nombre: producto.nombre,                  // OBLIGATORIO — desnormalizado
  restaurante_id: sesion.restaurante_id,    // OBLIGATORIO — RLS
  cantidad: 1,
  precio_unitario: producto.precio,
  origen: 'qr'                              // marcar origen QR para trazabilidad
}
```

### comandas.estado al crear desde QR
```typescript
// ✅ CORRECTO
estado: 'nueva'

// ❌ INCORRECTO — CHECK constraint falla
estado: 'pendiente'
estado: 'abierta'
```

---

## Flujo completo de pedido QR

```
1. Cliente escanea QR → GET /q/[token]
2. Next.js llama qr-session → valida token, devuelve config
3. Cliente ve menú → selecciona productos
4. Cliente confirma pedido → POST qr-order
   → crea comanda (estado='nueva') + items (con nombre+restaurante_id)
   → Realtime notifica KDS
   → Si modo='obligatorio' → redirige a cobro antes de confirmar en cocina
5. Cocina recibe en KDS igual que cualquier comanda
6. Cliente puede llamar al camarero → POST qr-call-waiter
   → push al camarero asignado a la mesa
```

---

## Flujo de cobro QR (cuando se desbloquee P2)

```
Cliente pulsa "Pagar" en /q/[token]
  → qr-cobro → crea PaymentIntent Stripe
    → cliente introduce tarjeta
      → webhook confirma pago
        → comanda.estado → 'cerrada'
          → verifactu-sign genera factura automáticamente
```

### Split de cuenta QR (EF ok, UI pendiente)
```
Cliente 1 pulsa "Dividir cuenta"
  → qr-split crea N sub-sesiones (una por comensal)
  → cada comensal accede por link
  → cada uno paga su parte independientemente
  → cuando todos han pagado → comanda se cierra automáticamente
```

---

## Configuración en `/owner → Config → QR`

```typescript
// Config por mesa
{
  qr_activo: boolean,
  modo_pago: 'obligatorio' | 'opcional' | 'sin_pago',
  importe_minimo: number | null,
  url_qr: string  // generado: /q/[token]
}
```

El panel muestra el QR descargable para imprimir y colocar en mesa.

---

## Variables de entorno requeridas

```bash
STRIPE_CLIENT_ID=...              # para cobro QR con Stripe — PENDIENTE (P2 bloqueante)
STRIPE_WEBHOOK_SECRET_QR=...      # webhook módulo QR — PENDIENTE (P2 bloqueante)
```

> ⚠️ Pendiente configurar en Vercel. Mientras tanto, solo el modo sin_pago es funcional.

---

## Integración con el resto del sistema

- **KDS**: comandas QR aparecen igual que las de voz. Campo `origen='qr'` en `comanda_items` permite filtrar.
- **Realtime**: `qr-order` publica en canal `kds-{restaurante_id}` — misma suscripción que usa el KDS.
- **VeriFactu**: el cobro QR genera factura automáticamente vía `verifactu-sign` si está configurado.
- **Push**: `qr-call-waiter` usa la misma infraestructura de `push-send` que usa cocina.

---

## Diagnóstico rápido

| Síntoma | Causa probable | Fix |
|---|---|---|
| Token inválido / sesión expirada | Token caducado o TTL superado | Regenerar QR desde `/owner → Config → QR` |
| Pedido no llega a KDS | `comanda_id` null en sesión | Verificar que `qr-order` crea la comanda antes del item |
| Error RLS en INSERT | Falta `restaurante_id` en comanda_items | Incluir siempre `restaurante_id` y `nombre` |
| Cobro QR falla | `STRIPE_CLIENT_ID` no configurado | P2 — añadir a Vercel env vars |
| Split no cierra comanda | Falta confirmación de todos los pagos | Verificar webhook suma importes |
| Push camarero no llega | `qr-call-waiter` sin suscripción activa | Camarero debe tener push activo en `/edge` |
| Modo opcional/obligatorio no funciona | Stripe env vars pendientes | Solo sin_pago disponible hasta resolver P2 |

# ═══════════════════════════════════════════════
# SECCIÓN 3 — MÓDULO VERIFACTU
# ═══════════════════════════════════════════════

# ia.rest — Módulo VeriFactu

Lee este archivo antes de tocar código relacionado con facturación en ia.rest.

---

## Contexto legal

**VeriFactu** es el estándar de facturación electrónica de la AEAT (España).
Obliga a encadenar facturas con hash SHA-256 para garantizar la integridad.

| Colectivo | Fecha obligatoria |
|---|---|
| Sociedades | 1 enero 2026 |
| Autónomos | 1 julio 2026 |

> ⚠️ **Para restaurantes clientes de ia.rest, VeriFactu ya es obligatorio.**

---

## Arquitectura del módulo

```
Camarero dice "cuenta" o pulsa botón cuenta
  → /edge genera evento cierre
    → verifactu-sign v17 (Edge Function)
      → genera factura con hash SHA-256 encadenado
      → guarda en facturas_verifactu
      → devuelve QR AEAT + número factura
        → /owner → Facturas (listado con QR)

Factura con NIF de cliente (cliente empresa o particular):
  → camarero pulsa "Factura con NIF" en /edge
    → FacturaClienteModal v2 (autocomplete NIF debounce 250ms)
      → busca/crea en clientes_fiscales
        → POST /api/factura/cliente
          → guarda en facturas_cliente + facturas_verifactu
```

---

## Edge Function: `verifactu-sign`

Versión actual: **v17**

### Endpoint
```
POST /functions/v1/verifactu-sign
Authorization: Bearer <anon_key>
Content-Type: application/json
```

### Payload de entrada
```typescript
{
  restaurante_id: string,  // uuid
  comanda_id: string,      // uuid — comanda a facturar
  metodo_pago: 'efectivo' | 'tarjeta' | 'bizum' | 'dividida',
  importe_total: number,   // en euros, 2 decimales
  items: Array<{
    nombre: string,
    cantidad: number,
    precio_unitario: number,
    iva_tipo: 10 | 21      // IVA hostelería: 10% comida, 21% alcohol
  }>
}
```

### Respuesta
```typescript
{
  ok: true,
  factura_id: string,         // uuid en facturas_verifactu
  numero_factura: string,     // ej: "2026-001234"
  hash_sha256: string,
  hash_anterior: string,
  qr_url: string,
  pdf_url: string | null
}
```

---

## Tabla: `facturas_verifactu`

```sql
id UUID PRIMARY KEY,
restaurante_id UUID NOT NULL,
comanda_id UUID REFERENCES comandas,
numero_factura TEXT NOT NULL,        -- secuencial: "2026-000001"
fecha TIMESTAMPTZ NOT NULL,
importe_total DECIMAL(10,2),
iva_desglosado JSONB,                -- { "10": 45.50, "21": 12.30 }
items JSONB,                         -- copia desnormalizada
metodo_pago TEXT,
hash_sha256 TEXT NOT NULL,           -- hash de esta factura
hash_anterior TEXT,                  -- null solo en la primera factura
nif_emisor TEXT NOT NULL,
razon_social TEXT NOT NULL,
qr_content TEXT,                     -- contenido del QR AEAT
estado TEXT DEFAULT 'emitida',       -- 'emitida' | 'anulada'
created_at TIMESTAMPTZ DEFAULT now()
```

---

## Tabla: `clientes_fiscales`

Clientes con NIF para emitir facturas personalizadas.

```sql
id UUID PRIMARY KEY,
restaurante_id UUID NOT NULL,
nif TEXT NOT NULL,                   -- NIF/CIF del cliente
razon_social TEXT NOT NULL,
direccion TEXT,
email TEXT,
created_at TIMESTAMPTZ DEFAULT now(),
UNIQUE(restaurante_id, nif)
```

---

## Tabla: `facturas_cliente`

Facturas emitidas a clientes con NIF propio (además de facturas_verifactu).

```sql
id UUID PRIMARY KEY,
restaurante_id UUID NOT NULL,
comanda_id UUID REFERENCES comandas,
cliente_fiscal_id UUID REFERENCES clientes_fiscales,
factura_verifactu_id UUID REFERENCES facturas_verifactu,
numero_factura TEXT NOT NULL,
fecha TIMESTAMPTZ NOT NULL,
importe_total DECIMAL(10,2),
iva_desglosado JSONB,
items JSONB,
metodo_pago TEXT,
estado TEXT DEFAULT 'emitida',
created_at TIMESTAMPTZ DEFAULT now()
```

---

## API routes de facturación

### `GET/POST /api/clientes-fiscales`
```typescript
// GET — buscar cliente por NIF (autocomplete)
GET /api/clientes-fiscales?nif=B12345678

// POST — crear/actualizar cliente fiscal
POST /api/clientes-fiscales
{ nif, razon_social, direccion?, email? }
```

### `POST /api/factura/cliente`
```typescript
// Generar factura con NIF de cliente
POST /api/factura/cliente
{
  comanda_id: string,
  cliente_fiscal_id: string,    // o nif+razon_social para crear on-the-fly
  metodo_pago: string,
  items: Array<{ nombre, cantidad, precio_unitario, iva_tipo }>
}
```

---

## FacturaClienteModal v2

Modal en /edge para emitir facturas con NIF de cliente.

```typescript
// Características:
// - Autocomplete NIF con debounce 250ms (busca en clientes_fiscales)
// - Si no existe → formulario para crear nuevo cliente fiscal
// - Preview de factura antes de emitir
// - Cliente demo: EMPRESA DEMO SL B12345678
```

---

## Configuración del restaurante

Para generar facturas válidas, el restaurante DEBE tener:
- `nif` — NIF/CIF del restaurante
- `razon_social` — razón social legal
- `direccion_fiscal` — dirección completa

Ruta: `/owner → Restaurante → Datos fiscales`

```typescript
const { data: restaurante } = await supabase
  .from('restaurantes')
  .select('nif, razon_social, direccion_fiscal')
  .eq('id', restauranteId)
  .single()

if (!restaurante.nif || !restaurante.razon_social) {
  throw new Error('Configura NIF y razón social antes de generar facturas')
}
```

---

## Hash SHA-256 encadenado

```typescript
const facturaString = [
  restaurante.nif,
  factura.numero_factura,
  factura.fecha.toISOString(),
  factura.importe_total.toFixed(2),
  hashAnterior || '0'  // primera factura usa '0'
].join('|')

const hash = await crypto.subtle.digest(
  'SHA-256',
  new TextEncoder().encode(facturaString)
)
// convertir a hex string
```

> ⚠️ **No romper la cadena** — nunca borrar de `facturas_verifactu`.

---

## QR AEAT

```
https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?...
  nif=<NIF_EMISOR>
  &numserie=<NUMERO_FACTURA>
  &fecha=<FECHA_DDMMYYYY>   ← formato DDMMYYYY obligatorio
  &importe=<IMPORTE>
```

---

## Tipos de IVA en hostelería

| Tipo | % IVA | Aplica a |
|---|---|---|
| Reducido | 10% | Comida, bebidas no alcohólicas, servicios de restauración |
| General | 21% | Bebidas alcohólicas |

```typescript
function ivaParaProducto(producto: Producto): 10 | 21 {
  if (producto.categoria === 'bebidas' && producto.alcoholico) return 21
  return 10
}
```

---

## Anulación de facturas

Las facturas **no se borran** — se anulan con factura rectificativa.

```typescript
{
  tipo: 'rectificativa',
  factura_original_id: facturaId,
  importe_total: -importeOriginal,
  motivo_anulacion: 'Error en pedido' | 'Devolución' | 'Otro'
}
```

---

## Panel `/owner → Facturas`

Lista de facturas con:
- Número de factura + fecha/hora
- Importe con IVA desglosado
- Hash SHA-256 (primeros 8 chars)
- Cliente fiscal (si aplica)
- Botón QR (abre QR AEAT en modal)
- Botón PDF (descarga si está configurado)
- Estado: emitida / anulada

---

## Diagnóstico

| Error | Causa | Fix |
|---|---|---|
| "NIF no configurado" | `restaurantes.nif` vacío | `/owner → Restaurante → Datos fiscales` |
| Hash roto | Factura borrada de BD | Nunca borrar de `facturas_verifactu` |
| IVA incorrecto | Clasificación incorrecta | Verificar campo `alcoholico` en productos |
| QR inválido | Fecha mal formateada | Formato AEAT: `DDMMYYYY` |
| Número duplicado | Race condition | La secuencia la gestiona `verifactu-sign` con `FOR UPDATE` |
| Cliente no encontrado en autocomplete | NIF no existe en clientes_fiscales | El modal permite crear nuevo cliente on-the-fly |

# ═══════════════════════════════════════════════
# SECCIÓN 4 — MÓDULO SUPABASE PATTERNS
# ═══════════════════════════════════════════════

# ia.rest — Patrones Supabase & Next.js

Lee este archivo ANTES de escribir cualquier código de API route, Edge Function, o migración SQL en ia.rest.

---

## ⚠️ Reglas críticas (errores frecuentes)

### 1. API routes → SIEMPRE `createServerClient()` + `getSession()` + `getRestauranteId()`

```typescript
// ✅ CORRECTO — patrón completo obligatorio en cualquier API route
import { createServerClient } from '@/lib/supabase'
import { getSession, getRestauranteId } from '@/lib/session'

export async function GET(req: Request) {
  const supabase = createServerClient()
  const session = await getSession(supabase)
  if (!session) return Response.json({ error: 'No autorizado' }, { status: 401 })
  const restauranteId = await getRestauranteId(session)
  // usar restauranteId en todas las queries
}

// ❌ ERROR — causa 401 en producción
import { createClient } from '@supabase/supabase-js'
const supabase = createClient(url, key)

// ❌ PATRÓN OBSOLETO — nunca usar
const token = req.headers.get('x-session-token')
// acceder sesiones_activas directamente sin getSession()
```

**Por qué:** `createClient` directo no envía cookies de sesión. `getSession()`/`getRestauranteId()` de `@/lib/session` son los únicos wrappers de auth del proyecto.

---

### 2. Dynamic routes Next.js App Router → `await params`

```typescript
// ✅ CORRECTO — params siempre Promise en App Router
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
}

// También en API routes con segmento dinámico
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
}

// ❌ ERROR — params síncrono
export default async function Page({ params }: { params: { id: string } }) {
  const { id } = params  // TypeError en runtime
}
```

---

### 3. `comandas.estado` — valores exactos

```typescript
// ✅ CORRECTO
estado: 'nueva'      // comanda recién creada
estado: 'en_curso'   // items en preparación
estado: 'lista'      // cocina marcó como lista
estado: 'cerrada'    // cobrada y cerrada

// ❌ ERROR — CHECK constraint falla
estado: 'pendiente'  // no existe
estado: 'abierta'    // no existe
```

---

### 4. `comanda_items` — campos obligatorios

```typescript
// ✅ SIEMPRE incluir nombre, restaurante_id, y formato_nombre si aplica
const item = {
  comanda_id: '...',
  producto_id: '...',
  nombre: producto.nombre,           // OBLIGATORIO — desnormalizado para historial
  restaurante_id: restauranteId,     // OBLIGATORIO — RLS lo exige
  cantidad: 2,
  precio_unitario: 8.50,
  formato_nombre: 'media',           // 'tapa' | 'media' | 'ración' | null
}

// ❌ ERROR — INSERT falla silenciosamente o viola RLS
const item = { comanda_id, producto_id, cantidad }
```

---

### 5. Patrón Turnos — 2 tipos coexisten (CRÍTICO)

```typescript
// Turno de SERVICIO (sala/mesa) → camarero_id IS NULL
// Turno de FICHAJE (personal)   → camarero_id = uuid

// ✅ SIEMPRE filtrar turno activo de SERVICIO así:
const { data: turno } = await supabase
  .from('turnos')
  .select('*')
  .eq('restaurante_id', restauranteId)
  .eq('estado', 'activo')
  .is('camarero_id', null)    // IS NULL — no .eq('camarero_id', null)
  .maybeSingle()              // maybeSingle — no .single() (puede no haber turno)

// ❌ ERROR — mata fichajes o explota
.eq('camarero_id', null)   // sintaxis incorrecta en Supabase JS para IS NULL
.single()                  // lanza error si no hay turno activo

// Camarero ficha desde /edge — POST /api/turnos/fichar
// Owner ve/modifica fichajes desde /owner → Fichajes
```

---

### 6. Guard impresión — reglas absolutas

```typescript
// ✅ CORRECTO — courier-route genera print_jobs al recibir comanda
// POST /api/comanda → courier automáticamente genera print_jobs → imprime

// ❌ NUNCA llamar /api/marchar tras /api/comanda
// El courier YA genera el push marchar internamente
// Llamarlo manualmente DUPLICA la impresión

// Guard dedup activo: 30s filtrando payload->>'tipo'='marchar'
// Si ves duplicados: verificar que no hay doble llamada a /api/marchar
```

---

## Patrón RLS — tabla nueva

Toda tabla nueva necesita al menos estas políticas:

```sql
-- Habilitar RLS
ALTER TABLE nueva_tabla ENABLE ROW LEVEL SECURITY;

-- SELECT: solo ve sus datos
CREATE POLICY "select_own" ON nueva_tabla
  FOR SELECT USING (restaurante_id = current_setting('app.restaurante_id')::uuid);

-- INSERT: solo inserta en su restaurante
CREATE POLICY "insert_own" ON nueva_tabla
  FOR INSERT WITH CHECK (restaurante_id = current_setting('app.restaurante_id')::uuid);

-- UPDATE: solo modifica sus datos
CREATE POLICY "update_own" ON nueva_tabla
  FOR UPDATE USING (restaurante_id = current_setting('app.restaurante_id')::uuid);

-- Service role lo puede todo (para Edge Functions)
CREATE POLICY "service_role_all" ON nueva_tabla
  USING (auth.role() = 'service_role');
```

> ia.rest usa `current_setting('app.restaurante_id')` para multi-tenant, no `auth.uid()`.

---

## Patrón Edge Function (Deno)

```typescript
// supabase/functions/mi-funcion/index.ts
// v1 — descripción de qué hace

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!  // SIEMPRE service role en EFs
  )

  try {
    const body = await req.json()
    // lógica aquí
    return new Response(JSON.stringify({ ok: true, data: {} }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
```

**Reglas EF:**
- Siempre usar `SUPABASE_SERVICE_ROLE_KEY` (no `ANON_KEY`) — necesitan escribir sin RLS
- Incrementar versión en el comentario al desplegar: `// v1`, `// v2`...
- CORS: siempre incluir el bloque OPTIONS

---

## RPCs importantes

### `validate_pin_with_rate_limit`
```typescript
const { data, error } = await supabase.rpc('validate_pin_with_rate_limit', {
  p_restaurante_id: restauranteId,
  p_pin: pin,
  p_ip_address: ipAddress
})
// Retorna: { valid: boolean, rol: string, camarero_id: uuid, blocked_until: timestamp }
```

### `rotate_kds_token`
```typescript
const { data } = await supabase.rpc('rotate_kds_token', {
  p_restaurante_id: restauranteId
})
// Retorna nuevo token para el KDS
```

---

## Multi-tenant — regla absoluta

**Siempre** filtrar por `restaurante_id`. Sin excepción.

```typescript
// ✅ CORRECTO
const { data } = await supabase
  .from('comandas')
  .select('*')
  .eq('restaurante_id', restauranteId)  // SIEMPRE
  .eq('estado', 'nueva')

// ❌ PELIGROSO — devuelve datos de todos los restaurantes
const { data } = await supabase
  .from('comandas')
  .select('*')
  .eq('estado', 'nueva')
```

---

## Realtime subscriptions

```typescript
// Patrón para escuchar comandas nuevas en KDS
const channel = supabase
  .channel(`kds-${restauranteId}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'comandas',
      filter: `restaurante_id=eq.${restauranteId}`
    },
    (payload) => {
      setComandas(prev => [...prev, payload.new])
    }
  )
  .subscribe()

// Cleanup
return () => supabase.removeChannel(channel)
```

---

## pg_cron jobs activos

| Job # | Función | Frecuencia | Qué hace |
|---|---|---|---|
| 6 | alerta-ritmo-cron | Cada 2 min | Detecta mesas lentas y envía alertas |

### Añadir nuevo job de cron
```sql
SELECT cron.schedule(
  'nombre-del-job',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url := 'https://efncqyvhniaxsirhdxaa.supabase.co/functions/v1/mi-funcion',
      headers := '{"Authorization": "Bearer <SERVICE_ROLE_KEY>", "Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    )
  $$
);
```

---

## Migraciones SQL — checklist

Antes de aplicar una migración:
- [ ] `ALTER TABLE` en lugar de recrear tablas (preserva datos)
- [ ] `IF NOT EXISTS` en columnas nuevas
- [ ] RLS habilitado + políticas creadas si es tabla nueva
- [ ] Índice en `restaurante_id` para performance
- [ ] Nombres de columnas en español (convención del proyecto)

```sql
-- Patrón añadir columna
ALTER TABLE mi_tabla
ADD COLUMN IF NOT EXISTS nueva_columna TEXT,
ADD COLUMN IF NOT EXISTS otra_columna BOOLEAN DEFAULT false;

-- Índice estándar
CREATE INDEX IF NOT EXISTS idx_mi_tabla_restaurante
ON mi_tabla(restaurante_id);
```

---

## Tablas nuevas añadidas (mayo 2026)

```
producto_formatos      — formatos T/M/R por producto (tapa/media/ración)
storefront_config      — configuración canales de venta online
pedidos_online         — pedidos del storefront (4 canales)
clientes_fiscales      — clientes con NIF para facturas personalizadas
facturas_cliente       — facturas emitidas a clientes con NIF propio
documentos_escaneados  — audit de SmartScanFAB (quién/tipo/confianza/estado)
voice_profiles         — perfiles de voz Azure (pendiente AZURE_SPEECH_KEY)
ia_training_log        — registro de inferencias por capa (patron/nim_8b_fast/claude_api)
cuentas                — multi-cuenta (N restaurantes por operador)
sugerencias            — sugerencias de mejora del personal
contract_acceptances   — aceptación contrato SaaS v1.0
candidatos             — candidatos RRHH
cv_analisis            — análisis IA de CVs (score 0-100, 9 roles hostelería)
```

---

## Patrón owner/jefe_sala — hooks en condicional

```typescript
// En componentes /owner y /jefe, sh() es función
// ✅ CORRECTO — sh es siempre función
const sh = (): Record<string, string> => ({ ... })
// llamar siempre como sh()

// Para hooks dentro de condicional → sub-componente DetalleView
// Nunca llamar hooks condicionalmente en el componente padre
function DetalleView({ id }: { id: string }) {
  const [data, setData] = useState(null)  // hook aquí, dentro del sub-componente
  // ...
}
```

---

## Errores frecuentes y soluciones

| Error | Causa | Fix |
|---|---|---|
| `401 Unauthorized` en API route | `createClient` directo | Usar `createServerClient()` + `getSession()` |
| `TypeError: params is not iterable` | dynamic route sin `await params` | `const { id } = await params` |
| INSERT silencioso sin datos | RLS bloqueando sin error | Verificar `restaurante_id` en payload |
| `violates check constraint` | `estado: 'pendiente'` | Usar `estado: 'nueva'` |
| `null value in column nombre` | comanda_items sin nombre | Incluir `nombre: producto.nombre` |
| Realtime no llega a KDS | Canal incorrecto | Verificar `filter` con `restaurante_id` |
| Impresión duplicada | Doble llamada a /api/marchar | Nunca llamar /api/marchar tras /api/comanda |
| Turno mata fichajes | .eq('camarero_id', null) | Usar .is('camarero_id', null) + .maybeSingle() |
| Hook en condicional error | useState/useEffect en if | Extraer a sub-componente DetalleView |

# ═══════════════════════════════════════════════
# SECCIÓN 5 — MÓDULO HARDWARE BRIDGE
# ═══════════════════════════════════════════════

# ia.rest — Hardware Bridge

Lee este archivo ANTES de tocar cualquier código relacionado con impresión, Cashdro o bridge.

---

## Arquitectura completa

```
Camarero confirma comanda
  → courier-route v16 (Edge Function)
    → bridge-agent v12 (Edge Function)
      → /heartbeat · /commands · /result · /log-error
        ↑
        bridge-local.js v6.0.1 (Node.js, polling TCP puro cada 3s)
        corriendo en: Android+Termux | PC/servidor | RPi Zero 2W
          → impresora ESC/POS TCP:9100
          → Cashdro HTTP API (localhost LAN) — pendiente módulo T3
```

---

## bridge-local.js v6.0.1

Script Node.js que corre en el hardware local del restaurante.
**No usa WebSockets ni push** — polling puro al bridge-agent cada 3 segundos.

### Novedades v6.0.1
- Fix retry+backoff en fallos de red
- Stale recovery: reintenta comandos atascados tras 90s sin respuesta
- Cloud Edition: soporta Supabase Realtime WSS además de polling HTTP

### Descarga
APK Android: `www.iarest.es/descargar`

### APK v2.0 (mayo 2026)
- Firmada RSA2048/SHA384
- versionCode=11, 4.4MB
- Incluye bridge-local.js embebido con Termux
- Permisos completos (PTT hardware, audio, red)

### Endpoints que consume (bridge-agent)
| Endpoint | Método | Qué hace |
|---|---|---|
| `/heartbeat` | POST | Registra que el bridge está vivo. Responde con comandos pendientes |
| `/commands` | GET | Descarga cola de comandos pendientes |
| `/result` | POST | Reporta resultado de ejecución (ok/error) |
| `/log-error` | POST | Envía errores al log central |

### connection_type
El campo `connection_type` en `impresoras` acepta exactamente estos valores:
```
tcp          → impresora IP directa (TCP:9100)
ip_local     → impresora en LAN vía IP local
usb_bridge   → impresora USB a través del bridge
```

### Protocolo ESC/POS
- Puerto TCP: **9100** (estándar térmicas Star/Epson/XPrinter)
- El bridge-local.js abre socket TCP raw y escribe bytes ESC/POS directamente
- **No CloudPRNT** para bridge local (CloudPRNT es para impresoras con WiFi propio)

---

## Bugs de impresión corregidos (mayo 2026)

| Bug | Descripción | Fix |
|---|---|---|
| B1 | courier sin `restaurante_id` en `courier` field | Añadido campo obligatorio |
| B2 | `zona_tipo` incorrecto en print_jobs | Normalizado a valores exactos |
| B3 | Dedup marchar fallaba | Guard 30s filtrando `payload->>'tipo'='marchar'` |

**Regla absoluta impresión:**
- NUNCA llamar `/api/marchar` tras `/api/comanda`
- El courier genera print_jobs automáticamente al recibir la comanda
- Llamar /api/marchar manualmente DUPLICA la impresión

---

## Tablas de BD relevantes

### `impresoras`
```sql
id, restaurante_id, nombre, tipo,
ip_address,           -- IP local de la impresora
connection_type,      -- 'tcp' | 'ip_local' | 'usb_bridge'
puerto (default 9100),
seccion_cocina_id,    -- qué partida imprime
activa BOOLEAN
```
> RLS activa — siempre filtrar por `restaurante_id`

### `bridge_tokens`
Token de autenticación del bridge-local.js. Rotación manual desde `/owner → Impresoras`.
```sql
id, restaurante_id, token (uuid),
activo BOOLEAN,
created_at, last_seen_at
```

### `bridge_devices`
Registro de dispositivos bridge activos (heartbeat).
```sql
id, restaurante_id, bridge_token_id,
device_name, ip_local,
last_heartbeat_at, version
```

### `bridge_commands`
Cola de comandos pendientes para el bridge.
```sql
id, restaurante_id, impresora_id,
payload JSONB,   -- { type: 'print', data: '...ESC/POS base64...' }
status,          -- 'pending' | 'sent' | 'done' | 'error'
created_at, executed_at
```

---

## Hardware recomendado

| Opción | Coste | Pros | Contras |
|---|---|---|---|
| **Android + Termux** | 0 € | El propio móvil del local, APK lista | Reinicio manual si se mata |
| **PC/servidor existente** | 0 € | Siempre encendido | Depende de PC del restaurante |
| **RPi Zero 2W** | ~25 € | Dedicado, silencioso, bajo consumo | Configuración inicial |

### Termux (Android) — setup mínimo
```bash
pkg install nodejs
node bridge-local.js --token <bridge_token> --url https://efncqyvhniaxsirhdxaa.supabase.co/functions/v1/bridge-agent
```

### RPi Zero 2W — setup producción
```bash
# En RPi OS Lite
curl -fsSL https://deb.nodesource.com/setup_20.x | bash
apt install nodejs
# bridge-local.js como systemd service para auto-start
```

---

## Cashdro (Módulo T3 — pendiente)

Cashdro es un cajón de efectivo inteligente con **HTTP API local en LAN**.

### Estado actual
- ✅ Cajón normal ESC/POS (apertura por pulso) funciona vía bridge
- 🔴 Cashdro HTTP API (gestión de efectivo, conteo, cierre) — **pendiente módulo T3**

### Cashdro HTTP API (cuando se implemente)
```
Base URL: http://<ip-cashdro-local>/api/v1
Métodos relevantes:
  POST /open      → abrir cajón
  GET  /status    → estado efectivo (billetes, monedas)
  POST /close     → cierre de caja con conteo
```
- La IP del Cashdro se configura en `restaurantes.cashdro_ip` (columna a añadir cuando T3)
- Las llamadas van desde bridge-local.js, **nunca desde Vercel** (es red local)

### Patrón de integración
```typescript
// bridge-local.js — handler de comando tipo 'cashdro_open'
case 'cashdro_open':
  const res = await fetch(`http://${config.cashdroIp}/api/v1/open`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason: cmd.payload.reason })
  })
  return { ok: res.ok, status: res.status }
```

---

## CloudPRNT (alternativa a bridge local)

Para impresoras Star con WiFi integrado. **No necesita bridge-local.js**.

- Impresora hace polling a Supabase Edge Function directamente
- Protocolo: HTTPS con autenticación por `mac_address`
- Tabla relevante: `impresoras` con `tipo='cloudprnt'` y `mac_address`
- EF: `courier-route` gestiona la cola CloudPRNT

---

## Diagnóstico rápido

| Síntoma | Causa probable | Fix |
|---|---|---|
| "Bridge caído" en `/owner` | bridge-local.js no hace heartbeat | Reiniciar script en el hardware |
| Impresora no responde | IP incorrecta o puerto 9100 cerrado | Verificar IP en `impresoras.ip_address` |
| `connection_type` no reconocido | Valor incorrecto en BD | Solo acepta `tcp` / `ip_local` / `usb_bridge` |
| Token inválido | Token rotado o expirado | Generar nuevo token en `/owner → Impresoras` |
| Cashdro no abre | HTTP API no implementada | Módulo T3 pendiente |
| Impresión duplicada | Doble llamada a /api/marchar | Nunca llamar /api/marchar tras /api/comanda |
| Stale recovery | Comando atascado >90s | bridge v6.0.1 lo reintenta automáticamente |

---

## Convenciones

- El bridge-local.js **nunca** llama directamente a tablas de BD — solo a `bridge-agent`
- Los comandos de impresión viajan como base64 ESC/POS en el campo `payload.data`
- `bridge-agent` usa `SUPABASE_SERVICE_ROLE_KEY` para escribir en `bridge_commands`
- Versioning: incrementar versión en comentario del EF al desplegar (`// v12`, `// v13`...)

# ═══════════════════════════════════════════════
# SECCIÓN 6 — AGENTES IA (dónde viven y cómo actúan)
# ═══════════════════════════════════════════════

> Aclaración clave: **los agentes de ia.rest NO son agentes de Claude Code.**
> Son código de producción que corre solo en Vercel/Supabase usando NIM
> (fallback Haiku). Claude Code solo los **edita y despliega**; no los ejecuta
> ni ellos lo llaman a él. Relación: Claude Code construye → Vercel ejecuta.

## Dónde está guardado cada agente (todo en el repo de GitHub)

**1. API routes de cron** (la mayoría):
```
app/api/cron/*            alertas · cobro-inactividad · feedback-visita ·
                          lead-onboarding · reservas-noshow · pipeline-comercial ·
                          crm-recordatorios · eventos-entorno · briefing-semanal ·
                          prospeccion-leads · instagram · instagram-refresh ·
                          instagram-metricas · mantenimiento-espacios · completar-locales
app/api/super/qa-agent/cron
app/api/backup/drive
```

**2. Edge Functions (Deno)** en Supabase:
```
supabase/functions/monitor-health     → Auto-Healer
supabase/functions/daily-briefing
supabase/functions/nim-diagnostico · nim-sentiment · notify-error
```

## Qué los dispara
- `vercel.json` (bloque `crons`) → horarios de producción.
- `pg_cron` en Supabase → job #6 (alerta-ritmo).

## Su "cerebro"
Todos llaman a `lib/ai-client.ts` → `callAI()` → NIM → Haiku.
NINGUNO usa la API de Anthropic ni Claude Code directamente.

## Su estado / memoria
Tablas de BD: `qa_patrones_error`, `ia_training_log`, `alerta_log`,
`instagram_semana`, `blog_borradores`, `leads`...

## Panel de control
`/super` → tabs Auto-Healer · QA · Pipeline · Instagram · Blog · Arquitecto
(solo para verlos y lanzarlos a mano).

## Listado y estado
| Agente | Cron | Estado |
|---|---|---|
| Auto-Healer v1.0 | */5 * * * * | ✅ Prod — tasa 97.9% |
| QA Agent v3 | 6:00 diario + 7:00 lunes | ✅ Prod — 6 patrones |
| Lead Hunter | */30 * * * * | ✅ Prod |
| Blog SEO | 8:00 lunes | ✅ Prod |
| Instagram v5 | lunes 8:30 | ✅ Prod — Cloudinary |
| Pipeline Comercial v1.0 | 8:00 lun-vie | ✅ Prod |
| Churn | — | 🔵 Backlog (cuando haya clientes) |

# ═══════════════════════════════════════════════
# SECCIÓN 7 — SETUP, SECRETOS Y ENTORNO LOCAL
# ═══════════════════════════════════════════════

> Principio: el secreto se **guarda cifrado fuera de git** y se **usa** leyéndolo
> en runtime desde `process.env`. En el repo solo el NOMBRE de la variable.

## Patrón "guardar y usar a la vez"
1. **Guardar** una vez en Vercel → Environment Variables (cifrado). Fuente de verdad.
2. **Producción** la app/crons/API routes leen con `process.env.X`.
3. **Local / Claude Code**:
   ```bash
   vercel env pull .env.local     # baja todas las vars a .env.local (gitignored)
   ```
   `next dev` y Claude Code las leen de ahí. Mismo secreto, un solo sitio.

## Casos especiales
- **Edge Functions (Supabase)** — almacén propio:
  ```bash
  supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...
  ```
- **Service account de Drive** → variable única `GOOGLE_SA_JSON` (JSON en base64),
  parsear en runtime. El `.json` NUNCA al repo.
- **Git de Claude Code** → SSH o `gh auth login` (credential helper del sistema).
  NO meter el PAT en `.env`.
- **Passwords personales** (paneles, AEAT) → gestor (Bitwarden / 1Password).
- **Nivel pro opcional**: Doppler / Infisical (un panel, sincroniza a Vercel +
  pull local + rotación). Con `vercel env pull` ya tienes el 90%.

## `.gitignore` recomendado
```gitignore
# Dependencias / build
node_modules/
.next/
out/
dist/

# Entorno y secretos — NUNCA al repo
.env
.env.*
!.env.example
ia-rest-drive-*.json
*-sa-*.json
*service-account*.json

# Sistema
.DS_Store
*.log
```

## `.env.example` (nombres, SIN valores — documenta qué falta configurar)
```bash
# --- Supabase ---
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=

# --- Sesión / auth ---
SESSION_SECRET=
SESSION_ENFORCE=true
CRON_SECRET=
SUPER_SHIELD_KEY=

# --- IA ---
GROQ_API_KEY=
GEMINI_API_KEY=
NIM_API_KEY=

# --- Stripe ---
STRIPE_SECRET_KEY=
STRIPE_MODE=
STRIPE_WEBHOOK_SECRET_OPERADOR=
STRIPE_WEBHOOK_SECRET_QR=
STRIPE_WEBHOOK_SECRET_STOREFRONT=
STRIPE_CLIENT_ID=

# --- Google Drive (service account) ---
GOOGLE_SA_JSON=          # JSON completo en base64

# --- Infra / tooling (no en repo; aquí solo referencia) ---
GITHUB_PAT=              # mejor usar SSH/gh en local
VERCEL_TOKEN=
```

# ═══════════════════════════════════════════════
# SECCIÓN 8 — SUBIR A GITHUB (flujo de commit)
# ═══════════════════════════════════════════════

> Antes del primer commit, verificar que NO se cuela ningún secreto.

```bash
# 1. Confirmar que .gitignore cubre .env y los .json de credenciales
git status            # NO debe aparecer ningún .env ni *-sa-*.json ni ia-rest-drive-*.json

# 2. Añadir solo lo seguro
git add CLAUDE.md .claude/ docs/ ia-rest-MAESTRO_skill.md .gitignore .env.example

# 3. Commit + push (flujo del proyecto)
npx tsc --noEmit                              # 0 errores TS
git fetch origin && git merge origin/main --no-edit
git commit -m "docs: documento maestro + skills + indice para Claude Code"
git push origin main
```

**NUNCA** `git pull --rebase` (pierde archivos nuevos).
**NUNCA** push sin `tsc --noEmit` limpio.

Si algún secreto se commiteó por error: rotarlo (no basta con borrarlo, queda en
el historial) y limpiar con `git filter-repo`.

---

## FIN DEL DOCUMENTO MAESTRO
Todo el conocimiento operativo de ia.rest está en este archivo. Lo que vive fuera
(BD, secretos, docs pesados, backups) está **apuntado** en la Sección 0 con su
ubicación e ID. Mantén la Sección 0 al día y nada se pierde.
