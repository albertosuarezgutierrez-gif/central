# `@central/core-receipts` — Plan de implementación (Fase 1: fundación)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Crear el paquete compartido `@central/core-receipts` con sus primitivas de diseño (tipos, guardia de integridad fiscal) y migrar a él los generadores ESC/POS puros de ia-rest **sin cambiar ni un byte** del ticket impreso.

**Architecture:** Paquete TS puro en `packages/core-receipts`, consumido por las apps con `workspace:*` (pnpm workspaces, igual que `@central/core-fiscal`). Esta fase NO introduce render HTML/PDF, glosa IA ni cambios de comportamiento: extrae las funciones de impresión ya existentes a un núcleo compartido y deja listas las primitivas (`ReceiptDoc`, `Branding`, `GlosaProvider`, `assertFiscalIntegrity`) que consumirán las fases siguientes.

**Tech Stack:** TypeScript (ESM, type-stripping de Node), runner de tests `node --test test/*.test.ts` (misma convención que `packages/core-fiscal`), pnpm workspaces.

---

## Contexto para quien ejecuta (lee esto antes de empezar)

- El spec completo está en `docs/superpowers/specs/2026-06-16-core-receipts-design.md`. Esta Fase 1 cubre las secciones §4.1 (modelo de datos), §4.5 (guardia de integridad) y el punto 1 del §6 (migración ESC/POS).
- Convención de paquetes (mira `packages/core-fiscal/package.json` y `packages/core-fiscal/tsconfig.json` como referencia exacta): `"type": "module"`, `"main"` y `"types"` apuntan a `./src/index.ts`, `exports` mapea `"."` a `./src/index.ts`, tests con `node --test test/*.test.ts`.
- Las apps importan con `"@central/core-fiscal": "workspace:*"` (ver `apps/ia-rest/package.json`). El mismo patrón aplica al paquete nuevo.
- Las funciones a migrar viven HOY en `apps/ia-rest/src/lib/courier.ts`. Son **puras** (solo `Buffer`/strings, sin Supabase): `generarEscPos` (L62-139), `generarTextoPlano` (L144-189), `generarTicketCuenta` (L645-734), `generarEscPosCuenta` (L795-938), más las constantes `ESC`/`GS`/`CMD` (L41-56) y las interfaces `PrintPayload` (L24-34), `ItemCuenta`/`TicketCuentaParams` (L621-643), `CuentaParams` (L764-788). El resto de `courier.ts` (`crearPrintJobs`, `crearPrintJobMarchar`, `crearPrintJobCuenta`, helpers de enrutamiento) usa Supabase y **se queda** en ia-rest.
- **Regla de oro de esta fase:** la migración es un *cut-paste verbatim*. No reescribas la lógica de los generadores; muévela tal cual. Los tests de igualdad de bytes son la red de seguridad.

---

## File Structure

- `packages/core-receipts/package.json` — manifiesto del paquete (workspace).
- `packages/core-receipts/tsconfig.json` — copia de la convención de core-fiscal.
- `packages/core-receipts/src/index.ts` — punto de entrada (re-exporta tipos, integridad y renderers).
- `packages/core-receipts/src/types.ts` — `ReceiptDoc`, `FiscalFields`, `Branding`, `Lang`, `GlosaProvider`, `GlosaContext`.
- `packages/core-receipts/src/integrity.ts` — `assertFiscalIntegrity`, `formatFiscalNumber`, `FiscalIntegrityError`.
- `packages/core-receipts/src/renderers/thermal.ts` — generadores ESC/POS migrados verbatim.
- `packages/core-receipts/test/integrity.test.ts` — tests unitarios de la guardia.
- `packages/core-receipts/test/thermal.test.ts` — tests de igualdad de bytes (goldens).
- `packages/core-receipts/test/fixtures/*.b64` — goldens base64 commiteados.
- `apps/ia-rest/src/lib/courier.ts` — Modify: borra los generadores, los importa del paquete.
- `apps/ia-rest/package.json` — Modify: añade la dep `@central/core-receipts`.

---

### Task 1: Scaffold del paquete

**Files:**
- Create: `packages/core-receipts/package.json`
- Create: `packages/core-receipts/tsconfig.json`
- Create: `packages/core-receipts/src/index.ts`
- Test: `packages/core-receipts/test/smoke.test.ts`

- [ ] **Step 1: Crear el manifiesto**

`packages/core-receipts/package.json`:

```json
{
  "name": "@central/core-receipts",
  "version": "0.0.0",
  "private": true,
  "description": "Núcleo compartido de render de recibos/tickets (casa de marcas): un ReceiptDoc fiscal-seguro → renderers (HTML/PDF/ESC-POS) con branding por negocio y glosa IA confinada a la capa no-fiscal. La integridad fiscal se valida fail-closed. Sin BD ni estado de inquilino.",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "node --test test/*.test.ts"
  },
  "sideEffects": false,
  "license": "UNLICENSED"
}
```

- [ ] **Step 2: Crear el tsconfig (copia de core-fiscal)**

`packages/core-receipts/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["esnext"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Crear el index de entrada (vacío de momento)**

`packages/core-receipts/src/index.ts`:

```ts
// Punto de entrada de @central/core-receipts.
// Se irá poblando con los re-exports a medida que avanza el plan.
export const CORE_RECEIPTS_VERSION = '0.0.0'
```

- [ ] **Step 4: Escribir un smoke test que falle**

`packages/core-receipts/test/smoke.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CORE_RECEIPTS_VERSION } from '../src/index.ts'

test('el paquete expone su versión', () => {
  assert.equal(CORE_RECEIPTS_VERSION, '0.0.0')
})
```

- [ ] **Step 5: Instalar el workspace y correr el test**

Run:
```bash
pnpm install
node --test packages/core-receipts/test/*.test.ts
```
Expected: PASS (1 test). Si `node --test` no entiende TS, el repo usa Node ≥22 con type-stripping; confirma la versión con `node --version` (debe ser ≥ 22.6).

- [ ] **Step 6: Commit**

```bash
git add packages/core-receipts/package.json packages/core-receipts/tsconfig.json packages/core-receipts/src/index.ts packages/core-receipts/test/smoke.test.ts pnpm-lock.yaml
git commit -m "feat(core-receipts): scaffold del paquete compartido"
```

---

### Task 2: Tipos del dominio (`ReceiptDoc`, `Branding`, glosa)

**Files:**
- Create: `packages/core-receipts/src/types.ts`
- Modify: `packages/core-receipts/src/index.ts`
- Test: `packages/core-receipts/test/types.test.ts`

- [ ] **Step 1: Escribir el test de tipos (compila = pasa)**

`packages/core-receipts/test/types.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ReceiptDoc, Branding } from '../src/index.ts'

test('un ReceiptDoc fiscal-seguro se construye con campos congelados', () => {
  const doc: ReceiptDoc = {
    kind: 'factura-cliente',
    fiscal: {
      numero: 'F-2026-000123',
      fechaLocal: '16-06-2026 13:45:00',
      emisorNif: 'B00000000',
      emisorRazon: 'ia.rest SL',
      base: 10,
      iva: 1,
      total: 11,
    },
    lineas: [{ descripcion: 'Café', cantidad: 1, precioUnitario: 11 }],
  }
  assert.equal(doc.fiscal.total, 11)
})

test('un Branding lleva colores y idioma', () => {
  const brand: Branding = {
    nombre: 'Sique Brilla',
    primario: '#0a0805',
    secundario: '#d4a017',
    light: '#fff8e1',
    lang: 'es',
  }
  assert.equal(brand.lang, 'es')
})
```

- [ ] **Step 2: Correr el test para verla fallar**

Run: `node --test packages/core-receipts/test/types.test.ts`
Expected: FAIL — `Cannot find module '../src/index.ts'` exports `ReceiptDoc`/`Branding` (aún no existen).

- [ ] **Step 3: Crear los tipos**

`packages/core-receipts/src/types.ts`:

```ts
// Idiomas soportados por la capa de presentación (es por defecto).
export type Lang = 'es' | 'en' | 'ca'

// Tipos de documento de cara al cliente.
export type ReceiptKind = 'ticket-verifactu' | 'factura-cliente' | 'recibo-limpieza'

// Campos fiscales: los renderers los copian VERBATIM, nunca los recalculan ni mutan.
// `huella` y `qrData` solo están presentes en tickets VeriFactu.
export interface FiscalFields {
  numero: string         // número/serie del documento
  fechaLocal: string     // dd-mm-yyyy hh:mm:ss (hora local AEAT)
  emisorNif: string
  emisorRazon: string
  destNif?: string
  destRazon?: string
  base: number           // base imponible
  iva: number            // cuota de IVA
  total: number
  huella?: string        // VeriFactu: hash encadenado
  qrData?: string        // VeriFactu: URL TIKE-CONT del QR
}

export interface ReceiptLine {
  descripcion: string
  cantidad: number
  precioUnitario: number
}

// Identidad visual de un negocio. Las plantillas la inyectan vía CSS custom props.
export interface Branding {
  nombre: string
  logoUrl?: string
  primario: string       // hex
  secundario: string     // hex
  light: string          // hex
  lang: Lang
}

// Documento listo para renderizar. `fiscal` es de solo lectura.
export interface ReceiptDoc {
  kind: ReceiptKind
  fiscal: Readonly<FiscalFields>
  lineas: ReadonlyArray<ReceiptLine>
  glosa?: string         // texto NO-fiscal ya resuelto (IA o fallback). Opcional.
}

// Contexto que recibe el proveedor de glosa. Solo datos NO-fiscales.
export interface GlosaContext {
  kind: ReceiptKind
  clienteNombre?: string
  resumenItems: string
  lang: Lang
  negocioTono?: string
}

// Proveedor de glosa (la implementación con IA llega en la Fase 3).
export interface GlosaProvider {
  generar(ctx: GlosaContext): Promise<string>
}
```

- [ ] **Step 4: Re-exportar desde el index**

Edita `packages/core-receipts/src/index.ts` para que quede así:

```ts
// Punto de entrada de @central/core-receipts.
export const CORE_RECEIPTS_VERSION = '0.0.0'

export type {
  Lang,
  ReceiptKind,
  FiscalFields,
  ReceiptLine,
  Branding,
  ReceiptDoc,
  GlosaContext,
  GlosaProvider,
} from './types.ts'
```

- [ ] **Step 5: Correr el test para verla pasar**

Run: `node --test packages/core-receipts/test/types.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core-receipts/src/types.ts packages/core-receipts/src/index.ts packages/core-receipts/test/types.test.ts
git commit -m "feat(core-receipts): tipos del dominio (ReceiptDoc, Branding, glosa)"
```

---

### Task 3: Guardia de integridad fiscal (`assertFiscalIntegrity`)

**Files:**
- Create: `packages/core-receipts/src/integrity.ts`
- Modify: `packages/core-receipts/src/index.ts`
- Test: `packages/core-receipts/test/integrity.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

`packages/core-receipts/test/integrity.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  assertFiscalIntegrity,
  formatFiscalNumber,
  FiscalIntegrityError,
} from '../src/index.ts'
import type { FiscalFields } from '../src/index.ts'

const fiscal: FiscalFields = {
  numero: 'F-2026-000123',
  fechaLocal: '16-06-2026 13:45:00',
  emisorNif: 'B00000000',
  emisorRazon: 'ia.rest SL',
  base: 10,
  iva: 1,
  total: 11,
  huella: 'ABC123HUELLA',
  qrData: 'https://prewww2.aeat.es/QR?nif=B00000000',
}

test('formatFiscalNumber usa coma decimal y 2 decimales', () => {
  assert.equal(formatFiscalNumber(11), '11,00')
  assert.equal(formatFiscalNumber(1234.5), '1234,50')
})

test('pasa cuando todos los campos fiscales están en la salida', () => {
  const rendered = [
    'Factura F-2026-000123', 'NIF: B00000000',
    'Base 10,00', 'IVA 1,00', 'TOTAL 11,00',
    'ABC123HUELLA', 'https://prewww2.aeat.es/QR?nif=B00000000',
  ].join('\n')
  assert.doesNotThrow(() => assertFiscalIntegrity(fiscal, rendered))
})

test('falla cerrado si falta el total', () => {
  const rendered = 'Factura F-2026-000123 NIF: B00000000 Base 10,00 IVA 1,00 ABC123HUELLA https://prewww2.aeat.es/QR?nif=B00000000'
  assert.throws(() => assertFiscalIntegrity(fiscal, rendered), FiscalIntegrityError)
})

test('falla si la glosa contiene una cifra fiscal', () => {
  const rendered = [
    'Factura F-2026-000123', 'NIF: B00000000',
    'Base 10,00', 'IVA 1,00', 'TOTAL 11,00',
    'ABC123HUELLA', 'https://prewww2.aeat.es/QR?nif=B00000000',
  ].join('\n')
  const glosa = 'Gracias, su total de 11,00 le espera'
  assert.throws(() => assertFiscalIntegrity(fiscal, rendered, glosa), FiscalIntegrityError)
})

test('acepta una glosa sin cifras fiscales', () => {
  const rendered = [
    'Factura F-2026-000123', 'NIF: B00000000',
    'Base 10,00', 'IVA 1,00', 'TOTAL 11,00',
    'ABC123HUELLA', 'https://prewww2.aeat.es/QR?nif=B00000000',
  ].join('\n')
  const glosa = 'Gracias Ana, vuelve pronto a vernos'
  assert.doesNotThrow(() => assertFiscalIntegrity(fiscal, rendered, glosa))
})
```

- [ ] **Step 2: Correr para verlos fallar**

Run: `node --test packages/core-receipts/test/integrity.test.ts`
Expected: FAIL — `assertFiscalIntegrity` no existe.

- [ ] **Step 3: Implementar la guardia**

`packages/core-receipts/src/integrity.ts`:

```ts
import type { FiscalFields } from './types.ts'

export class FiscalIntegrityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FiscalIntegrityError'
  }
}

// Formatea un número fiscal tal y como aparece en el documento: coma decimal, 2 decimales.
export function formatFiscalNumber(n: number): string {
  return n.toFixed(2).replace('.', ',')
}

/**
 * Verifica que todo campo fiscal obligatorio aparece VERBATIM en `rendered`,
 * y que la región de glosa (si se pasa) no contiene ninguna de las cifras fiscales.
 * Falla cerrado: lanza FiscalIntegrityError si algo no cuadra. No emitir sin pasar esto.
 */
export function assertFiscalIntegrity(
  fiscal: FiscalFields,
  rendered: string,
  glosa?: string,
): void {
  const cifras = [
    formatFiscalNumber(fiscal.base),
    formatFiscalNumber(fiscal.iva),
    formatFiscalNumber(fiscal.total),
  ]
  const obligatorios = [fiscal.numero, fiscal.emisorNif, ...cifras]
  if (fiscal.huella) obligatorios.push(fiscal.huella)
  if (fiscal.qrData) obligatorios.push(fiscal.qrData)

  for (const valor of obligatorios) {
    if (!rendered.includes(valor)) {
      throw new FiscalIntegrityError(`Campo fiscal ausente en la salida: "${valor}"`)
    }
  }

  if (glosa) {
    for (const cifra of cifras) {
      if (glosa.includes(cifra)) {
        throw new FiscalIntegrityError(`La glosa contiene una cifra fiscal: "${cifra}"`)
      }
    }
  }
}
```

- [ ] **Step 4: Re-exportar desde el index**

Añade al final de `packages/core-receipts/src/index.ts`:

```ts
export {
  assertFiscalIntegrity,
  formatFiscalNumber,
  FiscalIntegrityError,
} from './integrity.ts'
```

- [ ] **Step 5: Correr para verlos pasar**

Run: `node --test packages/core-receipts/test/integrity.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/core-receipts/src/integrity.ts packages/core-receipts/src/index.ts packages/core-receipts/test/integrity.test.ts
git commit -m "feat(core-receipts): guardia de integridad fiscal fail-closed"
```

---

### Task 4: Migrar los generadores ESC/POS (verbatim + igualdad de bytes)

**Files:**
- Create: `packages/core-receipts/src/renderers/thermal.ts`
- Create: `packages/core-receipts/test/generate-goldens.ts`
- Create: `packages/core-receipts/test/thermal.test.ts`
- Create: `packages/core-receipts/test/fixtures/*.b64` (generados)
- Modify: `packages/core-receipts/src/index.ts`

- [ ] **Step 1: Mover los generadores verbatim al paquete**

Crea `packages/core-receipts/src/renderers/thermal.ts` **copiando textualmente** desde `apps/ia-rest/src/lib/courier.ts` estos fragmentos, en este orden, sin modificar ni una línea de su cuerpo:

1. Las constantes `ESC`, `GS`, `CMD` (courier.ts L41-56).
2. La interfaz `PrintPayload` (L24-34) — añádele `export`.
3. La función `generarEscPos` (L58-139) — ya es `export`.
4. La función `generarTextoPlano` (L141-189) — ya es `export`.
5. Las interfaces `ItemCuenta` y `TicketCuentaParams` (L621-643) — ya son `export`.
6. La función `generarTicketCuenta` (L645-734) — ya es `export`.
7. La interfaz `CuentaParams` (L764-788) — añádele `export`.
8. La función `generarEscPosCuenta` (L795-938) — ya es `export`.

Cabecera del fichero nuevo:

```ts
// ============================================================
// @central/core-receipts · renderer TÉRMICO (ESC/POS)
// Migrado verbatim desde apps/ia-rest/src/lib/courier.ts.
// NO modificar la lógica: los tests de igualdad de bytes lo protegen.
// ============================================================
```

> Importante: NO muevas `crearPrintJobs`, `crearPrintJobMarchar`, `crearPrintJobCuenta`, `resolverDestinoItem`, `horaEnRango`, `resolverSecciones`, `getNextTicketNum` ni los `import` de Supabase: usan BD y se quedan en ia-rest.

- [ ] **Step 2: Confirmar que el cuerpo es idéntico (no transcripción con erratas)**

Run:
```bash
git -C /home/user/central diff --no-index <(sed -n '62,139p' apps/ia-rest/src/lib/courier.ts) <(sed -n '/export function generarEscPos/,/^}/p' packages/core-receipts/src/renderers/thermal.ts)
```
Expected: sin diferencias en el cuerpo de `generarEscPos` (sólo podría diferir por las líneas de `export`/comentarios de cabecera). Repite la comprobación mentalmente para los otros tres generadores. Si hay diferencias de lógica, corrígelas hasta que sea verbatim.

- [ ] **Step 3: Escribir el generador de goldens**

`packages/core-receipts/test/generate-goldens.ts`:

```ts
// Genera los goldens base64 a partir de la salida ACTUAL de los generadores.
// Ejecutar una sola vez tras la migración verbatim; revisar el diff de impresión
// (ver Step 5) antes de commitear los goldens.
import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  generarEscPos, generarTextoPlano, generarTicketCuenta, generarEscPosCuenta,
} from '../src/renderers/thermal.ts'
import { FIXTURES } from './fixtures.ts'

const here = dirname(fileURLToPath(import.meta.url))
const dir = join(here, 'fixtures')
mkdirSync(dir, { recursive: true })

const out = (name: string, data: Buffer | string) => {
  const b64 = Buffer.isBuffer(data) ? data.toString('base64') : Buffer.from(data, 'utf8').toString('base64')
  writeFileSync(join(dir, `${name}.b64`), b64)
}

out('escpos-comanda', generarEscPos(FIXTURES.comanda))
out('texto-comanda', generarTextoPlano(FIXTURES.comanda))
out('ticket-cuenta', generarTicketCuenta(FIXTURES.ticketCuenta))
out('escpos-cuenta', generarEscPosCuenta(FIXTURES.cuenta))
console.log('Goldens generados en', dir)
```

- [ ] **Step 4: Definir los fixtures (payloads fijos y deterministas)**

`packages/core-receipts/test/fixtures.ts`:

```ts
import type { PrintPayload, TicketCuentaParams, CuentaParams } from '../src/renderers/thermal.ts'

// `ts`/`fecha` fijos para que la salida sea determinista (las funciones leen la hora del payload).
export const FIXTURES: {
  comanda: PrintPayload
  ticketCuenta: TicketCuentaParams
  cuenta: CuentaParams
} = {
  comanda: {
    mesa: '12',
    camarero: 'ana',
    ticket_num: 7,
    seccion: 'cocina',
    zona_nombre: 'terraza',
    nota_general: 'sin gluten',
    items: [
      { nombre: 'Croquetas', cantidad: 2, notas: 'extra crujiente', formato_nombre: 'Ración' },
      { nombre: 'Tortilla', cantidad: 1 },
    ],
    tipo: 'comanda',
    ts: '2026-06-16T13:45:00.000Z',
  },
  ticketCuenta: {
    mesa_label: 'MESA 12',
    razon_social: 'ia.rest SL',
    nif_emisor: 'B00000000',
    direccion: 'Calle Falsa 123, Sevilla',
    numero_factura: 123,
    numero_serie: 'F',
    fecha: '2026-06-16T13:45:00.000Z',
    items: [
      { nombre: 'Croquetas', cantidad: 2, precio_unit: 6, formato: 'Ración' },
      { nombre: 'Tortilla', cantidad: 1, precio_unit: 5 },
    ],
    base_imponible: 15.45,
    cuota_iva: 1.55,
    tipo_iva: 10,
    importe_total: 17,
    qr_data: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=B00000000&numserie=F123',
    primer_registro: true,
  },
  cuenta: {
    comanda_id: 'c-1',
    local_id: 'l-1',
    mesa_label: '12',
    zona_nombre: 'terraza',
    camarero_nombre: 'ana',
    numero_ticket: 7,
    restaurante_nombre: 'Bar Pepe',
    restaurante_direccion: 'Calle Falsa 123',
    nif_emisor: 'B00000000',
    razon_social: 'ia.rest SL',
    cobrado: true,
    metodo_pago: 'efectivo',
    entregado: 20,
    cambio: 3,
    items: [
      { nombre: 'Croquetas', cantidad: 2, precio_unitario: 6 },
      { nombre: 'Tortilla', cantidad: 1, precio_unitario: 5 },
    ],
    total: 17,
  },
}
```

- [ ] **Step 5: Generar los goldens e inspeccionar la impresión legible**

Run:
```bash
node packages/core-receipts/test/generate-goldens.ts
node -e "for (const f of ['escpos-comanda','texto-comanda','ticket-cuenta','escpos-cuenta']) { const b=require('fs').readFileSync('packages/core-receipts/test/fixtures/'+f+'.b64','utf8'); console.log('==== '+f+' ===='); console.log(Buffer.from(b,'base64').toString('latin1')); }"
```
Expected: ves los tickets legibles (cabeceras, items, TOTAL 17,00 EUR, "Gracias por su visita", QR como bytes de control). Confirma que coinciden con lo que ia-rest imprime hoy. Si algo se ve mal, el cuerpo migrado no es verbatim — vuelve al Step 1.

- [ ] **Step 6: Escribir el test de igualdad de bytes**

`packages/core-receipts/test/thermal.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  generarEscPos, generarTextoPlano, generarTicketCuenta, generarEscPosCuenta,
} from '../src/renderers/thermal.ts'
import { FIXTURES } from './fixtures.ts'

const here = dirname(fileURLToPath(import.meta.url))
const golden = (name: string) => readFileSync(join(here, 'fixtures', `${name}.b64`), 'utf8')
const b64 = (data: Buffer | string) =>
  Buffer.isBuffer(data) ? data.toString('base64') : Buffer.from(data, 'utf8').toString('base64')

test('generarEscPos: bytes idénticos al golden', () => {
  assert.equal(b64(generarEscPos(FIXTURES.comanda)), golden('escpos-comanda'))
})
test('generarTextoPlano: bytes idénticos al golden', () => {
  assert.equal(b64(generarTextoPlano(FIXTURES.comanda)), golden('texto-comanda'))
})
test('generarTicketCuenta: bytes idénticos al golden', () => {
  assert.equal(b64(generarTicketCuenta(FIXTURES.ticketCuenta)), golden('ticket-cuenta'))
})
test('generarEscPosCuenta: bytes idénticos al golden', () => {
  assert.equal(b64(generarEscPosCuenta(FIXTURES.cuenta)), golden('escpos-cuenta'))
})
```

- [ ] **Step 7: Re-exportar los generadores desde el index**

Añade al final de `packages/core-receipts/src/index.ts`:

```ts
export {
  generarEscPos,
  generarTextoPlano,
  generarTicketCuenta,
  generarEscPosCuenta,
} from './renderers/thermal.ts'
export type { PrintPayload, ItemCuenta, TicketCuentaParams, CuentaParams } from './renderers/thermal.ts'
```

- [ ] **Step 8: Correr todos los tests del paquete**

Run: `node --test packages/core-receipts/test/*.test.ts`
Expected: PASS (smoke 1 + types 2 + integrity 5 + thermal 4 = 12 tests).

- [ ] **Step 9: Commit**

```bash
git add packages/core-receipts/src/renderers/thermal.ts packages/core-receipts/src/index.ts packages/core-receipts/test/fixtures.ts packages/core-receipts/test/generate-goldens.ts packages/core-receipts/test/thermal.test.ts packages/core-receipts/test/fixtures/
git commit -m "feat(core-receipts): renderer térmico ESC/POS migrado con igualdad de bytes"
```

---

### Task 5: Reconectar ia-rest para consumir el paquete

**Files:**
- Modify: `apps/ia-rest/package.json`
- Modify: `apps/ia-rest/src/lib/courier.ts`

- [ ] **Step 1: Añadir la dependencia workspace**

En `apps/ia-rest/package.json`, dentro de `"dependencies"`, junto a las otras `@central/*`, añade:

```json
    "@central/core-receipts": "workspace:*",
```

- [ ] **Step 2: Borrar los generadores de courier.ts e importarlos del paquete**

En `apps/ia-rest/src/lib/courier.ts`:
- Elimina las definiciones de `ESC`, `GS`, `CMD` (L41-56), `PrintPayload` (L24-34), `generarEscPos`, `generarTextoPlano`, `ItemCuenta`, `TicketCuentaParams`, `generarTicketCuenta`, `CuentaParams`, `generarEscPosCuenta`.
- Añade el import al principio del fichero (bajo el import de Supabase existente):

```ts
import {
  generarEscPos,
  generarTextoPlano,
  generarTicketCuenta,
  generarEscPosCuenta,
} from '@central/core-receipts'
import type { PrintPayload, ItemCuenta, TicketCuentaParams, CuentaParams } from '@central/core-receipts'
```

> `crearPrintJobs`, `crearPrintJobMarchar` y `crearPrintJobCuenta` siguen llamando a `generarEscPos`/`generarTextoPlano`/`generarEscPosCuenta` exactamente igual — ahora resueltos desde el paquete. Las re-exportaciones de `TicketCuentaParams`/`ItemCuenta`/`CuentaParams` que otros módulos de ia-rest importen desde `courier.ts` siguen disponibles porque las re-exportamos en el import-type (si algún fichero las importaba con `import { TicketCuentaParams } from '@/lib/courier'`, añade `export type { PrintPayload, ItemCuenta, TicketCuentaParams, CuentaParams } from '@central/core-receipts'` en courier.ts).

- [ ] **Step 3: Localizar consumidores que importaban tipos/funciones de courier.ts**

Run:
```bash
git -C /home/user/central grep -n "from '@/lib/courier'" apps/ia-rest/src
```
Expected: lista de ficheros. Para cada uno que importe `generarEscPosCuenta`, `generarTicketCuenta`, `TicketCuentaParams`, `ItemCuenta`, `CuentaParams` o `PrintPayload`, verifica que courier.ts los re-exporta (Step 2). Si no, añade el `export type ... from '@central/core-receipts'` correspondiente en courier.ts. No cambies los imports de los consumidores (siguen apuntando a `@/lib/courier`).

- [ ] **Step 4: Instalar y verificar typecheck + build de ia-rest**

Run:
```bash
pnpm install
pnpm --filter ia-rest-app exec tsc --noEmit
```
Expected: sin errores de tipos. (El `build` real de Vercel es `next build`; el typecheck reproduce la verificación de CI "Typecheck · ia-rest".)

- [ ] **Step 5: Re-correr los tests del paquete (regresión)**

Run: `node --test packages/core-receipts/test/*.test.ts`
Expected: PASS (12 tests) — confirma que mover el consumo no alteró los generadores.

- [ ] **Step 6: Commit**

```bash
git add apps/ia-rest/package.json apps/ia-rest/src/lib/courier.ts pnpm-lock.yaml
git commit -m "refactor(ia-rest): consumir generadores ESC/POS desde @central/core-receipts"
```

---

## Fuera de esta fase (planes posteriores)

Cada uno irá en su propio plan `docs/superpowers/plans/` cuando se aborde:

- **Fase 2 — renderer HTML + adopción de `ReceiptDoc`:** plantilla HTML theme-agnostic (CSS `--brand-*`), adaptadores `getBranding` (ialimp) / `IAREST_BRAND` / `SIVRA_BRAND`, y sustitución del HTML inline en las 3 rutas de factura. Cablear `assertFiscalIntegrity` en el camino HTML. Paridad visual por snapshot (piloto ialimp en vivo).
- **Fase 3 — glosa IA (modo A) + PDF:** `GlosaProvider` con `@central/core-ai` (caché + fallback determinista), region `.glosa`, renderer PDF con `@react-pdf/renderer` para adjuntos de email. Glosa fuera del camino térmico.
- **Fase 4 — modo B experimental:** layout no-fiscal compuesto por IA en ialimp/sivra, bloqueado en ia-rest.

---

## Self-Review (hecho)

- **Cobertura del spec:** §4.1 (tipos) → Task 2; §4.5 (guardia) → Task 3; §6 punto 1 (migración ESC/POS) → Tasks 4-5. §4.2/4.3/4.4 y renderers HTML/PDF quedan explícitamente fuera de fase (planes 2-4). Sin huérfanos en el alcance declarado de Fase 1.
- **Placeholders:** ninguno; todo el código nuevo (tipos, integridad, fixtures, tests) está completo. La migración se especifica como cut-paste verbatim con rangos de línea exactos + verificación de diff (Task 4 Step 2/5) en lugar de re-transcribir 400 líneas, precisamente para no arriesgar diferencias de bytes.
- **Consistencia de tipos:** `FiscalFields`/`ReceiptDoc`/`Branding`/`GlosaProvider` definidos en Task 2 y usados igual en Tasks 3-4. `assertFiscalIntegrity(fiscal, rendered, glosa?)` y `formatFiscalNumber(n)` con firma consistente entre implementación y tests. Los nombres de los generadores (`generarEscPos`, `generarTextoPlano`, `generarTicketCuenta`, `generarEscPosCuenta`) coinciden en thermal.ts, index, tests y los imports de ia-rest.
