# Portal de Grupo Asegura — Fase 1: entrar y aportar una póliza

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que una persona cualquiera —cliente o no— entre al portal con un código de un solo uso y suba una póliza suya, aunque no sea de la correduría, quedando registrada con su procedencia.

**Architecture:** App Next.js nueva `apps/asegura-portal`, separada del panel del corredor y con rol de BD propio SIN BYPASSRLS. La lógica que decide qué se ve y de dónde viene un dato vive en `@central/module-seguros-portal`, pura y sin BD. El envío del código de acceso pasa por un **puerto de canal**: en Fase 1 se enchufan email y consola; el adaptador de WhatsApp entra sin tocar el resto cuando exista la WABA.

**Tech Stack:** Next.js 15 (App Router), Prisma 5 (`multiSchema`), Postgres/Supabase (schema `seguros`), `jose` (cookie propia), `@central/core-ai` (`aiComplete`, `openrouterVision`), `@central/core-email`, `pdf-parse`, tests con `node --test`.

---

## Alcance: qué entra y qué NO

**Entra:** identidad por código de un solo uso, bóveda propia (bienes + pólizas que aporta el usuario), subida de póliza con lectura por IA, y las tres procedencias del dato pintadas distinto.

**NO entra, y cada cosa tiene su fase:**
- Motor de obligaciones y recordatorios (Fase 3).
- Vinculación con la cartera de CIMA y el tratamiento del móvil-como-hogar (Fase 4).
- Autorizaciones a terceros y portal de empresas (Fase 5).
- Emisión por Codeoscopic y agente conversacional (fuera del spec del portal).

**⛔ Dependencia externa conocida, y por qué no bloquea:** la WABA de Grupo Asegura **no existe todavía**, así que el OTP por WhatsApp no se puede probar de punta a punta. Por eso el canal es un puerto con dos adaptadores en Fase 1 (email y consola). Cuando haya número, la Fase 1 no se toca: se añade un fichero. Si se hubiera cableado WhatsApp directamente, todo este plan estaría parado.

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `packages/module-seguros-portal/src/acceso.ts` | Qué campos ve cada papel. Pura, sin BD |
| `packages/module-seguros-portal/src/procedencia.ts` | Los tres estados de un dato (`compania`/`calculado`/`declarado`) y qué se puede afirmar con cada uno |
| `packages/module-seguros-portal/src/codigo.ts` | Generación y verificación del código de un solo uso (formato, caducidad, intentos) |
| `packages/module-seguros-portal/src/index.ts` | Superficie pública del módulo |
| `apps/asegura-portal/prisma/schema.prisma` | Modelos `portal_*` de Fase 1 |
| `apps/asegura-portal/prisma/sql/2026-09-01_portal_fase1.sql` | DDL de las 6 tablas + rol |
| `apps/asegura-portal/lib/auth.ts` | Cookie `asegura_portal_session` + firma con `jose` |
| `apps/asegura-portal/lib/session.ts` | Lectura de sesión |
| `apps/asegura-portal/lib/canal.ts` | **Puerto de canal**: interfaz + registro de adaptadores |
| `apps/asegura-portal/lib/canal-email.ts` | Adaptador email |
| `apps/asegura-portal/lib/canal-consola.ts` | Adaptador de desarrollo |
| `apps/asegura-portal/lib/dinero.ts` | `eur()` — formato español `2.162,49€`; `null` devuelve `—`, nunca `0,00€` |
| `apps/asegura-portal/lib/extraer-poliza.ts` | PDF→texto o imagen→visión, y de ahí a campos |
| `apps/asegura-portal/app/api/acceso/solicitar/route.ts` | Pide el código |
| `apps/asegura-portal/app/api/acceso/verificar/route.ts` | Canjea el código por sesión |
| `apps/asegura-portal/app/api/polizas/route.ts` | Alta de póliza declarada |
| `apps/asegura-portal/app/(portal)/boveda/page.tsx` | La bóveda |
| `apps/asegura-portal/app/(portal)/boveda/SubirPoliza.tsx` | La pestaña de subir |
| `test/regression-portal-aislamiento.test.ts` | Guardián: nadie toca `seguros.*` sin pasar por el resolutor |

---

## Task 1: Niveles de acceso (lógica pura)

**Files:**
- Create: `packages/module-seguros-portal/package.json`
- Create: `packages/module-seguros-portal/src/acceso.ts`
- Create: `packages/module-seguros-portal/src/index.ts`
- Test: `packages/module-seguros-portal/src/acceso.test.ts`

- [ ] **Step 1: Crear el `package.json` del módulo**

```json
{
  "name": "@central/module-seguros-portal",
  "version": "0.0.0",
  "private": true,
  "description": "Reglas puras del portal de clientes/leads de Grupo Asegura: qué campos ve cada papel en una póliza (dato de la COSA vs dato de la PERSONA), la procedencia de cada dato (compañía/calculado/declarado) y el código de un solo uso. Sin BD, sin red.",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "node --test src/*.test.ts" },
  "sideEffects": false,
  "license": "UNLICENSED"
}
```

- [ ] **Step 2: Escribir el test que falla**

Crear `packages/module-seguros-portal/src/acceso.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { camposVisibles, NIVELES, type Nivel } from './acceso.ts'

test('el tomador ve prima e IBAN', () => {
  const v = camposVisibles('completo')
  assert.equal(v.prima, true)
  assert.equal(v.iban, true)
})

test('el conductor ve el teléfono de siniestros pero NUNCA la prima ni el IBAN', () => {
  const v = camposVisibles('tarjeta')
  assert.equal(v.telefonoSiniestros, true)
  assert.equal(v.compania, true)
  assert.equal(v.numeroPoliza, true)
  assert.equal(v.prima, false)
  assert.equal(v.iban, false)
  assert.equal(v.dniTomador, false)
})

test('«tarjeta» puede abrir un parte: es el caso del empleado en la cuneta', () => {
  assert.equal(camposVisibles('tarjeta').abrirParte, true)
})

test('solo «administrar» puede autorizar a terceros', () => {
  assert.equal(camposVisibles('administrar').autorizarTerceros, true)
  assert.equal(camposVisibles('gestionar').autorizarTerceros, false)
  assert.equal(camposVisibles('completo').autorizarTerceros, false)
  assert.equal(camposVisibles('tarjeta').autorizarTerceros, false)
})

test('los niveles son crecientes: lo que ve uno lo ve el siguiente', () => {
  const orden: Nivel[] = ['tarjeta', 'completo', 'gestionar', 'administrar']
  for (let i = 1; i < orden.length; i++) {
    const menor = camposVisibles(orden[i - 1])
    const mayor = camposVisibles(orden[i])
    for (const k of Object.keys(menor) as (keyof typeof menor)[]) {
      if (menor[k]) assert.equal(mayor[k], true, `${orden[i]} deberia ver ${k} porque ${orden[i - 1]} lo ve`)
    }
  }
})

test('NIVELES enumera exactamente los cuatro, en orden creciente', () => {
  assert.deepEqual([...NIVELES], ['tarjeta', 'completo', 'gestionar', 'administrar'])
})
```

- [ ] **Step 3: Ejecutar el test y verificar que falla**

```bash
cd /home/user/central && npx --yes pnpm@10.33.0 install --no-frozen-lockfile
cd packages/module-seguros-portal && node --test src/acceso.test.ts
```

Esperado: FALLA con `Cannot find module './acceso.ts'`.

- [ ] **Step 4: Implementar el mínimo**

Crear `packages/module-seguros-portal/src/acceso.ts`:

```ts
/**
 * Qué ve cada papel en una póliza.
 *
 * La línea que sostiene la seguridad del portal: **dato de la COSA ≠ dato de la
 * PERSONA**. El conductor de la furgoneta necesita compañía, nº de póliza y el
 * teléfono de siniestros para resolver un golpe; no necesita —y no debe ver— la
 * prima que paga el dueño, su IBAN ni su DNI.
 *
 * Los cuatro niveles son CRECIENTES: lo que ve uno lo ve el siguiente. Un test
 * lo comprueba, para que nadie añada un campo a `tarjeta` y se lo olvide arriba.
 */
export const NIVELES = ['tarjeta', 'completo', 'gestionar', 'administrar'] as const
export type Nivel = (typeof NIVELES)[number]

export type CamposVisibles = {
  compania: boolean
  numeroPoliza: boolean
  coberturas: boolean
  telefonoSiniestros: boolean
  abrirParte: boolean
  prima: boolean
  recibos: boolean
  iban: boolean
  dniTomador: boolean
  documentos: boolean
  crearPeticiones: boolean
  autorizarTerceros: boolean
}

const TARJETA: CamposVisibles = {
  compania: true,
  numeroPoliza: true,
  coberturas: true,
  telefonoSiniestros: true,
  abrirParte: true,
  prima: false,
  recibos: false,
  iban: false,
  dniTomador: false,
  documentos: false,
  crearPeticiones: false,
  autorizarTerceros: false,
}

const COMPLETO: CamposVisibles = {
  ...TARJETA,
  prima: true,
  recibos: true,
  iban: true,
  dniTomador: true,
  documentos: true,
}

const GESTIONAR: CamposVisibles = { ...COMPLETO, crearPeticiones: true }

const ADMINISTRAR: CamposVisibles = { ...GESTIONAR, autorizarTerceros: true }

const POR_NIVEL: Record<Nivel, CamposVisibles> = {
  tarjeta: TARJETA,
  completo: COMPLETO,
  gestionar: GESTIONAR,
  administrar: ADMINISTRAR,
}

export function camposVisibles(nivel: Nivel): CamposVisibles {
  return POR_NIVEL[nivel]
}
```

Crear `packages/module-seguros-portal/src/index.ts`:

```ts
export { NIVELES, camposVisibles } from './acceso.ts'
export type { Nivel, CamposVisibles } from './acceso.ts'
```

- [ ] **Step 5: Ejecutar el test y verificar que pasa**

```bash
cd /home/user/central/packages/module-seguros-portal && node --test src/acceso.test.ts
```

Esperado: `# pass 6`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
cd /home/user/central
git add packages/module-seguros-portal
git commit -m "feat(seguros-portal): niveles de acceso, dato de la cosa vs dato de la persona"
```

---

## Task 2: Procedencia del dato (los tres estados)

**Files:**
- Create: `packages/module-seguros-portal/src/procedencia.ts`
- Modify: `packages/module-seguros-portal/src/index.ts`
- Test: `packages/module-seguros-portal/src/procedencia.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `packages/module-seguros-portal/src/procedencia.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { fiabilidad, etiquetaProcedencia, sePuedeAfirmar, PROCEDENCIAS } from './procedencia.ts'

test('las tres procedencias son exactamente esas, y no hay una cuarta de cajón', () => {
  assert.deepEqual([...PROCEDENCIAS], ['compania', 'calculado', 'declarado'])
})

test('solo el dato de la compañía se puede afirmar sin confirmar', () => {
  assert.equal(sePuedeAfirmar({ procedencia: 'compania', confirmadoPorUsuario: false }), true)
})

test('un dato CALCULADO no se afirma hasta que el usuario lo confirma', () => {
  assert.equal(sePuedeAfirmar({ procedencia: 'calculado', confirmadoPorUsuario: false }), false)
  assert.equal(sePuedeAfirmar({ procedencia: 'calculado', confirmadoPorUsuario: true }), true)
})

test('un dato DECLARADO nunca se presenta como verificado, ni confirmado', () => {
  assert.equal(sePuedeAfirmar({ procedencia: 'declarado', confirmadoPorUsuario: true }), false)
})

test('la fiabilidad ordena: compania > calculado > declarado', () => {
  assert.ok(fiabilidad('compania') > fiabilidad('calculado'))
  assert.ok(fiabilidad('calculado') > fiabilidad('declarado'))
})

test('cada procedencia tiene una etiqueta que el usuario entiende', () => {
  assert.equal(etiquetaProcedencia('compania'), 'Confirmado por la compañía')
  assert.equal(etiquetaProcedencia('calculado'), 'Calculado — confírmalo')
  assert.equal(etiquetaProcedencia('declarado'), 'Lo has indicado tú')
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

```bash
cd /home/user/central/packages/module-seguros-portal && node --test src/procedencia.test.ts
```

Esperado: FALLA con `Cannot find module './procedencia.ts'`.

- [ ] **Step 3: Implementar el mínimo**

Crear `packages/module-seguros-portal/src/procedencia.ts`:

```ts
/**
 * De dónde sale un dato del portal. Son TRES, nunca dos, y se pintan distinto.
 *
 * - `compania`  — vino por CIMA/EIAC. El único fiable sin que nadie lo confirme.
 * - `calculado` — lo dedujo el sistema de una norma (ITV según matriculación,
 *                 caducidad del DNI...). PROPONE; hasta que el usuario lo
 *                 confirma no se afirma nada.
 * - `declarado` — lo escribió el usuario. Se guarda y se avisa, pero el sistema
 *                 NO pretende que sea verdad: no lo verificó nadie.
 *
 * Por eso `declarado` no se puede afirmar ni aunque el usuario lo «confirme»:
 * confirmar lo que tú mismo escribiste no añade ninguna verificación.
 */
export const PROCEDENCIAS = ['compania', 'calculado', 'declarado'] as const
export type Procedencia = (typeof PROCEDENCIAS)[number]

const FIABILIDAD: Record<Procedencia, number> = {
  compania: 3,
  calculado: 2,
  declarado: 1,
}

export function fiabilidad(p: Procedencia): number {
  return FIABILIDAD[p]
}

const ETIQUETA: Record<Procedencia, string> = {
  compania: 'Confirmado por la compañía',
  calculado: 'Calculado — confírmalo',
  declarado: 'Lo has indicado tú',
}

export function etiquetaProcedencia(p: Procedencia): string {
  return ETIQUETA[p]
}

export function sePuedeAfirmar(dato: {
  procedencia: Procedencia
  confirmadoPorUsuario: boolean
}): boolean {
  if (dato.procedencia === 'compania') return true
  if (dato.procedencia === 'calculado') return dato.confirmadoPorUsuario
  return false
}
```

- [ ] **Step 4: Añadir al índice del módulo**

Reemplazar el contenido de `packages/module-seguros-portal/src/index.ts`:

```ts
export { NIVELES, camposVisibles } from './acceso.ts'
export type { Nivel, CamposVisibles } from './acceso.ts'
export { PROCEDENCIAS, fiabilidad, etiquetaProcedencia, sePuedeAfirmar } from './procedencia.ts'
export type { Procedencia } from './procedencia.ts'
```

- [ ] **Step 5: Ejecutar los tests y verificar que pasan**

```bash
cd /home/user/central/packages/module-seguros-portal && node --test src/*.test.ts
```

Esperado: `# pass 12`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
cd /home/user/central
git add packages/module-seguros-portal
git commit -m "feat(seguros-portal): procedencia del dato en tres estados, nunca dos"
```

---

## Task 3: Código de un solo uso

**Files:**
- Create: `packages/module-seguros-portal/src/codigo.ts`
- Modify: `packages/module-seguros-portal/src/index.ts`
- Test: `packages/module-seguros-portal/src/codigo.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `packages/module-seguros-portal/src/codigo.test.ts`:

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { generarCodigo, estadoCodigo, MAX_INTENTOS, VALIDEZ_MINUTOS } from './codigo.ts'

const T0 = new Date('2026-09-01T10:00:00Z')

test('el código son 6 dígitos', () => {
  for (let i = 0; i < 50; i++) assert.match(generarCodigo(), /^\d{6}$/)
})

test('dos códigos seguidos no son iguales (no es un contador)', () => {
  const muestras = new Set(Array.from({ length: 30 }, () => generarCodigo()))
  assert.ok(muestras.size > 1)
})

test('el código correcto y dentro de plazo es válido', () => {
  const r = estadoCodigo(
    { codigo: '123456', creadoEn: T0, intentos: 0, usadoEn: null },
    '123456',
    new Date('2026-09-01T10:05:00Z'),
  )
  assert.equal(r, 'valido')
})

test('caducado a los VALIDEZ_MINUTOS, aunque el código sea el bueno', () => {
  const despues = new Date(T0.getTime() + (VALIDEZ_MINUTOS + 1) * 60_000)
  assert.equal(estadoCodigo({ codigo: '123456', creadoEn: T0, intentos: 0, usadoEn: null }, '123456', despues), 'caducado')
})

test('un código ya usado no vale una segunda vez', () => {
  const r = estadoCodigo(
    { codigo: '123456', creadoEn: T0, intentos: 0, usadoEn: new Date('2026-09-01T10:01:00Z') },
    '123456',
    new Date('2026-09-01T10:02:00Z'),
  )
  assert.equal(r, 'ya_usado')
})

test('al superar MAX_INTENTOS se bloquea aunque acierte: si no, es fuerza bruta sobre 6 dígitos', () => {
  const r = estadoCodigo(
    { codigo: '123456', creadoEn: T0, intentos: MAX_INTENTOS, usadoEn: null },
    '123456',
    new Date('2026-09-01T10:01:00Z'),
  )
  assert.equal(r, 'bloqueado')
})

test('código incorrecto dentro de plazo devuelve incorrecto', () => {
  const r = estadoCodigo({ codigo: '123456', creadoEn: T0, intentos: 1, usadoEn: null }, '999999', new Date('2026-09-01T10:01:00Z'))
  assert.equal(r, 'incorrecto')
})

test('se comprueba PRIMERO el bloqueo y luego el acierto', () => {
  const r = estadoCodigo(
    { codigo: '123456', creadoEn: T0, intentos: MAX_INTENTOS, usadoEn: null },
    '000000',
    new Date('2026-09-01T10:01:00Z'),
  )
  assert.equal(r, 'bloqueado')
})
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

```bash
cd /home/user/central/packages/module-seguros-portal && node --test src/codigo.test.ts
```

Esperado: FALLA con `Cannot find module './codigo.ts'`.

- [ ] **Step 3: Implementar el mínimo**

Crear `packages/module-seguros-portal/src/codigo.ts`:

```ts
import { randomInt } from 'node:crypto'

/** Minutos que vive un código antes de caducar. */
export const VALIDEZ_MINUTOS = 10

/** Intentos fallidos antes de bloquear. Con 6 dígitos, sin tope hay fuerza bruta. */
export const MAX_INTENTOS = 5

export type EstadoCodigo = 'valido' | 'incorrecto' | 'caducado' | 'ya_usado' | 'bloqueado'

export type CodigoGuardado = {
  codigo: string
  creadoEn: Date
  intentos: number
  usadoEn: Date | null
}

/** 6 dígitos con aleatoriedad criptográfica: `Math.random` aquí sería un fallo de seguridad. */
export function generarCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/**
 * El orden de las comprobaciones importa y es deliberado: primero «ya usado» y
 * «bloqueado», DESPUÉS la caducidad, y el acierto al final. Comprobar el acierto
 * antes del bloqueo convertiría el contador de intentos en decorativo.
 */
export function estadoCodigo(
  guardado: CodigoGuardado,
  entrada: string,
  ahora: Date,
): EstadoCodigo {
  if (guardado.usadoEn !== null) return 'ya_usado'
  if (guardado.intentos >= MAX_INTENTOS) return 'bloqueado'
  const caducaEn = guardado.creadoEn.getTime() + VALIDEZ_MINUTOS * 60_000
  if (ahora.getTime() > caducaEn) return 'caducado'
  return entrada === guardado.codigo ? 'valido' : 'incorrecto'
}
```

- [ ] **Step 4: Añadir al índice del módulo**

Reemplazar el contenido de `packages/module-seguros-portal/src/index.ts`:

```ts
export { NIVELES, camposVisibles } from './acceso.ts'
export type { Nivel, CamposVisibles } from './acceso.ts'
export { PROCEDENCIAS, fiabilidad, etiquetaProcedencia, sePuedeAfirmar } from './procedencia.ts'
export type { Procedencia } from './procedencia.ts'
export { VALIDEZ_MINUTOS, MAX_INTENTOS, generarCodigo, estadoCodigo } from './codigo.ts'
export type { EstadoCodigo, CodigoGuardado } from './codigo.ts'
```

- [ ] **Step 5: Ejecutar todos los tests del módulo**

```bash
cd /home/user/central/packages/module-seguros-portal && node --test src/*.test.ts
```

Esperado: `# pass 20`, `# fail 0`.

- [ ] **Step 6: Commit**

```bash
cd /home/user/central
git add packages/module-seguros-portal
git commit -m "feat(seguros-portal): codigo de un solo uso con caducidad y tope de intentos"
```

---

## Task 4: Tablas de la Fase 1 en el schema `seguros`

**Files:**
- Create: `apps/asegura-portal/prisma/sql/2026-09-01_portal_fase1.sql`

Solo las seis tablas que la Fase 1 usa. Las otras cinco del spec (`portal_autorizacion`, `portal_obligacion`, `portal_aviso`, `portal_vinculo`, `portal_revision`) llegan en sus fases: crear tablas que nadie escribe es deuda, no preparación.

- [ ] **Step 1: Escribir el SQL**

Crear `apps/asegura-portal/prisma/sql/2026-09-01_portal_fase1.sql`:

```sql
-- Portal de Grupo Asegura — Fase 1. Schema `seguros` de la BD compartida.
-- Prefijo `portal_` para no colisionar con el volcado de la cartera.
SET search_path = seguros, public;

CREATE TYPE seguros.portal_canal_tipo AS ENUM ('whatsapp', 'email');
CREATE TYPE seguros.portal_procedencia AS ENUM ('compania', 'calculado', 'declarado');
CREATE TYPE seguros.portal_bien_tipo AS ENUM ('vehiculo', 'vivienda', 'local', 'mascota', 'persona', 'empresa');

-- Quien entra. NO es un cliente: puede no estar en la cartera.
CREATE TABLE seguros.portal_identidad (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text,
  creada_en   timestamptz NOT NULL DEFAULT now(),
  ultimo_acceso_en timestamptz
);

-- Canal verificado. `valor_hash` para poder buscar sin guardar el valor en claro.
CREATE TABLE seguros.portal_canal (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identidad_id  uuid NOT NULL REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,
  tipo          seguros.portal_canal_tipo NOT NULL,
  valor_hash    text NOT NULL,
  verificado_en timestamptz,
  creado_en     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_portal_canal_tipo_valor ON seguros.portal_canal (tipo, valor_hash);
CREATE INDEX idx_portal_canal_identidad ON seguros.portal_canal (identidad_id);

-- Códigos de un solo uso. `usado_en` los hace de un solo uso de verdad.
CREATE TABLE seguros.portal_codigo (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo       seguros.portal_canal_tipo NOT NULL,
  valor_hash text NOT NULL,
  codigo     text NOT NULL,
  intentos   integer NOT NULL DEFAULT 0,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  usado_en   timestamptz
);
CREATE INDEX idx_portal_codigo_lookup ON seguros.portal_codigo (tipo, valor_hash, creado_en DESC);

-- La cosa asegurada. Es el ancla de todo lo demás (y, en Fase 3, del recordatorio).
CREATE TABLE seguros.portal_bien (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identidad_id uuid NOT NULL REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,
  tipo         seguros.portal_bien_tipo NOT NULL,
  nombre       text NOT NULL,
  datos        jsonb NOT NULL DEFAULT '{}'::jsonb,
  creado_en    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_portal_bien_identidad ON seguros.portal_bien (identidad_id);

-- La póliza que APORTA el usuario. Puede no ser nuestra: ese es el punto.
CREATE TABLE seguros.portal_poliza_declarada (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identidad_id   uuid NOT NULL REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,
  bien_id        uuid REFERENCES seguros.portal_bien(id) ON DELETE SET NULL,
  compania       text,
  numero_poliza  text,
  ramo           text,
  prima_anual    numeric(10,2),
  fecha_vencimiento date,
  procedencia    seguros.portal_procedencia NOT NULL DEFAULT 'declarado',
  confirmada_por_usuario boolean NOT NULL DEFAULT false,
  documento_nombre text,
  extraccion_bruta jsonb,
  creada_en      timestamptz NOT NULL DEFAULT now(),
  actualizada_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_portal_poliza_identidad ON seguros.portal_poliza_declarada (identidad_id);
CREATE INDEX idx_portal_poliza_vencimiento ON seguros.portal_poliza_declarada (fecha_vencimiento)
  WHERE fecha_vencimiento IS NOT NULL;

-- Consentimiento. APPEND-ONLY: se añaden filas, nunca se actualizan.
-- Separa «avísame» de «ofertadme» a propósito: un portal gratis que usa el alta
-- como permiso comercial se muere en tres meses.
CREATE TABLE seguros.portal_consentimiento (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identidad_id uuid NOT NULL REFERENCES seguros.portal_identidad(id) ON DELETE CASCADE,
  tipo         text NOT NULL CHECK (tipo IN ('avisos', 'comercial', 'lds_art19')),
  otorgado     boolean NOT NULL,
  version_texto text NOT NULL,
  ip           inet,
  user_agent   text,
  creado_en    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_portal_consentimiento_identidad ON seguros.portal_consentimiento (identidad_id, tipo, creado_en DESC);
```

- [ ] **Step 2: Aplicar la migración**

Con la herramienta `mcp__Supabase__apply_migration` sobre el proyecto **`wswbehlcuxqxyinousql`** (la BD compartida de la casa, NO la de Manuel), `name: "portal_fase1"` y el contenido íntegro del fichero de arriba como `query`.

⚠️ Es idempotente **solo una vez**: `CREATE TYPE` no admite `IF NOT EXISTS`. Si hay que re-aplicarlo, borrar antes las seis tablas y los tres tipos.

- [ ] **Step 3: Verificar que las seis tablas existen**

```sql
SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'seguros' AND c.relkind = 'r' AND c.relname LIKE 'portal\_%';
```

Esperado: `6`.

- [ ] **Step 4: Commit**

```bash
cd /home/user/central
git add apps/asegura-portal/prisma/sql
git commit -m "feat(asegura-portal): tablas de la fase 1 en el schema seguros"
```

---

## Task 5: Esqueleto de la app

**Files:**
- Create: `apps/asegura-portal/package.json`
- Create: `apps/asegura-portal/vercel.json`
- Create: `apps/asegura-portal/tsconfig.json`
- Create: `apps/asegura-portal/next.config.ts`
- Create: `apps/asegura-portal/prisma/schema.prisma`
- Create: `apps/asegura-portal/app/layout.tsx`
- Create: `apps/asegura-portal/app/globals.css`
- Modify: `.github/workflows/tests.yml`

- [ ] **Step 1: Crear el `package.json`**

```json
{
  "name": "asegura-portal",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "npm run prisma:generate && next build",
    "start": "next start",
    "lint": "eslint",
    "prisma:generate": "prisma generate"
  },
  "dependencies": {
    "@central/core-ai": "workspace:*",
    "@central/core-email": "workspace:*",
    "@central/core-identity": "workspace:*",
    "@central/module-seguros-portal": "workspace:*",
    "@prisma/client": "^5.22.0",
    "jose": "^5.9.3",
    "next": "^15.5.18",
    "nodemailer": "^6.9.15",
    "pdf-parse": "^1.1.1",
    "prisma": "^5.22.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "^16.2.6",
    "typescript": "^5"
  }
}
```

- [ ] **Step 2: Crear el `vercel.json` con el `ignoreCommand` OBLIGATORIO**

Sin esta clave, cada push reconstruye TODOS los proyectos del monorepo. Es la causa del incidente de ~600 US$ de julio.

```json
{
  "ignoreCommand": "node ../../scripts/vercel-ignore-build.mjs apps/asegura-portal --sin-previews",
  "buildCommand": "prisma generate && next build",
  "installCommand": "npx --yes pnpm@10.33.0 install --no-frozen-lockfile",
  "framework": "nextjs",
  "regions": ["fra1"]
}
```

- [ ] **Step 3: Crear `tsconfig.json`, `next.config.ts` y el layout**

`apps/asegura-portal/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`apps/asegura-portal/next.config.ts`:

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['pdf-parse'],
}

export default nextConfig
```

`apps/asegura-portal/app/globals.css`:

```css
:root { --fondo: #ffffff; --texto: #111827; --borde: #e5e7eb; --brand: #0f766e; }
* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: var(--fondo); color: var(--texto); }
```

`apps/asegura-portal/app/layout.tsx`:

```tsx
import './globals.css'
import type { ReactNode } from 'react'

export const metadata = { title: 'Mis seguros — Grupo Asegura' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 4: Crear el `schema.prisma`**

`apps/asegura-portal/prisma/schema.prisma`:

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["multiSchema"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  schemas  = ["seguros"]
}

model PortalIdentidad {
  id             String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  nombre         String?
  creadaEn       DateTime  @default(now()) @map("creada_en") @db.Timestamptz(6)
  ultimoAccesoEn DateTime? @map("ultimo_acceso_en") @db.Timestamptz(6)

  canales  PortalCanal[]
  bienes   PortalBien[]
  polizas  PortalPolizaDeclarada[]

  @@map("portal_identidad")
  @@schema("seguros")
}

model PortalCanal {
  id           String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  identidadId  String    @map("identidad_id") @db.Uuid
  tipo         String
  valorHash    String    @map("valor_hash")
  verificadoEn DateTime? @map("verificado_en") @db.Timestamptz(6)
  creadoEn     DateTime  @default(now()) @map("creado_en") @db.Timestamptz(6)

  identidad PortalIdentidad @relation(fields: [identidadId], references: [id], onDelete: Cascade)

  @@unique([tipo, valorHash])
  @@map("portal_canal")
  @@schema("seguros")
}

model PortalCodigo {
  id        String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tipo      String
  valorHash String    @map("valor_hash")
  codigo    String
  intentos  Int       @default(0)
  creadoEn  DateTime  @default(now()) @map("creado_en") @db.Timestamptz(6)
  usadoEn   DateTime? @map("usado_en") @db.Timestamptz(6)

  @@map("portal_codigo")
  @@schema("seguros")
}

model PortalBien {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  identidadId String   @map("identidad_id") @db.Uuid
  tipo        String
  nombre      String
  datos       Json     @default("{}")
  creadoEn    DateTime @default(now()) @map("creado_en") @db.Timestamptz(6)

  identidad PortalIdentidad         @relation(fields: [identidadId], references: [id], onDelete: Cascade)
  polizas   PortalPolizaDeclarada[]

  @@map("portal_bien")
  @@schema("seguros")
}

model PortalPolizaDeclarada {
  id                   String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  identidadId          String    @map("identidad_id") @db.Uuid
  bienId               String?   @map("bien_id") @db.Uuid
  compania             String?
  numeroPoliza         String?   @map("numero_poliza")
  ramo                 String?
  primaAnual           Decimal?  @map("prima_anual") @db.Decimal(10, 2)
  fechaVencimiento     DateTime? @map("fecha_vencimiento") @db.Date
  procedencia          String    @default("declarado")
  confirmadaPorUsuario Boolean   @default(false) @map("confirmada_por_usuario")
  documentoNombre      String?   @map("documento_nombre")
  extraccionBruta      Json?     @map("extraccion_bruta")
  creadaEn             DateTime  @default(now()) @map("creada_en") @db.Timestamptz(6)
  actualizadaEn        DateTime  @default(now()) @map("actualizada_en") @db.Timestamptz(6)

  identidad PortalIdentidad @relation(fields: [identidadId], references: [id], onDelete: Cascade)
  bien      PortalBien?     @relation(fields: [bienId], references: [id])

  @@map("portal_poliza_declarada")
  @@schema("seguros")
}

model PortalConsentimiento {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  identidadId  String   @map("identidad_id") @db.Uuid
  tipo         String
  otorgado     Boolean
  versionTexto String   @map("version_texto")
  ip           String?  @db.Inet
  userAgent    String?  @map("user_agent")
  creadoEn     DateTime @default(now()) @map("creado_en") @db.Timestamptz(6)

  @@map("portal_consentimiento")
  @@schema("seguros")
}
```

- [ ] **Step 5: Añadir la app a la matriz de CI**

En `.github/workflows/tests.yml`, línea 62, sustituir:

```yaml
        app: [ia-rest, ialimp, sivra, plataforma, rrhh, transporte, alquiler, almacen, mariscos, asegura, housesevillana]
```

por:

```yaml
        app: [ia-rest, ialimp, sivra, plataforma, rrhh, transporte, alquiler, almacen, mariscos, asegura, asegura-portal, housesevillana]
```

Una app fuera de la matriz no la typechequea nadie: es lo que dejó 5 errores `TS5097` de `housesevillana` vivos 15 días.

- [ ] **Step 6: Verificar que instala y typechequea**

```bash
cd /home/user/central && npx --yes pnpm@10.33.0 install --no-frozen-lockfile
cd apps/asegura-portal && npx --yes pnpm@10.33.0 exec prisma generate && npx --yes pnpm@10.33.0 exec tsc --noEmit -p tsconfig.json
```

Esperado: `prisma generate` termina OK y `tsc` no imprime errores.

- [ ] **Step 7: Commit**

```bash
cd /home/user/central
git add apps/asegura-portal .github/workflows/tests.yml pnpm-lock.yaml
git commit -m "feat(asegura-portal): esqueleto de la app, prisma y entrada en la matriz de CI"
```

---

## Task 6: Puerto de canal y sus adaptadores

**Files:**
- Create: `apps/asegura-portal/lib/canal.ts`
- Create: `apps/asegura-portal/lib/canal-consola.ts`
- Create: `apps/asegura-portal/lib/canal-email.ts`

- [ ] **Step 1: Crear el puerto**

`apps/asegura-portal/lib/canal.ts`:

```ts
/**
 * Puerto de canal: por dónde sale el código de acceso.
 *
 * WhatsApp es el canal que quiere el negocio, pero la WABA de Grupo Asegura NO
 * existe todavía. Cablearlo directamente habría dejado esta fase entera
 * bloqueada esperando a Meta. Con el puerto, el día que haya número se añade
 * `canal-whatsapp.ts` y se registra aquí: ni una línea del resto cambia.
 */
export type TipoCanal = 'whatsapp' | 'email'

export interface Canal {
  tipo: TipoCanal
  /** Devuelve true si el envío se aceptó. Un false NO es una excepción: es «no se pudo». */
  enviarCodigo(destino: string, codigo: string): Promise<boolean>
}

const registro = new Map<TipoCanal, Canal>()

export function registrarCanal(canal: Canal): void {
  registro.set(canal.tipo, canal)
}

/**
 * `null` cuando el canal no está registrado. Es DISTINTO de «el envío falló», y
 * quien llama tiene que distinguirlo: decirle al usuario «no te hemos podido
 * enviar el código» cuando en realidad WhatsApp no está montado es mentirle.
 */
export function obtenerCanal(tipo: TipoCanal): Canal | null {
  return registro.get(tipo) ?? null
}
```

- [ ] **Step 2: Crear el adaptador de consola**

`apps/asegura-portal/lib/canal-consola.ts`:

```ts
import type { Canal } from './canal'

/**
 * Adaptador de DESARROLLO: escribe el código en el log del servidor.
 * Se registra solo fuera de producción — en producción, un código de acceso en
 * los logs es una credencial regalada.
 */
export const canalConsola: Canal = {
  tipo: 'email',
  async enviarCodigo(destino, codigo) {
    if (process.env.NODE_ENV === 'production') return false
    console.log(`[portal] código para ${destino}: ${codigo}`)
    return true
  },
}
```

- [ ] **Step 3: Crear el adaptador de email**

`apps/asegura-portal/lib/canal-email.ts`:

⚠️ **`createMailTransporter()` NO recibe argumentos.** Lee el proveedor del entorno por orden
(`RESEND_API_KEY` → `SMTP_USER`+`SMTP_PASSWORD` → `GMAIL_USER`+`GMAIL_APP_PASSWORD`) y devuelve
**`Transporter | null`**. El remitente lo pone cada vertical al enviar. Comprobado en
`packages/core-email/src/transporter.ts`.

```ts
import { createMailTransporter } from '@central/core-email'
import type { Canal } from './canal'

export const canalEmail: Canal = {
  tipo: 'email',
  async enviarCodigo(destino, codigo) {
    // `null` = no hay proveedor configurado. Se devuelve false y quien llama lo
    // cuenta como «no se pudo enviar», que es la verdad.
    const transporter = createMailTransporter()
    if (!transporter) return false

    const from = process.env.PORTAL_MAIL_FROM
    if (!from) {
      console.error('[portal] falta PORTAL_MAIL_FROM: no se envía el código')
      return false
    }

    try {
      await transporter.sendMail({
        from,
        to: destino,
        subject: `${codigo} es tu código de acceso`,
        text: `Tu código para entrar en Mis Seguros es ${codigo}. Caduca en 10 minutos.\n\nSi no lo has pedido tú, ignora este correo.`,
      })
      return true
    } catch (e) {
      console.error('[portal] fallo enviando el código por email:', e)
      return false
    }
  },
}
```

- [ ] **Step 4: Verificar que typechequea**

```bash
cd /home/user/central/apps/asegura-portal && npx --yes pnpm@10.33.0 exec tsc --noEmit -p tsconfig.json
```

Esperado: sin errores.

- [ ] **Step 5: Commit**

```bash
cd /home/user/central
git add apps/asegura-portal/lib
git commit -m "feat(asegura-portal): puerto de canal con adaptadores de email y consola"
```

---

## Task 7: Sesión propia del portal

**Files:**
- Create: `apps/asegura-portal/lib/auth.ts`
- Create: `apps/asegura-portal/lib/session.ts`
- Create: `apps/asegura-portal/lib/db.ts`

- [ ] **Step 1: Crear `lib/db.ts`**

```ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prismaPortal?: PrismaClient }

export const prisma = globalForPrisma.prismaPortal ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prismaPortal = prisma
```

- [ ] **Step 2: Crear `lib/auth.ts`**

```ts
import {
  createSessionToken as createToken,
  verifySessionToken as verifyToken,
  requireSecret,
} from '@central/core-identity'
import { createHash } from 'node:crypto'

export const COOKIE_NAME = 'asegura_portal_session'
export const COOKIE_OPTS = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
  maxAge: 60 * 60 * 24 * 30,
} as const

// Secreto PROPIO del portal, distinto del panel del corredor: una sesión del
// portal no debe valer jamás en la app interna. `requireSecret` lanza en
// producción si falta y solo cae al literal en desarrollo — es lo que exige el
// guardián `test/regression-secrets.test.ts` (ver `packages/core-identity/src/secret.ts`).
const SECRET = () => requireSecret('ASEGURA_PORTAL_SESSION_SECRET', 'portal-dev-secret-change-in-prod')

/**
 * Hash del canal para poder buscarlo sin guardar el email o el móvil en claro.
 * Va con pimienta de entorno: sin ella, una tabla de hashes de emails es
 * trivial de revertir con un diccionario.
 */
export function hashCanal(valor: string): string {
  const pimienta = process.env.ASEGURA_PORTAL_CANAL_PEPPER ?? ''
  return createHash('sha256').update(`${pimienta}:${valor.trim().toLowerCase()}`).digest('hex')
}

export async function crearSesion(identidadId: string): Promise<string> {
  const { token } = await createToken({ claims: { identidadId }, secret: SECRET(), expiresIn: '30d' })
  return token
}

export async function verificarSesion(token: string): Promise<{ identidadId: string } | null> {
  const payload = await verifyToken(token, SECRET())
  if (!payload) return null
  return { identidadId: payload.identidadId as string }
}
```

- [ ] **Step 3: Crear `lib/session.ts`**

```ts
import { cookies } from 'next/headers'
import { COOKIE_NAME, verificarSesion } from './auth'
import { prisma } from './db'

export async function getIdentidad() {
  const jar = await cookies()
  const token = jar.get(COOKIE_NAME)?.value
  if (!token) return null
  const payload = await verificarSesion(token)
  if (!payload) return null
  return prisma.portalIdentidad.findUnique({
    where: { id: payload.identidadId },
    select: { id: true, nombre: true },
  })
}

export async function requireIdentidad() {
  const i = await getIdentidad()
  if (!i) throw new Error('Sin sesión de portal')
  return i
}
```

- [ ] **Step 4: Verificar typecheck y el guardián de secretos**

```bash
cd /home/user/central/apps/asegura-portal && npx --yes pnpm@10.33.0 exec tsc --noEmit -p tsconfig.json
cd /home/user/central && npx --yes pnpm@10.33.0 run test:guardia
```

Esperado: `tsc` sin errores; el guardián en verde (`# fail 0`).

- [ ] **Step 5: Commit**

```bash
cd /home/user/central
git add apps/asegura-portal/lib
git commit -m "feat(asegura-portal): sesion propia del portal con secreto separado del panel"
```

---

## Task 8: Pedir y canjear el código

**Files:**
- Create: `apps/asegura-portal/app/api/acceso/solicitar/route.ts`
- Create: `apps/asegura-portal/app/api/acceso/verificar/route.ts`
- Create: `apps/asegura-portal/app/page.tsx`

- [ ] **Step 1: Crear la ruta que pide el código**

`apps/asegura-portal/app/api/acceso/solicitar/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { generarCodigo } from '@central/module-seguros-portal'
import { prisma } from '@/lib/db'
import { hashCanal } from '@/lib/auth'
import { obtenerCanal, registrarCanal, type TipoCanal } from '@/lib/canal'
import { canalEmail } from '@/lib/canal-email'
import { canalConsola } from '@/lib/canal-consola'

registrarCanal(process.env.NODE_ENV === 'production' ? canalEmail : canalConsola)

const Entrada = z.object({
  tipo: z.enum(['whatsapp', 'email']),
  destino: z.string().min(3).max(200),
})

export async function POST(req: Request) {
  const parsed = Entrada.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })

  const { tipo, destino } = parsed.data
  const canal = obtenerCanal(tipo as TipoCanal)

  // «Este canal no está montado» NO es «no hemos podido enviarlo». Decirle al
  // usuario que falló el envío cuando WhatsApp aún no existe es mentirle.
  if (!canal) return NextResponse.json({ error: 'canal_no_disponible', tipo }, { status: 503 })

  const codigo = generarCodigo()
  await prisma.portalCodigo.create({
    data: { tipo, valorHash: hashCanal(destino), codigo },
  })

  const enviado = await canal.enviarCodigo(destino, codigo)
  if (!enviado) return NextResponse.json({ error: 'envio_fallido' }, { status: 502 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Crear la ruta que canjea el código**

`apps/asegura-portal/app/api/acceso/verificar/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { estadoCodigo } from '@central/module-seguros-portal'
import { prisma } from '@/lib/db'
import { COOKIE_NAME, COOKIE_OPTS, crearSesion, hashCanal } from '@/lib/auth'

const Entrada = z.object({
  tipo: z.enum(['whatsapp', 'email']),
  destino: z.string().min(3).max(200),
  codigo: z.string().length(6),
})

export async function POST(req: Request) {
  const parsed = Entrada.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })

  const { tipo, destino, codigo } = parsed.data
  const valorHash = hashCanal(destino)

  const guardado = await prisma.portalCodigo.findFirst({
    where: { tipo, valorHash },
    orderBy: { creadoEn: 'desc' },
  })
  if (!guardado) return NextResponse.json({ error: 'sin_codigo' }, { status: 400 })

  const estado = estadoCodigo(
    { codigo: guardado.codigo, creadoEn: guardado.creadoEn, intentos: guardado.intentos, usadoEn: guardado.usadoEn },
    codigo,
    new Date(),
  )

  if (estado !== 'valido') {
    // El intento se cuenta SIEMPRE que el código exista y no esté ya bloqueado:
    // si solo contáramos los aciertos, el tope de intentos no serviría de nada.
    if (estado === 'incorrecto') {
      await prisma.portalCodigo.update({ where: { id: guardado.id }, data: { intentos: { increment: 1 } } })
    }
    return NextResponse.json({ error: estado }, { status: 401 })
  }

  const canalExistente = await prisma.portalCanal.findUnique({ where: { tipo_valorHash: { tipo, valorHash } } })

  const identidadId =
    canalExistente?.identidadId ??
    (
      await prisma.portalIdentidad.create({
        data: { canales: { create: { tipo, valorHash, verificadoEn: new Date() } } },
        select: { id: true },
      })
    ).id

  await prisma.$transaction([
    prisma.portalCodigo.update({ where: { id: guardado.id }, data: { usadoEn: new Date() } }),
    prisma.portalIdentidad.update({ where: { id: identidadId }, data: { ultimoAccesoEn: new Date() } }),
  ])

  const token = await crearSesion(identidadId)
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, token, COOKIE_OPTS)
  return res
}
```

- [ ] **Step 3: Crear la página de entrada**

`apps/asegura-portal/app/page.tsx`:

```tsx
'use client'
import { useState } from 'react'

export default function Entrada() {
  const [destino, setDestino] = useState('')
  const [codigo, setCodigo] = useState('')
  const [fase, setFase] = useState<'pedir' | 'verificar'>('pedir')
  const [error, setError] = useState<string | null>(null)

  async function pedir() {
    setError(null)
    const r = await fetch('/api/acceso/solicitar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tipo: 'email', destino }),
    })
    if (r.ok) setFase('verificar')
    else setError((await r.json()).error ?? 'error')
  }

  async function verificar() {
    setError(null)
    const r = await fetch('/api/acceso/verificar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tipo: 'email', destino, codigo }),
    })
    if (r.ok) window.location.href = '/boveda'
    else setError((await r.json()).error ?? 'error')
  }

  return (
    <main style={{ maxWidth: 420, margin: '0 auto', padding: '3rem 1rem' }}>
      <h1 style={{ fontSize: '1.5rem' }}>Mis seguros</h1>
      <p style={{ color: '#4b5563' }}>Todos tus seguros en un sitio. Gratis, seas cliente o no.</p>

      {fase === 'pedir' ? (
        <>
          <input
            type="email"
            value={destino}
            onChange={(e) => setDestino(e.target.value)}
            placeholder="tu@email.com"
            style={{ width: '100%', padding: 12, fontSize: 16, minHeight: 44 }}
          />
          <button onClick={pedir} style={{ width: '100%', padding: 12, minHeight: 44, marginTop: 12 }}>
            Enviarme un código
          </button>
        </>
      ) : (
        <>
          <input
            inputMode="numeric"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="123456"
            style={{ width: '100%', padding: 12, fontSize: 16, minHeight: 44 }}
          />
          <button onClick={verificar} style={{ width: '100%', padding: 12, minHeight: 44, marginTop: 12 }}>
            Entrar
          </button>
        </>
      )}

      {error && <p style={{ color: '#b91c1c', marginTop: 12 }}>{textoError(error)}</p>}
    </main>
  )
}

function textoError(codigo: string): string {
  const mapa: Record<string, string> = {
    canal_no_disponible: 'Ese canal todavía no está disponible.',
    envio_fallido: 'No hemos podido enviarte el código. Inténtalo en un momento.',
    caducado: 'El código ha caducado. Pide uno nuevo.',
    ya_usado: 'Ese código ya se usó. Pide uno nuevo.',
    bloqueado: 'Demasiados intentos. Pide un código nuevo.',
    incorrecto: 'El código no es correcto.',
    sin_codigo: 'Pide un código primero.',
  }
  return mapa[codigo] ?? 'Ha ocurrido un error.'
}
```

- [ ] **Step 4: Verificar typecheck**

```bash
cd /home/user/central/apps/asegura-portal && npx --yes pnpm@10.33.0 exec tsc --noEmit -p tsconfig.json
```

Esperado: sin errores.

- [ ] **Step 5: Commit**

```bash
cd /home/user/central
git add apps/asegura-portal/app
git commit -m "feat(asegura-portal): entrada por codigo de un solo uso"
```

---

## Task 9: Extraer los datos de una póliza

**Files:**
- Create: `apps/asegura-portal/lib/extraer-poliza.ts`

Replica el pipeline ya probado de `apps/sivra/lib/agente-facturas/extraer.ts`: PDF → texto con `pdf-parse` → IA; imagen → base64 → visión.

- [ ] **Step 1: Crear el extractor**

`apps/asegura-portal/lib/extraer-poliza.ts`:

⚠️ **Firmas reales, comprobadas en `packages/core-ai/src/` — no son las que uno supondría:**
- `aiComplete(promptOrMessages, { system?, maxTokens?, temperature?, timeoutMs?, model? })` devuelve
  **un `string`**, no un objeto con `.text` (`client.ts:271`).
- `openrouterVision(config, system, images, userText, opts?)` — **cinco** argumentos, y las imágenes
  son `ImageInput = { data: string /* base64 puro */, mediaType: string }`, no `{ base64, mimeType }`
  (`openrouter.ts:189`, `types.ts:4`).

```ts
import { aiComplete, openrouterVision, cleanJSON } from '@central/core-ai'

export type PolizaExtraida = {
  compania?: string | null
  numeroPoliza?: string | null
  ramo?: string | null
  primaAnual?: number | null
  fechaVencimiento?: string | null
}

export type ResultadoExtraccion = {
  datos: PolizaExtraida
  /** `none` = no se pudo leer NADA. No es lo mismo que «la póliza no tiene esos datos». */
  fuente: 'texto' | 'vision' | 'none'
}

const INSTRUCCION = `Eres un extractor de datos de pólizas de seguro españolas.
Devuelve SOLO un objeto JSON con estas claves, sin texto alrededor:
{"compania":string|null,"numeroPoliza":string|null,"ramo":string|null,"primaAnual":number|null,"fechaVencimiento":"YYYY-MM-DD"|null}
Reglas:
- "ramo" debe ser uno de: auto, moto, hogar, vida, salud, decesos, responsabilidad_civil, comercio, comunidades, otros.
- "primaAnual" en euros, solo el número, con punto decimal.
- Si un dato NO aparece en el documento, pon null. NUNCA lo inventes ni lo deduzcas.`

export async function extraerPoliza(
  buffer: Buffer,
  mimeType: string,
  fileName = '',
): Promise<ResultadoExtraccion> {
  const esPdf = mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')

  if (esPdf) {
    let texto = ''
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse')
      texto = (await pdfParse(buffer)).text || ''
    } catch (e) {
      console.warn('[portal] pdf-parse falló:', e)
    }
    if (!texto.trim()) return { datos: {}, fuente: 'none' }
    const salida = await aiComplete(texto.slice(0, 20_000), {
      system: INSTRUCCION,
      maxTokens: 600,
    })
    return { datos: parsear(salida), fuente: 'texto' }
  }

  if (mimeType.startsWith('image/')) {
    const apiKey = process.env.OPENROUTER_API_KEY ?? ''
    if (!apiKey) return { datos: {}, fuente: 'none' }
    const salida = await openrouterVision(
      { apiKey },
      INSTRUCCION,
      [{ data: buffer.toString('base64'), mediaType: mimeType }],
      'Extrae los datos de esta póliza.',
    )
    return { datos: parsear(salida), fuente: 'vision' }
  }

  return { datos: {}, fuente: 'none' }
}

/**
 * Un JSON que no parsea devuelve `{}`, NUNCA campos a medias. Media extracción
 * pintada como póliza es peor que ninguna: el usuario se cree que está guardada.
 */
function parsear(salida: string): PolizaExtraida {
  try {
    const limpio = cleanJSON(salida)
    const obj = JSON.parse(limpio) as PolizaExtraida
    return obj && typeof obj === 'object' ? obj : {}
  } catch {
    return {}
  }
}
```

- [ ] **Step 2: Verificar typecheck**

```bash
cd /home/user/central/apps/asegura-portal && npx --yes pnpm@10.33.0 exec tsc --noEmit -p tsconfig.json
```

Esperado: sin errores. Las firmas de `aiComplete` y `openrouterVision` están comprobadas contra el
código real (ver el aviso del Step 1); si `tsc` protesta, es que el paquete cambió — mirar
`packages/core-ai/src/index.ts`, nunca inventar la llamada.

- [ ] **Step 3: Commit**

```bash
cd /home/user/central
git add apps/asegura-portal/lib/extraer-poliza.ts
git commit -m "feat(asegura-portal): extraccion de poliza desde PDF o foto"
```

---

## Task 10: La pestaña de subir la póliza

**Files:**
- Create: `apps/asegura-portal/lib/dinero.ts`
- Create: `apps/asegura-portal/app/api/polizas/route.ts`
- Create: `apps/asegura-portal/app/(portal)/boveda/page.tsx`
- Create: `apps/asegura-portal/app/(portal)/boveda/SubirPoliza.tsx`

- [ ] **Step 1: Crear `lib/dinero.ts`**

Regla global de la casa: `2.162,49€` — miles con punto, decimales con coma, € DETRÁS. Espejo exacto
de `apps/asegura/lib/dinero.ts`.

```ts
// Formato de dinero ESPAÑOL, regla global del monorepo: `2.162,49€`.
// Espejo de apps/asegura/lib/dinero.ts.
export function eur(n: number | null | undefined): string {
  // `null` NO es 0: es «todavía no lo sabemos». Un `0,00€` sobre una prima que
  // la IA no supo leer sería una afirmación falsa.
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return (
    n.toLocaleString('es-ES', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: 'always',
    }) + '€'
  )
}
```

- [ ] **Step 2: Crear la ruta de alta**

`apps/asegura-portal/app/api/polizas/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { requireIdentidad } from '@/lib/session'
import { prisma } from '@/lib/db'
import { extraerPoliza } from '@/lib/extraer-poliza'

export const runtime = 'nodejs'
const MAX_BYTES = 10 * 1024 * 1024

export async function POST(req: Request) {
  let identidad
  try {
    identidad = await requireIdentidad()
  } catch {
    return NextResponse.json({ error: 'sin_sesion' }, { status: 401 })
  }

  const form = await req.formData()
  const fichero = form.get('documento')
  if (!(fichero instanceof File)) return NextResponse.json({ error: 'sin_fichero' }, { status: 400 })
  if (fichero.size > MAX_BYTES) return NextResponse.json({ error: 'fichero_grande' }, { status: 413 })

  const buffer = Buffer.from(await fichero.arrayBuffer())
  const { datos, fuente } = await extraerPoliza(buffer, fichero.type, fichero.name)

  const poliza = await prisma.portalPolizaDeclarada.create({
    data: {
      identidadId: identidad.id,
      compania: datos.compania ?? null,
      numeroPoliza: datos.numeroPoliza ?? null,
      ramo: datos.ramo ?? null,
      primaAnual: datos.primaAnual ?? null,
      fechaVencimiento: datos.fechaVencimiento ? new Date(datos.fechaVencimiento) : null,
      // Siempre `declarado`: lo ha aportado el usuario. Que lo haya leído una IA
      // no lo convierte en dato verificado — al revés, es donde más se inventa.
      procedencia: 'declarado',
      documentoNombre: fichero.name,
      extraccionBruta: { fuente, datos },
    },
    select: { id: true },
  })

  return NextResponse.json({ id: poliza.id, datos, fuente })
}
```

- [ ] **Step 3: Crear el componente de subida**

`apps/asegura-portal/app/(portal)/boveda/SubirPoliza.tsx`:

```tsx
'use client'
import { useState } from 'react'

import { eur } from '@/lib/dinero'

type DatosLeidos = {
  compania?: string | null
  numeroPoliza?: string | null
  ramo?: string | null
  primaAnual?: number | null
  fechaVencimiento?: string | null
}
type Resultado = { datos: DatosLeidos; fuente: 'texto' | 'vision' | 'none' }

export function SubirPoliza() {
  const [estado, setEstado] = useState<'reposo' | 'subiendo' | 'listo' | 'error'>('reposo')
  const [resultado, setResultado] = useState<Resultado | null>(null)

  async function subir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setEstado('subiendo')
    const body = new FormData()
    body.append('documento', f)
    const r = await fetch('/api/polizas', { method: 'POST', body })
    if (!r.ok) return setEstado('error')
    setResultado(await r.json())
    setEstado('listo')
  }

  return (
    <section style={{ border: '1px solid var(--borde)', borderRadius: 8, padding: 16, marginTop: 16 }}>
      <h2 style={{ fontSize: '1.1rem', marginTop: 0 }}>Añade una póliza</h2>
      <p style={{ color: '#4b5563', fontSize: 14 }}>
        Sube el PDF o una foto. Da igual que no sea nuestra: la leemos y te avisamos antes de que venza.
      </p>

      <input type="file" accept="application/pdf,image/*" onChange={subir} style={{ minHeight: 44 }} />

      {estado === 'subiendo' && <p>Leyendo el documento…</p>}
      {estado === 'error' && <p style={{ color: '#b91c1c' }}>No hemos podido subirla. Inténtalo otra vez.</p>}

      {estado === 'listo' && resultado && (
        <div style={{ marginTop: 12 }}>
          {resultado.fuente === 'none' ? (
            // NO decimos «no tiene esos datos»: decimos que no hemos podido
            // leerlos. Es la diferencia entre un dato ausente y uno no mirado.
            <p>
              <strong>No hemos podido leer el documento.</strong> La póliza está guardada; complétala a mano
              cuando quieras.
            </p>
          ) : (
            <>
              <p>
                Guardada. <strong>Estos datos los hemos leído nosotros del documento</strong> — revísalos y
                confírmalos.
              </p>
              {/* Nada de volcar el JSON crudo: la prima se pinta con `eur()` (formato
                  español, regla global) y un campo que la IA no supo leer dice
                  «no lo hemos encontrado», no un hueco ni un 0. */}
              <dl style={{ display: 'grid', gridTemplateColumns: 'minmax(9rem, 40%) 1fr', gap: '4px 12px', fontSize: 14 }}>
                <dt>Compañía</dt><dd style={{ margin: 0 }}>{resultado.datos.compania ?? NO_LEIDO}</dd>
                <dt>Nº de póliza</dt><dd style={{ margin: 0 }}>{resultado.datos.numeroPoliza ?? NO_LEIDO}</dd>
                <dt>Ramo</dt><dd style={{ margin: 0 }}>{resultado.datos.ramo ?? NO_LEIDO}</dd>
                <dt>Prima anual</dt>
                <dd style={{ margin: 0 }}>
                  {resultado.datos.primaAnual == null ? NO_LEIDO : eur(resultado.datos.primaAnual)}
                </dd>
                <dt>Vencimiento</dt><dd style={{ margin: 0 }}>{resultado.datos.fechaVencimiento ?? NO_LEIDO}</dd>
              </dl>
            </>
          )}
        </div>
      )}
    </section>
  )
}

const NO_LEIDO = <span style={{ color: '#6b7280' }}>No lo hemos encontrado en el documento</span>
```

- [ ] **Step 4: Crear la página de la bóveda**

`apps/asegura-portal/app/(portal)/boveda/page.tsx`:

```tsx
import { redirect } from 'next/navigation'
import { getIdentidad } from '@/lib/session'
import { prisma } from '@/lib/db'
import { etiquetaProcedencia } from '@central/module-seguros-portal'
import { eur } from '@/lib/dinero'
import { SubirPoliza } from './SubirPoliza'

export default async function Boveda() {
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')

  const polizas = await prisma.portalPolizaDeclarada.findMany({
    where: { identidadId: identidad.id },
    orderBy: { creadaEn: 'desc' },
    take: 50,
  })

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1rem' }}>
      <h1 style={{ fontSize: '1.5rem' }}>Mis seguros</h1>

      {polizas.length === 0 ? (
        <p style={{ color: '#4b5563' }}>Todavía no has añadido ninguna póliza.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {polizas.map((p) => (
            <li key={p.id} style={{ border: '1px solid var(--borde)', borderRadius: 8, padding: 12, marginBottom: 8 }}>
              <strong>{p.compania ?? 'Compañía sin identificar'}</strong>
              {p.ramo && <span> · {p.ramo}</span>}
              <div style={{ fontSize: 13, color: '#4b5563' }}>
                {p.fechaVencimiento
                  ? `Vence el ${p.fechaVencimiento.toLocaleDateString('es-ES')}`
                  : 'No sabemos cuándo vence'}
                {' · '}
                {/* `Decimal` de Prisma: se convierte a número ANTES de formatear.
                    `null` sale como «—», jamás como «0,00€». */}
                {p.primaAnual == null ? 'Prima —' : `Prima ${eur(Number(p.primaAnual))}`}
              </div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
                {etiquetaProcedencia(p.procedencia as 'compania' | 'calculado' | 'declarado')}
              </div>
            </li>
          ))}
        </ul>
      )}

      <SubirPoliza />
    </main>
  )
}
```

- [ ] **Step 5: Verificar typecheck y lint**

```bash
cd /home/user/central/apps/asegura-portal
npx --yes pnpm@10.33.0 exec tsc --noEmit -p tsconfig.json
npx --yes pnpm@10.33.0 run lint
```

Esperado: `tsc` sin errores; lint sin errores (los *warnings* no bloquean).

- [ ] **Step 6: Commit**

```bash
cd /home/user/central
git add apps/asegura-portal/app apps/asegura-portal/lib/dinero.ts
git commit -m "feat(asegura-portal): boveda con la pestana de subir polizas"
```

---

## Task 11: Guardián de aislamiento del portal

**Files:**
- Create: `test/regression-portal-aislamiento.test.ts`

El equivalente al guardián que ya protege `apps/asegura`: ningún fichero del portal puede leer datos de una identidad sin pasar por `lib/session`. Sin este cepo, el día que alguien escriba una consulta con `identidadId` de la query string, nada avisa.

📌 **Desviación deliberada del spec, y por qué.** El spec nombra la puerta única `lib/acceso.ts`,
porque allí la puerta guarda además la lectura de la CARTERA (con sus niveles de acceso y la costura
`origen: cartera | aportada`). En Fase 1 no se lee cartera: solo hay bóveda propia, y lo único que
hay que resolver es *de quién es esta sesión*. Por eso la puerta se llama `lib/session` y el guardián
vigila eso. Cuando entre la Fase 4 (vinculación con CIMA), `lib/acceso.ts` nace encima y **el
guardián pasa a exigirlo a él**: es un renombrado del cepo, no un cepo nuevo.

- [ ] **Step 1: Escribir el guardián**

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const ficheros = execFileSync('git', ['ls-files', 'apps/asegura-portal'], { encoding: 'utf8' })
  .split('\n')
  .filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'))

// Estos SÍ pueden tocar prisma sin sesión: son la puerta de entrada (aún no hay
// identidad) o la propia maquinaria de sesión.
const EXENTOS = new Set([
  'apps/asegura-portal/lib/db.ts',
  'apps/asegura-portal/lib/session.ts',
  'apps/asegura-portal/lib/auth.ts',
  'apps/asegura-portal/app/api/acceso/solicitar/route.ts',
  'apps/asegura-portal/app/api/acceso/verificar/route.ts',
])

test('ningun fichero del portal consulta datos de identidad sin pasar por lib/session', () => {
  const infractores: string[] = []

  for (const f of ficheros) {
    if (EXENTOS.has(f)) continue
    const src = readFileSync(f, 'utf8')
    const usaPrisma = /prisma\.portal[A-Z]/.test(src)
    if (!usaPrisma) continue
    const usaSesion = /from '@\/lib\/session'/.test(src)
    if (!usaSesion) infractores.push(f)
  }

  assert.deepEqual(
    infractores,
    [],
    `Estos ficheros leen datos del portal sin resolver la identidad por lib/session:\n${infractores.join('\n')}`,
  )
})
```

- [ ] **Step 2: Comprobar que el cepo salta de verdad**

Un guardián que nunca se probó fallando no es un guardián. Crear un infractor temporal:

```bash
cd /home/user/central
mkdir -p apps/asegura-portal/app/api/_infractor
cat > apps/asegura-portal/app/api/_infractor/route.ts <<'EOF'
import { prisma } from '@/lib/db'
export async function GET() {
  return Response.json(await prisma.portalPolizaDeclarada.findMany())
}
EOF
git add apps/asegura-portal/app/api/_infractor/route.ts
node --test test/regression-portal-aislamiento.test.ts
```

Esperado: **FALLA**, nombrando `apps/asegura-portal/app/api/_infractor/route.ts`.

- [ ] **Step 3: Retirar el infractor y comprobar que vuelve a pasar**

```bash
cd /home/user/central
git rm -f --cached apps/asegura-portal/app/api/_infractor/route.ts
rm -rf apps/asegura-portal/app/api/_infractor
node --test test/regression-portal-aislamiento.test.ts
```

Esperado: `# pass 1`, `# fail 0`.

- [ ] **Step 4: Commit**

```bash
cd /home/user/central
git add test/regression-portal-aislamiento.test.ts
git commit -m "test(asegura-portal): guardian de aislamiento por identidad, verificado con un infractor"
```

---

## Task 12: Suite completa y PR

- [ ] **Step 1: Ejecutar los 12 checks requeridos en local**

```bash
cd /home/user/central
npx --yes pnpm@10.33.0 install --no-frozen-lockfile
npx --yes pnpm@10.33.0 test
cd apps/ia-rest && npx --yes pnpm@10.33.0 exec tsx scripts/qa-check.ts && npx --yes pnpm@10.33.0 run lint && npx --yes pnpm@10.33.0 exec tsc --noEmit
```

Esperado: `pnpm test` con `# fail 0`; QA «sin problemas»; lint con 0 errores.

- [ ] **Step 2: Typecheck de las 12 apps**

```bash
cd /home/user/central
for a in almacen alquiler asegura asegura-portal housesevillana ia-rest ialimp mariscos plataforma rrhh sivra transporte; do
  echo "== $a"
  (cd apps/$a && [ -f prisma/schema.prisma ] && npx --yes pnpm@10.33.0 exec prisma generate >/dev/null 2>&1
   npx --yes pnpm@10.33.0 exec tsc --noEmit -p tsconfig.json) || echo "FALLA $a"
done
```

Esperado: ningún `FALLA`.

- [ ] **Step 3: Anotar la memoria**

Añadir esta entrada **arriba del todo** en `docs/CONTEXTO-SESIONES.md` (máx ~8 líneas, fecha en la
primera). ⚠️ La cabecera va con `### ` o `- **`: son los ÚNICOS formatos que `scripts/rotar-memoria.mjs`
reconoce como entrada — una cabecera `## ` se funde con la anterior y se archiva mal.

```markdown
### 🧭 (01/09/2026) Portal de Grupo Asegura — Fase 1 en pie
- App nueva `apps/asegura-portal` (Next.js, rol propio SIN BYPASSRLS) + `@central/module-seguros-portal`
  (puro: niveles de acceso, procedencia en tres estados, código de un solo uso).
- 6 tablas `portal_*` en el schema `seguros`. Las otras 5 del spec llegan con sus fases.
- **El canal es un PUERTO**: la WABA de Grupo Asegura no existe todavía, así que en Fase 1 se
  enchufan email y consola; WhatsApp entra añadiendo un fichero, sin tocar nada más.
- Guardián `test/regression-portal-aislamiento.test.ts`, verificado con un infractor real.
- Falta infraestructura de Alberto: proyecto Vercel, rol `prisma_asegura_portal` con contraseña, envs.
```

- [ ] **Step 4: Empujar y abrir el PR**

```bash
cd /home/user/central
git push -u origin claude/intranet-clientes-empresas-mr2nhm
```

Abrir el PR en draft por la herramienta MCP de GitHub. Si los 12 requeridos no arrancan, seguir el orden de `CLAUDE.md`: (1) resolver conflicto con `main` si lo hay; (2) si no, mergear `main` en la rama igualmente; (3) solo entonces pedir mano.

---

## Pendientes de infraestructura (no son código, y bloquean el despliegue)

Ninguno bloquea escribir ni probar el código de arriba, pero sí ponerlo en pie:

1. **Proyecto Vercel `asegura-portal`** con Root Directory `apps/asegura-portal`.
2. **Rol `prisma_asegura_portal` SIN BYPASSRLS**, con GRANT solo sobre las tablas `portal_*` y lectura acotada de la cartera. La contraseña la pone Alberto: no debe pasar por un transcript.
3. **Envs del proyecto:** `DATABASE_URL` (con ese rol), `ASEGURA_PORTAL_SESSION_SECRET`,
   `ASEGURA_PORTAL_CANAL_PEPPER`, `OPENROUTER_API_KEY`, `PORTAL_MAIL_FROM` y **las del proveedor de
   correo que ya lee `@central/core-email` por su cuenta**: `RESEND_API_KEY`, o
   `SMTP_USER`+`SMTP_PASSWORD`, o `GMAIL_USER`+`GMAIL_APP_PASSWORD`. No hay envs `PORTAL_SMTP_*`: el
   transporter no recibe credenciales por parámetro.
4. **WABA de Grupo Asegura** — desbloquea el adaptador de WhatsApp, que es la Fase 2 del canal.
