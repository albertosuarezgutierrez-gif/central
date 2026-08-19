# ia.rest — Mapa de fuentes y contexto core (Secciones 0-1)

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
| Repo | github.com/albertosuarezgutierrez-gif/central (monorepo, app en apps/ia-rest/) |
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

> ✅ **BD UNIFICADA — cierre verificado 19/08/2026.** Producción (runtime POS, Edge
> Functions y crons) vive en el COMPARTIDO **`wswbehlcuxqxyinousql`, schema `iarest`**.
> La verificación empírica del 19/08: todas las tablas que escribe el runtime en el viejo
> están congeladas desde primeros de junio, mientras el compartido recibe escrituras
> vivas (leads hasta agosto) — la nota previa de "split-brain 12/07" quedó desfasada.
> El cliente fija el schema vía env `NEXT_PUBLIC_SUPABASE_SCHEMA=iarest` (`SB_SCHEMA`/
> `SB_OPTS` en `src/lib/supabase.ts`).

| Dato | Valor |
|---|---|
| Proyecto VIVO (runtime + EFs + crons) | **wswbehlcuxqxyinousql** (compartido) · schema `iarest` |
| Proyecto viejo (JUBILADO, congelado desde jun-2026) | efncqyvhniaxsirhdxaa — crons apagados 19/08; pausa/borrado pendiente de Alberto |

**Cierre del 19/08/2026** (rama `claude/unificar-supabase-ingress-gastos-zwt9mh`):
- 45 Edge Functions vivas en el compartido (incl. `qr-assistant`, que faltaba y daba 404
  en el QR de mesa) y sus fuentes versionadas en `apps/ia-rest/supabase/functions/`.
- 25 cron jobs recreados en el compartido (migración `20260819_crons_bd_compartida.sql`).
- Realtime: tablas del KDS/bridge añadidas a la publication (`20260819_realtime_publication_iarest.sql`).
- Datos con valor copiados del viejo (leads, CRM, ia_training_log, stripe_events…); el
  histórico demo (comandas de mayo, 6 facturas_verifactu de PRUEBA) se queda en el viejo,
  recuperable mientras esté pausado y no borrado.
- Regla operativa: **desplegar/aplicar SIEMPRE al compartido**; toda EF/cliente/Realtime
  nuevo fija schema `iarest` y las tablas con Realtime se añaden a la publication.

**Acceso:** MCP de Supabase / dashboard. Al migrar, toda consulta/cliente DEBE fijar el
schema `iarest` (en Realtime `schema: 'iarest'`; en EFs `createClient` con `db: { schema: 'iarest' }`).
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
SUPER_SHIELD_KEY                 # key de /api/auth/super-shield (rotar)
GOOGLE_SA_JSON                   # service account Drive — el .json NUNCA al repo
```

`.gitignore` debe incluir: `*.json` de credenciales, `.env*`, `ia-rest-drive-*.json`.

---

## INFRAESTRUCTURA

| Recurso | Valor |
|---|---|
| Supabase | **wswbehlcuxqxyinousql** (compartido, schema `iarest`, eu-west-1, PG17). El viejo `efncqyvhniaxsirhdxaa` está jubilado — ver §2. |
| Vercel team | team_f4gPpt6dPuNcd5YyMt3q27uf |
| Vercel app | prj_A0xZtqWcH6dtNEmlRiOwgj52GTRo |
| Vercel docs | prj_eKC4r06S5svI3mwJJUbZmLVnbiQE |
| Repo | github.com/albertosuarezgutierrez-gif/central (monorepo, app en apps/ia-rest/) |
| Dominio | www.iarest.es |
| GitHub PAT | → env `GITHUB_PAT` (no en repo) |
| Vercel Bearer | → env `VERCEL_TOKEN` (no en repo) |
| SUPER shield | `/api/auth/super-shield?k=<SUPER_SHIELD_KEY>` |
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
- LLM texto: NVIDIA NIM z-ai/glm-5.2 (swap 17/08/2026: el 3.3-70b deja de soportarse en NIM el 25/08/2026 y llama-4-maverick ya estaba EOL en el API; **fallback automático → Groq `openai/gpt-oss-120b`, gratis rate-limited**; Anthropic retirado 17/06/2026, sin saldo)
- LLM visión: **Gemini 2.0 Flash → NVIDIA NIM `meta/llama-3.2-11b-vision-instruct`** (orden de `callAIVision`: pasarela → Gemini → NIM; reordenado 25/06/2026, antes era NIM sin fallback). Gemini lee mucho mejor (OCR) y **admite imágenes grandes**; NIM queda de último recurso. `geminiVision` vive en `@central/core-ai` (junto a `geminiSearch`).
  - ⚠️ **GOTCHA NIM visión: imagen inline ≤ ~180 KB.** Solo aplica si se cae a NIM (Gemini no tiene ese tope). `integrate.api.nvidia.com` rechaza base64 mayores. Desde 25/06/2026 `fotoAJpegPequeno` (`produccion/page.tsx`) apunta a **~1.8 MB** (calidad alta para OCR) porque Gemini es el camino preferido; solo comprime agresivo si hay que caer a NIM. (Tope inicial de 170 KB descubierto 24/06/2026 con la foto-recepción de Catering JJ.)
  - **Recepción de mercancía multi-modal (cocina central, 25/06/2026):** `/produccion` tiene 3 vías → cola de revisión: escáner EAN (`BarcodeDetector`+`@zxing/browser`, escaneo continuo), foto (OCR Gemini), manual. Endpoints `/api/cocina/recepciones/{ean,temperatura,evidencia,caducidades}`. BD: `cocina_recepciones.codigo_barras`+`evidencia_url`; bucket privado Storage `recepciones` (prueba APPCC, URL firmada 1 año). Banner FEFO on-screen para la responsable. Helper `lib/recepcion-ean.ts` (Open Food Facts) y `lib/recepcion-caducidades.ts` (FEFO puro).
- Centralizado en: `lib/ai-client.ts` → `callAI()`, `callAIVision()`, `callAISearch()`, `callAITools()`, `cleanJSON()`
- **Pasarela central (16/06/2026):** si están los envs `AI_GATEWAY_URL`+`AI_GATEWAY_SECRET` (Team-shared en Vercel), las **4 vías** (`callAI`/`callAISearch`/`callAIVision`/`callAITools`) enrutan por la **pasarela de plataforma** (`gatewayChat`/`gatewaySearch`/`gatewayVision`/`gatewayTools` → `/api/ai/tools` para function-calling) y caen al camino directo NIM/Gemini si no está o falla. Gasto centralizado en `/operador/ia`
- `callAI(system, user, maxTokens, timeoutMs, noFallback=true, model?)`
  - Si NIM falla, cae **automáticamente a Groq** (`openai/gpt-oss-120b`, gratis rate-limited; reutiliza `GROQ_API_KEY`, override `GROQ_BRAIN_MODEL`). `callAITools` igual. Solo lanza error si Groq tampoco está.
  - `noFallback` es **legacy** (antaño evitaba el fallback de PAGO a Anthropic, quitado el 17/06/2026); **ya NO bloquea** el fallback gratis a Groq.
  - `model?` (6º arg) → fuerza un modelo NIM concreto en esa llamada (p. ej. el 8B rápido).
- NUNCA llamar NIM/Gemini directamente desde componentes o API routes (usar `lib/ai-client.ts`)
- ⚠️ **LÍMITE ~60s en funciones Vercel de ia-rest** (el plan NO respeta `maxDuration=300` aquí, sí en
  plataforma). El 70b a ~4000 tokens tarda >60s → la función muere con **504** (texto plano, no JSON).
  Para **generaciones largas** (p. ej. blog-seo) usar el **modelo rápido `meta/llama-3.1-8b-instruct`**
  (`callAI(..., model)`) con timeout interno < 60s. Lección de la sesión 16/06 (blog-seo, PR #302).
- Brain: lib/brain.ts + lib/brain-cache.ts + lib/brain-patron.ts + lib/brain-router.ts
- Cache menú: 5min por restaurante. Few-shot con comandas del turno activo vía ia_training_log

---

## ROLES Y ACCESOS

| Rol | Ruta | PIN demo |
|---|---|---|
| super_admin | /super | 9999 (+ shield cookie obligatoria) |
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

## COCINA CENTRAL (catering / comida para llevar) — ≠ restaurante

Una **cocina central de preparación** es un MODELO DISTINTO al restaurante: **sin mesas, comandas,
voz ni KDS**. Su mundo es **evento → parte de elaboración → producción → trazabilidad APPCC → recepción**.
Piloto: **Catering Joaquín Jaén** (Carmen, rol `cocina`, PIN demo 1234).

- **Activación por local:** `iarest.restaurantes.modo` (`'restaurante'` por defecto | `'cocina_central'`).
  El login lee el flag (`/api/auth` firma `cocina_central`) y enruta `cocina`+`cocina_central` → **`/produccion`**
  (no `/kds`). `/cocina` sigue redirigiendo a `/kds` para restaurantes.
- **Pantalla `/produccion`** (cliente, header fino, móvil-first, sin voz/mesas). Usa los módulos puros
  `@central/module-trazabilidad` (generarParte, alérgenos, controles, muestras, evaluarSalida) y
  `@central/module-organizador-trabajo` (asignarTrabajo).
- **Tablas (schema `iarest`, aditivas, server=service_role):** `cocina_recetas` + `cocina_receta_ingredientes`
  (escandallo por PAX), `cocina_eventos` + `cocina_evento_elaboraciones`, `cocina_registros` (operativa del
  día: hecho/controles Tª/muestra/firma + **atribución** `hecho_por[_id]`/`hecho_at`/`firma_por_id`),
  `cocina_recepciones` (albaranes, con `caducidad`), `cocina_asignaciones` (reparto receta→trabajador,
  `origen` ia|manual). Más `personal.partidas text[]` y `personal.cocina_rol` (`responsable`|`cocinero`|`preparacion`).
- **APIs** (auth `x-ia-session` + `local_id`): `/api/cocina/parte` `eventos[/id]` `recetas[/id]` `registros`
  `recepciones[/id]` `recepciones/reconocer` (📷 foto etiqueta/albarán → producto/proveedor/lote/caducidad/Tª
  vía `callAIVision`) `yo` `validar-pin` `personal` (gestión de equipo, guard solo-responsable)
  `asignaciones` (reparto) `menu-sugerido` (✨ la IA compone menú eligiendo del catálogo vía `callAI`).
- **Roles internos de cocina** (`personal.cocina_rol`): **responsable** (Carmen) ve y gestiona todo
  (incl. **alta/baja del equipo** desde `/produccion` → `/api/cocina/personal`, con PIN 4 díg. único por
  local + `partidas`); **cocinero** ve solo su(s) `partidas`; **preparación** = recepción + bases. Frontera
  = "contacto con mercancía cruda". (El rol `co-responsable` está previsto pero aún no habilitado en el guard.)
- **IA en `/produccion`:** **✨ Repartir con IA** (`asignarTrabajo` por partida sobre el equipo real;
  reasignable a mano → los ajustes quedan `origen='manual'` como señal de aprendizaje), **✨ Sugerir menú**
  (describe el evento → menú del catálogo → abre `EventoForm` prerrellenado para revisión humana),
  **📷 Foto-recepción** (autorrellena el albarán). **Pendiente:** análisis de overrides para reentrenar la
  propuesta de reparto, recalibrado de tiempos con `hecho_at`, y **control por voz** (sin comandas).

---

## MATERIALES / LOGÍSTICA (mesas, sillas, menaje de catering) — ≠ almacén de cocina

Módulo **independiente de eventos** (sirve para catering JJ, haciendas o alquiler puro), gating por
`personal.modulos_gestion = 'materiales'`. Motor puro `@central/module-materiales`
(`packages/module-materiales`: `expandirKit`, `disponibilidadEnFecha`, `stockActualDesdeLedger`,
`ajusteInventario`, `alertasVencimiento`). UI: dueño en `/owner` tab **Materiales** (14 sub-pestañas:
Resumen, Catálogo, Espacios, Transferencias, Serializados, Kits, Inventario, Mantenimiento, Reservas,
Clientes, Proveedores, Historial, Importar, Informes); montador en **`/montaje`** (sus asignaciones,
recogido/devuelto, rotura con foto).

- **16 tablas en schema `iarest`** (aplicadas a la BD compartida el 18/06/2026 — antes solo existían
  las 3 base y la Fase B fallaba en prod): `materiales`, `materiales_asignacion`, `materiales_dano`
  (MVP) + `materiales_espacios`, `materiales_transferencias`, `materiales_categorias`,
  `materiales_movimientos` (ledger), `materiales_unidades` (serializados/QR), `materiales_proveedores`,
  `materiales_clientes`, `materiales_kits` (+`_items`), `materiales_inventario_fisico` (+`_lineas`),
  `materiales_mantenimiento`, `materiales_reservas`. Todas RLS `service_role_all`.
- **Enlace a evento (genérico, sin FK dura):** asignación con `destino_tipo`/`destino_ref`/`destino_nombre`;
  reservas/movimientos con `parent_tipo`/`parent_id`. Permite colgar material de un `eventos.id`.
- **APIs** `/api/materiales/*`: `route` (catálogo) · `asignacion` · `dano` · `perfil` · `categorias` ·
  `espacios` · `proveedores` · `clientes` · `kits[/id/items][/instanciar]` · `reservas` · `movimientos` ·
  `unidades` · `mantenimiento` · `inventario-fisico[/id/lineas|cerrar]` · `alertas` · `qr/[id]` · `import` · `informe`.
- **Integración con cocina central (boda → cocina + material)** = diseñada, NO construida:
  `docs/superpowers/specs/2026-06-18-eventos-spine-cocina-materiales-design.md` ("junto pero separado
  por módulo", anclaje en tabla `eventos`).
- Demo: owner Alberto PIN 1369 → tab Materiales; montador PIN 4040 → `/montaje`.
- **Tenant DEMO de Catering JJ (datos operativos, prod `wswbehlcuxqxyinousql`/schema `iarest`):**
  `restaurantes.id = 067c8bab-4edf-4765-a0d6-11b6ea112e8f`, slug `catering-joaquin-jaen`, `codigo_acceso CATERINGJJ`.
  Login: **`/login?r=catering-joaquin-jaen`** (el `?r=` se manda en MAYÚSCULAS; `resolve_restaurante` lo resuelve;
  un `)` o espacio pegado al enlace, o entrar SIN `?r=`, hacen caer a DEMO → "PIN incorrecto").
  PINs (`personal`, en claro, rate-limited por `login_pin`): **Carmen 1234** (cocina/responsable → `/produccion`),
  **Joaquín/owner 1369** (`/owner`), **Montador JJ 4040** (gestor, modulos_gestion=['materiales'] → `/montaje`),
  cocineros **Marta 2001** (frío/corte) · **Diego 2002** (caliente) · **Lucía 2003** (montaje/frío).
  Datos de demo sembrados (25/06/2026) con marcador **`[seed-demo]`** en notas/observaciones/descripción
  (borrables con `DELETE … WHERE … LIKE '%[seed-demo]%'`): dietas en la Boda Familia Pérez, recepciones,
  catálogo materiales+kits, menús de evento, costes/invitados/APPCC del evento CRM. **Solo el tenant JJ.**
- **Activación del menú (gotcha):** los grupos `materiales` (`/owner/materiales`) y `eventos` del nav owner se OCULTAN si `restaurantes.modulos_activos` (lista no vacía) no lleva esa clave. Se activan desde **Config → Módulos** (grupo "Catering & eventos", toggles `eventos`+`materiales`; añadidos a `ModulosTab` el 24/06/2026). El nav lee `modulos_activos` **solo al cargar la página** → `ModulosTab.guardar()` hace `window.location.reload()` tras guardar para que la sección aparezca sola.

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

> **Captación de leads (landing) — `/api/leads/landing`:** TODA landing (home/hostelería/catering/espacios) postea
> aquí → guarda en `leads_landing` + crea lead CRM en `leads` (origen `inbound_web`) → avisa por `tgAlert()` **y**
> `enviarEmailNuevoLead()` (a `hola@iarest.es`, que está en el Gmail de Alberto). El cliente y la API DEBEN cuadrar
> campos: la home manda `restaurante:""` y email opcional → la API exige `nombre` + (teléfono **o** email), nunca
> `restaurante`/`email` obligatorios. Si no cuadran = **400 silencioso = lead perdido sin rastro en BD** (el form
> hace `await fetch` en try/catch e igual muestra "Recibido"); el intento sí queda en **GA4 `generate_lead`**. Fix
> 18/06/2026 (PR #360).

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
Marketing/web: MiWeb v4.0, /r/[slug], directorio SEO, Blog SEO (cron lunes), Instagram agente v6 (semana temática: briefing domingo → blog + lun carrusel/mié Reel IA/vie carrusel, todo sobre UN tema; detalle en la tabla de agentes).
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
alertas */2 · cobro-inactividad */5 · feedback-visita */10 · lead-onboarding */30 · reservas-noshow */5 · cobro-descuento `0 2 1 * *` · backup/drive `0 3 * * *` · completar-locales `0 4 * * *` · mantenimiento-espacios `0 8 * * *` · instagram-metricas `0 7 * * *` · qa-agent `0 6 * * *` + `0 7 * * 1` · pipeline-comercial `0 8 * * 1-5` · crm-recordatorios `0 9 * * 1-5` · eventos-entorno `0 7 * * 1` · briefing-semanal `30 8 * * 0` (domingo) · prospeccion-leads `0 9 * * 1` · instagram `0 8 * * 1,3,5` · instagram-refresh `0 6 1 * *`

---

## PENDIENTES CRÍTICOS
> ⚠️ Stripe YA está en LIVE: `STRIPE_SECRET_KEY` es la clave live y Connect funciona
> (Saboga Catering cobra dinero real vía `/cobro/[slug]`, charges `succeeded` live
> de 10/40/60 €, verificado 04/06/2026). Lo que queda para "todo a live" abajo.

| # | Tarea | Impacto |
|---|---|---|
| P1 | `STRIPE_MODE=live` en Vercel (ahora sin definir → `test`) | Solo afecta flag de QA y 2 rutas onboarding (proveedores/portal): en `test` usan `STRIPE_SECRET_KEY_TEST`. El core ya cobra live |
| P2 | `STRIPE_WEBHOOK_SECRET_QR` (endpoint live → `/api/qr/webhook`) | Cierra el cobro inline del QR de mesa. `STRIPE_CLIENT_ID` (Connect) ya activo |
| P3 | `STRIPE_WEBHOOK_SECRET_STOREFRONT` (endpoint live → `/api/storefront/webhook-pago`) | Confirma pagos del storefront |
| P3b | Verificar webhooks live: OPERADOR (`/api/webhook/stripe-operador`) y PROPINAS (`/api/propinas/webhook`) | Suscripción del operador y propinas digitales |
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

