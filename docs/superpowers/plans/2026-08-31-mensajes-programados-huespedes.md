# Mensajes programados a huéspedes (sustituye los automáticos de Smoobu) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Orquestador propio de los mensajes automáticos del ciclo de una reserva SIVRA (confirmación → acceso → víspera → bienvenida → estancia → víspera de salida → post-salida), con fuente de verdad en nuestro repo/BD y Smoobu solo como transporte + respaldo. Arranca en **modo sombra** (todo va a Telegram, nada al huésped).

**Architecture:** Un cron cada 30 min (`/api/sivra/mensajes/programados`, vía `CRON_JOBS`) lista las reservas vivas de Smoobu en una ventana [−2 d, +9 d], y para cada una decide con lógica PURA (`decidir.ts`) qué mensajes tocan hoy según fase y hora Madrid; renderiza plantillas deterministas en español (`plantillas.ts`) desde `acceso.ts` (estático por piso) + `sivra_codigos_acceso` (códigos rotables en BD, NUNCA en el repo) + `horarios.ts`/`salida.ts` existentes; traduce por IA al idioma de la reserva con verificación de que los datos sobreviven (`traducir.ts`, fallback español); y envía por `enviarAlHuesped` **solo si el piso está activado** en `mensajes_prog_pisos` — si no, copia sombra a Telegram. Registro/dedupe en `mensajes_programados` (UNIQUE booking+tipo+fecha_objetivo). Latido `sivra_mensajes_prog`.

**Tech Stack:** Next.js route handler (plataforma), Prisma `$queryRaw`, `@central/core-telegram`, `@central/core-ai`, `node --test` para la lógica pura.

**Contexto medido (31/08/2026, 8 hilos reales de Smoobu):** inventario de los 7 automáticos actuales, sus defectos (plantillas solo-español, parking fantasma de San Juan de la Palma, duplicados en reservas de última hora, dirección solo detrás de enlace, salida sin automatizar) y decisión de diseño con Alberto: texto-plano-primero en el hilo del portal (funciona offline y lo puede leer el operador del canal), sin landing propia, pregunta de fase al final de cada mensaje (las respuestas las absorbe el agente existente), código de la caja en DOS tiempos (instrucciones a 7 días, código en la víspera), rotación de código tras cancelación expuesta (tarea a Vanesa).

**Reglas de la casa que aplican:** códigos/wifi NUNCA en el repo (semilla por Supabase MCP, no en el .sql) · toda tabla nueva lleva su REVOKE en la migración · NULL ≠ 0 (un envío no registrado ≠ no debido) · latido + PROBE en el MISMO PR · cron nuevo SOLO en `CRON_JOBS` · el SQL crudo se prueba contra la BD real antes de mergear.

---

### Task 1: Migración BD (3 tablas + REVOKE) y semilla de códigos fuera del repo

**Files:**
- Create: `apps/plataforma/prisma/sql/2026-08-31_mensajes_programados.sql`

- [x] **Step 1: escribir la migración** con:
  - `mensajes_programados` (registro + dedupe): `id bigserial PK, booking_id text NOT NULL, property_id text NOT NULL, tipo text NOT NULL, fecha_objetivo date NOT NULL, idioma text NOT NULL DEFAULT 'es', estado text NOT NULL, cuerpo text NOT NULL DEFAULT '', intentos int NOT NULL DEFAULT 0, error text, created_at timestamptz DEFAULT now(), enviado_at timestamptz` + `UNIQUE (booking_id, tipo, fecha_objetivo)`. Estados: `sombra` · `enviado` · `fallo` (se reintenta) .
  - `mensajes_prog_pisos` (activación por piso): `property_id text PK, activo boolean NOT NULL DEFAULT false, desde timestamptz DEFAULT now()`. **Fila ausente = sombra** (conservador).
  - `sivra_codigos_acceso` (rotables): `property_id text PK, codigo_portal text, codigo_caja text, wifi_ssid text, wifi_password text, notas text, updated_at timestamptz DEFAULT now()`. NULL = «no consta», y la plantilla lo declara, no lo inventa.
  - `REVOKE ALL ... FROM anon, authenticated` y `FROM prisma_ialimp, prisma_almacen, prisma_alquiler, prisma_transporte` en las TRES (patrón `2026-08-20_ses_establecimientos.sql`).
- [x] **Step 2: aplicar por Supabase MCP** (`apply_migration`) y **sembrar los códigos reales por `execute_sql`** (fuera del repo): Dúplex caja 7272 · House portal 987654# · Luxury portal 2022# caja 2232 · Busto Reform portal 2022# caja 6622 · los 4 wifi. Verificar con un SELECT.
- [x] **Step 3: commit** de la migración sola.

### Task 2: `acceso.ts` — fuente única de acceso por piso (estático, sin códigos)

**Files:**
- Create: `apps/plataforma/lib/sivra/acceso.ts`
- Test: `apps/plataforma/lib/sivra/acceso.test.ts`

Contenido importado de la guest app REAL de los 4 pisos (leída el 31/08/2026 por api-guest). Tipo:

```ts
export type AccesoPiso = {
  nombre: string
  direccion: string            // postal completa del PISO
  mapaPiso: string             // enlace Google Maps del piso
  llavesFuera: boolean         // Dúplex: true (Javier Lasso de la Vega 7); resto: mismo portal
  llavesDireccion: string      // dónde se recogen las llaves (texto plano)
  llavesMapa: string           // enlace Maps del punto de llaves
  pasos: string[]              // pasos numerados; marcadores {PORTAL} y {CAJA} que rellena la BD
  fotos: string[]              // URLs públicas (CDN Smoobu hoy; espejo pendiente)
  video?: string               // YouTube caja de llaves
  chekinUrl: string            // enlace Chekin del piso (de la guía)
  dentro: string               // cómo llegar a la puerta una vez dentro
  avisos: string[]             // p.ej. Dúplex zona de tráfico restringido (no entrar en coche)
  basura: string               // dónde tirar la basura (texto + enlace)
}
export const ACCESO: Record<string, AccesoPiso>
export function bloqueAcceso(propertyId, codigos: {portal?: string|null; caja?: string|null}, opts: {conCodigos: boolean}): string
```

- `bloqueAcceso(..., {conCodigos:false})` = versión de 7 días (proceso sin códigos, «los códigos te llegan la víspera»); `conCodigos:true` = víspera (con códigos de BD; si un código es NULL en BD, la línea dice «te lo confirmamos hoy mismo» y el orquestador avisa a Telegram — jamás inventa).
- Datos clave por piso: **Dúplex** llaves en C/ Javier Lasso de la Vega 7 (caja, edificio 4, 1º C; llaves a la mesa al salir; azotea planta 8; basura C/ Martín Villa) · **House** Socorro 24, teclado portal, 2 juegos (ficha + cancela hierro), cámara en zona común · **Luxury/Busto Reform** Bustos Tavera 22 (portal común, cajas distintas; Luxury fondo dcha, Reform 1ª izq) · basura busto/house C/ María Coronel. Vídeo YouTube kQl1TzYzqsY (Dúplex/Luxury/Reform).

- [x] Test: los 4 property_id existen; `bloqueAcceso` sin códigos NO contiene `{CAJA}` ni cifras de código; con códigos los contiene; Dúplex menciona Javier Lasso de la Vega ANTES que la dirección del piso; ninguna foto es URL http (todas https).
- [x] Commit.

### Task 3: `plantillas.ts` — los 7 mensajes deterministas (ES)

**Files:**
- Create: `apps/plataforma/lib/sivra/mensajes-prog/plantillas.ts`
- Test: `apps/plataforma/lib/sivra/mensajes-prog/plantillas.test.ts`

```ts
export type TipoMensaje = 'confirmacion'|'acceso'|'vispera_llegada'|'bienvenida'|'estancia'|'vispera_salida'|'post_salida'
export type DatosPlantilla = { guestName, property, propertyId, checkIn, checkOut, horaCheckIn, horaCheckOut,
  codigos: {portal?: string|null; caja?: string|null; wifiSsid?: string|null; wifiPass?: string|null},
  guestAppUrl?: string, lateOfertaOk: boolean|null /* null = no verificado → NO se ofrece */ }
export function renderPlantilla(tipo: TipoMensaje, d: DatosPlantilla): string
```

Copy en español (texto plano, sin HTML), cada una termina con SU pregunta de fase:
1. `confirmacion` — gracias + fechas + «las instrucciones completas de acceso te llegan una semana antes» + parking REAL (`bloqueParking()` de parking.ts, los 4 públicos) + pregunta: ¿hora aproximada de llegada? ¿alguna necesidad (cuna, etc.)?
2. `acceso` (7 días) — dirección en texto + `bloqueAcceso(conCodigos:false)` + fotos + vídeo + Chekin obligatorio + guest app como complemento + pregunta hora de llegada si no la han dicho.
3. `vispera_llegada` — códigos (portal/caja/wifi de BD) + repite dirección y punto de llaves + recordatorio Chekin + atención 9:00–21:00 y llegada autónoma a cualquier hora (política `llegada.ts`) + pregunta hora.
4. `bienvenida` (día llegada, mañana) — bienvenida + normas cortas (ruido 22–9, no fiestas, no fumar, solo registrados) + 091/112 + «escríbenos por aquí para lo que sea».
5. `estancia` (mañana siguiente, solo estancias ≥3 noches) — ¿todo bien? ¿algo que podamos mejorar?
6. `vispera_salida` — salida hasta {horaCheckOut} + llaves al salir (por piso: Dúplex mesa alta cocina; resto donde se recogieron — `salida.ts`) + tareas (aire/luces, ventanas, basura, avisar) + SOLO si `lateOfertaOk === true`: «si no entra nadie mañana podéis quedaros hasta las 12:00 sin coste» + pregunta hora de salida.
7. `post_salida` — gracias + petición de reseña + canal directo abierto.

- [x] Tests: cada tipo devuelve texto no vacío con el nombre y el piso; `confirmacion` NO menciona «San Juan de la Palma»; `acceso` NO contiene los códigos; `vispera_llegada` SÍ los contiene cuando vienen y declara el hueco cuando son null; `vispera_salida` con `lateOfertaOk:null` NO ofrece las 12:00; `estancia`/`post_salida` sin códigos.
- [x] Commit.

### Task 4: `decidir.ts` — qué mensajes tocan hoy (puro)

**Files:**
- Create: `apps/plataforma/lib/sivra/mensajes-prog/decidir.ts`
- Test: `apps/plataforma/lib/sivra/mensajes-prog/decidir.test.ts`

```ts
export type ReservaMin = { bookingId, propertyId, checkIn, checkOut, createdAt?: string, noches: number }
export type Debido = { tipo: TipoMensaje; fechaObjetivo: string }
export function mensajesDebidos(r: ReservaMin, hoy: string, horaMadrid: string, yaHechos: Set<string> /* `${tipo}:${fechaObjetivo}` */): Debido[]
```

Ventanas (hora Madrid): `confirmacion` en cuanto se ve la reserva (fechaObjetivo = min(hoy, checkIn)) · `acceso` desde checkIn−7 (≥09:00) · `vispera_llegada` checkIn−1 ≥09:00 · `bienvenida` día de llegada ≥08:00 · `estancia` checkIn+1 ≥10:30 y noches ≥3 · `vispera_salida` checkOut−1 ≥17:00 · `post_salida` día de salida ≥12:00. Reglas duras:
- **Última hora / colapso:** si al ver la reserva ya están vencidas varias ventanas de llegada, se emiten como MUCHO `confirmacion` + el último hito alcanzado (p.ej. reserva de hoy para hoy → `confirmacion` + `vispera_llegada`(hoy, con códigos) — nunca la ristra entera duplicada de Smoobu). `bienvenida`/`estancia` vencidas se OMITEN, no se reenvían tarde.
- **Nada post-checkout salvo `post_salida`**, y solo si checkOut fue hoy o ayer (no se saluda a un huésped que se fue hace una semana).
- `fechaObjetivo` ancla el dedupe: si una modificación mueve el checkIn, los hitos de la nueva fecha se deben otra vez (clave distinta) y los de la vieja quedan como histórico.

- [x] Tests con fechas concretas: reserva normal a 10 días → solo confirmacion; a 7 días 09:30 → acceso; víspera 08:00 → nada, 09:30 → vispera_llegada; reservada-hoy-llega-hoy 13:00 → confirmacion+vispera_llegada exactamente; 1 noche → sin estancia; checkOut hace 3 días → nada; `yaHechos` filtra.
- [x] Commit.

### Task 5: `traducir.ts` — traducción que no puede corromper datos

**Files:**
- Create: `apps/plataforma/lib/sivra/mensajes-prog/traducir.ts`
- Test: `apps/plataforma/lib/sivra/mensajes-prog/traduccion-guarda.test.ts` (solo la guarda pura)

```ts
export function conservaDatos(orig: string, trad: string): boolean  // PURO: toda secuencia de ≥2 dígitos y toda URL del original están en la traducción
export async function traducirMensaje(texto: string, idioma: string): Promise<{ texto: string; idioma: string }>
```
- Si `idioma` es `es`/vacío → tal cual. Si la IA falla o `conservaDatos()` da false → **se envía el español** (lo que hace Smoobu hoy; jamás un mensaje con el código mutado).
- [x] Tests de `conservaDatos`: código perdido → false; URL recortada → false; traducción sana → true.
- [x] Commit.

### Task 6: orquestador + route + cron + latido (todo el cableado en un task)

**Files:**
- Create: `apps/plataforma/lib/sivra/mensajes-prog/orquestador.ts`
- Create: `apps/plataforma/app/api/sivra/mensajes/programados/route.ts`
- Modify: `apps/plataforma/lib/cron-dispatch.ts` (+1 fila `{ path: '/api/sivra/mensajes/programados', schedule: '7,37 * * * *' }`)
- Modify: `apps/plataforma/lib/monitoring/latidos.ts` (entrada `sivra_mensajes_prog`, maxHoras 6)
- Modify: `apps/plataforma/app/api/cron/agentes-latido/route.ts` (PROBE `agente_latidos.sivra_mensajes_prog` — MISMO PR, landmine PR #1447)

Orquestador (IO):
1. `registrarLatido('sivra_mensajes_prog', false, 'intento…')` al arrancar (lección facturas-scan) + presupuesto de tiempo (deadline 280 s).
2. Lista reservas: `GET /api/reservations?from=hoy−2&to=hoy+9&showCancellation=false&pageSize=100` (una llamada). `toPropertyId` para el piso; fuera los `Blocked channel`.
3. Reintentos: filas `estado='fallo'` con `intentos<5` se reencolan antes que lo nuevo.
4. Por reserva: `mensajesDebidos(...)` con `yaHechos` de la tabla → para cada debido: leer códigos + `guest-app-url` (solo tipos que lo usan), `lateOfertaOk` solo para `vispera_salida` (reusa `entradaMismoDiaLibre`; fallo de fetch → null), `renderPlantilla`, `traducirMensaje` al idioma de la reserva.
5. **Sombra vs activo** por `mensajes_prog_pisos.activo`: sombra → estado `sombra` + acumular para UN Telegram por pasada («🕶️ SOMBRA — se habría enviado…» con el texto ES); activo → `enviarAlHuesped` (asunto solo en `confirmacion`), estado `enviado`/`fallo`, copia informativa a Telegram.
6. INSERT con `ON CONFLICT (booking_id,tipo,fecha_objetivo) DO NOTHING` como reclamo ANTES de enviar (carrera entre pasadas); si el envío falla → UPDATE a `fallo`.
7. Latido final OK con detalle (`N debidos · N sombra · N enviados · N fallos`); fallos de envío con reserva a <2 días → aviso Telegram inmediato.
- [x] Route: `isCronAuthorized`, `maxDuration = 300`, `dynamic = 'force-dynamic'`.
- [x] Commit.

### Task 7: verificación + memoria + PR

- [x] `npx --yes pnpm@10.33.0 install --no-frozen-lockfile` (el contenedor arranca sin node_modules).
- [x] `pnpm test` en raíz (incluye los tests nuevos) — 0 fallos.
- [x] `cd apps/plataforma && pnpm exec prisma generate && pnpm exec tsc --noEmit -p tsconfig.json` — 0 errores.
- [x] Probar el SQL nuevo contra la BD real (SELECT de las 3 tablas; el INSERT ON CONFLICT del orquestador a mano) — landmine «el SQL de un cron nuevo se ejecuta contra la BD real antes de mergear».
- [x] Anotar `docs/CONTEXTO-SESIONES.md` (entrada nueva arriba, ≤8 líneas).
- [x] Commit + push `claude/smoobu-automated-messages-po1uvp` + PR draft + subscribe.

### Fuera de este PR (anotado, decidido con Alberto)
- Activación por piso (UPDATE `mensajes_prog_pisos` cuando Alberto valide la sombra) y apagado de las plantillas de Smoobu piso a piso (lo hace él en la UI de Smoobu).
- Rotación de código tras cancelación expuesta → tarea automática a Vanesa (`limpieza_tareas`).
- Vigía SLA de pendientes de Telegram sin respuesta; reseña condicionada al sentimiento; espejo de fotos en Supabase Storage; volcar hora de llegada/salida a la intranet de limpieza; integrar `bloqueAcceso` en la ficha del agente; fallback de envío por email directo.
