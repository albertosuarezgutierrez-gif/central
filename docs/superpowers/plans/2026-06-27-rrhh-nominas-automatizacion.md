# Automatización de Nóminas (iarrhh) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir cálculo, generación y firma digital de nóminas en `apps/rrhh`, con el motor de cálculo extraído como `@central/module-nominas` (puro, npm-publishable).

**Architecture:** `packages/module-nominas` contiene la lógica pura de cálculo SS+IRPF+neto sin dependencias externas. `apps/rrhh` lo consume para generar borradores (cron día 25), permitir al responsable revisar y añadir incidencias, confirmar generando PDF, y solicitar firma digital al empleado con el módulo de firma existente (eIDAS).

**Tech Stack:** TypeScript puro (module-nominas), Prisma + Supabase (rrhh DB, schema `rrhh`), `@react-pdf/renderer` (PDF), Next.js 15 App Router (pages/API), Vercel Cron (automatización), módulo de firma existente (`@central/core-firma` + `lib/firma.ts`).

---

## Mapa de archivos

### Nuevos en `packages/module-nominas/`
| archivo | responsabilidad |
|---|---|
| `package.json` | configuración del paquete |
| `tsconfig.json` | config TS del paquete |
| `src/tipos.ts` | todos los tipos exportados |
| `src/tablas-2026.ts` | bases SS, tipos de cotización, SMI para 2026 |
| `src/at-ep.ts` | tabla estática AT/EP por código CNAE |
| `src/calcular.ts` | `calcularNomina()` — función principal |
| `src/calcular.test.ts` | tests unitarios del motor |
| `src/index.ts` | re-exports públicos |

### Nuevos en `apps/rrhh/`
| archivo | responsabilidad |
|---|---|
| `prisma/migrations/0015_nominas_cnae.sql` | columnas CNAE + at_ep en empresas |
| `prisma/migrations/0016_contratos_laborales.sql` | tabla contratos_laborales |
| `prisma/migrations/0017_nominas_incidencias.sql` | tablas nominas + incidencias_mes |
| `lib/contratos.ts` | CRUD contratos_laborales |
| `lib/contratos.test.ts` | tests CRUD contratos |
| `lib/nominas.ts` | CRUD nóminas, generación borradores, confirmación |
| `lib/nominas.test.ts` | tests nóminas |
| `lib/nomina-pdf.tsx` | generación PDF con @react-pdf/renderer |
| `lib/at-ep-agente.ts` | resolver AT/EP por CNAE (tabla estática + fallback IA) |
| `app/api/admin/contratos/[empleadoId]/route.ts` | GET/POST contrato activo |
| `app/api/admin/nominas/[periodo]/route.ts` | GET nóminas del período |
| `app/api/admin/nominas/generar/route.ts` | POST generar borradores |
| `app/api/admin/nominas/[nominaId]/incidencias/route.ts` | POST añadir incidencia |
| `app/api/admin/nominas/[nominaId]/incidencias/[incId]/route.ts` | DELETE incidencia |
| `app/api/admin/nominas/[nominaId]/confirmar/route.ts` | POST confirmar + PDF + firma |
| `app/api/cron/nominas/route.ts` | Vercel Cron (CRON_SECRET) |
| `app/admin/nominas/page.tsx` | panel listado de períodos |
| `app/admin/nominas/[periodo]/page.tsx` | detalle nóminas del mes |
| `app/admin/empleados/[id]/contrato/page.tsx` | gestión contrato del empleado |

### Modificados
| archivo | cambio |
|---|---|
| `apps/rrhh/prisma/schema.prisma` | +3 modelos + 2 campos en empresas |
| `apps/rrhh/package.json` | +`@central/module-nominas` +`@react-pdf/renderer` |
| `apps/rrhh/next.config.ts` | +`@central/module-nominas` en transpilePackages |
| `apps/rrhh/vercel.json` | +crons config |
| `apps/rrhh/app/admin/empleados/[id]/page.tsx` | +enlace a /contrato |

---

## Task 1: Paquete `packages/module-nominas` — scaffold + tipos

**Files:**
- Create: `packages/module-nominas/package.json`
- Create: `packages/module-nominas/tsconfig.json`
- Create: `packages/module-nominas/src/tipos.ts`
- Create: `packages/module-nominas/src/index.ts`

- [ ] **Step 1: Crear `packages/module-nominas/package.json`**

```json
{
  "name": "@central/module-nominas",
  "version": "0.1.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5",
    "vitest": "^3.2.6 <4.0.0"
  }
}
```

- [ ] **Step 2: Crear `packages/module-nominas/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Crear `packages/module-nominas/src/tipos.ts`**

```typescript
export type GrupoCotizacion = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11
export type TipoContrato = 'indefinido' | 'temporal' | 'parcial'
export type TipoIncidencia =
  | 'horas_extra'
  | 'ausencia_injustificada'
  | 'plus_puntual'
  | 'descuento'
  | 'baja_it'
  | 'vacaciones'

export interface ConceptoSalarial {
  nombre: string
  importe: number // euros
}

export interface ContratoLaboral {
  tipoContrato: TipoContrato
  jornadaPct: number          // 100 = jornada completa
  salarioBase: number         // bruto mensual para jornada completa
  grupoCotizacion: GrupoCotizacion
  irpfRetencionPct: number    // % acordado (Modelo 145), ej. 15.5
  conceptosFijos: ConceptoSalarial[]
}

export interface IncidenciaMes {
  tipo: TipoIncidencia
  concepto: string
  importe?: number   // euros (plus_puntual, descuento)
  horas?: number     // horas extra
  dias?: number      // días de baja/ausencia
}

export interface TiposCotizacion {
  contingencias_comunes: { empresa: number; trabajador: number }
  desempleo_indefinido:  { empresa: number; trabajador: number }
  desempleo_temporal:    { empresa: number; trabajador: number }
  fogasa: number
  fp:     { empresa: number; trabajador: number }
  at_ep:  number // específico por CNAE de la empresa
}

export interface BaseCotizacion {
  min: number // euros/mes (grupos 1-7) o euros/día (grupos 8-11)
  max: number
}

export interface TablasCotizacion {
  año: number
  bases: Record<GrupoCotizacion, BaseCotizacion>
  tipos: TiposCotizacion
  smi: number        // salario mínimo interprofesional mensual
  diasLaborablesMes: number // días laborables del mes (para proporcionar bajas/ausencias)
}

export interface DevengoLinea {
  concepto: string
  importe: number
}

export interface Devengos {
  salarioBase: number
  complementosFijos: DevengoLinea[]
  horasExtra: number
  pluses: DevengoLinea[]
  descuentos: number    // importe total de deducciones salariales (positivo)
  total: number         // total devengado bruto
}

export interface DeduccionesEmpleado {
  contingencias_comunes: number
  desempleo: number
  fp: number
  irpf: number
  total: number
}

export interface CuotaPatronal {
  contingencias_comunes: number
  desempleo: number
  fogasa: number
  fp: number
  at_ep: number
  total: number
}

export interface NominaDesglose {
  periodo: string           // "2026-06"
  devengos: Devengos
  baseCotizacion: number
  baseIrpf: number
  deducciones: DeduccionesEmpleado
  netoAPagar: number
  cuotaPatronal: CuotaPatronal
  costeTotalEmpresa: number // devengos.total + cuotaPatronal.total
}
```

- [ ] **Step 4: Crear `packages/module-nominas/src/index.ts`** (vacío por ahora, se rellena en Task 4)

```typescript
export * from './tipos'
export * from './tablas-2026'
export * from './at-ep'
export { calcularNomina } from './calcular'
```

- [ ] **Step 5: Commit**

```bash
git add packages/module-nominas/
git commit -m "feat(module-nominas): scaffold paquete + tipos TS"
```

---

## Task 2: Tablas SS 2026 y tabla AT/EP por CNAE

**Files:**
- Create: `packages/module-nominas/src/tablas-2026.ts`
- Create: `packages/module-nominas/src/at-ep.ts`

- [ ] **Step 1: Crear `packages/module-nominas/src/tablas-2026.ts`**

```typescript
import type { TablasCotizacion, GrupoCotizacion, BaseCotizacion } from './tipos'

// Bases de cotización SS 2026 (BOE — actualizar cada año con nueva LPGE)
// Grupos 1-7: euros/mes. Grupos 8-11: euros/día.
const BASES_2026: Record<GrupoCotizacion, BaseCotizacion> = {
  1:  { min: 1847.40, max: 4909.50 },
  2:  { min: 1531.80, max: 4909.50 },
  3:  { min: 1332.90, max: 4909.50 },
  4:  { min: 1184.10, max: 4909.50 },
  5:  { min: 1184.10, max: 4909.50 },
  6:  { min: 1184.10, max: 4909.50 },
  7:  { min: 1184.10, max: 4909.50 },
  8:  { min:   39.47, max:  163.65 }, // diario
  9:  { min:   39.47, max:  163.65 },
  10: { min:   39.47, max:  163.65 },
  11: { min:   39.47, max:  163.65 },
}

/**
 * Devuelve las TablasCotizacion para 2026 con el tipo AT/EP específico de la empresa.
 * El parámetro atEp viene de rrhh.empresas.at_ep_tipo (resuelto por CNAE via at-ep-agente).
 */
export function tablas2026(atEp: number, diasLaborablesMes = 22): TablasCotizacion {
  return {
    año: 2026,
    bases: BASES_2026,
    tipos: {
      contingencias_comunes: { empresa: 0.236, trabajador: 0.047 },
      desempleo_indefinido:  { empresa: 0.055, trabajador: 0.0155 },
      desempleo_temporal:    { empresa: 0.067, trabajador: 0.016 },
      fogasa: 0.002,
      fp:     { empresa: 0.006, trabajador: 0.001 },
      at_ep:  atEp,
    },
    smi: 1184.10,
    diasLaborablesMes,
  }
}
```

- [ ] **Step 2: Crear `packages/module-nominas/src/at-ep.ts`**

```typescript
// Tabla de tipos de cotización AT/EP por código CNAE.
// Fuente: Tarifa de primas (art. 19 LGSS) — Real Decreto vigente.
// Actualizar anualmente. Si el CNAE no está en la tabla, usar atEpFallback().

const TABLA_AT_EP: Record<string, number> = {
  // Hostelería
  '5510': 0.0240, // hoteles
  '5520': 0.0240, // alojamientos turísticos y de corta estancia
  '5530': 0.0240, // cámpings y aparcamientos de caravanas
  '5590': 0.0240, // otros alojamientos
  '5610': 0.0255, // restaurantes y puestos de comidas
  '5621': 0.0255, // provisión de comidas preparadas para eventos
  '5629': 0.0255, // otros servicios de comidas
  '5630': 0.0255, // establecimientos de bebidas
  // Limpieza
  '8121': 0.0350, // limpieza general de edificios
  '8122': 0.0350, // otras actividades de limpieza industrial y de edificios
  '8129': 0.0350, // otras actividades de limpieza
  '8130': 0.0450, // actividades de jardinería
  // Comercio
  '4711': 0.0150, // comercio al por menor en establecimientos no especializados
  '4719': 0.0150, // otro comercio al por menor
  '4721': 0.0150, // comercio al por menor de frutas y hortalizas
  '4724': 0.0150, // comercio al por menor de pan, pastelería, confitería
  // Administración / Oficinas
  '6820': 0.0075, // alquiler de bienes inmobiliarios por cuenta propia
  '6831': 0.0075, // agentes de la propiedad inmobiliaria
  '6832': 0.0075, // gestión y administración de la propiedad inmobiliaria
  '6910': 0.0075, // actividades jurídicas
  '6920': 0.0075, // actividades de contabilidad, teneduría de libros
  '7010': 0.0075, // actividades de las sedes centrales
  '7022': 0.0075, // otras actividades de consultoría de gestión empresarial
  // Construcción
  '4110': 0.0570, // promoción inmobiliaria
  '4120': 0.0570, // construcción de edificios residenciales
  '4321': 0.0570, // instalaciones eléctricas
  '4322': 0.0570, // fontanería, instalaciones de sistemas de calefacción
  '4399': 0.0570, // otras actividades de construcción especializada
  // Transporte
  '4931': 0.0310, // transporte terrestre urbano y suburbano de pasajeros
  '4932': 0.0310, // transporte por taxi
  '4941': 0.0310, // transporte de mercancías por carretera
  '5223': 0.0310, // actividades anexas al transporte aéreo
}

/** Tipo AT/EP para un CNAE. Devuelve undefined si no está en la tabla. */
export function atEpPorCnae(cnae: string): number | undefined {
  // Buscar exacto primero, luego por los 3 primeros dígitos
  return TABLA_AT_EP[cnae] ?? TABLA_AT_EP[cnae.slice(0, 3)]
}
```

- [ ] **Step 3: Commit**

```bash
git add packages/module-nominas/src/tablas-2026.ts packages/module-nominas/src/at-ep.ts
git commit -m "feat(module-nominas): tablas SS 2026 y AT/EP por CNAE"
```

---

## Task 3: Motor de cálculo `calcularNomina()` con tests

**Files:**
- Create: `packages/module-nominas/src/calcular.ts`
- Create: `packages/module-nominas/src/calcular.test.ts`

- [ ] **Step 1: Escribir el test primero**

Crear `packages/module-nominas/src/calcular.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { calcularNomina } from './calcular'
import { tablas2026 } from './tablas-2026'
import type { ContratoLaboral, IncidenciaMes } from './tipos'

const TABLAS = tablas2026(0.025, 22) // AT/EP hostelería, 22 días laborables

const CONTRATO_BASE: ContratoLaboral = {
  tipoContrato: 'indefinido',
  jornadaPct: 100,
  salarioBase: 1800,
  grupoCotizacion: 7,
  irpfRetencionPct: 10,
  conceptosFijos: [],
}

describe('calcularNomina', () => {
  it('calcula neto básico sin incidencias', () => {
    const r = calcularNomina(CONTRATO_BASE, [], TABLAS, '2026-06')
    expect(r.devengos.total).toBe(1800)
    // Deducciones: SS 4.70%+1.55%+0.10%=6.35% de base + IRPF 10%
    const ss = Math.round(1800 * 0.0635 * 100) / 100
    const irpf = Math.round(1800 * 0.10 * 100) / 100
    expect(r.deducciones.total).toBeCloseTo(ss + irpf, 1)
    expect(r.netoAPagar).toBeCloseTo(1800 - ss - irpf, 1)
  })

  it('aplica jornada parcial al salario base', () => {
    const contrato = { ...CONTRATO_BASE, jornadaPct: 50 }
    const r = calcularNomina(contrato, [], TABLAS, '2026-06')
    expect(r.devengos.salarioBase).toBeCloseTo(900, 1)
  })

  it('añade horas extra al devengo', () => {
    const incidencias: IncidenciaMes[] = [
      { tipo: 'horas_extra', concepto: 'Horas extra junio', horas: 8 },
    ]
    const r = calcularNomina(CONTRATO_BASE, incidencias, TABLAS, '2026-06')
    // €/hora = 1800 / 160
    const precioHora = 1800 / 160
    expect(r.devengos.horasExtra).toBeCloseTo(precioHora * 8, 1)
    expect(r.devengos.total).toBeGreaterThan(1800)
  })

  it('descuenta días de baja IT', () => {
    const incidencias: IncidenciaMes[] = [
      { tipo: 'baja_it', concepto: 'Baja médica', dias: 5 },
    ]
    const r = calcularNomina(CONTRATO_BASE, incidencias, TABLAS, '2026-06')
    // 5 de 22 días laborables
    const descuento = (1800 / 22) * 5
    expect(r.devengos.descuentos).toBeCloseTo(descuento, 1)
    expect(r.devengos.total).toBeLessThan(1800)
  })

  it('aplica base mínima SS si salario < mínimo del grupo', () => {
    const contrato = { ...CONTRATO_BASE, salarioBase: 500, grupoCotizacion: 7 as const }
    const r = calcularNomina(contrato, [], TABLAS, '2026-06')
    // Base mínima grupo 7 = 1184.10
    expect(r.baseCotizacion).toBe(1184.10)
  })

  it('calcula cuota patronal correctamente', () => {
    const r = calcularNomina(CONTRATO_BASE, [], TABLAS, '2026-06')
    // base = 1800 (dentro de rango grupo 7)
    expect(r.cuotaPatronal.contingencias_comunes).toBeCloseTo(1800 * 0.236, 1)
    expect(r.cuotaPatronal.at_ep).toBeCloseTo(1800 * 0.025, 1)
    expect(r.costeTotalEmpresa).toBeCloseTo(1800 + r.cuotaPatronal.total, 1)
  })

  it('añade complementos fijos al devengo', () => {
    const contrato = {
      ...CONTRATO_BASE,
      conceptosFijos: [
        { nombre: 'Plus transporte', importe: 50 },
        { nombre: 'Plus productividad', importe: 100 },
      ],
    }
    const r = calcularNomina(contrato, [], TABLAS, '2026-06')
    expect(r.devengos.total).toBeCloseTo(1800 + 150, 1)
    expect(r.devengos.complementosFijos).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Ejecutar el test — debe fallar**

```bash
cd packages/module-nominas && npx vitest run src/calcular.test.ts
```

Expected: Error — `calcular.ts` no existe todavía.

- [ ] **Step 3: Implementar `packages/module-nominas/src/calcular.ts`**

```typescript
import type {
  ContratoLaboral,
  IncidenciaMes,
  TablasCotizacion,
  NominaDesglose,
  Devengos,
  DeduccionesEmpleado,
  CuotaPatronal,
} from './tipos'

function r2(n: number): number {
  return Math.round(n * 100) / 100
}

export function calcularNomina(
  contrato: ContratoLaboral,
  incidencias: IncidenciaMes[],
  tablas: TablasCotizacion,
  periodo: string,
): NominaDesglose {
  const { tipoContrato, jornadaPct, salarioBase, grupoCotizacion, irpfRetencionPct, conceptosFijos } = contrato

  // 1. Salario base proporcional a jornada
  const salarioEfectivo = r2(salarioBase * (jornadaPct / 100))

  // 2. Complementos fijos
  const complementosFijos = conceptosFijos.map(c => ({ concepto: c.nombre, importe: r2(c.importe) }))
  const totalComplementos = r2(complementosFijos.reduce((s, c) => s + c.importe, 0))

  // 3. Horas extra
  const precioHora = r2(salarioBase / 160) // 160h/mes jornada completa
  const horasExtra = r2(
    incidencias
      .filter(i => i.tipo === 'horas_extra')
      .reduce((s, i) => s + (i.horas ?? 0) * precioHora, 0)
  )

  // 4. Pluses puntuales
  const pluses = incidencias
    .filter(i => i.tipo === 'plus_puntual')
    .map(i => ({ concepto: i.concepto, importe: r2(i.importe ?? 0) }))
  const totalPluses = r2(pluses.reduce((s, p) => s + p.importe, 0))

  // 5. Descuentos (ausencias injustificadas, baja IT, vacaciones sin retribuir)
  const diasLaborables = tablas.diasLaborablesMes
  const importeDia = r2(salarioEfectivo / diasLaborables)
  const descuentos = r2(
    incidencias
      .filter(i => ['ausencia_injustificada', 'baja_it', 'vacaciones'].includes(i.tipo))
      .reduce((s, i) => {
        if (i.importe != null) return s + i.importe
        return s + (i.dias ?? 0) * importeDia
      }, 0)
  )

  const totalDevengado = r2(salarioEfectivo + totalComplementos + horasExtra + totalPluses - descuentos)

  const devengos: Devengos = {
    salarioBase: salarioEfectivo,
    complementosFijos,
    horasExtra,
    pluses,
    descuentos,
    total: totalDevengado,
  }

  // 6. Base de cotización (clamp entre min y max del grupo)
  const { min, max } = tablas.bases[grupoCotizacion]
  const baseCotizacion = Math.max(min, Math.min(max, totalDevengado))

  // 7. Deducciones SS trabajador
  const tipos = tablas.tipos
  const desempleoTipo =
    tipoContrato === 'indefinido'
      ? tipos.desempleo_indefinido.trabajador
      : tipos.desempleo_temporal.trabajador

  const deducciones: DeduccionesEmpleado = {
    contingencias_comunes: r2(baseCotizacion * tipos.contingencias_comunes.trabajador),
    desempleo:             r2(baseCotizacion * desempleoTipo),
    fp:                    r2(baseCotizacion * tipos.fp.trabajador),
    irpf:                  r2(totalDevengado * (irpfRetencionPct / 100)),
    get total() {
      return r2(this.contingencias_comunes + this.desempleo + this.fp + this.irpf)
    },
  }
  deducciones.total = r2(deducciones.contingencias_comunes + deducciones.desempleo + deducciones.fp + deducciones.irpf)

  const netoAPagar = r2(totalDevengado - deducciones.total)

  // 8. Cuota patronal (informativa)
  const desempleoEmpresa =
    tipoContrato === 'indefinido'
      ? tipos.desempleo_indefinido.empresa
      : tipos.desempleo_temporal.empresa

  const cuotaPatronal: CuotaPatronal = {
    contingencias_comunes: r2(baseCotizacion * tipos.contingencias_comunes.empresa),
    desempleo:             r2(baseCotizacion * desempleoEmpresa),
    fogasa:                r2(baseCotizacion * tipos.fogasa),
    fp:                    r2(baseCotizacion * tipos.fp.empresa),
    at_ep:                 r2(baseCotizacion * tipos.at_ep),
    get total() {
      return r2(this.contingencias_comunes + this.desempleo + this.fogasa + this.fp + this.at_ep)
    },
  }
  cuotaPatronal.total = r2(
    cuotaPatronal.contingencias_comunes +
    cuotaPatronal.desempleo +
    cuotaPatronal.fogasa +
    cuotaPatronal.fp +
    cuotaPatronal.at_ep
  )

  return {
    periodo,
    devengos,
    baseCotizacion,
    baseIrpf: totalDevengado,
    deducciones,
    netoAPagar,
    cuotaPatronal,
    costeTotalEmpresa: r2(totalDevengado + cuotaPatronal.total),
  }
}
```

- [ ] **Step 4: Ejecutar tests — deben pasar**

```bash
cd packages/module-nominas && npx vitest run src/calcular.test.ts
```

Expected: 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/module-nominas/src/calcular.ts packages/module-nominas/src/calcular.test.ts
git commit -m "feat(module-nominas): motor calcularNomina() con tests SS+IRPF"
```

---

## Task 4: Migraciones de BD

**Files:**
- Create: `apps/rrhh/prisma/migrations/0015_nominas_cnae.sql`
- Create: `apps/rrhh/prisma/migrations/0016_contratos_laborales.sql`
- Create: `apps/rrhh/prisma/migrations/0017_nominas_incidencias.sql`

- [ ] **Step 1: Crear `0015_nominas_cnae.sql`**

```sql
ALTER TABLE rrhh.empresas ADD COLUMN IF NOT EXISTS cnae_codigo TEXT;
ALTER TABLE rrhh.empresas ADD COLUMN IF NOT EXISTS at_ep_tipo NUMERIC(6,4);
```

- [ ] **Step 2: Crear `0016_contratos_laborales.sql`**

```sql
CREATE TABLE IF NOT EXISTS rrhh.contratos_laborales (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         UUID NOT NULL REFERENCES rrhh.empresas(id) ON DELETE CASCADE,
  empleado_id        UUID NOT NULL REFERENCES rrhh.empleados(id) ON DELETE CASCADE,
  salario_base       NUMERIC(10,2) NOT NULL CHECK (salario_base >= 0),
  grupo_cotizacion   SMALLINT NOT NULL CHECK (grupo_cotizacion BETWEEN 1 AND 11),
  tipo_contrato      TEXT NOT NULL CHECK (tipo_contrato IN ('indefinido','temporal','parcial')),
  jornada_pct        NUMERIC(5,2) NOT NULL DEFAULT 100 CHECK (jornada_pct > 0 AND jornada_pct <= 100),
  irpf_retencion_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (irpf_retencion_pct >= 0),
  categoria_convenio TEXT,
  conceptos_fijos    JSONB NOT NULL DEFAULT '[]',
  vigente_desde      DATE NOT NULL,
  activo             BOOLEAN NOT NULL DEFAULT TRUE,
  creada_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS contratos_empresa_idx ON rrhh.contratos_laborales(empresa_id);
CREATE INDEX IF NOT EXISTS contratos_empleado_idx ON rrhh.contratos_laborales(empleado_id);
```

- [ ] **Step 3: Crear `0017_nominas_incidencias.sql`**

```sql
CREATE TABLE IF NOT EXISTS rrhh.nominas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES rrhh.empresas(id) ON DELETE CASCADE,
  empleado_id   UUID NOT NULL REFERENCES rrhh.empleados(id) ON DELETE CASCADE,
  periodo       TEXT NOT NULL,
  estado        TEXT NOT NULL DEFAULT 'borrador'
                  CHECK (estado IN ('borrador','confirmada','enviada')),
  datos_calculo JSONB NOT NULL DEFAULT '{}',
  pdf_path      TEXT,
  generada_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmada_at TIMESTAMPTZ,
  enviada_at    TIMESTAMPTZ,
  creada_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (empresa_id, empleado_id, periodo)
);
CREATE INDEX IF NOT EXISTS nominas_empresa_periodo_idx ON rrhh.nominas(empresa_id, periodo);

CREATE TABLE IF NOT EXISTS rrhh.incidencias_mes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID NOT NULL,
  nomina_id  UUID NOT NULL REFERENCES rrhh.nominas(id) ON DELETE CASCADE,
  tipo       TEXT NOT NULL
               CHECK (tipo IN ('horas_extra','ausencia_injustificada','plus_puntual','descuento','baja_it','vacaciones')),
  concepto   TEXT NOT NULL,
  importe    NUMERIC(10,2),
  horas      NUMERIC(6,2),
  dias       INTEGER,
  creada_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS incidencias_nomina_idx ON rrhh.incidencias_mes(nomina_id);
```

- [ ] **Step 4: Aplicar migraciones a Supabase**

Usar el MCP de Supabase (`apply_migration`) para el proyecto `wswbehlcuxqxyinousql`:
- Migración 0015 (CNAE en empresas)
- Migración 0016 (contratos_laborales)
- Migración 0017 (nominas + incidencias_mes)

O ejecutar directamente:
```bash
# Via Supabase CLI si está disponible
supabase db push --db-url "$DIRECT_URL"
```

- [ ] **Step 5: Commit**

```bash
git add apps/rrhh/prisma/migrations/
git commit -m "feat(rrhh-db): migraciones contratos_laborales, nominas, incidencias_mes"
```

---

## Task 5: Actualizar Prisma schema

**Files:**
- Modify: `apps/rrhh/prisma/schema.prisma`

- [ ] **Step 1: Añadir columnas a modelo `empresas`**

En `prisma/schema.prisma`, dentro del model `empresas` añadir tras `marca_color`:

```prisma
  cnae_codigo  String?
  at_ep_tipo   Decimal? @db.Decimal(6, 4)
```

- [ ] **Step 2: Añadir modelos nuevos al final del schema**

```prisma
model contratos_laborales {
  id                 String   @id @default(uuid()) @db.Uuid
  empresa_id         String   @db.Uuid
  empleado_id        String   @db.Uuid
  salario_base       Decimal  @db.Decimal(10, 2)
  grupo_cotizacion   Int      @db.SmallInt
  tipo_contrato      String
  jornada_pct        Decimal  @default(100) @db.Decimal(5, 2)
  irpf_retencion_pct Decimal  @default(0) @db.Decimal(5, 2)
  categoria_convenio String?
  conceptos_fijos    Json     @default("[]")
  vigente_desde      DateTime @db.Date
  activo             Boolean  @default(true)
  creada_at          DateTime @default(now()) @db.Timestamptz(6)

  @@index([empresa_id])
  @@index([empleado_id])
}

model nominas {
  id            String    @id @default(uuid()) @db.Uuid
  empresa_id    String    @db.Uuid
  empleado_id   String    @db.Uuid
  periodo       String
  estado        String    @default("borrador")
  datos_calculo Json      @default("{}")
  pdf_path      String?
  generada_at   DateTime  @default(now()) @db.Timestamptz(6)
  confirmada_at DateTime? @db.Timestamptz(6)
  enviada_at    DateTime? @db.Timestamptz(6)
  creada_at     DateTime  @default(now()) @db.Timestamptz(6)
  incidencias   incidencias_mes[]

  @@unique([empresa_id, empleado_id, periodo])
  @@index([empresa_id, periodo])
}

model incidencias_mes {
  id         String   @id @default(uuid()) @db.Uuid
  empresa_id String   @db.Uuid
  nomina_id  String   @db.Uuid
  tipo       String
  concepto   String
  importe    Decimal? @db.Decimal(10, 2)
  horas      Decimal? @db.Decimal(6, 2)
  dias       Int?
  creada_at  DateTime @default(now()) @db.Timestamptz(6)
  nomina     nominas  @relation(fields: [nomina_id], references: [id], onDelete: Cascade)

  @@index([nomina_id])
}
```

- [ ] **Step 3: Regenerar cliente Prisma**

```bash
cd apps/rrhh && npx prisma generate
```

Expected: `✔ Generated Prisma Client` sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/rrhh/prisma/schema.prisma
git commit -m "feat(rrhh): Prisma schema para contratos, nominas e incidencias"
```

---

## Task 6: Registrar `@central/module-nominas` en `apps/rrhh`

**Files:**
- Modify: `apps/rrhh/package.json`
- Modify: `apps/rrhh/next.config.ts`

- [ ] **Step 1: Añadir dependencias a `package.json`**

En el bloque `dependencies`, añadir (manteniendo el orden alfabético):

```json
"@central/module-nominas": "file:../../packages/module-nominas",
"@react-pdf/renderer": "^4.3.0",
```

Añadir en `devDependencies`:
```json
"@types/react-pdf": "*",
```

- [ ] **Step 2: Añadir a `transpilePackages` en `next.config.ts`**

Añadir `'@central/module-nominas'` al array `transpilePackages`:

```typescript
transpilePackages: [
  '@central/core-ai',
  '@central/core-email',
  '@central/core-firma',
  '@central/core-storage',
  '@central/core-identity',
  '@central/legal-templates',
  '@central/module-documental',
  '@central/module-rrhh',
  '@central/module-chat',
  '@central/module-nominas',   // ← añadir
],
```

- [ ] **Step 3: Instalar dependencias**

```bash
cd apps/rrhh && npx --yes pnpm@10.33.0 install --no-frozen-lockfile
```

- [ ] **Step 4: Commit**

```bash
git add apps/rrhh/package.json apps/rrhh/next.config.ts
git commit -m "feat(rrhh): registrar @central/module-nominas y @react-pdf/renderer"
```

---

## Task 7: `lib/contratos.ts` — CRUD contratos laborales

**Files:**
- Create: `apps/rrhh/lib/contratos.ts`
- Create: `apps/rrhh/lib/contratos.test.ts`

- [ ] **Step 1: Escribir el test**

Crear `apps/rrhh/lib/contratos.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Prisma
vi.mock('./prisma', () => ({
  prisma: {
    contratos_laborales: {
      findFirst: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

import { contratoActivoDeEmpleado, crearContrato } from './contratos'
import { prisma } from './prisma'

const EMPRESA_ID = 'e1'
const EMPLEADO_ID = 'emp1'

const DATOS_CONTRATO = {
  salarioBase: 1800,
  grupoCotizacion: 7 as const,
  tipoContrato: 'indefinido' as const,
  jornadaPct: 100,
  irpfRetencionPct: 10,
  categoriaConvenio: 'Camarero/a',
  conceptosFijos: [],
  vigenteDesdе: new Date('2026-01-01'),
}

describe('contratos', () => {
  beforeEach(() => vi.clearAllMocks())

  it('contratoActivoDeEmpleado devuelve null si no existe', async () => {
    vi.mocked(prisma.contratos_laborales.findFirst).mockResolvedValue(null)
    const r = await contratoActivoDeEmpleado(EMPRESA_ID, EMPLEADO_ID)
    expect(r).toBeNull()
  })

  it('crearContrato desactiva contrato anterior y crea nuevo', async () => {
    vi.mocked(prisma.contratos_laborales.updateMany).mockResolvedValue({ count: 1 })
    vi.mocked(prisma.contratos_laborales.create).mockResolvedValue({ id: 'c1' } as never)
    await crearContrato(EMPRESA_ID, EMPLEADO_ID, DATOS_CONTRATO)
    expect(prisma.contratos_laborales.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { empresa_id: EMPRESA_ID, empleado_id: EMPLEADO_ID, activo: true } })
    )
    expect(prisma.contratos_laborales.create).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Ejecutar el test — debe fallar**

```bash
cd apps/rrhh && npx vitest run lib/contratos.test.ts
```

Expected: Error — módulo no encontrado.

- [ ] **Step 3: Implementar `apps/rrhh/lib/contratos.ts`**

```typescript
import { prisma } from './prisma'
import type { GrupoCotizacion, TipoContrato } from '@central/module-nominas'

export interface DatosContrato {
  salarioBase: number
  grupoCotizacion: GrupoCotizacion
  tipoContrato: TipoContrato
  jornadaPct: number
  irpfRetencionPct: number
  categoriaConvenio?: string | null
  conceptosFijos: { nombre: string; importe: number }[]
  vigenteDesde: Date
}

export interface ContratoRow extends DatosContrato {
  id: string
  empresaId: string
  empleadoId: string
  activo: boolean
  creadaAt: Date
}

function mapRow(r: Record<string, unknown>): ContratoRow {
  return {
    id: r.id as string,
    empresaId: r.empresa_id as string,
    empleadoId: r.empleado_id as string,
    salarioBase: Number(r.salario_base),
    grupoCotizacion: r.grupo_cotizacion as GrupoCotizacion,
    tipoContrato: r.tipo_contrato as TipoContrato,
    jornadaPct: Number(r.jornada_pct),
    irpfRetencionPct: Number(r.irpf_retencion_pct),
    categoriaConvenio: r.categoria_convenio as string | null,
    conceptosFijos: r.conceptos_fijos as { nombre: string; importe: number }[],
    vigenteDesde: new Date(r.vigente_desde as string),
    activo: r.activo as boolean,
    creadaAt: new Date(r.creada_at as string),
  }
}

export async function contratoActivoDeEmpleado(
  empresaId: string,
  empleadoId: string,
): Promise<ContratoRow | null> {
  const row = await prisma.contratos_laborales.findFirst({
    where: { empresa_id: empresaId, empleado_id: empleadoId, activo: true },
  })
  return row ? mapRow(row as Record<string, unknown>) : null
}

export async function crearContrato(
  empresaId: string,
  empleadoId: string,
  datos: DatosContrato,
): Promise<void> {
  // Desactivar contratos anteriores del mismo empleado
  await prisma.contratos_laborales.updateMany({
    where: { empresa_id: empresaId, empleado_id: empleadoId, activo: true },
    data: { activo: false },
  })
  await prisma.contratos_laborales.create({
    data: {
      empresa_id: empresaId,
      empleado_id: empleadoId,
      salario_base: datos.salarioBase,
      grupo_cotizacion: datos.grupoCotizacion,
      tipo_contrato: datos.tipoContrato,
      jornada_pct: datos.jornadaPct,
      irpf_retencion_pct: datos.irpfRetencionPct,
      categoria_convenio: datos.categoriaConvenio ?? null,
      conceptos_fijos: datos.conceptosFijos,
      vigente_desde: datos.vigenteDesde,
    },
  })
}

export async function historialContratos(
  empresaId: string,
  empleadoId: string,
): Promise<ContratoRow[]> {
  const rows = await prisma.contratos_laborales.findMany({
    where: { empresa_id: empresaId, empleado_id: empleadoId },
    orderBy: { vigente_desde: 'desc' },
  })
  return rows.map(r => mapRow(r as Record<string, unknown>))
}
```

- [ ] **Step 4: Ejecutar tests — deben pasar**

```bash
cd apps/rrhh && npx vitest run lib/contratos.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/rrhh/lib/contratos.ts apps/rrhh/lib/contratos.test.ts
git commit -m "feat(rrhh): lib/contratos CRUD contratos_laborales"
```

---

## Task 8: `lib/at-ep-agente.ts` — resolver AT/EP por CNAE

**Files:**
- Create: `apps/rrhh/lib/at-ep-agente.ts`

- [ ] **Step 1: Implementar `apps/rrhh/lib/at-ep-agente.ts`**

```typescript
import { atEpPorCnae } from '@central/module-nominas'
import { generarRespuesta } from './ai'
import { prisma } from './prisma'

/**
 * Resuelve el tipo AT/EP para una empresa dado su CNAE.
 * 1. Busca en la tabla estática del módulo.
 * 2. Si no está, usa IA para intentar determinarlo.
 * Persiste el resultado en rrhh.empresas.at_ep_tipo.
 */
export async function resolverYGuardarAtEp(empresaId: string, cnae: string): Promise<number> {
  const deTabla = atEpPorCnae(cnae)

  if (deTabla !== undefined) {
    await prisma.$executeRaw`
      UPDATE rrhh.empresas SET cnae_codigo = ${cnae}, at_ep_tipo = ${deTabla} WHERE id = ${empresaId}::uuid
    `
    return deTabla
  }

  // Fallback: preguntar a la IA
  const prompt = `El código CNAE de la empresa es "${cnae}". Según la Tarifa de primas vigente en España para contingencias de accidentes de trabajo y enfermedades profesionales (AT/EP), ¿cuál es el tipo de cotización aproximado para esta actividad? Responde SOLO con un número decimal entre 0 y 0.15 (por ejemplo: 0.025). Sin texto adicional.`
  const respuesta = await generarRespuesta(prompt)
  const valor = parseFloat(respuesta.trim())
  const tipo = isNaN(valor) ? 0.025 : Math.min(0.15, Math.max(0, valor))

  await prisma.$executeRaw`
    UPDATE rrhh.empresas SET cnae_codigo = ${cnae}, at_ep_tipo = ${tipo} WHERE id = ${empresaId}::uuid
  `
  return tipo
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/rrhh/lib/at-ep-agente.ts
git commit -m "feat(rrhh): at-ep-agente resolver tipo AT/EP por CNAE"
```

---

## Task 9: `lib/nominas.ts` — CRUD y generación de borradores

**Files:**
- Create: `apps/rrhh/lib/nominas.ts`
- Create: `apps/rrhh/lib/nominas.test.ts`

- [ ] **Step 1: Escribir tests**

Crear `apps/rrhh/lib/nominas.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./prisma', () => ({
  prisma: {
    nominas: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    incidencias_mes: { create: vi.fn(), delete: vi.fn() },
    contratos_laborales: { findFirst: vi.fn() },
    empleados: { findMany: vi.fn() },
    solicitudes: { findMany: vi.fn() },
    $executeRaw: vi.fn(),
  },
}))

import { nominasDePeriodo, agregarIncidencia } from './nominas'
import { prisma } from './prisma'

const EMP = 'empresa1'

describe('nominas', () => {
  beforeEach(() => vi.clearAllMocks())

  it('nominasDePeriodo devuelve array vacío si no hay nóminas', async () => {
    vi.mocked(prisma.nominas.findMany).mockResolvedValue([])
    const r = await nominasDePeriodo(EMP, '2026-06')
    expect(r).toEqual([])
  })

  it('agregarIncidencia llama a create con datos correctos', async () => {
    vi.mocked(prisma.incidencias_mes.create).mockResolvedValue({ id: 'i1' } as never)
    await agregarIncidencia(EMP, 'nom1', {
      tipo: 'horas_extra',
      concepto: 'Horas junio',
      horas: 4,
    })
    expect(prisma.incidencias_mes.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tipo: 'horas_extra', horas: 4 }),
      })
    )
  })
})
```

- [ ] **Step 2: Ejecutar test — debe fallar**

```bash
cd apps/rrhh && npx vitest run lib/nominas.test.ts
```

Expected: Error — módulo no encontrado.

- [ ] **Step 3: Implementar `apps/rrhh/lib/nominas.ts`**

```typescript
import { prisma } from './prisma'
import { contratoActivoDeEmpleado } from './contratos'
import { calcularNomina, tablas2026 } from '@central/module-nominas'
import type { IncidenciaMes, NominaDesglose, TipoIncidencia } from '@central/module-nominas'

export interface NominaRow {
  id: string
  empresaId: string
  empleadoId: string
  periodo: string
  estado: 'borrador' | 'confirmada' | 'enviada'
  datosCalculo: NominaDesglose
  pdfPath: string | null
  generadaAt: Date
  confirmadaAt: Date | null
  enviadaAt: Date | null
}

function mapNomina(r: Record<string, unknown>): NominaRow {
  return {
    id: r.id as string,
    empresaId: r.empresa_id as string,
    empleadoId: r.empleado_id as string,
    periodo: r.periodo as string,
    estado: r.estado as 'borrador' | 'confirmada' | 'enviada',
    datosCalculo: r.datos_calculo as NominaDesglose,
    pdfPath: r.pdf_path as string | null,
    generadaAt: new Date(r.generada_at as string),
    confirmadaAt: r.confirmada_at ? new Date(r.confirmada_at as string) : null,
    enviadaAt: r.enviada_at ? new Date(r.enviada_at as string) : null,
  }
}

export async function nominasDePeriodo(empresaId: string, periodo: string): Promise<NominaRow[]> {
  const rows = await prisma.nominas.findMany({
    where: { empresa_id: empresaId, periodo },
    orderBy: { creada_at: 'asc' },
  })
  return rows.map(r => mapNomina(r as Record<string, unknown>))
}

export async function agregarIncidencia(
  empresaId: string,
  nominaId: string,
  incidencia: { tipo: TipoIncidencia; concepto: string; importe?: number; horas?: number; dias?: number },
): Promise<void> {
  await prisma.incidencias_mes.create({
    data: {
      empresa_id: empresaId,
      nomina_id: nominaId,
      tipo: incidencia.tipo,
      concepto: incidencia.concepto,
      importe: incidencia.importe ?? null,
      horas: incidencia.horas ?? null,
      dias: incidencia.dias ?? null,
    },
  })
}

export async function eliminarIncidencia(empresaId: string, incidenciaId: string): Promise<void> {
  await prisma.incidencias_mes.delete({ where: { id: incidenciaId, empresa_id: empresaId } })
}

/** Calcula el desglose de una nómina a partir de sus incidencias actuales. */
export async function recalcularNomina(
  empresaId: string,
  nominaId: string,
  atEpTipo: number,
): Promise<NominaDesglose> {
  const nomina = await prisma.nominas.findFirst({ where: { id: nominaId, empresa_id: empresaId } })
  if (!nomina) throw new Error('Nómina no encontrada')

  const contrato = await contratoActivoDeEmpleado(empresaId, nomina.empleado_id as string)
  if (!contrato) throw new Error('El empleado no tiene contrato activo')

  const incRows = await prisma.incidencias_mes.findMany({ where: { nomina_id: nominaId } })
  const incidencias: IncidenciaMes[] = incRows.map(i => ({
    tipo: i.tipo as TipoIncidencia,
    concepto: i.concepto as string,
    importe: i.importe != null ? Number(i.importe) : undefined,
    horas: i.horas != null ? Number(i.horas) : undefined,
    dias: i.dias ?? undefined,
  }))

  const tablas = tablas2026(atEpTipo)
  return calcularNomina(
    {
      tipoContrato: contrato.tipoContrato,
      jornadaPct: contrato.jornadaPct,
      salarioBase: contrato.salarioBase,
      grupoCotizacion: contrato.grupoCotizacion,
      irpfRetencionPct: contrato.irpfRetencionPct,
      conceptosFijos: contrato.conceptosFijos,
    },
    incidencias,
    tablas,
    nomina.periodo as string,
  )
}

/**
 * Genera borradores de nómina para todos los empleados activos con contrato.
 * Importa solicitudes aprobadas del mes como incidencias automáticas (bajas, vacaciones).
 * Si ya existe un borrador para ese período, lo omite.
 */
export async function generarBorradores(
  empresaId: string,
  periodo: string, // "2026-06"
  atEpTipo: number,
): Promise<{ creadas: number; omitidas: number }> {
  const [año, mes] = periodo.split('-').map(Number)
  const inicioMes = new Date(año, mes - 1, 1)
  const finMes = new Date(año, mes, 0)

  const empleados = await prisma.empleados.findMany({
    where: { empresa_id: empresaId, estado: 'activo' },
  })

  let creadas = 0
  let omitidas = 0

  for (const empleado of empleados) {
    // Verificar que tiene contrato activo
    const contrato = await contratoActivoDeEmpleado(empresaId, empleado.id as string)
    if (!contrato) { omitidas++; continue }

    // Verificar que no existe ya una nómina para ese período
    const existente = await prisma.nominas.findFirst({
      where: { empresa_id: empresaId, empleado_id: empleado.id as string, periodo },
    })
    if (existente) { omitidas++; continue }

    const tablas = tablas2026(atEpTipo)
    const desglose = calcularNomina(
      {
        tipoContrato: contrato.tipoContrato,
        jornadaPct: contrato.jornadaPct,
        salarioBase: contrato.salarioBase,
        grupoCotizacion: contrato.grupoCotizacion,
        irpfRetencionPct: contrato.irpfRetencionPct,
        conceptosFijos: contrato.conceptosFijos,
      },
      [],
      tablas,
      periodo,
    )

    const nomina = await prisma.nominas.create({
      data: {
        empresa_id: empresaId,
        empleado_id: empleado.id as string,
        periodo,
        estado: 'borrador',
        datos_calculo: desglose as object,
      },
    })

    // Importar solicitudes aprobadas del mes como incidencias
    const solicitudes = await prisma.solicitudes.findMany({
      where: {
        empresa_id: empresaId,
        empleado_id: empleado.id as string,
        estado: 'aprobada',
        fecha_inicio: { gte: inicioMes },
        fecha_fin: { lte: finMes },
      },
    })

    for (const sol of solicitudes) {
      const tipo = ['vacaciones', 'permiso_retribuido'].includes(sol.tipo as string)
        ? 'vacaciones'
        : sol.tipo === 'baja'
          ? 'baja_it'
          : null
      if (!tipo) continue

      const dias = Math.ceil(
        (new Date(sol.fecha_fin as string).getTime() - new Date(sol.fecha_inicio as string).getTime()) /
          (1000 * 60 * 60 * 24),
      ) + 1

      await prisma.incidencias_mes.create({
        data: {
          empresa_id: empresaId,
          nomina_id: nomina.id as string,
          tipo,
          concepto: `${sol.tipo} aprobada (${sol.fecha_inicio})`,
          dias,
        },
      })
    }

    creadas++
  }

  return { creadas, omitidas }
}
```

- [ ] **Step 4: Ejecutar tests — deben pasar**

```bash
cd apps/rrhh && npx vitest run lib/nominas.test.ts
```

Expected: 2 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/rrhh/lib/nominas.ts apps/rrhh/lib/nominas.test.ts
git commit -m "feat(rrhh): lib/nominas CRUD + generarBorradores + recalcularNomina"
```

---

## Task 10: `lib/nomina-pdf.tsx` — generación de PDF

**Files:**
- Create: `apps/rrhh/lib/nomina-pdf.tsx`

- [ ] **Step 1: Implementar `apps/rrhh/lib/nomina-pdf.tsx`**

```tsx
import React from 'react'
import { Document, Page, Text, View, StyleSheet, renderToBuffer } from '@react-pdf/renderer'
import type { NominaDesglose } from '@central/module-nominas'

const styles = StyleSheet.create({
  page: { padding: 32, fontSize: 9, fontFamily: 'Helvetica' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, borderBottom: '1 solid #ccc', paddingBottom: 8 },
  section: { marginBottom: 10 },
  title: { fontSize: 11, fontWeight: 'bold', marginBottom: 4, backgroundColor: '#f0f0f0', padding: 3 },
  row: { flexDirection: 'row', borderBottom: '0.5 solid #eee', paddingVertical: 2 },
  col1: { flex: 1 },
  col2: { width: 80, textAlign: 'right' },
  totalRow: { flexDirection: 'row', borderTop: '1 solid #333', paddingVertical: 3, fontWeight: 'bold' },
  neto: { fontSize: 12, fontWeight: 'bold', textAlign: 'center', marginTop: 10, padding: 6, backgroundColor: '#e8f4e8' },
})

interface Props {
  desglose: NominaDesglose
  empresa: { nombre: string; cif?: string }
  empleado: { nombre: string; dni?: string; nss?: string; puesto?: string }
}

function fmt(n: number) {
  return n.toFixed(2).replace('.', ',') + ' €'
}

export function NominaPdf({ desglose, empresa, empleado }: Props) {
  const { devengos, deducciones, baseCotizacion, cuotaPatronal } = desglose

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Cabecera */}
        <View style={styles.header}>
          <View>
            <Text style={{ fontSize: 11, fontWeight: 'bold' }}>{empresa.nombre}</Text>
            {empresa.cif && <Text>CIF: {empresa.cif}</Text>}
          </View>
          <View style={{ textAlign: 'right' }}>
            <Text style={{ fontSize: 11, fontWeight: 'bold' }}>NÓMINA</Text>
            <Text>Período: {desglose.periodo}</Text>
          </View>
        </View>

        {/* Datos empleado */}
        <View style={styles.section}>
          <Text style={styles.title}>Datos del trabajador</Text>
          <View style={styles.row}><Text style={styles.col1}>Nombre</Text><Text>{empleado.nombre}</Text></View>
          {empleado.dni && <View style={styles.row}><Text style={styles.col1}>DNI</Text><Text>{empleado.dni}</Text></View>}
          {empleado.nss && <View style={styles.row}><Text style={styles.col1}>Nº Seguridad Social</Text><Text>{empleado.nss}</Text></View>}
          {empleado.puesto && <View style={styles.row}><Text style={styles.col1}>Categoría / Puesto</Text><Text>{empleado.puesto}</Text></View>}
        </View>

        {/* Devengos */}
        <View style={styles.section}>
          <Text style={styles.title}>Devengos (haber)</Text>
          <View style={styles.row}><Text style={styles.col1}>Salario base</Text><Text style={styles.col2}>{fmt(devengos.salarioBase)}</Text></View>
          {devengos.complementosFijos.map((c, i) => (
            <View key={i} style={styles.row}><Text style={styles.col1}>{c.concepto}</Text><Text style={styles.col2}>{fmt(c.importe)}</Text></View>
          ))}
          {devengos.horasExtra > 0 && (
            <View style={styles.row}><Text style={styles.col1}>Horas extraordinarias</Text><Text style={styles.col2}>{fmt(devengos.horasExtra)}</Text></View>
          )}
          {devengos.pluses.map((p, i) => (
            <View key={i} style={styles.row}><Text style={styles.col1}>{p.concepto}</Text><Text style={styles.col2}>{fmt(p.importe)}</Text></View>
          ))}
          {devengos.descuentos > 0 && (
            <View style={styles.row}><Text style={styles.col1}>Descuentos (ausencias/baja)</Text><Text style={styles.col2}>-{fmt(devengos.descuentos)}</Text></View>
          )}
          <View style={styles.totalRow}><Text style={styles.col1}>TOTAL DEVENGADO</Text><Text style={styles.col2}>{fmt(devengos.total)}</Text></View>
        </View>

        {/* Deducciones */}
        <View style={styles.section}>
          <Text style={styles.title}>Deducciones (debe)</Text>
          <View style={styles.row}><Text style={styles.col1}>SS Contingencias comunes (4,70%)</Text><Text style={styles.col2}>{fmt(deducciones.contingencias_comunes)}</Text></View>
          <View style={styles.row}><Text style={styles.col1}>SS Desempleo (1,55%)</Text><Text style={styles.col2}>{fmt(deducciones.desempleo)}</Text></View>
          <View style={styles.row}><Text style={styles.col1}>SS Formación profesional (0,10%)</Text><Text style={styles.col2}>{fmt(deducciones.fp)}</Text></View>
          <View style={styles.row}><Text style={styles.col1}>IRPF ({desglose.baseIrpf > 0 ? ((deducciones.irpf / desglose.baseIrpf) * 100).toFixed(1) : 0}%)</Text><Text style={styles.col2}>{fmt(deducciones.irpf)}</Text></View>
          <View style={styles.totalRow}><Text style={styles.col1}>TOTAL DEDUCCIONES</Text><Text style={styles.col2}>{fmt(deducciones.total)}</Text></View>
        </View>

        {/* Bases */}
        <View style={styles.section}>
          <Text style={styles.title}>Bases de cotización</Text>
          <View style={styles.row}><Text style={styles.col1}>Base de cotización SS</Text><Text style={styles.col2}>{fmt(baseCotizacion)}</Text></View>
          <View style={styles.row}><Text style={styles.col1}>Base sujeta a IRPF</Text><Text style={styles.col2}>{fmt(desglose.baseIrpf)}</Text></View>
        </View>

        {/* Cuota patronal (informativa) */}
        <View style={styles.section}>
          <Text style={styles.title}>Cuota empresarial (informativa)</Text>
          <View style={styles.row}><Text style={styles.col1}>Total cuota empresa</Text><Text style={styles.col2}>{fmt(cuotaPatronal.total)}</Text></View>
          <View style={styles.row}><Text style={styles.col1}>Coste total empresa</Text><Text style={styles.col2}>{fmt(desglose.costeTotalEmpresa)}</Text></View>
        </View>

        {/* Neto */}
        <Text style={styles.neto}>LÍQUIDO A PERCIBIR: {fmt(desglose.netoAPagar)}</Text>

        <Text style={{ marginTop: 40, fontSize: 8, color: '#666', textAlign: 'center' }}>
          Período: {desglose.periodo} — Generado por iarrhh
        </Text>
      </Page>
    </Document>
  )
}

export async function generarPdfNomina(
  desglose: NominaDesglose,
  empresa: { nombre: string; cif?: string },
  empleado: { nombre: string; dni?: string; nss?: string; puesto?: string },
): Promise<Buffer> {
  return renderToBuffer(<NominaPdf desglose={desglose} empresa={empresa} empleado={empleado} />)
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/rrhh/lib/nomina-pdf.tsx
git commit -m "feat(rrhh): generación PDF de nómina con @react-pdf/renderer"
```

---

## Task 11: API routes de nóminas

**Files:**
- Create: `apps/rrhh/app/api/admin/contratos/[empleadoId]/route.ts`
- Create: `apps/rrhh/app/api/admin/nominas/[periodo]/route.ts`
- Create: `apps/rrhh/app/api/admin/nominas/generar/route.ts`
- Create: `apps/rrhh/app/api/admin/nominas/[nominaId]/incidencias/route.ts`
- Create: `apps/rrhh/app/api/admin/nominas/[nominaId]/incidencias/[incId]/route.ts`
- Create: `apps/rrhh/app/api/admin/nominas/[nominaId]/confirmar/route.ts`

- [ ] **Step 1: `app/api/admin/contratos/[empleadoId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { resolverSesion } from '@/lib/tenant'
import { contratoActivoDeEmpleado, crearContrato, type DatosContrato } from '@/lib/contratos'
import { historialContratos } from '@/lib/contratos'

export async function GET(req: NextRequest, { params }: { params: Promise<{ empleadoId: string }> }) {
  const { empresaId } = await resolverSesion(req)
  const { empleadoId } = await params
  const contrato = await contratoActivoDeEmpleado(empresaId, empleadoId)
  const historial = await historialContratos(empresaId, empleadoId)
  return NextResponse.json({ contrato, historial })
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ empleadoId: string }> }) {
  const { empresaId } = await resolverSesion(req)
  const { empleadoId } = await params
  const body = await req.json() as DatosContrato
  await crearContrato(empresaId, empleadoId, {
    ...body,
    vigenteDesde: new Date(body.vigenteDesde as unknown as string),
  })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: `app/api/admin/nominas/[periodo]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { resolverSesion } from '@/lib/tenant'
import { nominasDePeriodo } from '@/lib/nominas'

export async function GET(req: NextRequest, { params }: { params: Promise<{ periodo: string }> }) {
  const { empresaId } = await resolverSesion(req)
  const { periodo } = await params
  const nominas = await nominasDePeriodo(empresaId, periodo)
  return NextResponse.json(nominas)
}
```

- [ ] **Step 3: `app/api/admin/nominas/generar/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { resolverSesion } from '@/lib/tenant'
import { generarBorradores } from '@/lib/nominas'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  const { empresaId } = await resolverSesion(req)
  const { periodo } = await req.json() as { periodo: string }

  const empresa = await prisma.$queryRaw<{ at_ep_tipo: number | null }[]>`
    SELECT at_ep_tipo FROM rrhh.empresas WHERE id = ${empresaId}::uuid LIMIT 1
  `
  const atEp = empresa[0]?.at_ep_tipo ?? 0.025

  const resultado = await generarBorradores(empresaId, periodo, Number(atEp))
  return NextResponse.json(resultado)
}
```

- [ ] **Step 4: `app/api/admin/nominas/[nominaId]/incidencias/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { resolverSesion } from '@/lib/tenant'
import { agregarIncidencia } from '@/lib/nominas'
import type { TipoIncidencia } from '@central/module-nominas'

export async function POST(req: NextRequest, { params }: { params: Promise<{ nominaId: string }> }) {
  const { empresaId } = await resolverSesion(req)
  const { nominaId } = await params
  const body = await req.json() as { tipo: TipoIncidencia; concepto: string; importe?: number; horas?: number; dias?: number }
  await agregarIncidencia(empresaId, nominaId, body)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: `app/api/admin/nominas/[nominaId]/incidencias/[incId]/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { resolverSesion } from '@/lib/tenant'
import { eliminarIncidencia } from '@/lib/nominas'

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ nominaId: string; incId: string }> }) {
  const { empresaId } = await resolverSesion(req)
  const { incId } = await params
  await eliminarIncidencia(empresaId, incId)
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 6: `app/api/admin/nominas/[nominaId]/confirmar/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { resolverSesion } from '@/lib/tenant'
import { recalcularNomina } from '@/lib/nominas'
import { generarPdfNomina } from '@/lib/nomina-pdf'
import { subirDocumento } from '@/lib/storage'
import { prisma } from '@/lib/prisma'
import { solicitarFirma } from '@/lib/firma'
import { pushEmpleado } from '@/lib/push'

export async function POST(req: NextRequest, { params }: { params: Promise<{ nominaId: string }> }) {
  const { empresaId } = await resolverSesion(req)
  const { nominaId } = await params

  // 1. Recuperar nómina y datos de empresa/empleado
  const nomina = await prisma.nominas.findFirst({ where: { id: nominaId, empresa_id: empresaId } })
  if (!nomina) return NextResponse.json({ error: 'Nómina no encontrada' }, { status: 404 })
  if (nomina.estado !== 'borrador') return NextResponse.json({ error: 'Solo se puede confirmar un borrador' }, { status: 400 })

  const empresa = await prisma.$queryRaw<{ nombre: string; at_ep_tipo: number | null }[]>`
    SELECT nombre, at_ep_tipo FROM rrhh.empresas WHERE id = ${empresaId}::uuid LIMIT 1
  `
  const empleado = await prisma.empleados.findFirst({ where: { id: nomina.empleado_id as string } })
  if (!empleado || !empresa[0]) return NextResponse.json({ error: 'Datos incompletos' }, { status: 500 })

  // 2. Recalcular con incidencias finales
  const atEp = empresa[0].at_ep_tipo ?? 0.025
  const desglose = await recalcularNomina(empresaId, nominaId, Number(atEp))

  // 3. Generar PDF
  const pdfBuffer = await generarPdfNomina(
    desglose,
    { nombre: empresa[0].nombre },
    {
      nombre: empleado.nombre as string,
      dni: empleado.dni as string | undefined,
      nss: empleado.nss as string | undefined,
      puesto: empleado.puesto as string | undefined,
    },
  )

  // 4. Subir PDF a storage
  const storagePath = `${empresaId}/nominas/${empleado.id}/${nomina.periodo}.pdf`
  await subirDocumento(storagePath, pdfBuffer, 'application/pdf')

  // 5. Insertar en rrhh.documentos para que aparezca en el expediente
  const doc = await prisma.documentos.create({
    data: {
      empresa_id: empresaId,
      empleado_id: empleado.id as string,
      carpeta: 'nominas',
      nombre: `Nómina ${nomina.periodo}`,
      tipo: 'application/pdf',
      tamano: BigInt(pdfBuffer.length),
      storage_path: storagePath,
      subido_por: 'sistema',
      estado_firma: 'pendiente',
    },
  })

  // 6. Actualizar nómina con pdf_path, datos_calculo y estado
  await prisma.nominas.update({
    where: { id: nominaId },
    data: {
      estado: 'confirmada',
      datos_calculo: desglose as object,
      pdf_path: storagePath,
      confirmada_at: new Date(),
    },
  })

  // 7. Solicitar firma digital al empleado (flujo eIDAS existente)
  await solicitarFirma(empresaId, empleado.id as string, doc.id as string)
  await pushEmpleado(
    empresaId,
    empleado.id as string,
    'Nueva nómina disponible para firmar',
    `Tu nómina de ${nomina.periodo} está lista. Accede a tu portal para firmarla.`,
    '/e',
  )

  return NextResponse.json({ ok: true, documentoId: doc.id })
}
```

- [ ] **Step 7: Commit**

```bash
git add apps/rrhh/app/api/admin/contratos/ apps/rrhh/app/api/admin/nominas/
git commit -m "feat(rrhh): API routes contratos y nóminas (generar, incidencias, confirmar)"
```

---

## Task 12: Vercel Cron — endpoint `/api/cron/nominas`

**Files:**
- Create: `apps/rrhh/app/api/cron/nominas/route.ts`
- Modify: `apps/rrhh/vercel.json`

- [ ] **Step 1: Crear `apps/rrhh/app/api/cron/nominas/route.ts`**

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { generarBorradores } from '@/lib/nominas'
import { pushResponsables } from '@/lib/push'
import { avisarResponsables } from '@/lib/notificar'
import { prisma } from '@/lib/prisma'

export async function POST(req: NextRequest) {
  // Verificar CRON_SECRET (Vercel lo envía en Authorization header)
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Período: mes actual
  const hoy = new Date()
  const periodo = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`

  // Generar borradores para todas las empresas activas
  const empresas = await prisma.$queryRaw<{ id: string; at_ep_tipo: number | null }[]>`
    SELECT id, at_ep_tipo FROM rrhh.empresas
  `

  const resultados: { empresaId: string; creadas: number; omitidas: number }[] = []

  for (const empresa of empresas) {
    const atEp = empresa.at_ep_tipo ?? 0.025
    const r = await generarBorradores(empresa.id, periodo, Number(atEp))
    resultados.push({ empresaId: empresa.id, ...r })

    if (r.creadas > 0) {
      const titulo = `Borradores de nómina ${periodo} generados`
      const cuerpo = `Se han generado ${r.creadas} borradores. Revísalos en el panel de nóminas.`
      await pushResponsables(empresa.id, titulo, cuerpo, '/admin/nominas')
      await avisarResponsables(empresa.id, titulo, cuerpo)
    }
  }

  return NextResponse.json({ periodo, resultados })
}
```

- [ ] **Step 2: Actualizar `apps/rrhh/vercel.json` para añadir cron**

```json
{
  "buildCommand": "prisma generate && next build",
  "installCommand": "npx --yes pnpm@10.33.0 install --no-frozen-lockfile",
  "framework": "nextjs",
  "crons": [
    {
      "path": "/api/cron/nominas",
      "schedule": "0 8 25 * *"
    }
  ]
}
```

- [ ] **Step 3: Añadir `CRON_SECRET` a las variables de entorno de Vercel**

Variable: `CRON_SECRET` — valor aleatorio largo (ej. generado con `openssl rand -hex 32`).

Documentar en `apps/rrhh/CLAUDE.md` bajo "Envs":
```
CRON_SECRET    — secret para autenticar el endpoint /api/cron/nominas (Vercel Cron)
```

- [ ] **Step 4: Commit**

```bash
git add apps/rrhh/app/api/cron/ apps/rrhh/vercel.json apps/rrhh/CLAUDE.md
git commit -m "feat(rrhh): Vercel Cron para generación automática de borradores de nómina (día 25)"
```

---

## Task 13: Página admin — contrato del empleado

**Files:**
- Create: `apps/rrhh/app/admin/empleados/[id]/contrato/page.tsx`

- [ ] **Step 1: Implementar página**

```tsx
import { resolverSesionServer } from '@/lib/tenant'
import { contratoActivoDeEmpleado, historialContratos } from '@/lib/contratos'
import { prisma } from '@/lib/prisma'
import ContratoForm from './ContratoForm'

export default async function ContratoPage({ params }: { params: Promise<{ id: string }> }) {
  const { empresaId } = await resolverSesionServer()
  const { id: empleadoId } = await params

  const empleado = await prisma.empleados.findFirst({ where: { id: empleadoId, empresa_id: empresaId } })
  if (!empleado) return <p>Empleado no encontrado</p>

  const contratoActivo = await contratoActivoDeEmpleado(empresaId, empleadoId)
  const historial = await historialContratos(empresaId, empleadoId)

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Contrato laboral</h1>
      <p className="text-gray-500 mb-6">{empleado.nombre as string}</p>
      <ContratoForm empleadoId={empleadoId} contrato={contratoActivo} historial={historial} />
    </main>
  )
}
```

- [ ] **Step 2: Crear `ContratoForm.tsx` (client component)**

Crear `apps/rrhh/app/admin/empleados/[id]/contrato/ContratoForm.tsx`:

```tsx
'use client'
import { useState } from 'react'
import type { ContratoRow } from '@/lib/contratos'

interface Props {
  empleadoId: string
  contrato: ContratoRow | null
  historial: ContratoRow[]
}

const GRUPOS = [1,2,3,4,5,6,7,8,9,10,11] as const
const TIPOS = ['indefinido','temporal','parcial'] as const

export default function ContratoForm({ empleadoId, contrato, historial }: Props) {
  const [salario, setSalario] = useState(contrato?.salarioBase?.toString() ?? '')
  const [grupo, setGrupo] = useState(contrato?.grupoCotizacion?.toString() ?? '7')
  const [tipo, setTipo] = useState(contrato?.tipoContrato ?? 'indefinido')
  const [jornada, setJornada] = useState(contrato?.jornadaPct?.toString() ?? '100')
  const [irpf, setIrpf] = useState(contrato?.irpfRetencionPct?.toString() ?? '0')
  const [categoria, setCategoria] = useState(contrato?.categoriaConvenio ?? '')
  const [desde, setDesde] = useState(
    contrato?.vigenteDesde ? new Date(contrato.vigenteDesde).toISOString().split('T')[0] : ''
  )
  const [guardando, setGuardando] = useState(false)
  const [ok, setOk] = useState(false)

  async function guardar() {
    setGuardando(true)
    setOk(false)
    await fetch(`/api/admin/contratos/${empleadoId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        salarioBase: parseFloat(salario),
        grupoCotizacion: parseInt(grupo),
        tipoContrato: tipo,
        jornadaPct: parseFloat(jornada),
        irpfRetencionPct: parseFloat(irpf),
        categoriaConvenio: categoria || null,
        conceptosFijos: contrato?.conceptosFijos ?? [],
        vigenteDesde: desde,
      }),
    })
    setGuardando(false)
    setOk(true)
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium mb-1">Salario base (€/mes)</label>
          <input type="number" step="0.01" value={salario} onChange={e => setSalario(e.target.value)}
            className="w-full border rounded px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Grupo de cotización SS</label>
          <select value={grupo} onChange={e => setGrupo(e.target.value)} className="w-full border rounded px-3 py-2">
            {GRUPOS.map(g => <option key={g} value={g}>Grupo {g}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Tipo contrato</label>
          <select value={tipo} onChange={e => setTipo(e.target.value as typeof tipo)} className="w-full border rounded px-3 py-2">
            {TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Jornada (%)</label>
          <input type="number" min="1" max="100" value={jornada} onChange={e => setJornada(e.target.value)}
            className="w-full border rounded px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Retención IRPF (%)</label>
          <input type="number" step="0.1" min="0" value={irpf} onChange={e => setIrpf(e.target.value)}
            className="w-full border rounded px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Vigente desde</label>
          <input type="date" value={desde} onChange={e => setDesde(e.target.value)}
            className="w-full border rounded px-3 py-2" />
        </div>
        <div className="col-span-2">
          <label className="block text-sm font-medium mb-1">Categoría convenio</label>
          <input type="text" value={categoria} onChange={e => setCategoria(e.target.value)}
            placeholder="ej. Camarero/a 1ª"
            className="w-full border rounded px-3 py-2" />
        </div>
      </div>

      <button onClick={guardar} disabled={guardando}
        className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50">
        {guardando ? 'Guardando...' : contrato ? 'Actualizar contrato' : 'Crear contrato'}
      </button>
      {ok && <span className="ml-3 text-green-600">Guardado correctamente</span>}

      {historial.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-2">Historial de contratos</h2>
          <table className="w-full text-sm border">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-2 text-left">Desde</th>
                <th className="p-2 text-right">Salario</th>
                <th className="p-2 text-left">Tipo</th>
                <th className="p-2 text-center">Estado</th>
              </tr>
            </thead>
            <tbody>
              {historial.map(c => (
                <tr key={c.id} className="border-t">
                  <td className="p-2">{new Date(c.vigenteDesde).toLocaleDateString('es-ES')}</td>
                  <td className="p-2 text-right">{c.salarioBase.toFixed(2)} €</td>
                  <td className="p-2">{c.tipoContrato}</td>
                  <td className="p-2 text-center">{c.activo ? '✓ Activo' : 'Anterior'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/rrhh/app/admin/empleados/
git commit -m "feat(rrhh): página admin gestión contrato laboral del empleado"
```

---

## Task 14: Página admin — panel de nóminas

**Files:**
- Create: `apps/rrhh/app/admin/nominas/page.tsx`
- Create: `apps/rrhh/app/admin/nominas/[periodo]/page.tsx`
- Create: `apps/rrhh/app/admin/nominas/[periodo]/NominasPanel.tsx`

- [ ] **Step 1: `app/admin/nominas/page.tsx`** — selección de período

```tsx
import Link from 'next/link'

function periodosRecientes(): string[] {
  const periodos: string[] = []
  const hoy = new Date()
  for (let i = 0; i < 6; i++) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1)
    periodos.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return periodos
}

export default function NominasIndexPage() {
  const periodos = periodosRecientes()
  return (
    <main className="p-6 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Nóminas</h1>
      <ul className="space-y-2">
        {periodos.map(p => (
          <li key={p}>
            <Link href={`/admin/nominas/${p}`}
              className="block p-4 border rounded hover:bg-gray-50 font-medium">
              {p}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
```

- [ ] **Step 2: `app/admin/nominas/[periodo]/page.tsx`**

```tsx
import { resolverSesionServer } from '@/lib/tenant'
import { nominasDePeriodo } from '@/lib/nominas'
import { prisma } from '@/lib/prisma'
import NominasPanel from './NominasPanel'

export default async function NominasPeriodoPage({ params }: { params: Promise<{ periodo: string }> }) {
  const { empresaId } = await resolverSesionServer()
  const { periodo } = await params
  const nominas = await nominasDePeriodo(empresaId, periodo)

  // Enriquecer con nombre del empleado
  const empleadoIds = nominas.map(n => n.empleadoId)
  const empleados = await prisma.empleados.findMany({
    where: { id: { in: empleadoIds } },
    select: { id: true, nombre: true },
  })
  const nombrePorId = Object.fromEntries(empleados.map(e => [e.id, e.nombre]))

  const rows = nominas.map(n => ({
    ...n,
    nombreEmpleado: nombrePorId[n.empleadoId] as string ?? '—',
  }))

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-2">Nóminas — {periodo}</h1>
      <NominasPanel periodo={periodo} nominas={rows} />
    </main>
  )
}
```

- [ ] **Step 3: `app/admin/nominas/[periodo]/NominasPanel.tsx`** (client component)

```tsx
'use client'
import { useState } from 'react'
import type { NominaRow } from '@/lib/nominas'

interface NominaConNombre extends NominaRow {
  nombreEmpleado: string
}

const ESTADO_CHIP = {
  borrador:   'bg-gray-100 text-gray-600',
  confirmada: 'bg-blue-100 text-blue-700',
  enviada:    'bg-green-100 text-green-700',
}

export default function NominasPanel({ periodo, nominas: init }: { periodo: string; nominas: NominaConNombre[] }) {
  const [nominas, setNominas] = useState(init)
  const [generando, setGenerando] = useState(false)
  const [confirmando, setConfirmando] = useState<string | null>(null)

  async function generarBorradores() {
    setGenerando(true)
    await fetch('/api/admin/nominas/generar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ periodo }),
    })
    window.location.reload()
  }

  async function confirmar(nominaId: string) {
    setConfirmando(nominaId)
    await fetch(`/api/admin/nominas/${nominaId}/confirmar`, { method: 'POST' })
    setConfirmando(null)
    window.location.reload()
  }

  return (
    <div>
      <div className="flex gap-3 mb-6">
        <button onClick={generarBorradores} disabled={generando}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50">
          {generando ? 'Generando...' : `Generar borradores ${periodo}`}
        </button>
      </div>

      {nominas.length === 0 ? (
        <p className="text-gray-400">No hay nóminas para este período. Pulsa "Generar borradores".</p>
      ) : (
        <table className="w-full border text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="p-3 text-left">Empleado</th>
              <th className="p-3 text-right">Bruto</th>
              <th className="p-3 text-right">Neto</th>
              <th className="p-3 text-center">Estado</th>
              <th className="p-3 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {nominas.map(n => (
              <tr key={n.id} className="border-t">
                <td className="p-3">{n.nombreEmpleado}</td>
                <td className="p-3 text-right">{n.datosCalculo?.devengos?.total?.toFixed(2) ?? '—'} €</td>
                <td className="p-3 text-right font-semibold">{n.datosCalculo?.netoAPagar?.toFixed(2) ?? '—'} €</td>
                <td className="p-3 text-center">
                  <span className={`px-2 py-1 rounded text-xs font-medium ${ESTADO_CHIP[n.estado]}`}>
                    {n.estado}
                  </span>
                </td>
                <td className="p-3 text-center">
                  {n.estado === 'borrador' && (
                    <button onClick={() => confirmar(n.id)} disabled={confirmando === n.id}
                      className="text-sm bg-green-600 text-white px-3 py-1 rounded disabled:opacity-50">
                      {confirmando === n.id ? 'Confirmando...' : 'Confirmar'}
                    </button>
                  )}
                  {n.pdfPath && (
                    <a href={`/api/admin/documentos/${n.id}/pdf`} target="_blank"
                      className="ml-2 text-sm text-blue-600 underline">PDF</a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Commit**

```bash
git add apps/rrhh/app/admin/nominas/
git commit -m "feat(rrhh): panel admin de nóminas por período"
```

---

## Task 15: Verificación end-to-end

- [ ] **Step 1: Tests unitarios del motor**

```bash
cd packages/module-nominas && npx vitest run
```

Expected: 6+ tests PASS.

- [ ] **Step 2: Tests de rrhh**

```bash
cd apps/rrhh && npx vitest run
```

Expected: Todos los tests existentes + nuevos (contratos, nominas) PASS.

- [ ] **Step 3: Check de tipos**

```bash
cd apps/rrhh && npx tsc --noEmit
```

Expected: Sin errores.

- [ ] **Step 4: Test manual del flujo completo**

1. Ir a `/admin/empleados/[id]/contrato` → crear contrato (salario 1800€, grupo 7, indefinido, IRPF 10%)
2. Ir a `/admin/nominas` → seleccionar mes actual
3. Pulsar "Generar borradores" → comprobar que aparece la fila con bruto=1800 y neto calculado
4. Pulsar "Confirmar" → verificar que el PDF se genera (aparece enlace PDF)
5. Acceder al portal del empleado `/e` → ver nómina en carpeta documentos con estado "pendiente de firma"
6. Firmar con OTP → verificar que el estado cambia a "firmada"

- [ ] **Step 5: Commit final**

```bash
git add -A
git commit -m "feat(rrhh): sistema de nóminas automatizado completo (motor+BD+PDF+firma+cron)"
```

---

## Notas de implementación

- **`CRON_SECRET`**: añadir como variable de entorno en el proyecto Vercel `central-rrhh`. Sin este secret el cron no funciona en producción.
- **Firma y notificaciones**: usar `solicitarFirma(empresaId, empleadoId, docId)` de `lib/firma.ts`; push con `pushEmpleado(empresaId, empleadoId, titulo, cuerpo, url)` de `lib/push.ts`; email a responsables con `avisarResponsables(empresaId, asunto, texto)` de `lib/notificar.ts`. Firmas ya verificadas contra el código existente.
- **Tablas SS 2026**: las bases y tipos incluidos son aproximados. Verificar en el BOE antes de usar en producción.
- **AT/EP CNAE**: si el CNAE de la empresa no está en la tabla estática, el agente IA hace una estimación. Permitir al responsable sobreescribir manualmente desde `/admin/cuenta`.
- **`@react-pdf/renderer`**: no es compatible con SSR de Next.js en algunos setups. Si hay error al importar en server components, mover la llamada a `generarPdfNomina` a una Route Handler (API route), que ya es lo que hace `confirmar/route.ts`.
