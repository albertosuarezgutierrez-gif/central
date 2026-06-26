// Tests con vitest (resolver de bundler): module-transporte importa @central/module-flota en
// runtime, y el index.ts de flota tiene re-exports de valor sin extensión que `node --test` no
// resuelve. Por eso este paquete corre con vitest (igual que core-firma / module-rrhh) y se lista
// en el script `test:vitest` de la raíz, no en `pnpm -r run test`.
import { describe, it, expect } from 'vitest'

import type { Porte, Vehiculo } from '@central/module-flota'
import {
  ESTADOS_ACTIVOS,
  puedeTransicionar,
  transicionar,
  importeServicio,
  costeDePortes,
  sugerirImporte,
  margenServicio,
  esIntercompany,
  totalIntercompany,
  operacionIntercompanyDe,
  resumenServicios,
} from '../src/transporte.ts'
import type { ServicioTransporte } from '../src/types.ts'

// ─── Fixtures ──────────────────────────────────────────────────────────────────
const camion: Vehiculo = {
  id: 'v1',
  cuentaId: 'c1',
  nombre: 'Camión 1',
  matricula: '1234ABC',
  tipo: 'camion',
  esPropio: true,
  tarifaKm: 1.5,
  tarifaFija: 20,
  activo: true,
}

// Porte con coste explícito real.
const porteReal: Porte = {
  id: 'p1',
  vehiculoId: 'v1',
  estado: 'completado',
  kmReales: 100,
  costeReal: 200,
}

// Porte sin coste explícito → se deriva de km × tarifa + fija (estimado).
const porteEstimado: Porte = {
  id: 'p2',
  vehiculoId: 'v1',
  estado: 'planificado',
  kmEstimados: 50, // 50 × 1.5 + 20 = 95
}

function servicio(over: Partial<ServicioTransporte> = {}): ServicioTransporte {
  return {
    id: 's1',
    aTerceros: true,
    fecha: '2026-06-26',
    estado: 'planificado',
    porteIds: [],
    ...over,
  }
}

// ─── Máquina de estados ──────────────────────────────────────────────────────
describe('máquina de estados', () => {
  it('transiciones válidas e inválidas', () => {
    expect(puedeTransicionar('presupuestado', 'planificado')).toBe(true)
    expect(puedeTransicionar('planificado', 'en_curso')).toBe(true)
    expect(puedeTransicionar('entregado', 'facturado')).toBe(true)
    expect(puedeTransicionar('en_curso', 'cancelado')).toBe(true)
    expect(puedeTransicionar('facturado', 'cancelado')).toBe(false)
    expect(puedeTransicionar('presupuestado', 'facturado')).toBe(false)
  })

  it('transicionar devuelve nuevo objeto y lanza si es inválida', () => {
    const s = servicio({ estado: 'planificado' })
    const s2 = transicionar(s, 'en_curso')
    expect(s2.estado).toBe('en_curso')
    expect(s.estado).toBe('planificado') // inmutable
    expect(() => transicionar(s, 'facturado')).toThrow()
  })
})

// ─── Importe ─────────────────────────────────────────────────────────────────
describe('importe', () => {
  it('aplica descuento y nunca baja de 0; null → 0', () => {
    expect(importeServicio(servicio({ importe: 500 }))).toBe(500)
    expect(importeServicio(servicio({ importe: 500, descuentoEur: 120 }))).toBe(380)
    expect(importeServicio(servicio({ importe: 100, descuentoEur: 999 }))).toBe(0)
    expect(importeServicio(servicio({ importe: null }))).toBe(0)
  })
})

// ─── Coste compuesto con module-flota ────────────────────────────────────────
describe('coste compuesto con module-flota', () => {
  it('costeDePortes suma portes por id (real vs estimado) e ignora vehículos desconocidos', () => {
    const s = servicio({ porteIds: ['p1', 'p2'] })
    // p1 real = 200; p2 estimado = 50×1.5+20 = 95 → 295
    expect(costeDePortes(s, [porteReal, porteEstimado], [camion])).toBe(295)
    expect(costeDePortes(servicio({ porteIds: ['p1'] }), [porteReal, porteEstimado], [camion])).toBe(200)
    expect(costeDePortes(s, [porteReal, porteEstimado], [])).toBe(0) // vehículo no presente
  })

  it('sugerirImporte aplica margen sobre el coste', () => {
    const s = servicio({ porteIds: ['p1'] }) // coste 200
    expect(sugerirImporte(s, [porteReal], [camion])).toBe(240) // ×1.2
    expect(sugerirImporte(s, [porteReal], [camion], 0.5)).toBe(300) // ×1.5
  })

  it('margenServicio = importe − coste', () => {
    const s = servicio({ porteIds: ['p1'], importe: 300 }) // coste 200
    const m = margenServicio(s, [porteReal], [camion])
    expect(m.ingreso).toBe(300)
    expect(m.coste).toBe(200)
    expect(m.margen).toBe(100)
    expect(m.margenPct).toBe(33.33)
  })
})

// ─── Intercompany ────────────────────────────────────────────────────────────
describe('intercompany', () => {
  it('esIntercompany solo si interno y entre sociedades distintas', () => {
    expect(esIntercompany(servicio({ aTerceros: false, sociedadOrigenId: 'A', sociedadDestinoId: 'B' }))).toBe(true)
    expect(esIntercompany(servicio({ aTerceros: true, sociedadOrigenId: 'A', sociedadDestinoId: 'B' }))).toBe(false)
    expect(esIntercompany(servicio({ aTerceros: false, sociedadOrigenId: 'A', sociedadDestinoId: 'A' }))).toBe(false)
  })

  it('totalIntercompany suma internos no cancelados y operacionIntercompanyDe proyecta la forma', () => {
    const servicios = [
      servicio({ id: 's1', aTerceros: false, sociedadOrigenId: 'A', sociedadDestinoId: 'B', importe: 300 }),
      servicio({ id: 's2', aTerceros: true, sociedadOrigenId: 'A', sociedadDestinoId: 'B', importe: 999 }),
      servicio({ id: 's3', aTerceros: false, sociedadOrigenId: 'A', sociedadDestinoId: 'B', importe: 100, estado: 'cancelado' }),
    ]
    expect(totalIntercompany(servicios)).toBe(300)

    expect(operacionIntercompanyDe(servicios[0])).toEqual({
      sociedadOrigenId: 'A',
      sociedadDestinoId: 'B',
      importe: 300,
      tipo: 'flota',
      parent: { parentId: 's1', parentType: 'porte' },
    })
    expect(operacionIntercompanyDe(servicios[1])).toBeNull() // a terceros
  })
})

// ─── Resumen ─────────────────────────────────────────────────────────────────
describe('resumen', () => {
  it('agrega por estado, activos, terceros e interno', () => {
    const servicios = [
      servicio({ id: 's1', aTerceros: true, importe: 500, estado: 'planificado' }),
      servicio({ id: 's2', aTerceros: false, sociedadOrigenId: 'A', sociedadDestinoId: 'B', importe: 300, estado: 'en_curso' }),
      servicio({ id: 's3', aTerceros: true, importe: 200, estado: 'facturado' }),
      servicio({ id: 's4', aTerceros: true, importe: 99, estado: 'cancelado' }),
    ]
    const r = resumenServicios(servicios)
    expect(r.activos).toBe(2) // planificado + en_curso
    expect(r.ingresosTerceros).toBe(700) // 500 + 200 (cancelado excluido)
    expect(r.totalInterno).toBe(300)
    expect(r.porEstado.cancelado).toBe(1)
    expect(ESTADOS_ACTIVOS).toEqual(['planificado', 'en_curso', 'entregado'])
  })
})
