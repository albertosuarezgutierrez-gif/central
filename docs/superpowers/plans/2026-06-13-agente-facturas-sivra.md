# Agente de facturas de SIVRA — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agente diario en sivra que lee Gmail + Drive, archiva facturas, las imputa en `gastos`
(modo mixto con aprendizaje de recurrentes y bandeja de revisión), avisa por Telegram y pone al día 2026.

**Architecture:** Cron `/api/expenses/agent/scan` que orquesta módulos pequeños en
`lib/agente-facturas/*`. Reutiliza extracción IA, Drive script y tabla `gastos` existentes. La
bandeja = `gastos.revisado=false`. Reglas aprendidas en `gastos_reglas`. Avisos vía `lib/telegram.ts`.

**Tech Stack:** Next.js 15 App Router, TypeScript, Prisma `$queryRaw` sobre Supabase, NVIDIA NIM
(IA), `imapflow` (IMAP Gmail), Google Apps Script (Drive), Telegram Bot API, node:test.

---

## File Structure

| Fichero | Responsabilidad |
|---|---|
| `migrations/2026-06-13_agente_facturas.sql` (repo) | DDL aditiva + seed reglas alquiler |
| `apps/sivra/lib/telegram.ts` (nuevo) | `tgAlert` / `tgAlertButtons` (portado de ia-rest) |
| `apps/sivra/lib/agente-facturas/fingerprint.ts` (nuevo) | Huella de proveedor/recurrencia (PURO) |
| `apps/sivra/lib/agente-facturas/reglas.ts` (nuevo) | Match regla + score de confianza (PURO) |
| `apps/sivra/lib/agente-facturas/conciliar.ts` (nuevo) | Validar base+IVA−IRPF=total, mapear piso (PURO) |
| `apps/sivra/lib/agente-facturas/gmail.ts` (nuevo) | IMAP: candidatos, adjuntos, etiqueta |
| `apps/sivra/lib/agente-facturas/drive.ts` (nuevo) | list/get/archive vía DRIVE_SCRIPT_URL |
| `apps/sivra/lib/agente-facturas/extraer.ts` (nuevo) | Envuelve aiExtractInvoice (+IRPF) |
| `apps/sivra/lib/agente-facturas/imputar.ts` (nuevo) | Inserta en gastos + dedup + log + reglas |
| `apps/sivra/lib/agente-facturas/anomalias.ts` (nuevo) | Duplicados, importe fuera de banda, recurrente que falta |
| `apps/sivra/lib/agente-facturas/avisos.ts` (nuevo) | Telegram + email (resumen, bandeja, sin-adjunto) |
| `apps/sivra/lib/ai-client.ts` (mod) | Prompt extracción += irpf/irpf_porcentaje |
| `apps/sivra/app/api/expenses/agent/scan/route.ts` (nuevo) | Cron diario (orquestador) |
| `apps/sivra/app/api/expenses/agent/backfill/route.ts` (nuevo) | Puesta al día 2026 (dry-run + commit) |
| `apps/sivra/app/api/expenses/pendientes/route.ts` (nuevo) | GET lista pendientes |
| `apps/sivra/app/api/expenses/pendientes/[id]/route.ts` (nuevo) | PATCH aprobar / DELETE descartar |
| `apps/sivra/app/api/expenses/route.ts` (mod) | GET excluye revisado=false; POST guarda irpf/origen |
| `apps/sivra/app/(dashboard)/expenses/page.tsx` (mod) | +ALQUILER, +Personal, link a bandeja |
| `apps/sivra/app/(dashboard)/expenses/pendientes/page.tsx` (nuevo) | UI bandeja de revisión |
| `apps/sivra/scripts/drive-upload.gs` (mod) | acciones list/get/archive |
| `apps/sivra/vercel.json` (mod) | cron scan diario |
| `test/agente-facturas.test.ts` (nuevo, root) | Tests de fingerprint/reglas/conciliar |

---

## Task 1: Migración de BD (aditiva + seed)

**Files:** Create `migrations/2026-06-13_agente_facturas.sql`. Apply via Supabase.

- [ ] **Step 1: Escribir el SQL** (idempotente, aditivo — NO toca RLS/buckets):

```sql
-- gastos: columnas aditivas
ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS irpf_porcentaje numeric;
ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS origen text;
ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS fingerprint text;
ALTER TABLE public.gastos ADD COLUMN IF NOT EXISTS motivo_revision text;
CREATE INDEX IF NOT EXISTS idx_gastos_fingerprint ON public.gastos(fingerprint);
CREATE INDEX IF NOT EXISTS idx_gastos_revisado ON public.gastos(revisado);

-- reglas aprendidas
CREATE TABLE IF NOT EXISTS public.gastos_reglas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text UNIQUE NOT NULL,
  proveedor text, nif_proveedor text,
  propiedad text, categoria text,
  iva_porcentaje numeric, irpf_porcentaje numeric,
  importe_esperado numeric, importe_min numeric, importe_max numeric,
  periodicidad text DEFAULT 'mensual',
  vistas int DEFAULT 1,
  ultima_fecha date,
  activa boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- auditoría del agente
CREATE TABLE IF NOT EXISTS public.agente_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fuente text, fingerprint text, gasto_id uuid,
  decision text, confianza numeric, motivo text,
  payload jsonb,
  created_at timestamptz DEFAULT now()
);

-- seed: alquiler Kutxabank (Bustos Tavera 22) — recurrente mensual
INSERT INTO public.gastos_reglas
  (fingerprint, proveedor, nif_proveedor, propiedad, categoria, iva_porcentaje, irpf_porcentaje, importe_esperado, importe_min, importe_max, periodicidad, vistas, activa)
VALUES
  ('alquiler:bustostavera22:bajo-derecha','GUTIERREZ ALCALA, MARIA',NULL,'prop_luxury_busto','ALQUILER',21,19,309.38,300,320,'mensual',2,true),
  ('alquiler:bustostavera22:bajo-izquierda','GUTIERREZ ALCALA, MARIA',NULL,'prop_busto_reform','ALQUILER',21,19,259.16,250,270,'mensual',2,true)
ON CONFLICT (fingerprint) DO NOTHING;
```

- [ ] **Step 2: Aplicar** vía `mcp__Supabase__apply_migration` (name `agente_facturas_2026_06_13`).
- [ ] **Step 3: Verificar** con `mcp__Supabase__execute_sql`:
  `select count(*) from gastos_reglas;` → Expected: 2. Y columnas nuevas en `gastos`.
- [ ] **Step 4: Commit** `git add migrations/... && git commit -m "feat(sivra): migración agente facturas"`.

## Task 2: Lógica pura — fingerprint (TDD)

**Files:** Create `apps/sivra/lib/agente-facturas/fingerprint.ts`, `test/agente-facturas.test.ts`.

- [ ] **Step 1: Test** (en `test/agente-facturas.test.ts`):

```ts
import test from 'node:test'
import assert from 'node:assert/strict'
import { fingerprint, normalizaProveedor } from '../apps/sivra/lib/agente-facturas/fingerprint.ts'

test('fingerprint alquiler distingue piso por dirección', () => {
  const fpD = fingerprint({ proveedor: 'GUTIERREZ ALCALA, MARIA', concepto: 'BAJO Derecha BUSTOS TAVERA 22 RENTA' })
  const fpI = fingerprint({ proveedor: 'GUTIERREZ ALCALA, MARIA', concepto: 'BAJO izquierda BUSTOS TAVERA 22 RENTA' })
  assert.notEqual(fpD, fpI)
  assert.match(fpD, /derecha/)
})

test('fingerprint estable ante mayúsculas/acentos/espacios', () => {
  const a = fingerprint({ nif_proveedor: 'B-12.345.678 ', proveedor: 'Endesa Energía S.A.' })
  const b = fingerprint({ nif_proveedor: 'b12345678', proveedor: 'ENDESA  ENERGIA SA' })
  assert.equal(a, b)
})

test('normalizaProveedor quita acentos y sufijos sociales', () => {
  assert.equal(normalizaProveedor('Endesa Energía, S.A.'), 'endesa energia')
})
```

- [ ] **Step 2: Run** `node --test test/agente-facturas.test.ts` → Expected: FAIL (módulo no existe).
- [ ] **Step 3: Implementar** `fingerprint.ts` (PURO, sin imports):

```ts
// Huella estable para deduplicar e identificar gastos recurrentes.
const SUFIJOS = /\b(s\.?a\.?|s\.?l\.?u?\.?|s\.?c\.?|sociedad|limitada|anonima|energia)\b/gi

export function normalizaTexto(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
}

export function normalizaProveedor(s: string): string {
  return normalizaTexto((s || '').replace(/,/g, ' '))
    .replace(SUFIJOS, '').replace(/\s+/g, ' ').trim()
}

export function normalizaNif(s?: string | null): string {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Palabras clave que distinguen un mismo proveedor en varias propiedades.
function discriminador(concepto?: string | null): string {
  const t = normalizaTexto(concepto || '')
  const m = t.match(/\b(derecha|izquierda|bajo|1a|1b|2a|2b|atico|duplex)\b/g)
  return m ? Array.from(new Set(m)).sort().join('-') : ''
}

export function fingerprint(f: {
  nif_proveedor?: string | null
  proveedor?: string | null
  concepto?: string | null
}): string {
  const base = normalizaNif(f.nif_proveedor) || normalizaProveedor(f.proveedor || '')
  const disc = discriminador(f.concepto)
  return disc ? `${base}:${disc}` : base
}
```

- [ ] **Step 4: Run** `node --test test/agente-facturas.test.ts` → Expected: PASS.
- [ ] **Step 5: Commit** `feat(sivra): fingerprint de gastos recurrentes`.

## Task 3: Lógica pura — reglas + confianza (TDD)

**Files:** Create `apps/sivra/lib/agente-facturas/reglas.ts`. Add tests to same test file.

- [ ] **Step 1: Test**:

```ts
import { evaluar, type Regla } from '../apps/sivra/lib/agente-facturas/reglas.ts'

const reglaAlquiler: Regla = {
  fingerprint: 'gutierrez alcala maria:derecha', propiedad: 'prop_luxury_busto',
  categoria: 'ALQUILER', iva_porcentaje: 21, irpf_porcentaje: 19,
  importe_esperado: 309.38, importe_min: 300, importe_max: 320, vistas: 2, activa: true,
}

test('regla estable + importe en banda → auto (alta confianza)', () => {
  const r = evaluar({ total: 309.38, base_imponible: 303.31, iva: 63.70, irpf: 57.63 }, reglaAlquiler)
  assert.equal(r.decision, 'auto')
  assert.ok(r.confianza >= 0.8)
  assert.equal(r.propiedad, 'prop_luxury_busto')
})

test('importe fuera de banda → bandeja', () => {
  const r = evaluar({ total: 450 }, reglaAlquiler)
  assert.equal(r.decision, 'bandeja')
  assert.match(r.motivo!, /importe/i)
})

test('sin regla → bandeja', () => {
  const r = evaluar({ total: 50 }, null)
  assert.equal(r.decision, 'bandeja')
})

test('regla nueva (vistas<2) → bandeja aunque coincida', () => {
  const r = evaluar({ total: 309.38 }, { ...reglaAlquiler, vistas: 1 })
  assert.equal(r.decision, 'bandeja')
})
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implementar** `reglas.ts` (PURO):

```ts
export interface Regla {
  fingerprint: string
  propiedad?: string | null
  categoria?: string | null
  iva_porcentaje?: number | null
  irpf_porcentaje?: number | null
  importe_esperado?: number | null
  importe_min?: number | null
  importe_max?: number | null
  vistas: number
  activa: boolean
}

export interface Extraido {
  total?: number | null
  base_imponible?: number | null
  iva?: number | null
  irpf?: number | null
}

export interface Veredicto {
  decision: 'auto' | 'bandeja'
  confianza: number
  propiedad?: string | null
  categoria?: string | null
  motivo?: string
}

const MIN_VISTAS = 2

export function evaluar(g: Extraido, regla: Regla | null): Veredicto {
  if (!regla || !regla.activa)
    return { decision: 'bandeja', confianza: 0.3, motivo: 'Proveedor nuevo, sin regla aprendida' }
  if (regla.vistas < MIN_VISTAS)
    return { decision: 'bandeja', confianza: 0.5, propiedad: regla.propiedad, categoria: regla.categoria, motivo: 'Regla aún sin historial confirmado' }

  const total = Number(g.total ?? 0)
  const min = regla.importe_min ?? (regla.importe_esperado ?? total) * 0.9
  const max = regla.importe_max ?? (regla.importe_esperado ?? total) * 1.1
  if (!(total > 0) || total < min || total > max)
    return { decision: 'bandeja', confianza: 0.5, propiedad: regla.propiedad, categoria: regla.categoria, motivo: `Importe ${total}€ fuera de banda (${min}-${max})` }

  return { decision: 'auto', confianza: 0.9, propiedad: regla.propiedad, categoria: regla.categoria }
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(sivra): motor de reglas y confianza`.

## Task 4: Lógica pura — conciliar IVA/IRPF + mapeo piso (TDD)

**Files:** Create `apps/sivra/lib/agente-facturas/conciliar.ts`. Tests al mismo fichero.

- [ ] **Step 1: Test** (usa los 2 recibos reales como fixtures):

```ts
import { conciliar, mapeaPropiedadAlquiler } from '../apps/sivra/lib/agente-facturas/conciliar.ts'

test('concilia base+IVA−IRPF=total (recibo Luxury)', () => {
  const r = conciliar({ base_imponible: 303.31, iva: 63.70, irpf: 57.63, total: 309.38 })
  assert.equal(r.ok, true)
})

test('detecta descuadre', () => {
  const r = conciliar({ base_imponible: 303.31, iva: 63.70, irpf: 57.63, total: 999 })
  assert.equal(r.ok, false)
})

test('mapea Bajo Derecha→Luxury, Bajo Izquierda→Busto Reform', () => {
  assert.equal(mapeaPropiedadAlquiler('BAJO Derecha BUSTOS TAVERA 22'), 'prop_luxury_busto')
  assert.equal(mapeaPropiedadAlquiler('BAJO izquierda BUSTOS TAVERA 22'), 'prop_busto_reform')
  assert.equal(mapeaPropiedadAlquiler('otra cosa'), null)
})
```

- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implementar** `conciliar.ts` (PURO):

```ts
export function conciliar(g: { base_imponible?: number|null; iva?: number|null; irpf?: number|null; total?: number|null }, tol = 0.05) {
  const base = Number(g.base_imponible ?? 0), iva = Number(g.iva ?? 0)
  const irpf = Number(g.irpf ?? 0), total = Number(g.total ?? 0)
  if (!base && !total) return { ok: false, esperado: 0 }
  const esperado = +(base + iva - irpf).toFixed(2)
  return { ok: Math.abs(esperado - total) <= tol, esperado }
}

export function mapeaPropiedadAlquiler(texto: string): string | null {
  const t = (texto || '').toLowerCase()
  if (!t.includes('bustos tavera')) return null
  if (t.includes('derecha'))   return 'prop_luxury_busto'
  if (t.includes('izquierda')) return 'prop_busto_reform'
  return null
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(sivra): conciliación IVA/IRPF y mapeo de piso`.

## Task 5: Telegram (portado)

**Files:** Create `apps/sivra/lib/telegram.ts`.

- [ ] **Step 1:** Portar `tgAlert` y `tgAlertButtons` de `apps/ia-rest/src/lib/telegram.ts`, cambiando
  el rótulo `ia.rest` por `SIVRA`. Variables `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`. (Código completo
  en ese fichero fuente; copiar `tgAlert`, `tgAlertButtons`, `escapeHtml`.)
- [ ] **Step 2:** `npx tsc --noEmit` en sivra → sin errores nuevos.
- [ ] **Step 3: Commit** `feat(sivra): notificaciones Telegram`.

## Task 6: Extracción IA con IRPF

**Files:** Modify `apps/sivra/lib/ai-client.ts`. Create `apps/sivra/lib/agente-facturas/extraer.ts`.

- [ ] **Step 1:** En `INVOICE_SYSTEM` añadir al JSON `"irpf_porcentaje": 0` y `"irpf": 0.00`, y la
  categoría `ALQUILER` a la lista; añadir regla: "Si es un adeudo/recibo de alquiler con retención,
  rellena irpf (importe positivo retenido) e irpf_porcentaje".
- [ ] **Step 2:** `extraer.ts` exporta `extraerDesdeBuffer(buffer, mimeType, fileName)` que replica el
  pipeline de `parse-invoice/route.ts` (pdf-parse → texto → `aiExtractInvoice`; imagen → base64 →
  visión) y devuelve el objeto extraído. Reutilizable por scan/backfill sin pasar por HTTP.
- [ ] **Step 3:** `npx tsc --noEmit`. **Step 4: Commit** `feat(sivra): extracción IRPF + helper extraer`.

## Task 7: Drive — list/get/archive

**Files:** Modify `apps/sivra/scripts/drive-upload.gs`. Create `apps/sivra/lib/agente-facturas/drive.ts`.

- [ ] **Step 1:** En `.gs`, `doPost` enruta por `data.action`: `upload` (actual, normalizando a
  `fileBase64`+`fecha`), `list` (devuelve PDFs de raíz sin archivar: id, nombre), `get` (id→base64),
  `archive` (mueve fichero a subcarpeta AÑO/MES). Mantener compat con el `upload` actual.
- [ ] **Step 2:** `drive.ts` con `listNuevos()`, `getContenido(id)`, `archivar(id, fecha)`, `subir(...)`
  llamando a `DRIVE_SCRIPT_URL`. **Corrige el contrato** (script espera `fileBase64`/`fecha`, devuelve
  `url`/`fileId`).
- [ ] **Step 3:** `npx tsc --noEmit`. **Step 4: Commit** `feat(sivra): acciones Drive list/get/archive`.

## Task 8: Gmail IMAP

**Files:** Create `apps/sivra/lib/agente-facturas/gmail.ts`. Modify `apps/sivra/package.json` (`imapflow`).

- [ ] **Step 1:** Añadir dep `imapflow` (`^1.0.0`).
- [ ] **Step 2:** `gmail.ts` con:
  - `listarCandidatos({ desde, etiqueta })` → correos con adjunto PDF/imagen o keywords de factura,
    devuelve `{ uid, from, subject, fecha, adjuntos: [{nombre, mime, buffer}], sinAdjunto: bool }`.
  - `marcarProcesado(uid)` → aplica etiqueta Gmail `Facturas/Procesada` (IMAP flags/labels).
  - Conexión con `GMAIL_USER`/`GMAIL_APP_PASSWORD` (`imap.gmail.com:993`). Cierra siempre la conexión.
- [ ] **Step 3:** `npx tsc --noEmit`. **Step 4: Commit** `feat(sivra): lectura Gmail por IMAP`.

## Task 9: Imputar + anomalías + avisos

**Files:** Create `imputar.ts`, `anomalias.ts`, `avisos.ts` en `lib/agente-facturas/`.

- [ ] **Step 1:** `imputar.ts`:
  - `existeDuplicado({ fingerprint, numero_factura, fecha, total })` → consulta `gastos`.
  - `insertarGasto(datos, { revisado, origen })` → INSERT raw (incluye irpf, irpf_porcentaje,
    fingerprint, origen, confianza, motivo_revision, raw_extraction).
  - `reforzarRegla(fingerprint, datos)` → UPSERT en `gastos_reglas` (`vistas++`, banda, ultima_fecha).
  - `log(fuente, decision, ...)` → INSERT en `agente_log`.
- [ ] **Step 2:** `anomalias.ts`: `esDuplicado`, `importeFueraDeBanda(regla, total)`,
  `recurrentesQueFaltan(mes)` (reglas mensuales activas sin gasto ese mes).
- [ ] **Step 3:** `avisos.ts`: `avisaBandeja(items)`, `avisaSinAdjunto(correos)`,
  `resumen(stats)` — todos vía `tgAlert` + email (nodemailer/`@central/core-email`).
- [ ] **Step 4:** `npx tsc --noEmit`. **Step 5: Commit** `feat(sivra): imputación, anomalías y avisos`.

## Task 10: Endpoint scan (orquestador) + cron

**Files:** Create `app/api/expenses/agent/scan/route.ts`. Modify `vercel.json`.

- [ ] **Step 1:** `scan` (GET, `isCronAuthorized`): por cada candidato de Gmail y Drive → extraer →
  fingerprint → buscar regla → `evaluar` → conciliar → dedup → `insertarGasto` (revisado auto/bandeja)
  → archivar en Drive + marcar email → log. Acumula stats. Correos sin adjunto → `avisaSinAdjunto`.
  Al final → `avisaBandeja` + `resumen`. `maxDuration = 60`.
- [ ] **Step 2:** En `vercel.json` añadir `{ "path": "/api/expenses/agent/scan", "schedule": "0 6 * * *" }`.
- [ ] **Step 3:** `npx tsc --noEmit`. **Step 4: Commit** `feat(sivra): cron diario del agente de facturas`.

## Task 11: Endpoint backfill 2026

**Files:** Create `app/api/expenses/agent/backfill/route.ts`.

- [ ] **Step 1:** GET con `?dryRun=1` (cuenta y devuelve, no escribe) y `?commit=1`. Recorre emails 2026
  + PDFs de Drive (mismo pipeline que scan, en modo mixto). Además genera **alquileres** faltantes
  ene→hoy para los 2 pisos (importe fijo 309.38 / 259.16, regla seed → auto). Idempotente (dedup).
  Protegido `isCronAuthorized` (lanzamiento manual con `?secret=`). `maxDuration = 60`.
- [ ] **Step 2:** `npx tsc --noEmit`. **Step 3: Commit** `feat(sivra): backfill 2026 (dry-run + commit)`.

## Task 12: API bandeja + ajustes route gastos

**Files:** Create `app/api/expenses/pendientes/route.ts`, `.../[id]/route.ts`. Modify `app/api/expenses/route.ts`.

- [ ] **Step 1:** `route.ts` GET: añadir `AND (revisado IS DISTINCT FROM false)` para excluir pendientes
  de la lista/total. POST: guardar `irpf`, `irpf_porcentaje`, `origen='manual'`, `fingerprint`.
- [ ] **Step 2:** `pendientes/route.ts` GET → gastos con `revisado=false` (con motivo_revision, confianza).
- [ ] **Step 3:** `pendientes/[id]/route.ts` PATCH (aprobar: set `revisado=true`, opcional corrección de
  campos, `reforzarRegla`) y DELETE (descartar: borra fila).
- [ ] **Step 4:** `npx tsc --noEmit`. **Step 5: Commit** `feat(sivra): API de bandeja de revisión`.

## Task 13: UI — desplegables + página bandeja

**Files:** Modify `expenses/page.tsx`. Create `expenses/pendientes/page.tsx`.

- [ ] **Step 1:** En `page.tsx`: `CATEGORIAS` += `'ALQUILER'`; `PROPS` += `{ id:'prop_personal', name:'Personal' }`;
  un color para ALQUILER en `CAT_COLORS`; botón/aviso "🔔 N en bandeja" enlazando a `/expenses/pendientes`.
- [ ] **Step 2:** `pendientes/page.tsx`: tabla de pendientes (fetch `/api/expenses/pendientes`), cada fila
  editable (proveedor, importe, piso, categoría), botones **Aprobar** (PATCH), **Descartar** (DELETE),
  enlace al PDF, y **"Aprobar todo"**. Sigue el estilo de `expenses/page.tsx`.
- [ ] **Step 3:** `npx tsc --noEmit`. **Step 4: Commit** `feat(sivra): UI bandeja de revisión y desplegables`.

## Task 14: Verificación + memoria

- [ ] **Step 1:** `node --test test/agente-facturas.test.ts` → todos PASS.
- [ ] **Step 2:** En `apps/sivra`: `npx tsc --noEmit` (sin errores nuevos). Si hay deps, `next build`.
- [ ] **Step 3:** Actualizar `docs/CONTEXTO-SESIONES.md` (entrada arriba) con lo construido + pendientes
  de despliegue (envs Telegram, DRIVE_SCRIPT_URL, etiqueta Gmail, lanzar backfill dry-run).
- [ ] **Step 4: Commit + push** branch `claude/invoice-processing-agent-7fwjst` y abrir **PR draft**.

---

## Verificación / límites honestos

- **Verificable aquí:** migración aplicada (Supabase MCP), tests de lógica pura, `tsc`/`next build`.
- **Requiere despliegue + config del usuario (no testeable en esta sesión):** run real de IMAP/Drive
  contra cuentas reales, envío Telegram (faltan `TELEGRAM_BOT_TOKEN`/`CHAT_ID` en Vercel de sivra),
  `DRIVE_SCRIPT_URL` apuntando a la carpeta, etiqueta Gmail. El backfill se lanza **a mano en dry-run**
  primero. Esto se documenta en el PR y en CONTEXTO-SESIONES.

## Self-review

- **Cobertura del spec:** Gmail (T8), Drive+archivo (T7), extracción IVA/IRPF (T6), aprendizaje/reglas
  (T3,T9), modo mixto (T3,T10), bandeja revisado=false (T12,T13), Personal/ALQUILER (T1,T13), backfill
  (T11), avisos Telegram+email+sin-adjunto (T5,T9), anomalías/duplicados/recurrente-falta (T9),
  auditoría (T1,T9), resumen (T9,T10). Booking reuse y resumen mensual: notas para iteración (no bloquean).
- **Sin placeholders:** lógica pura con código completo; glue de I/O con contrato y firmas definidos.
- **Consistencia de tipos:** `fingerprint()`, `evaluar()/Regla/Veredicto`, `conciliar()` usados igual
  en tasks posteriores.
