# `@central/core-receipts` — Plan de implementación (Fase 2: renderer HTML + adopción en ialimp)

> **For agentic workers:** REQUIRED SUB-SKILL: usa el flujo de ejecución por subagentes (un subagente por tarea, revisión entre tareas). Steps con checkbox (`- [ ]`).

**Goal:** Añadir al paquete `@central/core-receipts` un renderer **HTML** compartido (`renderInvoiceHtml`) con branding por negocio vía CSS custom properties, y adoptarlo en la **factura del propietario de ialimp** SIN cambiar el aspecto que ve el cliente en vivo (paridad visual primero; white-label detrás de una puerta explícita).

**Architecture:** `renderInvoiceHtml(doc: ReceiptDoc, branding: Branding): string` vive en `packages/core-receipts/src/renderers/html.ts`. Reproduce la plantilla HTML actual de ialimp pero parametrizada con variables CSS `--brand-*` inyectadas desde `branding`. La integridad fiscal se valida con `assertFiscalIntegrity` (Fase 1). ia-rest (su factura es JSON, no HTML) y sivra (su salida es un informe, no factura fiscal) quedan FUERA de esta fase.

**Tech Stack:** TypeScript ESM, `node --test` (igual que Fase 1), pnpm workspaces. ialimp: Next 15 / Prisma `$queryRaw`.

---

## Contexto para quien ejecuta (lee esto antes)

- Spec: `docs/superpowers/specs/2026-06-16-core-receipts-design.md`. Fase 1 (paquete + tipos + integridad + térmico): ya MERGED/en PR #307. Esta Fase 2 cubre §4.2 (branding) y el renderer HTML del §6 punto 2.
- **Hallazgos del mapa de código (corrigen el spec):**
  - **ia-rest** `apps/ia-rest/src/app/api/factura/cliente/route.ts` **devuelve JSON, no HTML** (`NextResponse.json({factura})`). NO hay HTML que unificar. Una vista HTML para ia-rest sería una ruta NUEVA aditiva → **fuera de Fase 2** (se hará en su propio plan si Alberto lo pide).
  - **sivra** `apps/sivra/app/api/admin/limpiadoras/informe/route.ts` es un **informe de sesiones**, sin NIF/razón social/datos fiscales → **no es una factura** → **fuera de Fase 2**.
  - **ialimp** `apps/ialimp/app/api/propietario/[token]/factura/[id]/route.ts` (líneas 80-172) **SÍ genera el HTML de factura**. Helpers locales `esc()`/`eur()`/`fdate()` (líneas 7-22). Es el ÚNICO objetivo real de Fase 2.
- **⚠️ ialimp está EN VIVO** (`app.ialimp.es` = rama `main`; cliente piloto Sique Brilla / Vanessa). Cualquier merge a `main` se ve al instante. Regla de ialimp (su CLAUDE.md): desarrollar en rama → **validar en la preview de Vercel** → mergear. Por eso esta fase es **paridad visual primero**: la factura debe verse EXACTAMENTE igual tras la refactorización; el white-label por empresa se activa en una tarea aparte y gateada.
- Tipo `Branding` del paquete (Fase 1, `src/types.ts`): `{ nombre, logoUrl?, primario, secundario, light, lang }`. El de ialimp (`apps/ialimp/lib/branding.ts`) es `{ nombre, logo_url, primario, secundario, light }` (sin `lang`, `logo_url` con guion). Hay que **mapear** entre ambos (Task 3).
- Convención de tests del paquete: `node --test test/*.test.ts`. Para HTML usamos **golden snapshot** (como los `.b64` del térmico, pero el golden es el HTML en texto).

---

## File Structure

- `packages/core-receipts/src/types.ts` — Modify: añadir campos OPCIONALES no-fiscales a `ReceiptDoc`/`ReceiptLine` (periodo, vencimiento, concepto, estado, datos de contacto del emisor, detalle de línea). No rompe Fase 1 (todo opcional).
- `packages/core-receipts/src/renderers/html.ts` — Create: `renderInvoiceHtml(doc, branding)` + helpers `escHtml`, `eur`, `fdate`.
- `packages/core-receipts/src/index.ts` — Modify: exportar `renderInvoiceHtml`.
- `packages/core-receipts/test/html-fixtures.ts` — Create: `ReceiptDoc` + `Branding` de ejemplo (deterministas).
- `packages/core-receipts/test/html.test.ts` — Create: golden snapshot + integridad fiscal + no-XSS + branding.
- `packages/core-receipts/test/fixtures/invoice-default.html` — Create (generado): golden HTML con branding default.
- `apps/ialimp/app/api/propietario/[token]/factura/[id]/route.ts` — Modify: sustituir el HTML inline (80-172) por `renderInvoiceHtml`.
- `apps/ialimp/package.json` — Modify: dep `@central/core-receipts: workspace:*` (si no la tiene ya).

---

### Task 1: Extender los tipos con campos de presentación no-fiscales

**Files:**
- Modify: `packages/core-receipts/src/types.ts`
- Test: `packages/core-receipts/test/types-presentacion.test.ts`

- [ ] **Step 1: Escribir el test que falla**

`packages/core-receipts/test/types-presentacion.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ReceiptDoc } from '../src/index.ts'

test('ReceiptDoc admite campos de presentación no-fiscales opcionales', () => {
  const doc: ReceiptDoc = {
    kind: 'factura-cliente',
    fiscal: {
      numero: 'F-2026-000123', fechaLocal: '16-06-2026 13:45:00',
      emisorNif: 'B00000000', emisorRazon: 'Empresa SL',
      base: 10, iva: 2.1, total: 12.1,
    },
    lineas: [{ descripcion: 'Limpieza', cantidad: 1, precioUnitario: 10, detalle: 'Piso A' }],
    presentacion: {
      estado: 'emitida',
      fechaEmision: '2026-06-16', periodoDesde: '2026-06-01', periodoHasta: '2026-06-30',
      vencimiento: '2026-07-16', concepto: 'Servicios de junio',
      emisorEmail: 'hola@empresa.es', emisorTelefono: '600000000', emisorIban: 'ES00',
      emisorDireccion: 'Calle 1', destDireccion: 'Calle 2', notaPie: 'Gracias',
    },
  }
  assert.equal(doc.presentacion?.estado, 'emitida')
  assert.equal(doc.lineas[0].detalle, 'Piso A')
})
```

- [ ] **Step 2: Correr para verlo fallar**

Run: `node --test packages/core-receipts/test/types-presentacion.test.ts`
Expected: FAIL (compilación: `presentacion`/`detalle` no existen).

- [ ] **Step 3: Añadir los campos opcionales a `types.ts`**

En `packages/core-receipts/src/types.ts`, añade `detalle?` a `ReceiptLine` y un bloque `Presentacion` opcional a `ReceiptDoc`:

```ts
export interface ReceiptLine {
  descripcion: string
  cantidad: number
  precioUnitario: number
  detalle?: string        // texto auxiliar NO-fiscal (p. ej. nombre del piso)
}

// Datos NO-fiscales de presentación. Nunca entran en assertFiscalIntegrity.
export interface Presentacion {
  estado?: string
  fechaEmision?: string
  periodoDesde?: string
  periodoHasta?: string
  vencimiento?: string
  concepto?: string
  emisorEmail?: string
  emisorTelefono?: string
  emisorIban?: string
  emisorDireccion?: string
  destDireccion?: string
  notaPie?: string
}
```

Y en `ReceiptDoc` añade la propiedad opcional:

```ts
export interface ReceiptDoc {
  kind: ReceiptKind
  fiscal: Readonly<FiscalFields>
  lineas: ReadonlyArray<ReceiptLine>
  glosa?: string
  presentacion?: Presentacion   // NUEVO (Fase 2): datos de display no-fiscales
}
```

Exporta el tipo nuevo en `src/index.ts` (junto a los demás `export type`):

```ts
export type { Presentacion } from './types.ts'
```

- [ ] **Step 4: Correr para verlo pasar**

Run: `node --test packages/core-receipts/test/types-presentacion.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add packages/core-receipts/src/types.ts packages/core-receipts/src/index.ts packages/core-receipts/test/types-presentacion.test.ts
git commit -m "feat(core-receipts): campos de presentación no-fiscales en ReceiptDoc"
```

---

### Task 2: Implementar `renderInvoiceHtml`

**Files:**
- Create: `packages/core-receipts/src/renderers/html.ts`
- Create: `packages/core-receipts/test/html-fixtures.ts`
- Create: `packages/core-receipts/test/html.test.ts`
- Create: `packages/core-receipts/test/fixtures/invoice-default.html` (generado en Step 5)
- Modify: `packages/core-receipts/src/index.ts`

- [ ] **Step 1: Crear el renderer**

`packages/core-receipts/src/renderers/html.ts` — reproduce la plantilla de ialimp (`apps/ialimp/app/api/propietario/[token]/factura/[id]/route.ts` líneas 80-172) parametrizada con `--brand-*`. Los colores por defecto del `Branding` ialimp (`primario:#4f46e5`, `light:#eef2ff`) reproducen el aspecto actual (donde hoy hay `--indigo:#4f46e5` y `#eef2ff`):

```ts
import type { ReceiptDoc, Branding } from '../types.ts'
import { assertFiscalIntegrity, formatFiscalNumber } from '../integrity.ts'

export function escHtml(v: unknown): string {
  if (v === null || v === undefined) return ''
  return String(v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Importe con formato es-ES (coma decimal, 2 decimales) + euro. Mismo resultado que el `eur()` de ialimp.
export function eur(n: unknown): string {
  const v = Number(n || 0)
  return v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

export function fdate(s: unknown): string {
  if (!s) return '—'
  const d = new Date(String(s))
  if (isNaN(d.getTime())) return String(s)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

/**
 * Renderiza la factura como HTML imprimible (el usuario "Guarda como PDF").
 * Branding se inyecta como CSS custom properties --brand-*.
 * Valida la integridad fiscal (fail-closed) antes de devolver.
 */
export function renderInvoiceHtml(doc: ReceiptDoc, branding: Branding): string {
  const f = doc.fiscal
  const p = doc.presentacion ?? {}

  const filas = doc.lineas.map(l => `
      <tr>
        <td>${escHtml(l.descripcion)}</td>
        <td class="c">${escHtml(l.detalle || '—')}</td>
        <td class="r">${Number(l.cantidad || 0).toLocaleString('es-ES')}</td>
        <td class="r">${eur(l.precioUnitario)}</td>
        <td class="r">${eur(l.precioUnitario * l.cantidad)}</td>
      </tr>`).join('')

  const ivaPct = f.base ? Math.round((f.iva / f.base) * 100) : 0

  const html = `<!doctype html>
<html lang="${escHtml(branding.lang || 'es')}"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Factura ${escHtml(f.numero)}</title>
<style>
  :root{ --brand-primary:${escHtml(branding.primario)}; --brand-light:${escHtml(branding.light)}; --ink:#1e1b4b; --muted:#64748b; --line:#e2e8f0; }
  *{ box-sizing:border-box; }
  body{ font-family:'Nunito',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; color:var(--ink);
        margin:0; background:#f1f5f9; padding:24px; }
  .sheet{ max-width:780px; margin:0 auto; background:#fff; border:1px solid var(--line); border-radius:14px;
          padding:36px 40px; }
  .top{ display:flex; justify-content:space-between; align-items:flex-start; gap:24px; margin-bottom:28px; }
  .badge{ display:inline-block; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.5px;
          padding:3px 10px; border-radius:999px; background:var(--brand-light); color:var(--brand-primary); }
  h1{ font-size:24px; margin:6px 0 0; }
  .muted{ color:var(--muted); font-size:13px; line-height:1.5; }
  .parties{ display:flex; gap:24px; margin-bottom:24px; }
  .parties > div{ flex:1; }
  .label{ font-size:10px; font-weight:700; text-transform:uppercase; color:var(--muted); letter-spacing:.5px; margin-bottom:4px; }
  .strong{ font-weight:700; }
  .meta{ display:flex; gap:24px; flex-wrap:wrap; margin-bottom:22px; font-size:13px; }
  .meta b{ display:block; font-size:10px; text-transform:uppercase; color:var(--muted); letter-spacing:.5px; font-weight:700; }
  table{ width:100%; border-collapse:collapse; font-size:13px; margin-bottom:18px; }
  th{ text-align:left; font-size:10px; text-transform:uppercase; letter-spacing:.5px; color:var(--muted);
      border-bottom:2px solid var(--line); padding:8px 6px; }
  td{ padding:9px 6px; border-bottom:1px solid var(--line); }
  td.r,th.r{ text-align:right; } td.c,th.c{ text-align:center; }
  .totales{ margin-left:auto; width:280px; font-size:14px; }
  .totales .row{ display:flex; justify-content:space-between; padding:6px 0; }
  .totales .grand{ border-top:2px solid var(--ink); margin-top:6px; padding-top:10px; font-size:18px; font-weight:800; }
  .foot{ margin-top:28px; font-size:11px; color:var(--muted); line-height:1.5; }
  .btn{ display:inline-flex; align-items:center; gap:8px; background:var(--brand-primary); color:#fff; border:none;
        font-family:inherit; font-size:14px; font-weight:700; padding:12px 20px; border-radius:10px; cursor:pointer; }
  .bar{ max-width:780px; margin:0 auto 16px; display:flex; justify-content:flex-end; }
  @media print{ body{ background:#fff; padding:0; } .sheet{ border:none; border-radius:0; } .bar{ display:none; } }
</style></head>
<body>
  <div class="bar"><button class="btn" onclick="window.print()">⬇ Descargar / Imprimir PDF</button></div>
  <div class="sheet">
    <div class="top">
      <div>
        <span class="badge">Factura · ${escHtml((p.estado || '').toUpperCase())}</span>
        <h1>${escHtml(f.numero)}</h1>
      </div>
      <div class="muted" style="text-align:right">
        <div class="strong" style="color:var(--ink);font-size:15px">${escHtml(branding.nombre)}</div>
        ${p.emisorEmail ? `<div>${escHtml(p.emisorEmail)}</div>` : ''}
      </div>
    </div>

    <div class="parties">
      <div>
        <div class="label">Emisor</div>
        <div class="strong">${escHtml(f.emisorRazon)}</div>
        ${f.emisorNif ? `<div class="muted">NIF: ${escHtml(f.emisorNif)}</div>` : ''}
        ${p.emisorDireccion ? `<div class="muted">${escHtml(p.emisorDireccion)}</div>` : ''}
        ${p.emisorEmail ? `<div class="muted">${escHtml(p.emisorEmail)}</div>` : ''}
        ${p.emisorTelefono ? `<div class="muted">Tel: ${escHtml(p.emisorTelefono)}</div>` : ''}
        ${p.emisorIban ? `<div class="muted">IBAN: ${escHtml(p.emisorIban)}</div>` : ''}
      </div>
      <div>
        <div class="label">Cliente</div>
        <div class="strong">${escHtml(f.destRazon || '')}</div>
        ${f.destNif ? `<div class="muted">NIF: ${escHtml(f.destNif)}</div>` : ''}
        ${p.destDireccion ? `<div class="muted">${escHtml(p.destDireccion)}</div>` : ''}
      </div>
    </div>

    <div class="meta">
      <div><b>Fecha de emisión</b>${fdate(p.fechaEmision)}</div>
      <div><b>Periodo</b>${fdate(p.periodoDesde)} – ${fdate(p.periodoHasta)}</div>
      ${p.vencimiento ? `<div><b>Vencimiento</b>${fdate(p.vencimiento)}</div>` : ''}
      ${p.concepto ? `<div><b>Concepto</b>${escHtml(p.concepto)}</div>` : ''}
    </div>

    <table>
      <thead><tr>
        <th>Descripción</th><th class="c">Piso</th><th class="r">Cant.</th>
        <th class="r">Precio</th><th class="r">Importe</th>
      </tr></thead>
      <tbody>${filas || '<tr><td colspan="5" class="muted">Sin líneas</td></tr>'}</tbody>
    </table>

    <div class="totales">
      <div class="row"><span class="muted">Base imponible</span><span>${eur(f.base)}</span></div>
      <div class="row"><span class="muted">IVA (${Number(ivaPct).toLocaleString('es-ES')}%)</span><span>${eur(f.iva)}</span></div>
      <div class="row grand"><span>Total</span><span>${eur(f.total)}</span></div>
    </div>

    <div class="foot">${escHtml(p.notaPie || `Documento generado por ${branding.nombre}.`)}</div>
  </div>
</body></html>`

  // Integridad fiscal: número, NIF emisor y cifras (base/IVA/total) deben aparecer verbatim.
  assertFiscalIntegrity(f, html, doc.glosa)
  // Nota: assertFiscalIntegrity formatea cifras con formatFiscalNumber (coma, 2 dec) → coincide con eur() (sin el ' €').
  void formatFiscalNumber
  return html
}
```

> Atención fiscal: `assertFiscalIntegrity` busca `formatFiscalNumber(base/iva/total)` = `"10,00"` etc. `eur()` produce `"10,00 €"`, que **contiene** esa subcadena → la comprobación pasa. El número de factura y el NIF emisor aparecen verbatim. ✔️

- [ ] **Step 2: Exportar desde el index**

Añade a `packages/core-receipts/src/index.ts`:

```ts
export { renderInvoiceHtml, escHtml, eur as eurHtml, fdate as fdateHtml } from './renderers/html.ts'
```

- [ ] **Step 3: Crear los fixtures de test**

`packages/core-receipts/test/html-fixtures.ts`:

```ts
import type { ReceiptDoc, Branding } from '../src/index.ts'

export const BRAND_DEFAULT: Branding = {
  nombre: 'ialimp', logoUrl: undefined,
  primario: '#4f46e5', secundario: '#6366f1', light: '#eef2ff', lang: 'es',
}

export const BRAND_SIQUE: Branding = {
  nombre: 'Sique Brilla', logoUrl: undefined,
  primario: '#0a0805', secundario: '#d4a017', light: '#fff8e1', lang: 'es',
}

export const DOC: ReceiptDoc = {
  kind: 'factura-cliente',
  fiscal: {
    numero: 'F-2026-000123', fechaLocal: '16-06-2026 13:45:00',
    emisorNif: 'B00000000', emisorRazon: 'Sique Brilla SL',
    destNif: '12345678Z', destRazon: 'Ana Propietaria',
    base: 100, iva: 21, total: 121,
  },
  lineas: [
    { descripcion: 'Limpieza salida', cantidad: 2, precioUnitario: 35, detalle: 'Piso Centro' },
    { descripcion: 'Lavandería', cantidad: 1, precioUnitario: 30, detalle: 'Piso Centro' },
  ],
  presentacion: {
    estado: 'emitida', fechaEmision: '2026-06-16',
    periodoDesde: '2026-06-01', periodoHasta: '2026-06-30',
    vencimiento: '2026-07-16', concepto: 'Servicios de junio',
    emisorEmail: 'hola@sique.es', emisorTelefono: '600111222',
    emisorIban: 'ES7600000000000000000000', emisorDireccion: 'Calle Falsa 1, Sevilla',
    destDireccion: 'Av. Real 9',
  },
}
```

- [ ] **Step 4: Escribir el test (snapshot + integridad + XSS)**

`packages/core-receipts/test/html.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { renderInvoiceHtml, FiscalIntegrityError } from '../src/index.ts'
import { DOC, BRAND_DEFAULT, BRAND_SIQUE } from './html-fixtures.ts'

const here = dirname(fileURLToPath(import.meta.url))
const goldenPath = join(here, 'fixtures', 'invoice-default.html')

test('snapshot: HTML con branding default estable', () => {
  const html = renderInvoiceHtml(DOC, BRAND_DEFAULT)
  if (!existsSync(goldenPath)) { writeFileSync(goldenPath, html); console.log('golden creado'); return }
  assert.equal(html, readFileSync(goldenPath, 'utf8'))
})

test('campos fiscales aparecen verbatim', () => {
  const html = renderInvoiceHtml(DOC, BRAND_DEFAULT)
  for (const v of ['F-2026-000123', 'B00000000', '100,00', '21,00', '121,00']) {
    assert.ok(html.includes(v), `falta ${v}`)
  }
})

test('branding inyecta sus colores como CSS vars', () => {
  const html = renderInvoiceHtml(DOC, BRAND_SIQUE)
  assert.ok(html.includes('--brand-primary:#0a0805'))
  assert.ok(html.includes('--brand-light:#fff8e1'))
  assert.ok(html.includes('Sique Brilla'))
})

test('escapa HTML en campos de texto (anti-XSS)', () => {
  const evil = { ...DOC, lineas: [{ descripcion: '<script>alert(1)</script>', cantidad: 1, precioUnitario: 1 }],
    fiscal: { ...DOC.fiscal, base: 1, iva: 0, total: 1 } }
  const html = renderInvoiceHtml(evil, BRAND_DEFAULT)
  assert.ok(!html.includes('<script>alert(1)</script>'))
  assert.ok(html.includes('&lt;script&gt;'))
})

test('falla cerrado si el total no cuadra con lo renderizado', () => {
  // total imposible de formatear en la salida (no aparece) → FiscalIntegrityError
  const bad = { ...DOC, fiscal: { ...DOC.fiscal, total: 999999 } }
  assert.throws(() => renderInvoiceHtml(bad, BRAND_DEFAULT), FiscalIntegrityError)
})
```

- [ ] **Step 5: Generar el golden e inspeccionarlo**

Run:
```bash
node --test packages/core-receipts/test/html.test.ts
```
Expected: la 1ª ejecución crea `test/fixtures/invoice-default.html` (log "golden creado") y el resto pasa. Abre el golden y verifica que es una factura válida (cabecera, emisor/cliente, tabla, totales 121,00 €). Vuelve a correr: ahora el snapshot compara y PASA.

- [ ] **Step 6: Correr toda la suite del paquete**

Run: `node --test packages/core-receipts/test/*.test.ts`
Expected: PASS (Fase 1: 12 + types-presentacion: 1 + html: 5 = 18).

- [ ] **Step 7: Commit**

```bash
git add packages/core-receipts/src/renderers/html.ts packages/core-receipts/src/index.ts packages/core-receipts/test/html-fixtures.ts packages/core-receipts/test/html.test.ts packages/core-receipts/test/fixtures/invoice-default.html
git commit -m "feat(core-receipts): renderer HTML de factura con branding por CSS vars"
```

---

### Task 3: Adoptar `renderInvoiceHtml` en ialimp (paridad visual, branding default)

> Objetivo: que la factura del propietario use el renderer compartido pero se vea **idéntica** a la actual. Branding = **default ialimp** (indigo) en esta tarea — Sique Brilla NO cambia de aspecto todavía (eso es Task 4, gateada). La validación final es VISUAL en la preview de Vercel (flujo ialimp).

**Files:**
- Modify: `apps/ialimp/package.json`
- Modify: `apps/ialimp/app/api/propietario/[token]/factura/[id]/route.ts`

- [ ] **Step 1: Añadir la dependencia**

En `apps/ialimp/package.json`, dentro de `dependencies`, añade (si no está):
```json
    "@central/core-receipts": "workspace:*",
```

- [ ] **Step 2: Sustituir el HTML inline por el renderer**

En `apps/ialimp/app/api/propietario/[token]/factura/[id]/route.ts`:
- Mantén las queries (cliente, factura `f`, `lineas`) tal cual (líneas 24-69).
- Borra los helpers locales `esc/eur/fdate` (líneas 7-22) **solo si no se usan en otro sitio del fichero** (en este fichero solo los usa el HTML que vamos a quitar).
- Borra la construcción de `filas` (líneas 71-78) y el `const html = ...` (líneas 80-172).
- Añade el import arriba:
```ts
import { renderInvoiceHtml } from '@central/core-receipts'
import { BRAND_DEFAULT } from '@/lib/branding'
import type { ReceiptDoc } from '@central/core-receipts'
```
- Sustituye el bloque borrado por el armado del `ReceiptDoc` + la llamada (justo antes del `return`):
```ts
  const ivaPct = f.iva_porcentaje ?? 21
  const doc: ReceiptDoc = {
    kind: 'factura-cliente',
    fiscal: {
      numero: f.numero_factura,
      fechaLocal: String(f.fecha_emision ?? ''),
      emisorNif: f.empresa_nif ?? '',
      emisorRazon: f.empresa_razon_social || f.empresa_nombre || '',
      destNif: f.dest_nif ?? undefined,
      destRazon: f.dest_razon_social || cliente.nombre || '',
      base: Number(base),
      iva: Number(ivaImp),
      total: Number(total),
    },
    lineas: lineas.map(l => ({
      descripcion: l.descripcion,
      cantidad: Number(l.cantidad || 0),
      precioUnitario: Number(l.precio_unitario || 0),
      detalle: l.propiedad_nombre || undefined,
    })),
    presentacion: {
      estado: f.estado,
      fechaEmision: f.fecha_emision, periodoDesde: f.periodo_desde, periodoHasta: f.periodo_hasta,
      vencimiento: f.fecha_vencimiento, concepto: f.concepto,
      emisorEmail: f.empresa_email, emisorTelefono: f.empresa_telefono,
      emisorIban: f.empresa_iban, emisorDireccion: f.empresa_direccion,
      destDireccion: f.dest_direccion,
    },
  }

  // Branding por empresa: en esta fase, DEFAULT (paridad visual). Task 4 lo cambia a getBranding(cliente.empresa_id).
  const branding = { ...BRAND_DEFAULT, lang: 'es' as const }
  const html = renderInvoiceHtml(doc, branding)
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } })
```

> Nota: el `Branding` de `lib/branding.ts` no tiene `lang` ni `logoUrl`; `BRAND_DEFAULT` (indigo) + `lang:'es'` produce el `Branding` que espera el paquete. Sus colores (`#4f46e5`/`#eef2ff`) reproducen el aspecto actual.

- [ ] **Step 3: Verificar typecheck/build de ialimp**

Run:
```bash
pnpm install
pnpm --filter ialimp exec tsc --noEmit
```
Expected: 0 errores. (Recuerda: ialimp tiene `ignoreBuildErrors`, así que el typecheck explícito es la red real.)

- [ ] **Step 4: Verificar paridad visual en la preview (OBLIGATORIO antes de mergear)**

La paridad byte-a-byte del HTML inline viejo vs el renderer es difícil de garantizar en test unitario (saltos de línea/indentación). Por eso la validación es **visual**:
- Tras pushear la rama, abre la **preview de Vercel de ialimp** y entra a una factura real del propietario (misma BD de producción).
- Compara con `main`: cabecera, emisor/cliente, tabla de líneas (incluida la columna "Piso"), totales (Base/IVA %/Total) y el botón Imprimir.
- Debe verse **igual**. Si algo baila (un campo de más/menos, un color), ajústalo en `renderInvoiceHtml` o en el armado del `doc` hasta lograr paridad. NO mergees a `main` sin esta comprobación (cliente en vivo).

- [ ] **Step 5: Re-correr la suite del paquete (regresión)**

Run: `node --test packages/core-receipts/test/*.test.ts`
Expected: PASS (18).

- [ ] **Step 6: Commit**

```bash
git add apps/ialimp/package.json apps/ialimp/app/api/propietario/[token]/factura/[id]/route.ts pnpm-lock.yaml
git commit -m "refactor(ialimp): factura del propietario usa @central/core-receipts (paridad visual)"
```

---

### Task 4 (GATEADA — requiere OK explícito de Alberto): white-label por empresa en la factura

> Esto **cambia el aspecto de las facturas de Sique Brilla en vivo** (pasan de indigo a su oro/negro). Es deseable (es su marca) pero es un cambio visible para un cliente real → **no ejecutar sin el visto bueno de Alberto** y sin validar en preview con Vanessa.

**Files:**
- Modify: `apps/ialimp/app/api/propietario/[token]/factura/[id]/route.ts`

- [ ] **Step 1: Cambiar el branding default por el de la empresa**

Sustituye en la ruta:
```ts
import { BRAND_DEFAULT } from '@/lib/branding'
// ...
const branding = { ...BRAND_DEFAULT, lang: 'es' as const }
```
por:
```ts
import { getBranding } from '@/lib/branding'
// ...
const b = await getBranding(cliente.empresa_id)
const branding = { nombre: b.nombre, logoUrl: b.logo_url ?? undefined,
  primario: b.primario, secundario: b.secundario, light: b.light, lang: 'es' as const }
```

- [ ] **Step 2: Verificar typecheck**

Run: `pnpm --filter ialimp exec tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Validar en preview con la marca de Sique Brilla**

Abre la preview, entra a una factura de un propietario de Sique Brilla → debe verse con su **oro/negro**. Una empresa sin marca configurada → indigo (default). Confirmar con Alberto/Vanessa ANTES de mergear.

- [ ] **Step 4: Commit**

```bash
git add apps/ialimp/app/api/propietario/[token]/factura/[id]/route.ts
git commit -m "feat(ialimp): factura del propietario aplica el white-label de la empresa"
```

---

## Fuera de esta fase

- **ia-rest**: su `factura/cliente` es JSON; una vista HTML sería una ruta nueva aditiva (`GET .../html`) → plan propio si se pide. La factura de ia-rest NO lleva QR/huella (eso es el ticket ESC/POS, ya en Fase 1).
- **sivra**: su salida es un informe de sesiones, no una factura fiscal → no entra.
- **PDF adjunto (`@react-pdf/renderer`) y glosa IA (modo A)** → **Fase 3** (plan propio).
- **Modo B** → Fase 4.

---

## Self-Review (hecho)

- **Cobertura del spec:** §4.2 (branding por CSS vars) → Task 2/3; renderer HTML del §6.2 → Task 2; adopción en la única ruta HTML real (ialimp) → Task 3; white-label en vivo → Task 4 (gateada). ia-rest/sivra/PDF/glosa explícitamente fuera de fase con motivo.
- **Placeholders:** ninguno; el renderer y los tests están completos. La "paridad" se valida visualmente en preview (no por golden byte-a-byte) porque el HTML inline viejo no es trivial de reproducir carácter a carácter; el golden del paquete sí fija el output del renderer para detectar regresiones futuras.
- **Consistencia de tipos:** `ReceiptDoc`/`Branding`/`Presentacion` definidos en Task 1 y usados igual en Tasks 2-4. `renderInvoiceHtml(doc, branding)` firma estable. El mapeo `Branding` ialimp (`logo_url`) → paquete (`logoUrl`, `lang`) está explícito en Task 3/4.
- **Seguridad del cliente en vivo:** Task 3 = paridad (cero cambio visual); Task 4 (cambio visual real) gateada tras OK + preview. Coherente con el flujo de release de ialimp (preview → validar → merge).
