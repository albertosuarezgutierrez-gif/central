# Recaptación de leads sin vencimiento — Plan de implementación

> **Para agentes:** usa `superpowers:subagent-driven-development` (recomendado) o
> `superpowers:executing-plans` para ejecutar este plan tarea a tarea. Los pasos usan
> checkboxes (`- [ ]`).

**Objetivo:** dar a Alberto una cola de los 669 leads del volcado (sin vencimiento, con
contacto, excluyendo a quien ya es cliente vivo por CIMA) con un botón de WhatsApp manual
y uno de email (Resend, con tracking de apertura/clic), cooldown de 14 días tras contactar,
y reutilizando el descarte de ficha ya existente para "no interesado".

**Arquitectura:** lógica pura nueva en `@central/module-seguros`; lectura/escritura y envío
en `apps/asegura` (puerto `/api/operador/recaptacion/*` + webhook de Resend); proxy +
pantalla en `apps/plataforma` (`/correduria` → sección Clientes), siguiendo el patrón ya
establecido por `cartera-impagados.ts` / `aviso-acceso.ts` / `correduria-puerto.ts`.

**Tech stack:** Next.js 15 · Prisma 5 (schema `apps/asegura/prisma/asegura.prisma`) ·
`@central/core-ai` (`aiComplete`) para pulir el texto · Resend HTTP API (no SMTP, para poder
trackear aperturas/clics) · `svix` para verificar la firma del webhook.

Spec: `docs/superpowers/specs/2026-09-12-recaptacion-leads-design.md`.

---

### Task 1: Lógica pura — cooldown y mensaje base (`@central/module-seguros`)

**Files:**
- Create: `packages/module-seguros/src/recaptacion.ts`
- Create: `packages/module-seguros/src/recaptacion.test.ts`
- Modify: `packages/module-seguros/src/index.ts` (añadir el re-export)

- [ ] **Step 1: Escribir el test que falla**

```ts
// packages/module-seguros/src/recaptacion.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COOLDOWN_DIAS, enCooldown, textoBaseRecaptacionWhatsapp } from './recaptacion.ts'

test('sin envío previo, nunca está en cooldown', () => {
  assert.equal(enCooldown(null), false)
})

test('un envío de ayer sigue en cooldown', () => {
  const ayer = new Date('2026-09-11T10:00:00Z')
  const hoy = new Date('2026-09-12T10:00:00Z')
  assert.equal(enCooldown({ creadoAt: ayer }, hoy), true)
})

test('un envío de hace 15 días ya no está en cooldown (14 días)', () => {
  const hace15 = new Date('2026-08-28T10:00:00Z')
  const hoy = new Date('2026-09-12T10:00:00Z')
  assert.equal(enCooldown({ creadoAt: hace15 }, hoy, COOLDOWN_DIAS), false)
})

test('exactamente en el límite del cooldown sigue contando como en cooldown', () => {
  const hace14 = new Date('2026-08-29T10:00:00Z')
  const hoy = new Date('2026-09-12T10:00:00Z')
  assert.equal(enCooldown({ creadoAt: hace14 }, hoy, COOLDOWN_DIAS), true)
})

test('el mensaje base nombra el ramo y, si se conoce, la aseguradora anterior', () => {
  const t = textoBaseRecaptacionWhatsapp({
    nombre: 'Maria Antonia Gutierrez Alcala',
    ramoLegible: 'comunidades',
    aseguradoraAnterior: 'Plus Ultra',
  })
  assert.match(t, /Maria/i)
  assert.match(t, /comunidades/i)
  assert.match(t, /Plus Ultra/)
})

test('sin aseguradora anterior conocida, no se inventa ninguna', () => {
  const t = textoBaseRecaptacionWhatsapp({ nombre: 'Pablo', ramoLegible: 'auto', aseguradoraAnterior: null })
  assert.doesNotMatch(t, /con null/i)
})
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `cd packages/module-seguros && node --test src/recaptacion.test.ts`
Expected: FAIL — `Cannot find module './recaptacion.ts'`.

- [ ] **Step 3: Implementación**

```ts
// packages/module-seguros/src/recaptacion.ts
//
// Cola de recaptación de leads sin vencimiento (12/09/2026). Ver
// docs/superpowers/specs/2026-09-12-recaptacion-leads-design.md.
//
// La cola es SOLO leads del volcado, sin vencimiento, con contacto, y
// EXCLUYENDO a quien ya es cliente vivo por CIMA en otro ramo (regla 6 del
// spec): esos se trabajan desde su ficha normal, no aquí. El filtro/exclusión
// vive en SQL (apps/asegura/lib/cartera-recaptacion.ts, con
// sqlVolcadoHistorico()/sqlCarteraViva() de cartera-viva.ts); aquí solo el
// cooldown y el texto, que no dependen de la BD.

import { MEDIADOR } from './mediador.ts'
import { nombreDePila } from './nombre-de-pila.ts'

export const COOLDOWN_DIAS = 14

export type EnvioRecienteRecaptacion = { creadoAt: Date }

/**
 * `true` si el lead sigue en cooldown desde su último envío/apertura de
 * enlace. El límite se calcula sumando días de calendario, no horas exactas:
 * un envío de las 23:50 y una comprobación a las 00:05 del día siguiente NO
 * cuentan como "un día completo" — así el cooldown no se vacía por minutos.
 */
export function enCooldown(
  ultimoEnvio: EnvioRecienteRecaptacion | null,
  hoy: Date = new Date(),
  dias: number = COOLDOWN_DIAS,
): boolean {
  if (ultimoEnvio === null) return false
  const limite = new Date(ultimoEnvio.creadoAt)
  limite.setUTCDate(limite.getUTCDate() + dias)
  return hoy < limite
}

export type PersonalizacionRecaptacion = {
  nombre: string
  /** Ya en texto legible ("comunidades", "hogar"), no el enum crudo de la BD. */
  ramoLegible: string
  /** `null` = no se conoce; el texto NO menciona ninguna compañía en ese caso. */
  aseguradoraAnterior: string | null
}

/**
 * Firma igual que `mensaje-whatsapp.ts` (mismo `FIRMA`, mismo portal como
 * ÚNICO enlace — dos URLs en un mensaje corto compiten). Esta es la base
 * DETERMINISTA que `apps/asegura` manda a pulir a la IA; si la IA falla, esta
 * misma frase es lo que se envía — nunca un mensaje vacío ni una plantilla a
 * medias.
 */
export function textoBaseRecaptacionWhatsapp(d: PersonalizacionRecaptacion): string {
  const pila = nombreDePila(d.nombre) ?? d.nombre
  const firma = `${MEDIADOR.identidad.nombre.split(' ').slice(0, 2).join(' ')}, de ${MEDIADOR.marca}`
  const conQuien = d.aseguradoraAnterior ? ` que tuviste con ${d.aseguradoraAnterior}` : ''
  return [
    `Hola ${pila}, soy ${firma}, corredor de seguros.`,
    '',
    `Te escribo porque en su día tuvimos contacto por tu seguro de ${d.ramoLegible}${conQuien}, y quería saber si sigues teniendo ese riesgo asegurado.`,
    '',
    'Si te interesa, te paso un precio actualizado sin compromiso — y de paso te dejo una herramienta gratis para tener todos tus seguros en un sitio:',
    '',
    MEDIADOR.identidad.portal,
    '',
    'Si ya no te hace falta o prefieres que no te escriba más, dímelo y no insisto.',
  ].join('\n')
}

/** Misma redacción, adaptada a un asunto+cuerpo de correo (sin el saludo de WhatsApp). */
export function textoBaseRecaptacionEmail(d: PersonalizacionRecaptacion): { asunto: string; texto: string } {
  const pila = nombreDePila(d.nombre) ?? d.nombre
  const firma = `${MEDIADOR.identidad.nombre.split(' ').slice(0, 2).join(' ')}, de ${MEDIADOR.marca}`
  const conQuien = d.aseguradoraAnterior ? ` que tuviste con ${d.aseguradoraAnterior}` : ''
  const asunto = `¿Sigues con tu seguro de ${d.ramoLegible}?`
  const texto = [
    `Hola ${pila}:`,
    '',
    `Soy ${firma}. En su día tuvimos contacto por tu seguro de ${d.ramoLegible}${conQuien}, y quería saber si sigues teniendo ese riesgo asegurado.`,
    '',
    'Si te interesa, te paso un precio actualizado sin compromiso. De paso te dejo una herramienta gratis para tener todos tus seguros en un sitio, sean de quien sean:',
    MEDIADOR.identidad.portal,
    '',
    'Si ya no te hace falta o prefieres que no te escriba más, respóndeme y no insisto.',
  ].join('\n')
  return { asunto, texto }
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `cd packages/module-seguros && node --test src/recaptacion.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Exportarlo desde el índice del paquete**

En `packages/module-seguros/src/index.ts`, añadir junto a las demás exportaciones de dominio:

```ts
export { COOLDOWN_DIAS, enCooldown, textoBaseRecaptacionWhatsapp, textoBaseRecaptacionEmail } from './recaptacion.ts'
export type { EnvioRecienteRecaptacion, PersonalizacionRecaptacion } from './recaptacion.ts'
```

- [ ] **Step 6: Commit**

```bash
git add packages/module-seguros/src/recaptacion.ts packages/module-seguros/src/recaptacion.test.ts packages/module-seguros/src/index.ts
git commit -m "feat(module-seguros): cooldown y mensaje base de recaptación de leads"
```

---

### Task 2: Migración — tabla `seguros.recaptacion_envios`

**Files:**
- Create: `apps/asegura/prisma/sql/2026-09-12_recaptacion_envios.sql`
- Modify: `apps/asegura/prisma/asegura.prisma` (nuevo modelo + enums)

- [ ] **Step 1: Escribir la migración**

```sql
-- apps/asegura/prisma/sql/2026-09-12_recaptacion_envios.sql
--
-- Registro de cada intento de recaptación (WhatsApp manual o email por
-- Resend) sobre un lead del volcado sin vencimiento. Ver
-- docs/superpowers/specs/2026-09-12-recaptacion-leads-design.md.
--
-- No hay tabla de "cola calculada": se deriva en cada GET (patrón
-- `polizasSinRecibo()` de lib/cartera-impagados.ts). Esta tabla es solo el
-- HISTORIAL de contactos, que alimenta el cooldown y el contador semanal.

create type seguros.canal_recaptacion as enum ('whatsapp', 'email');

create type seguros.estado_envio_recaptacion as enum (
  'enviado',        -- email: Resend aceptó el mensaje
  'enlace_abierto', -- whatsapp: Alberto pulsó el botón (techo sin WABA: no hay lectura)
  'abierto',        -- email: Resend confirmó open
  'pinchado'        -- email: Resend confirmó click
);

create table if not exists seguros.recaptacion_envios (
  id                uuid primary key default gen_random_uuid(),
  correduria_id     uuid not null references seguros.corredurias(id),
  cliente_id        uuid not null references seguros.clientes(id),
  poliza_id         uuid not null references seguros.polizas(id),
  canal             seguros.canal_recaptacion not null,
  estado            seguros.estado_envio_recaptacion not null,
  mensaje           text not null,
  resend_message_id text,
  creado_por        text not null,
  created_at        timestamp not null default now(),
  updated_at        timestamp not null default now()
);

-- El cooldown y "¿hay algo en marcha para este lead?" preguntan siempre por
-- cliente+fecha: sin este índice cada carga de la cola sería un seq scan.
create index if not exists ix_recaptacion_envios_cliente
  on seguros.recaptacion_envios (cliente_id, created_at desc);

-- El webhook de Resend casa por `resend_message_id`, nunca por cliente/fecha.
create index if not exists ix_recaptacion_envios_resend_id
  on seguros.recaptacion_envios (resend_message_id)
  where resend_message_id is not null;

grant select, insert, update on seguros.recaptacion_envios to prisma_seguros;
```

- [ ] **Step 2: Aplicarla contra la BD real**

Usa `mcp__Supabase__apply_migration` (proyecto `wswbehlcuxqxyinousql`, nombre
`recaptacion_envios`) con el contenido de arriba. Verifica después:

```sql
select table_name from information_schema.tables where table_schema='seguros' and table_name='recaptacion_envios';
```

Expected: una fila.

- [ ] **Step 3: Añadir el modelo Prisma**

En `apps/asegura/prisma/asegura.prisma`, junto a los demás enums/modelos de `seguros`:

```prisma
enum CanalRecaptacion {
  whatsapp
  email

  @@schema("seguros")
}

enum EstadoEnvioRecaptacion {
  enviado
  enlace_abierto
  abierto
  pinchado

  @@schema("seguros")
}

model RecaptacionEnvio {
  id               String                 @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  correduriaId     String                 @map("correduria_id") @db.Uuid
  clienteId        String                 @map("cliente_id") @db.Uuid
  polizaId         String                 @map("poliza_id") @db.Uuid
  canal            CanalRecaptacion
  estado           EstadoEnvioRecaptacion
  mensaje          String
  resendMessageId  String?                @map("resend_message_id")
  creadoPor        String                 @map("creado_por")
  createdAt        DateTime               @default(now()) @map("created_at") @db.Timestamp(6)
  updatedAt        DateTime               @default(now()) @map("updated_at") @db.Timestamp(6)

  @@map("recaptacion_envios")
  @@schema("seguros")
}
```

(Sigue el mismo estilo que el resto de modelos de este fichero — mira `model Cliente` justo
arriba para el patrón exacto de `@map`/`@@schema`.)

- [ ] **Step 4: Regenerar el cliente y comprobar que compila**

Run: `cd apps/asegura && pnpm exec prisma generate && pnpm exec prisma generate --schema prisma/asegura.prisma && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: 0 errores. (Recuerda la trampa del `CLAUDE.md` raíz: esta app tiene DOS schemas de Prisma — genera los dos antes de fiarte del typecheck.)

- [ ] **Step 5: Commit**

```bash
git add apps/asegura/prisma/sql/2026-09-12_recaptacion_envios.sql apps/asegura/prisma/asegura.prisma
git commit -m "feat(asegura): tabla recaptacion_envios para el historial de recaptación de leads"
```

---

### Task 3: `apps/asegura` — la cola calculada y el registro de envíos

**Files:**
- Create: `apps/asegura/lib/cartera-recaptacion.ts`
- Create: `apps/asegura/lib/cartera-recaptacion.test.ts`

- [ ] **Step 1: Escribir el test que falla (lee el FUENTE, como `cartera-filtro.test.ts`)**

El SQL vive dentro de un `Prisma.sql`, invisible a `tsc`/build (regla del `CLAUDE.md` de
`apps/asegura`), así que el guardián lee el fichero como texto:

```ts
// apps/asegura/lib/cartera-recaptacion.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const FUENTE = readFileSync(new URL('./cartera-recaptacion.ts', import.meta.url), 'utf8')

test('el filtro de cartera viva usa el helper compartido, no una condición propia', () => {
  assert.match(FUENTE, /sqlVolcadoHistorico|sqlCarteraViva/)
})

test('la exclusión de cliente-ya-vivo-por-CIMA está en el SQL de la cola', () => {
  // Debe existir un NOT EXISTS que mire otras pólizas del mismo cliente que SÍ
  // sean cartera viva — si esta línea desaparece, un cliente actual volvería a
  // aparecer en la cola de "leads a recaptar".
  assert.match(FUENTE, /not exists[\s\S]{0,400}cartera_viva|not exists[\s\S]{0,400}import_ref is null or[\s\S]{0,80}eiac_xml_hash is not null/i)
})

test('la prima usa nullif para no pintar 0 como si fuera un importe real', () => {
  assert.match(FUENTE, /nullif/i)
})

test('el opt-out de WhatsApp y de email se respetan cada uno por su canal', () => {
  // Guarda obligatoria del spec (punto 1, la única que Alberto marcó como
  // "sí o sí"): un cliente que dio de baja un canal no puede recibir esa
  // oferta por ese canal, aunque siga teniendo el otro disponible.
  assert.match(FUENTE, /wa_opt_out_at/i)
  assert.match(FUENTE, /email_opt_out_at/i)
})
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `cd apps/asegura && node --test lib/cartera-recaptacion.test.ts`
Expected: FAIL — el fichero no existe.

- [ ] **Step 3: Implementación**

```ts
// apps/asegura/lib/cartera-recaptacion.ts
//
// La cola de recaptación: leads del volcado sin fecha de vencimiento, con
// contacto, que NO son ya cliente vivo por CIMA. Ver
// docs/superpowers/specs/2026-09-12-recaptacion-leads-design.md.
//
// No hay tabla de cola: se calcula en cada GET, como `polizasSinRecibo()` de
// `cartera-impagados.ts`. `seguros.recaptacion_envios` es solo el HISTORIAL
// que decide el cooldown y alimenta el contador semanal.

import { enCooldown, COOLDOWN_DIAS, textoBaseRecaptacionWhatsapp, textoBaseRecaptacionEmail } from '@central/module-seguros'
import { decryptField } from '@central/module-seguros-pii'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'

const RAMOS_LEGIBLES: Record<string, string> = {
  hogar: 'hogar',
  auto: 'auto',
  moto: 'moto',
  responsabilidad_civil: 'responsabilidad civil',
  vida: 'vida',
  salud: 'salud',
  decesos: 'decesos',
  comercio: 'comercio',
  otros: 'comunidades', // el caso real que abrió este trabajo (BIDP023227) es 'otros'
}

function ramoLegible(tipo: string): string {
  return RAMOS_LEGIBLES[tipo] ?? tipo.replace(/_/g, ' ')
}

/** Descifra sin convertir un fallo en "no tiene contacto". Mismo patrón que `cartera-impagados.ts`. */
function descifrar(v: string | null | undefined): string | null {
  if (typeof v !== 'string' || v.trim() === '') return null
  if (!v.startsWith('v1:')) return v
  try {
    return decryptField(v)
  } catch {
    return null
  }
}

export type LeadRecaptacion = {
  clienteId: string
  polizaId: string
  cliente: string
  ramo: string
  ramoLegible: string
  aseguradoraAnterior: string | null
  numeroPoliza: string | null
  telefono: string | null
  email: string | null
  /** `true` = ya se contactó hace menos de 14 días; la pantalla ofrece "ver igualmente" para forzar. */
  enCooldown: boolean
  ultimoContactoEn: string | null
}

export type ContadoresRecaptacion = {
  totalCandidatos: number
  contactadosSemana: number
  conAperturaORespuestaSemana: number
}

export type ColaRecaptacion = { leads: LeadRecaptacion[]; contadores: ContadoresRecaptacion }

type FilaCruda = {
  clienteId: string
  nombre: string
  apellidos: string
  polizaId: string
  tipo: string
  aseguradora: string | null
  numeroPoliza: string | null
  /** `null` si no hay teléfono O si el cliente dio de baja WhatsApp (`wa_opt_out_at`). */
  telefono: string | null
  /** `null` si no hay email O si el cliente dio de baja el correo (`email_opt_out_at`). */
  email: string | null
  ultimoEnvioAt: Date | null
}

export async function colaRecaptacion(correduriaId: string): Promise<ColaRecaptacion> {
  const vacia: ColaRecaptacion = { leads: [], contadores: { totalCandidatos: 0, contactadosSemana: 0, conAperturaORespuestaSemana: 0 } }
  if (!aseguraConfigurada()) return vacia
  const db = prismaAsegura()

  // Un lead entra si: es volcado sin vencimiento y activo, tiene teléfono o
  // email, y su cliente NO tiene NINGUNA otra póliza de cartera viva (si la
  // tuviera, es cliente actual y se trabaja desde su ficha, no aquí).
  const filas = await db.$queryRaw<FilaCruda[]>`
    select
      c.id as "clienteId", c.nombre, c.apellidos,
      p.id as "polizaId", p.tipo::text as tipo, p.aseguradora, p.numero_poliza as "numeroPoliza",
      -- Opt-out POR CANAL, no de la ficha entera: si dio de baja WhatsApp pero
      -- no el email (o al revés), sigue siendo contactable por el otro.
      case when c.wa_opt_out_at is null then c.telefono else null end as telefono,
      case when c.email_opt_out_at is null then c.email else null end as email,
      (
        select max(r.created_at) from seguros.recaptacion_envios r
        where r.cliente_id = c.id
      ) as "ultimoEnvioAt"
    from seguros.polizas p
    join seguros.clientes c on c.id = p.cliente_id
    where p.correduria_id = ${correduriaId}::uuid
      and p.merged_into_poliza_id is null
      and c.merged_into_cliente_id is null
      and c.activo
      and p.import_ref is not null and p.import_ref <> ''
      and p.eiac_xml_hash is null
      and p.estado = 'activa'
      and p.fecha_vencimiento is null
      -- Al menos un canal DISPONIBLE tras aplicar el opt-out (no basta con
      -- tener el dato guardado: si el único canal que tiene está dado de baja,
      -- este lead no entra en la cola).
      and (
        (c.telefono is not null and c.wa_opt_out_at is null)
        or (c.email is not null and c.email_opt_out_at is null)
      )
      and not exists (
        select 1 from seguros.polizas v
        where v.cliente_id = c.id
          and v.id <> p.id
          and v.merged_into_poliza_id is null
          and (v.import_ref is null or v.eiac_xml_hash is not null)
      )
    order by c.apellidos, c.nombre
    limit 2000
  `

  const hoy = new Date()
  const leads: LeadRecaptacion[] = filas.map((f) => {
    const tipo = String(f.tipo)
    const ultimoEnvio = f.ultimoEnvioAt ? { creadoAt: f.ultimoEnvioAt } : null
    return {
      clienteId: f.clienteId,
      polizaId: f.polizaId,
      cliente: `${f.nombre} ${f.apellidos}`.trim(),
      ramo: tipo,
      ramoLegible: ramoLegible(tipo),
      aseguradoraAnterior: f.aseguradora?.trim() || null,
      numeroPoliza: f.numeroPoliza,
      telefono: descifrar(f.telefono),
      email: descifrar(f.email),
      enCooldown: enCooldown(ultimoEnvio, hoy, COOLDOWN_DIAS),
      ultimoContactoEn: f.ultimoEnvioAt ? f.ultimoEnvioAt.toISOString().slice(0, 10) : null,
    }
  })

  const contadores = await contadoresSemana(correduriaId)
  return { leads, contadores: { ...contadores, totalCandidatos: leads.length } }
}

async function contadoresSemana(correduriaId: string): Promise<Omit<ContadoresRecaptacion, 'totalCandidatos'>> {
  const db = prismaAsegura()
  const filas = await db.$queryRaw<{ contactados: bigint; conRespuesta: bigint }[]>`
    select
      count(distinct cliente_id)::bigint as contactados,
      count(distinct cliente_id) filter (where estado in ('abierto', 'pinchado'))::bigint as "conRespuesta"
    from seguros.recaptacion_envios
    where correduria_id = ${correduriaId}::uuid
      and created_at >= now() - interval '7 days'
  `
  const f = filas[0]
  return { contactadosSemana: Number(f?.contactados ?? 0), conAperturaORespuestaSemana: Number(f?.conRespuesta ?? 0) }
}

/** El texto sugerido para un lead concreto (WhatsApp), antes de que la IA lo pula. */
export function textoWhatsappPara(lead: Pick<LeadRecaptacion, 'cliente' | 'ramoLegible' | 'aseguradoraAnterior'>): string {
  return textoBaseRecaptacionWhatsapp({ nombre: lead.cliente, ramoLegible: lead.ramoLegible, aseguradoraAnterior: lead.aseguradoraAnterior })
}

/** Ídem para email. */
export function textoEmailPara(lead: Pick<LeadRecaptacion, 'cliente' | 'ramoLegible' | 'aseguradoraAnterior'>): { asunto: string; texto: string } {
  return textoBaseRecaptacionEmail({ nombre: lead.cliente, ramoLegible: lead.ramoLegible, aseguradoraAnterior: lead.aseguradoraAnterior })
}

/** Registra que Alberto abrió el enlace de WhatsApp de un lead. Deja fila en `historial_interno`. */
export async function registrarEnvioWhatsapp(
  correduriaId: string,
  entrada: { clienteId: string; polizaId: string; mensaje: string; actor: string },
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const db = prismaAsegura()
  const cliente = await db.cliente.findFirst({ where: { id: entrada.clienteId, correduriaId, mergedIntoClienteId: null }, select: { id: true } })
  if (!cliente) return { ok: false, motivo: 'Esa ficha no es de esta correduría.' }
  await db.$executeRaw`
    insert into seguros.recaptacion_envios (correduria_id, cliente_id, poliza_id, canal, estado, mensaje, creado_por)
    values (${correduriaId}::uuid, ${entrada.clienteId}::uuid, ${entrada.polizaId}::uuid, 'whatsapp', 'enlace_abierto', ${entrada.mensaje}, ${entrada.actor})
  `
  await anotar(correduriaId, entrada.clienteId, `Recaptación: se abrió el enlace de WhatsApp (mensaje ya escrito) por ${entrada.actor}`)
  return { ok: true }
}

async function anotar(correduriaId: string, clienteId: string, texto: string): Promise<void> {
  try {
    await prismaAsegura().$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast('gestion' as tipo_historial_interno), ${texto})`
  } catch (e) {
    console.error('[cartera-recaptacion] historial_interno no se pudo anotar:', e instanceof Error ? e.message : e)
  }
}
```

⚠️ Nota para quien ejecute este paso: el SQL crudo de este fichero **no prefija `seguros.`**
en las tablas que Prisma ya conoce por `?schema=seguros` en algunos sitios de esta app, pero
aquí SÍ se prefija `seguros.` en las tablas nuevas/cruzadas (`seguros.polizas`,
`seguros.clientes`, `seguros.recaptacion_envios`) porque el resto de `lib/cartera-*.ts` de
esta app hace lo mismo cuando cruza varias tablas del schema — revisa `cartera-impagados.ts`
antes de tocar esto si el guardián de aislamiento (`test/regression-asegura-aislamiento.test.ts`)
protesta, y ajusta el prefijo al patrón que ese test exige.

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `cd apps/asegura && node --test lib/cartera-recaptacion.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck**

Run: `cd apps/asegura && pnpm exec prisma generate && pnpm exec prisma generate --schema prisma/asegura.prisma && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: 0 errores.

- [ ] **Step 6: Commit**

```bash
git add apps/asegura/lib/cartera-recaptacion.ts apps/asegura/lib/cartera-recaptacion.test.ts
git commit -m "feat(asegura): cola de recaptación calculada + registro de WhatsApp"
```

---

### Task 4: `apps/asegura` — pulir el texto con IA (opcional, con fallback)

**Files:**
- Create: `apps/asegura/lib/recaptacion-ia.ts`
- Create: `apps/asegura/lib/recaptacion-ia.test.ts`

- [ ] **Step 1: Test que falla**

```ts
// apps/asegura/lib/recaptacion-ia.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pulirConIA } from './recaptacion-ia.ts'

test('si la IA falla, devuelve el texto base sin tocar', async () => {
  const base = 'Hola Pablo, texto base.'
  const resultado = await pulirConIA(base, async () => { throw new Error('sin red') })
  assert.equal(resultado, base)
})

test('si la IA responde, usa su texto', async () => {
  const base = 'Hola Pablo, texto base.'
  const resultado = await pulirConIA(base, async () => ({ text: 'Hola Pablo, versión pulida.', proveedor: 'openrouter', modelo: 'x' }))
  assert.equal(resultado, 'Hola Pablo, versión pulida.')
})

test('si la IA responde vacío, se queda con el texto base', async () => {
  const base = 'Hola Pablo, texto base.'
  const resultado = await pulirConIA(base, async () => ({ text: '   ', proveedor: 'openrouter', modelo: 'x' }))
  assert.equal(resultado, base)
})
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `cd apps/asegura && node --test lib/recaptacion-ia.test.ts`
Expected: FAIL — el fichero no existe.

- [ ] **Step 3: Implementación**

```ts
// apps/asegura/lib/recaptacion-ia.ts
//
// Remata el texto base de recaptación con un modelo barato. NUNCA bloquea el
// envío: si la IA falla o tarda, se manda el texto base determinista (ver
// `@central/module-seguros/recaptacion.ts`), que ya es un mensaje completo y
// correcto por sí solo.

type ResultadoIA = { text: string }

/**
 * `llamar` se inyecta para poder probar sin red (por defecto, `aiComplete` de
 * la pasarela). Separado así en vez de importar `aiComplete` arriba: el
 * `import` de `@central/core-ai` no rompe `node --test` (a diferencia de
 * Prisma), pero mantener la inyección deja el test sin red real.
 */
export async function pulirConIA(
  textoBase: string,
  llamar: (prompt: string) => Promise<ResultadoIA> = llamarPasarela,
): Promise<string> {
  try {
    const r = await llamar(
      `Reescribe este mensaje de WhatsApp de un corredor de seguros a un lead antiguo, en tono cercano y natural, ` +
      `sin inventar datos nuevos, MISMA longitud aproximada, conservando el enlace tal cual aparece:\n\n${textoBase}`,
    )
    const texto = r.text.trim()
    return texto === '' ? textoBase : texto
  } catch (e) {
    console.error('[recaptacion-ia] no se pudo pulir el texto, se manda el base:', e instanceof Error ? e.message : e)
    return textoBase
  }
}

async function llamarPasarela(prompt: string): Promise<ResultadoIA> {
  const { aiComplete } = await import('@central/core-ai')
  const r = await aiComplete(prompt, { maxTokens: 260, temperature: 0.6, timeoutMs: 12_000 })
  return { text: r.text }
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `cd apps/asegura && node --test lib/recaptacion-ia.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/asegura/lib/recaptacion-ia.ts apps/asegura/lib/recaptacion-ia.test.ts
git commit -m "feat(asegura): pulido opcional del mensaje de recaptación con IA barata"
```

---

### Task 5: `apps/asegura` — envío de email por Resend (HTTP API, con tracking) y webhook

**Files:**
- Create: `apps/asegura/lib/recaptacion-email.ts`
- Create: `apps/asegura/lib/recaptacion-email.test.ts`
- Create: `apps/asegura/lib/recaptacion-webhook.ts`
- Create: `apps/asegura/lib/recaptacion-webhook.test.ts`
- Modify: `apps/asegura/package.json` (añadir `svix`)

- [ ] **Step 1: Añadir la dependencia**

En `apps/asegura/package.json`, dentro de `"dependencies"`:

```json
"svix": "^1.42.0"
```

Run: `pnpm install --filter @central/asegura` (o `pnpm install` en la raíz si el filtro no
resuelve el nombre del paquete — comprueba `name` en `apps/asegura/package.json`).

- [ ] **Step 2: Test que falla — envío**

```ts
// apps/asegura/lib/recaptacion-email.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { construirPeticionResend } from './recaptacion-email.ts'

test('la petición a Resend pide tracking de apertura y de clic', () => {
  const p = construirPeticionResend({
    apiKey: 'x', from: 'hola@envios.grupoasegura.es', to: 'cliente@example.com',
    asunto: 'Asunto', texto: 'Cuerpo', html: '<p>Cuerpo</p>',
  })
  assert.equal(p.url, 'https://api.resend.com/emails')
  assert.equal(p.body.to, 'cliente@example.com')
  assert.deepEqual(p.body.tags, [{ name: 'categoria', value: 'recaptacion' }])
})
```

- [ ] **Step 3: Ejecutar y comprobar que falla**

Run: `cd apps/asegura && node --test lib/recaptacion-email.test.ts`
Expected: FAIL — el fichero no existe.

- [ ] **Step 4: Implementación del envío**

```ts
// apps/asegura/lib/recaptacion-email.ts
//
// Envío de email de recaptación por la API HTTP de Resend (NO por SMTP como
// el resto de correos de esta app — ver `@central/core-email` /
// `correo-aviso-acceso.ts`). El transporte SMTP no da tracking de
// apertura/clic; la API sí, activando `open`/`click` en la petición.
//
// Solo ESTE flujo usa la API directa: el resto de correos de la casa sigue
// por SMTP a propósito (no todos necesitan tracking, y mezclar dos
// transportes de correo con reglas distintas confundiría más de lo que
// resuelve). `RESEND_API_KEY` es la MISMA variable que ya usa el transporte
// SMTP (ver `apps/asegura/CLAUDE.md`, "el proveedor es RESEND").

export type PeticionResend = {
  url: 'https://api.resend.com/emails'
  headers: Record<string, string>
  body: {
    from: string
    to: string
    subject: string
    text: string
    html: string
    tags: { name: string; value: string }[]
  }
}

export function construirPeticionResend(d: {
  apiKey: string
  from: string
  to: string
  asunto: string
  texto: string
  html: string
}): PeticionResend {
  return {
    url: 'https://api.resend.com/emails',
    headers: { Authorization: `Bearer ${d.apiKey}`, 'content-type': 'application/json' },
    body: {
      from: d.from,
      to: d.to,
      subject: d.asunto,
      text: d.texto,
      html: d.html,
      // La categoría, no datos personales: sirve para filtrar en el dashboard
      // de Resend y para que el webhook (si algún día distingue por tag) sepa
      // de qué flujo viene.
      tags: [{ name: 'categoria', value: 'recaptacion' }],
    },
  }
}

export type ResultadoEnvioResend =
  | { ok: true; resendMessageId: string }
  | { ok: false; motivo: 'sin_api_key' | 'rechazado' }

/**
 * Envía de verdad. `fetchImpl` se inyecta para poder probar sin red (por
 * defecto, `fetch` global). El apellido "resend" en vez de reusar
 * `@central/core-email` es deliberado: ese paquete construye un transporter
 * SMTP, no hace peticiones HTTP a la API — mezclar los dos conceptos en un
 * mismo helper sería más confuso que tener dos caminos claros.
 */
export async function enviarEmailResend(
  d: { from: string; to: string; asunto: string; texto: string; html: string },
  fetchImpl: typeof fetch = fetch,
): Promise<ResultadoEnvioResend> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  if (!apiKey) return { ok: false, motivo: 'sin_api_key' }
  const peticion = construirPeticionResend({ apiKey, from: d.from, to: d.to, asunto: d.asunto, texto: d.texto, html: d.html })
  try {
    const res = await fetchImpl(peticion.url, {
      method: 'POST',
      headers: peticion.headers,
      body: JSON.stringify(peticion.body),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      console.error('[recaptacion-email] Resend rechazó el envío:', res.status, await res.text().catch(() => ''))
      return { ok: false, motivo: 'rechazado' }
    }
    const json = (await res.json().catch(() => null)) as { id?: string } | null
    if (!json?.id) return { ok: false, motivo: 'rechazado' }
    return { ok: true, resendMessageId: json.id }
  } catch (e) {
    console.error('[recaptacion-email] fallo de red mandando a Resend:', e instanceof Error ? e.message : e)
    return { ok: false, motivo: 'rechazado' }
  }
}
```

- [ ] **Step 5: Ejecutar y comprobar que pasa**

Run: `cd apps/asegura && node --test lib/recaptacion-email.test.ts`
Expected: PASS.

- [ ] **Step 6: Test que falla — verificación del webhook**

```ts
// apps/asegura/lib/recaptacion-webhook.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarEventoResend } from './recaptacion-webhook.ts'

test('un evento email.opened con message_id conocido se traduce a estado abierto', () => {
  const r = interpretarEventoResend({ type: 'email.opened', data: { email_id: 'abc123' } })
  assert.deepEqual(r, { resendMessageId: 'abc123', estado: 'abierto' })
})

test('un evento email.clicked se traduce a pinchado', () => {
  const r = interpretarEventoResend({ type: 'email.clicked', data: { email_id: 'abc123' } })
  assert.deepEqual(r, { resendMessageId: 'abc123', estado: 'pinchado' })
})

test('un tipo de evento que no interesa (delivered, bounced...) no produce ninguna actualización', () => {
  const r = interpretarEventoResend({ type: 'email.delivered', data: { email_id: 'abc123' } })
  assert.equal(r, null)
})

test('un payload sin email_id no produce ninguna actualización', () => {
  const r = interpretarEventoResend({ type: 'email.opened', data: {} })
  assert.equal(r, null)
})
```

- [ ] **Step 7: Ejecutar y comprobar que falla**

Run: `cd apps/asegura && node --test lib/recaptacion-webhook.test.ts`
Expected: FAIL — el fichero no existe.

- [ ] **Step 8: Implementación del webhook**

```ts
// apps/asegura/lib/recaptacion-webhook.ts
//
// Interpreta y verifica los eventos que manda Resend cuando alguien abre o
// pincha un email de recaptación. La firma es tipo svix (cabeceras
// `svix-id`/`svix-timestamp`/`svix-signature`), verificada con
// `RESEND_WEBHOOK_SECRET` (se obtiene al crear el endpoint en el dashboard de
// Resend — es un secreto NUEVO, distinto de `RESEND_API_KEY`).

import { Webhook } from 'svix'

export type EventoUtilResend = { resendMessageId: string; estado: 'abierto' | 'pinchado' }

/** Puro: no verifica firma, solo interpreta el payload ya autenticado. */
export function interpretarEventoResend(payload: unknown): EventoUtilResend | null {
  if (typeof payload !== 'object' || payload === null) return null
  const o = payload as Record<string, unknown>
  const tipo = o.type
  if (tipo !== 'email.opened' && tipo !== 'email.clicked') return null
  const data = o.data
  if (typeof data !== 'object' || data === null) return null
  const emailId = (data as Record<string, unknown>).email_id
  if (typeof emailId !== 'string' || emailId.trim() === '') return null
  return { resendMessageId: emailId, estado: tipo === 'email.opened' ? 'abierto' : 'pinchado' }
}

export type VerificacionWebhook = { ok: true; payload: unknown } | { ok: false; motivo: 'sin_secreto' | 'firma_invalida' }

/**
 * Verifica la firma con el secreto de Resend antes de fiarse de nada del
 * cuerpo. Sin `RESEND_WEBHOOK_SECRET` el webhook se rechaza siempre — nunca
 * se procesa un evento sin verificar, ni siquiera en desarrollo (mismo
 * criterio que `lib/cron-auth.ts` de esta app).
 */
export function verificarWebhookResend(
  cuerpoCrudo: string,
  cabeceras: { 'svix-id': string; 'svix-timestamp': string; 'svix-signature': string },
): VerificacionWebhook {
  const secreto = process.env.RESEND_WEBHOOK_SECRET?.trim()
  if (!secreto) return { ok: false, motivo: 'sin_secreto' }
  try {
    const wh = new Webhook(secreto)
    const payload = wh.verify(cuerpoCrudo, cabeceras)
    return { ok: true, payload }
  } catch {
    return { ok: false, motivo: 'firma_invalida' }
  }
}
```

- [ ] **Step 9: Ejecutar y comprobar que pasa**

Run: `cd apps/asegura && node --test lib/recaptacion-webhook.test.ts`
Expected: PASS (4 tests — `interpretarEventoResend` no toca red ni `svix`, así que corre sin problema bajo `node --test`).

- [ ] **Step 10: Typecheck**

Run: `cd apps/asegura && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: 0 errores.

- [ ] **Step 11: Commit**

```bash
git add apps/asegura/package.json apps/asegura/lib/recaptacion-email.ts apps/asegura/lib/recaptacion-email.test.ts apps/asegura/lib/recaptacion-webhook.ts apps/asegura/lib/recaptacion-webhook.test.ts pnpm-lock.yaml
git commit -m "feat(asegura): envío de email de recaptación por Resend + verificación del webhook"
```

---

### Task 6: `apps/asegura` — las rutas del puerto

**Files:**
- Create: `apps/asegura/app/api/operador/recaptacion/route.ts`
- Create: `apps/asegura/app/api/operador/recaptacion/whatsapp/route.ts`
- Create: `apps/asegura/app/api/operador/recaptacion/email/route.ts`
- Create: `apps/asegura/app/api/webhooks/resend/route.ts`

- [ ] **Step 1: `GET /api/operador/recaptacion` — la cola**

Mira primero `apps/asegura/app/api/operador/impagados/route.ts` (o el equivalente más
cercano) para copiar el patrón exacto de auth Bearer + `tenantAmbito`/`exigirCorreduriaId`
de esta app (`lib/tenant.ts`) — **no lo reinventes aquí**. La forma del handler:

```ts
// apps/asegura/app/api/operador/recaptacion/route.ts
import { NextResponse } from 'next/server'
import { requireOperadorAuth } from '@/lib/operador-auth' // el helper que ya usan las otras rutas /api/operador/*
import { exigirCorreduriaId } from '@/lib/tenant'
import { colaRecaptacion } from '@/lib/cartera-recaptacion'
import { registrarErrorCartera, describirErrorCartera } from '@/lib/error-cartera'

export async function GET(req: Request) {
  const auth = requireOperadorAuth(req)
  if (!auth.ok) return NextResponse.json({ estado: 'error', motivo: 'secreto_rechazado' }, { status: 401 })
  try {
    const correduriaId = await exigirCorreduriaId()
    const cola = await colaRecaptacion(correduriaId)
    return NextResponse.json({ estado: 'ok', ...cola })
  } catch (e) {
    const causa = registrarErrorCartera(e, '[operador/recaptacion]')
    return NextResponse.json({ estado: 'error', causa }, { status: 500 })
  }
}
```

(Los nombres exactos de `requireOperadorAuth`/`registrarErrorCartera`/`exigirCorreduriaId`
hay que confirmarlos leyendo una ruta hermana ya existente — p. ej.
`apps/asegura/app/api/operador/impagados/route.ts` — y ajustar los imports a los reales; el
`CLAUDE.md` de esta app documenta el contrato pero los nombres de función pueden diferir
ligeramente de lo escrito aquí.)

- [ ] **Step 2: `POST /api/operador/recaptacion/whatsapp` — registrar el clic**

```ts
// apps/asegura/app/api/operador/recaptacion/whatsapp/route.ts
import { NextResponse } from 'next/server'
import { requireOperadorAuth } from '@/lib/operador-auth'
import { exigirCorreduriaId } from '@/lib/tenant'
import { registrarEnvioWhatsapp } from '@/lib/cartera-recaptacion'

export async function POST(req: Request) {
  const auth = requireOperadorAuth(req)
  if (!auth.ok) return NextResponse.json({ estado: 'error', motivo: 'secreto_rechazado' }, { status: 401 })
  const body = await req.json().catch(() => null) as { clienteId?: string; polizaId?: string; mensaje?: string; actor?: string } | null
  if (!body?.clienteId || !body?.polizaId || !body?.mensaje) {
    return NextResponse.json({ estado: 'error', motivo: 'faltan_campos' }, { status: 422 })
  }
  const correduriaId = await exigirCorreduriaId()
  const r = await registrarEnvioWhatsapp(correduriaId, {
    clienteId: body.clienteId, polizaId: body.polizaId, mensaje: body.mensaje,
    actor: body.actor?.trim() || 'plataforma',
  })
  if (!r.ok) return NextResponse.json({ estado: 'error', motivo: r.motivo }, { status: 404 })
  return NextResponse.json({ estado: 'ok' })
}
```

- [ ] **Step 3: `POST /api/operador/recaptacion/email` — enviar de verdad**

```ts
// apps/asegura/app/api/operador/recaptacion/email/route.ts
import { NextResponse } from 'next/server'
import { requireOperadorAuth } from '@/lib/operador-auth'
import { exigirCorreduriaId } from '@/lib/tenant'
import { pulirConIA } from '@/lib/recaptacion-ia'
import { enviarEmailResend } from '@/lib/recaptacion-email'
import { prismaAsegura } from '@/lib/asegura-db'

export async function POST(req: Request) {
  const auth = requireOperadorAuth(req)
  if (!auth.ok) return NextResponse.json({ estado: 'error', motivo: 'secreto_rechazado' }, { status: 401 })
  const body = await req.json().catch(() => null) as {
    clienteId?: string; polizaId?: string; email?: string; asunto?: string; texto?: string; actor?: string
  } | null
  if (!body?.clienteId || !body?.polizaId || !body?.email || !body?.asunto || !body?.texto) {
    return NextResponse.json({ estado: 'error', motivo: 'faltan_campos' }, { status: 422 })
  }
  const correduriaId = await exigirCorreduriaId()
  const cliente = await prismaAsegura().cliente.findFirst({
    where: { id: body.clienteId, correduriaId, mergedIntoClienteId: null }, select: { id: true },
  })
  if (!cliente) return NextResponse.json({ estado: 'error', motivo: 'no_encontrado' }, { status: 404 })

  const textoFinal = await pulirConIA(body.texto)
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;white-space:pre-line">${escaparHtml(textoFinal)}</div>`
  const from = process.env.ASEGURA_MAIL_FROM?.trim() || 'hola@envios.grupoasegura.es'
  const resultado = await enviarEmailResend({ from, to: body.email, asunto: body.asunto, texto: textoFinal, html })
  if (!resultado.ok) {
    return NextResponse.json({ estado: 'error', motivo: resultado.motivo }, { status: resultado.motivo === 'sin_api_key' ? 503 : 502 })
  }

  await prismaAsegura().$executeRaw`
    insert into seguros.recaptacion_envios (correduria_id, cliente_id, poliza_id, canal, estado, mensaje, resend_message_id, creado_por)
    values (${correduriaId}::uuid, ${body.clienteId}::uuid, ${body.polizaId}::uuid, 'email', 'enviado', ${textoFinal}, ${resultado.resendMessageId}, ${body.actor?.trim() || 'plataforma'})
  `
  await prismaAsegura().$executeRaw`
    insert into historial_interno (correduria_id, cliente_id, tipo, texto)
    values (${correduriaId}::uuid, ${body.clienteId}::uuid, cast('gestion' as tipo_historial_interno),
      ${'Recaptación: email enviado por ' + (body.actor?.trim() || 'plataforma')})
  `
  return NextResponse.json({ estado: 'ok' })
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
```

- [ ] **Step 4: `POST /api/webhooks/resend` — recibir opens/clicks**

```ts
// apps/asegura/app/api/webhooks/resend/route.ts
import { NextResponse } from 'next/server'
import { verificarWebhookResend, interpretarEventoResend } from '@/lib/recaptacion-webhook'
import { prismaAsegura } from '@/lib/asegura-db'

export async function POST(req: Request) {
  const cuerpoCrudo = await req.text()
  const cabeceras = {
    'svix-id': req.headers.get('svix-id') ?? '',
    'svix-timestamp': req.headers.get('svix-timestamp') ?? '',
    'svix-signature': req.headers.get('svix-signature') ?? '',
  }
  const verificado = verificarWebhookResend(cuerpoCrudo, cabeceras)
  if (!verificado.ok) return NextResponse.json({ estado: 'error', motivo: verificado.motivo }, { status: 401 })

  const evento = interpretarEventoResend(verificado.payload)
  if (evento === null) return NextResponse.json({ estado: 'ignorado' })

  // Solo AVANZA el estado (abierto → pinchado nunca retrocede a abierto si ya
  // estaba en pinchado); un evento duplicado de Resend no debe deshacer nada.
  await prismaAsegura().$executeRaw`
    update seguros.recaptacion_envios
       set estado = ${evento.estado}::seguros.estado_envio_recaptacion, updated_at = now()
     where resend_message_id = ${evento.resendMessageId}
       and canal = 'email'
       and not (estado = 'pinchado' and ${evento.estado} = 'abierto')
  `
  return NextResponse.json({ estado: 'ok' })
}
```

- [ ] **Step 5: Typecheck y build**

Run: `cd apps/asegura && pnpm exec tsc --noEmit -p tsconfig.json && pnpm run build`
Expected: 0 errores, build OK. Ajusta los imports de auth/tenant/error a los nombres reales
que encuentres en las rutas hermanas — es el único punto de este plan donde el nombre exacto
depende de código que no se ha vuelto a leer en esta sesión.

- [ ] **Step 6: Commit**

```bash
git add apps/asegura/app/api/operador/recaptacion apps/asegura/app/api/webhooks/resend
git commit -m "feat(asegura): puerto de recaptación (cola, WhatsApp, email) + webhook de Resend"
```

---

### Task 7: `apps/plataforma` — proxy e interpretación

**Files:**
- Create: `apps/plataforma/lib/recaptacion-asegura.ts`
- Create: `apps/plataforma/lib/recaptacion-asegura.test.ts`
- Create: `apps/plataforma/app/api/correduria/recaptacion/route.ts`
- Create: `apps/plataforma/app/api/correduria/recaptacion/whatsapp/route.ts`
- Create: `apps/plataforma/app/api/correduria/recaptacion/email/route.ts`

- [ ] **Step 1: Test que falla — interpretación pura**

```ts
// apps/plataforma/lib/recaptacion-asegura.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { interpretarCola } from './recaptacion-asegura.ts'

test('una respuesta ok con leads se interpreta entera', () => {
  const r = interpretarCola(200, {
    estado: 'ok',
    leads: [{
      clienteId: 'c1', polizaId: 'p1', cliente: 'Pablo', ramo: 'auto', ramoLegible: 'auto',
      aseguradoraAnterior: null, numeroPoliza: 'X1', telefono: '600111222', email: null,
      enCooldown: false, ultimoContactoEn: null,
    }],
    contadores: { totalCandidatos: 1, contactadosSemana: 0, conAperturaORespuestaSemana: 0 },
  })
  assert.equal(r.estado, 'ok')
  if (r.estado === 'ok') assert.equal(r.leads.length, 1)
})

test('un 401 se interpreta como secreto rechazado, no como lista vacía', () => {
  const r = interpretarCola(401, {})
  assert.deepEqual(r, { estado: 'error', motivo: 'secreto_rechazado' })
})

test('una respuesta con forma rara es ilegible, no una cola vacía', () => {
  const r = interpretarCola(200, { estado: 'ok', leads: 'no-es-un-array' })
  assert.deepEqual(r, { estado: 'error', motivo: 'respuesta_ilegible' })
})
```

- [ ] **Step 2: Ejecutar y comprobar que falla**

Run: `cd apps/plataforma && node --test lib/recaptacion-asegura.test.ts`
Expected: FAIL — el fichero no existe.

- [ ] **Step 3: Implementación**

```ts
// apps/plataforma/lib/recaptacion-asegura.ts
//
// Interpretación pura + llamadas al puerto de recaptación de asegura. Mismo
// patrón que `lib/correduria-puerto.ts` (motivo de fallo tipado, nunca una
// lista vacía disfrazando un error).

export type MotivoPuerto = 'secreto_rechazado' | 'asegura_error' | 'respuesta_ilegible' | 'red'

export type LeadRecaptacion = {
  clienteId: string
  polizaId: string
  cliente: string
  ramo: string
  ramoLegible: string
  aseguradoraAnterior: string | null
  numeroPoliza: string | null
  telefono: string | null
  email: string | null
  enCooldown: boolean
  ultimoContactoEn: string | null
}

export type ContadoresRecaptacion = { totalCandidatos: number; contactadosSemana: number; conAperturaORespuestaSemana: number }

export type ColaRecaptacion =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: MotivoPuerto }
  | { estado: 'ok'; leads: LeadRecaptacion[]; contadores: ContadoresRecaptacion }

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}
function entero(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}

export function interpretarCola(status: number, json: unknown): ColaRecaptacion {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (status !== 200 || typeof json !== 'object' || json === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
  const r = json as Record<string, unknown>
  if (r.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (r.estado === 'error') return { estado: 'error', motivo: 'asegura_error' }
  if (r.estado !== 'ok' || !Array.isArray(r.leads)) return { estado: 'error', motivo: 'respuesta_ilegible' }

  const leads: LeadRecaptacion[] = []
  for (const l of r.leads) {
    if (typeof l !== 'object' || l === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
    const o = l as Record<string, unknown>
    if (typeof o.clienteId !== 'string' || typeof o.polizaId !== 'string' || typeof o.cliente !== 'string') {
      return { estado: 'error', motivo: 'respuesta_ilegible' }
    }
    leads.push({
      clienteId: o.clienteId, polizaId: o.polizaId, cliente: o.cliente,
      ramo: cadena(o.ramo) ?? 'sin_informar', ramoLegible: cadena(o.ramoLegible) ?? 'sin informar',
      aseguradoraAnterior: cadena(o.aseguradoraAnterior),
      numeroPoliza: cadena(o.numeroPoliza), telefono: cadena(o.telefono), email: cadena(o.email),
      enCooldown: o.enCooldown === true, ultimoContactoEn: cadena(o.ultimoContactoEn),
    })
  }
  const c = (typeof r.contadores === 'object' && r.contadores !== null ? r.contadores : {}) as Record<string, unknown>
  return {
    estado: 'ok', leads,
    contadores: {
      totalCandidatos: entero(c.totalCandidatos),
      contactadosSemana: entero(c.contactadosSemana),
      conAperturaORespuestaSemana: entero(c.conAperturaORespuestaSemana),
    },
  }
}

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

async function pedirCon(path: string, init?: RequestInit): Promise<{ status: number; json: unknown } | null> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return null
  const res = await fetch(`${urlAsegura()}${path}`, {
    ...init,
    headers: { ...(init?.headers ?? {}), Authorization: `Bearer ${secret}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
  })
  return { status: res.status, json: await res.json().catch(() => null) }
}

export async function colaRecaptacionAsegura(): Promise<ColaRecaptacion> {
  try {
    const r = await pedirCon('/api/operador/recaptacion')
    if (r === null) return { estado: 'sin_configurar' }
    return interpretarCola(r.status, r.json)
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}

export type ResultadoEnvio = { ok: true } | { ok: false; motivo: string }

export async function registrarWhatsappAsegura(d: { clienteId: string; polizaId: string; mensaje: string; actor: string }): Promise<ResultadoEnvio> {
  try {
    const r = await pedirCon('/api/operador/recaptacion/whatsapp', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(d),
    })
    if (r === null) return { ok: false, motivo: 'sin_configurar' }
    const j = r.json as Record<string, unknown> | null
    if (j?.estado === 'ok') return { ok: true }
    return { ok: false, motivo: typeof j?.motivo === 'string' ? j.motivo : `HTTP ${r.status}` }
  } catch {
    return { ok: false, motivo: 'red' }
  }
}

export async function enviarEmailAsegura(d: { clienteId: string; polizaId: string; email: string; asunto: string; texto: string; actor: string }): Promise<ResultadoEnvio> {
  try {
    const r = await pedirCon('/api/operador/recaptacion/email', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(d),
    })
    if (r === null) return { ok: false, motivo: 'sin_configurar' }
    const j = r.json as Record<string, unknown> | null
    if (j?.estado === 'ok') return { ok: true }
    return { ok: false, motivo: typeof j?.motivo === 'string' ? j.motivo : `HTTP ${r.status}` }
  } catch {
    return { ok: false, motivo: 'red' }
  }
}
```

- [ ] **Step 4: Ejecutar y comprobar que pasa**

Run: `cd apps/plataforma && node --test lib/recaptacion-asegura.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Las tres rutas proxy**

```ts
// apps/plataforma/app/api/correduria/recaptacion/route.ts
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth' // el helper de sesión que usan las demás rutas de /api/correduria/*
import { colaRecaptacionAsegura } from '@/lib/recaptacion-asegura'

export async function GET() {
  const session = await requireSession()
  if (!session) return NextResponse.json({ estado: 'error' }, { status: 401 })
  const cola = await colaRecaptacionAsegura()
  return NextResponse.json(cola)
}
```

```ts
// apps/plataforma/app/api/correduria/recaptacion/whatsapp/route.ts
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { registrarWhatsappAsegura } from '@/lib/recaptacion-asegura'

export async function POST(req: Request) {
  const session = await requireSession()
  if (!session) return NextResponse.json({ estado: 'error' }, { status: 401 })
  const body = await req.json().catch(() => null) as { clienteId?: string; polizaId?: string; mensaje?: string } | null
  if (!body?.clienteId || !body?.polizaId || !body?.mensaje) {
    return NextResponse.json({ estado: 'error', motivo: 'faltan_campos' }, { status: 422 })
  }
  // El actor lo pone el servidor, nunca el cliente: mismo criterio que
  // `/api/correduria/cliente/relaciones/aviso`.
  const r = await registrarWhatsappAsegura({ ...body, clienteId: body.clienteId, polizaId: body.polizaId, mensaje: body.mensaje, actor: session.email })
  return NextResponse.json(r.ok ? { estado: 'ok' } : { estado: 'error', motivo: r.motivo }, { status: r.ok ? 200 : 502 })
}
```

```ts
// apps/plataforma/app/api/correduria/recaptacion/email/route.ts
import { NextResponse } from 'next/server'
import { requireSession } from '@/lib/auth'
import { enviarEmailAsegura } from '@/lib/recaptacion-asegura'

export async function POST(req: Request) {
  const session = await requireSession()
  if (!session) return NextResponse.json({ estado: 'error' }, { status: 401 })
  const body = await req.json().catch(() => null) as {
    clienteId?: string; polizaId?: string; email?: string; asunto?: string; texto?: string
  } | null
  if (!body?.clienteId || !body?.polizaId || !body?.email || !body?.asunto || !body?.texto) {
    return NextResponse.json({ estado: 'error', motivo: 'faltan_campos' }, { status: 422 })
  }
  const r = await enviarEmailAsegura({ ...body, clienteId: body.clienteId, polizaId: body.polizaId, email: body.email, asunto: body.asunto, texto: body.texto, actor: session.email })
  return NextResponse.json(r.ok ? { estado: 'ok' } : { estado: 'error', motivo: r.motivo }, { status: r.ok ? 200 : 502 })
}
```

(`requireSession` es un nombre de plantilla — antes de escribir estos tres ficheros, mira
CÓMO obtiene la sesión una ruta ya existente de `apps/plataforma/app/api/correduria/*`, p. ej.
`apps/plataforma/app/api/correduria/cliente/route.ts`, y usa exactamente esa función y esa
forma de leer `session.email`.)

- [ ] **Step 6: Typecheck**

Run: `cd apps/plataforma && pnpm exec tsc --noEmit -p tsconfig.json`
Expected: 0 errores.

- [ ] **Step 7: Commit**

```bash
git add apps/plataforma/lib/recaptacion-asegura.ts apps/plataforma/lib/recaptacion-asegura.test.ts apps/plataforma/app/api/correduria/recaptacion
git commit -m "feat(plataforma): proxy de recaptación hacia el puerto de asegura"
```

---

### Task 8: `apps/plataforma` — la pantalla

**Files:**
- Create: `apps/plataforma/app/(usuario)/correduria/Recaptacion.tsx`
- Modify: el fichero que monta la sección **Clientes** de `/correduria` (localízalo con
  `Grep` por `ListaCartera` dentro de `apps/plataforma/app/(usuario)/correduria/` — es el
  client component padre que ya monta `ListaCartera` y reporta contadores a `Secciones.tsx`)

- [ ] **Step 1: El componente**

```tsx
// apps/plataforma/app/(usuario)/correduria/Recaptacion.tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { RefreshCw, Trash2 } from 'lucide-react'
import Bloque from './Bloque' // el envoltorio compartido: línea fina + título, sin caja propia
import { Badge, btnStyle } from '@/components/ui'
import type { Contador } from './secciones'

type Lead = {
  clienteId: string; polizaId: string; cliente: string; ramoLegible: string
  aseguradoraAnterior: string | null; numeroPoliza: string | null
  telefono: string | null; email: string | null; enCooldown: boolean; ultimoContactoEn: string | null
}

type Cola =
  | { estado: 'cargando' }
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo?: string }
  | { estado: 'ok'; leads: Lead[]; contadores: { totalCandidatos: number; contactadosSemana: number; conAperturaORespuestaSemana: number } }

/**
 * Cola de leads del volcado sin vencimiento, con contacto, que NO son ya
 * cliente vivo por CIMA. WhatsApp es un enlace manual (sin WABA: no hay
 * lectura, solo constancia de que se abrió); el email SÍ lo envía el
 * servidor y se trackea apertura/clic vía Resend. Ver
 * docs/superpowers/specs/2026-09-12-recaptacion-leads-design.md.
 */
export default function Recaptacion({ onContador }: { onContador?: (n: number | null) => void }) {
  const [cola, setCola] = useState<Cola>({ estado: 'cargando' })
  const [ocultosPorCooldown, setOcultosPorCooldown] = useState(true)
  const reportado = useRef<number | null>(null)

  useEffect(() => {
    let vivo = true
    fetch('/api/correduria/recaptacion')
      .then((r) => r.json())
      .then((j) => { if (vivo) setCola(j) })
      .catch(() => { if (vivo) setCola({ estado: 'error' }) })
    return () => { vivo = false }
  }, [])

  useEffect(() => {
    if (!onContador) return
    const n: Contador | null = cola.estado === 'ok'
      ? cola.leads.filter((l) => !l.enCooldown).length
      : cola.estado === 'cargando' ? undefined as unknown as null : null
    if (reportado.current !== (n as number | null)) {
      reportado.current = n as number | null
      onContador(n)
    }
  }, [cola, onContador])

  if (cola.estado === 'cargando') return null
  if (cola.estado === 'sin_configurar') {
    return <Bloque titulo="🎯 Recaptación">La cartera no está configurada todavía.</Bloque>
  }
  if (cola.estado === 'error') {
    return <Bloque titulo="🎯 Recaptación" destacado>No se ha podido leer la cola de recaptación. Vuelve a intentarlo.</Bloque>
  }

  const visibles = ocultosPorCooldown ? cola.leads.filter((l) => !l.enCooldown) : cola.leads

  return (
    <Bloque titulo="🎯 Recaptación">
      <p style={{ margin: '0 0 12px', color: 'var(--muted)', fontSize: 13 }}>
        {cola.contadores.totalCandidatos} leads sin fecha de vencimiento con contacto ·{' '}
        {cola.contadores.contactadosSemana} contactados esta semana ·{' '}
        {cola.contadores.conAperturaORespuestaSemana} con apertura o respuesta
      </p>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, marginBottom: 10 }}>
        <input type="checkbox" checked={ocultosPorCooldown} onChange={(e) => setOcultosPorCooldown(e.target.checked)} />
        Ocultar los contactados en los últimos 14 días
      </label>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '6px 8px' }}>Cliente</th>
              <th style={{ padding: '6px 8px' }}>Ramo</th>
              <th style={{ padding: '6px 8px' }}>Antes con</th>
              <th style={{ padding: '6px 8px' }}>Contacto</th>
              <th style={{ padding: '6px 8px' }}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((l) => <FilaLead key={l.polizaId} l={l} />)}
          </tbody>
        </table>
      </div>
      {visibles.length === 0 && <p style={{ color: 'var(--muted)', fontSize: 13 }}>Nada que mostrar con este filtro.</p>}
    </Bloque>
  )
}

function FilaLead({ l }: { l: Lead }) {
  return (
    <tr style={{ borderBottom: '1px solid var(--border)' }}>
      <td style={{ padding: '6px 8px' }}>
        <a href={`/correduria/cliente/${l.clienteId}`}>{l.cliente}</a>
        {l.enCooldown && <Badge tono="neutro">contactado {l.ultimoContactoEn}</Badge>}
      </td>
      <td style={{ padding: '6px 8px' }}>{l.ramoLegible}</td>
      <td style={{ padding: '6px 8px' }}>{l.aseguradoraAnterior ?? '—'}</td>
      <td style={{ padding: '6px 8px' }}>
        {l.telefono ? <span>📞 {l.telefono}</span> : null}
        {l.email ? <span style={{ marginLeft: 8 }}>✉️ {l.email}</span> : null}
        {!l.telefono && !l.email && '—'}
      </td>
      <td style={{ padding: '6px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {l.telefono && <BotonWhatsappRecaptacion lead={l} />}
        {l.email && <BotonEmailRecaptacion lead={l} />}
        <a href={`/correduria/cliente/${l.clienteId}`} title="Marcar como no interesado (descarta la ficha)" style={btnStyle('sutil', 'sm')}>
          <Trash2 size={14} /> Ficha
        </a>
      </td>
    </tr>
  )
}

/**
 * Abre WhatsApp con el mensaje personalizado y registra el clic (fetch en
 * paralelo, sin `preventDefault`: el enlace sigue abriendo en pestaña nueva
 * aunque el registro tarde o falle).
 */
function BotonWhatsappRecaptacion({ lead }: { lead: Lead }) {
  const [enviando, setEnviando] = useState(false)
  const mensaje = mensajeSugerido(lead)
  const url = `https://wa.me/${lead.telefono!.replace(/\D/g, '')}?text=${encodeURIComponent(mensaje)}`
  return (
    <a
      href={url} target="_blank" rel="noopener noreferrer"
      style={btnStyle('primario', 'sm')}
      onClick={() => {
        setEnviando(true)
        fetch('/api/correduria/recaptacion/whatsapp', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ clienteId: lead.clienteId, polizaId: lead.polizaId, mensaje }),
        }).catch(() => {}).finally(() => setEnviando(false))
      }}
    >
      {enviando ? <RefreshCw size={14} className="spin" /> : null} WhatsApp
    </a>
  )
}

function BotonEmailRecaptacion({ lead }: { lead: Lead }) {
  const [estado, setEstado] = useState<'idle' | 'enviando' | 'ok' | 'error'>('idle')
  return (
    <button
      type="button"
      style={btnStyle('sutil', 'sm')}
      disabled={estado === 'enviando' || estado === 'ok'}
      onClick={async () => {
        setEstado('enviando')
        const asunto = `¿Sigues con tu seguro de ${lead.ramoLegible}?`
        const texto = mensajeSugerido(lead)
        try {
          const res = await fetch('/api/correduria/recaptacion/email', {
            method: 'POST', headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ clienteId: lead.clienteId, polizaId: lead.polizaId, email: lead.email, asunto, texto }),
          })
          setEstado(res.ok ? 'ok' : 'error')
        } catch {
          setEstado('error')
        }
      }}
    >
      {estado === 'ok' ? 'Enviado ✓' : estado === 'error' ? 'Error, reintenta' : 'Email'}
    </button>
  )
}

function mensajeSugerido(l: Lead): string {
  const conQuien = l.aseguradoraAnterior ? ` que tuviste con ${l.aseguradoraAnterior}` : ''
  return `Hola ${l.cliente.split(' ')[0]}, ¿sigues con tu seguro de ${l.ramoLegible}${conQuien}? Si quieres te paso un precio actualizado.`
}
```

⚠️ Notas para quien implemente este paso:
- `Bloque`, `Badge`, `btnStyle`, y el tipo `Contador` de `./secciones` son imports de
  plantilla: **confírmalos leyendo `ListaCartera.tsx` o `Duplicadas.tsx`** en la misma
  carpeta, que ya usan exactamente estas piezas, y copia sus rutas de import literales.
- El texto que abre WhatsApp AQUÍ es el sugerido en el cliente (`mensajeSugerido`), NO el
  pulido por IA — el pulido por IA solo se aplica en el envío de EMAIL (donde el servidor
  puede tardar 1-2 s sin que el usuario note nada raro); hacer lo mismo para WhatsApp
  significaría esperar una llamada a IA antes de poder pulsar el enlace, lo que rompería la
  sensación de "un clic, se abre WhatsApp" de la que habla el spec. Si Alberto pide más
  adelante que el texto de WhatsApp también pase por IA, se resuelve trayendo el texto ya
  pulido desde `GET /api/operador/recaptacion` (calculando el pulido en el servidor al
  construir la cola) en vez de aquí.

- [ ] **Step 2: Montarlo en la sección Clientes y reportar el contador**

Localiza el client component que ya monta `<ListaCartera onContador={...} />` (Grep por
`ListaCartera` dentro de `apps/plataforma/app/(usuario)/correduria/`) y añade, en la
sección `clientes`, junto a los demás bloques:

```tsx
<Recaptacion onContador={(n) => setContadorSeccion('clientes', 'recaptacion', n)} />
```

(La función exacta para combinar varios contadores dentro de la MISMA sección — aquí
`ListaCartera` y `Recaptacion` comparten la pestaña "Clientes" — ya existe en
`agregarContadores` de `secciones.ts`; sigue el mismo patrón que usan los demás bloques de
esa sección para no reinventar la agregación.)

- [ ] **Step 3: Comprobación visual**

Arranca la app en local (`pnpm dev` en `apps/plataforma`), entra en `/correduria` → sección
Clientes, y comprueba: el bloque aparece, la tabla no desborda en 375px de ancho (el
`overflowX:'auto'` del contenedor de la tabla es justo para eso — regla global de
responsive), y el botón de WhatsApp abre una pestaña nueva con el texto precargado.

- [ ] **Step 4: Typecheck y build**

Run: `cd apps/plataforma && pnpm exec tsc --noEmit -p tsconfig.json && pnpm run build`
Expected: 0 errores, build OK.

- [ ] **Step 5: Commit**

```bash
git add apps/plataforma/app/\(usuario\)/correduria/Recaptacion.tsx apps/plataforma/app/\(usuario\)/correduria/*.tsx
git commit -m "feat(plataforma): pantalla de recaptación de leads en /correduria (sección Clientes)"
```

---

### Task 9: Envs, documentación y verificación final

**Files:**
- Modify: `apps/asegura/CLAUDE.md` (una entrada corta, siguiendo el estilo del resto del
  fichero — NO reescribas secciones existentes, añade una nueva con fecha)
- Modify: `docs/CONTEXTO-SESIONES.md` (entrada de cierre, máx. 8 líneas)

- [ ] **Step 1: Envs nuevas a configurar en Vercel (avisar a Alberto, no se piden aquí)**

- `RESEND_WEBHOOK_SECRET` — se obtiene al crear el endpoint `https://central-asegura.vercel.app/api/webhooks/resend`
  en el dashboard de Resend (Webhooks → Add Endpoint → eventos `email.opened` y `email.clicked`).
  Sin ella, el webhook devuelve 401 a todo (fail-closed, nunca se procesa un evento sin
  verificar la firma).
- `RESEND_API_KEY` y `ASEGURA_MAIL_FROM` YA EXISTEN (el resto de correos de esta app ya
  los usa) — no hace falta pedir nada nuevo salvo el webhook secret.

- [ ] **Step 2: Anotar en `apps/asegura/CLAUDE.md`**

Añade, siguiendo el formato del resto del fichero (fecha en negrita, sin reescribir nada
existente):

```markdown
## 🎯 Recaptación de leads sin vencimiento (12/09/2026)

`/api/operador/recaptacion` sirve la cola de leads del volcado sin fecha de vencimiento,
con teléfono o email, EXCLUYENDO a quien ya es cliente vivo por CIMA en otro ramo (esos se
trabajan desde su ficha). WhatsApp es un enlace manual (`wa.me`, sin WABA — solo se registra
que Alberto lo abrió, no que el cliente lo leyó); el email SÍ lo manda el servidor por la
**API HTTP de Resend** (no SMTP, para poder trackear apertura/clic vía webhook
`/api/webhooks/resend`, verificado con `RESEND_WEBHOOK_SECRET`). Cooldown de 14 días tras
cualquier envío (`seguros.recaptacion_envios`). El "no interesado" reutiliza el descarte de
ficha YA EXISTENTE (`descartarCliente`, `DELETE /api/operador/cliente`) — no se construyó
un estado de descarte nuevo. Spec: `docs/superpowers/specs/2026-09-12-recaptacion-leads-design.md`.
```

- [ ] **Step 3: Cerrar con una entrada en `docs/CONTEXTO-SESIONES.md`**

Sigue el formato ya usado en el resto del fichero (entrada nueva arriba, fecha `(dd/mm/aaaa)`
en la primera línea, máximo ~8 líneas).

- [ ] **Step 4: Suite completa**

Run:
```bash
cd apps/asegura && pnpm exec prisma generate && pnpm exec prisma generate --schema prisma/asegura.prisma && node --test lib/*.test.ts && pnpm exec tsc --noEmit -p tsconfig.json
cd ../plataforma && node --test lib/*.test.ts && pnpm exec tsc --noEmit -p tsconfig.json
cd ../.. && pnpm test
```
Expected: todo en verde.

- [ ] **Step 5: Commit final**

```bash
git add apps/asegura/CLAUDE.md docs/CONTEXTO-SESIONES.md
git commit -m "docs: documentar la recaptación de leads sin vencimiento"
```

---

## Verificación manual con Alberto (antes de dar el feature por cerrado)

1. Configurar `RESEND_WEBHOOK_SECRET` en Vercel (`central-asegura`) y crear el endpoint en
   el dashboard de Resend.
2. Probar UN envío de WhatsApp real (clic → se abre WhatsApp con el texto) y UN email real
   sobre un lead de prueba (usar un teléfono/email propio, no un cliente real, para la
   primera prueba).
3. Confirmar en el dashboard de Resend que el webhook llega y que `recaptacion_envios`
   pasa de `enviado` a `abierto` al abrir el correo de prueba.
4. Confirmar con Alberto el número de días del cooldown (el spec fija 14 por defecto).
