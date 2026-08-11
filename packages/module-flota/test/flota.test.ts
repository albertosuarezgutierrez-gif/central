// Tests de lógica pura del módulo de flota/transporte.
// Runner: node --test (Node 22, type-stripping nativo).

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  round2,
  costePorteEstimado,
  costePorteReal,
  costePorKm,
  rentabilidadPorte,
  rentabilidadVehiculo,
  vehiculoAptoParaCarga,
  intervaloPorte,
  vehiculoDisponible,
  vehiculosAptos,
  asignarVehiculo,
  estadoDocumento,
  alertasDocumentos,
  vehiculosSinDocumentar,
  esPorteIntercompany,
  totalIntercompany,
} from '../src/flota.ts'
import type { Vehiculo, Porte, DocumentoVehiculo, Mantenimiento, Repostaje } from '../src/types.ts'

// ── Helpers ───────────────────────────────────────────────────────────────────

function veh(over: Partial<Vehiculo> = {}): Vehiculo {
  return {
    id: 'v1',
    cuentaId: 'c1',
    nombre: 'Furgo 1',
    matricula: '1234-ABC',
    tipo: 'furgon',
    capacidadKg: 1000,
    capacidadM3: 8,
    esPropio: true,
    tarifaKm: 0.5,
    tarifaFija: 20,
    activo: true,
    ...over,
  }
}

function porte(over: Partial<Porte> = {}): Porte {
  return {
    id: 'p1',
    vehiculoId: 'v1',
    estado: 'completado',
    ...over,
  }
}

// ── Costes ──────────────────────────────────────────────────────────────────

test('round2 redondea a 2 decimales', () => {
  assert.equal(round2(1.005), 1.01)
  assert.equal(round2(70), 70)
})

test('costePorteEstimado/Real derivan de km × tarifaKm + tarifaFija', () => {
  const v = veh()
  const p = porte({ kmEstimados: 100, kmReales: 120 })
  assert.equal(costePorteEstimado(p, v), 70) // 100*0.5 + 20
  assert.equal(costePorteReal(p, v), 80) // 120*0.5 + 20
})

test('costePorte* usa el valor explícito si existe (no recalcula)', () => {
  const v = veh()
  const p = porte({ kmEstimados: 100, costeEstimado: 99, kmReales: 120, costeReal: 111 })
  assert.equal(costePorteEstimado(p, v), 99)
  assert.equal(costePorteReal(p, v), 111)
})

test('costePorKm = costeReal / kmReales (0 si no hay km)', () => {
  const v = veh()
  assert.equal(costePorKm(porte({ kmReales: 120 }), v), round2(80 / 120))
  assert.equal(costePorKm(porte({ kmReales: 0 }), v), 0)
  assert.equal(costePorKm(porte({}), v), 0)
})

test('rentabilidadPorte: desviaciones y margen sobre lo facturado', () => {
  const v = veh()
  const r = rentabilidadPorte(porte({ kmEstimados: 100, kmReales: 120, importeFacturado: 150 }), v)
  assert.equal(r.costeEstimado, 70)
  assert.equal(r.costeReal, 80)
  assert.equal(r.desviacionCoste, 10)
  assert.equal(r.desviacionKm, 20)
  assert.equal(r.importeFacturado, 150)
  assert.equal(r.margen, 70) // 150 − 80
  assert.equal(r.margenPct, 46.67)
})

test('rentabilidadPorte: margenPct 0 si no hay facturación', () => {
  const r = rentabilidadPorte(porte({ kmReales: 100 }), veh())
  assert.equal(r.importeFacturado, 0)
  assert.equal(r.margenPct, 0)
})

test('rentabilidadVehiculo agrega ingresos vs combustible+mantenimiento', () => {
  const v = veh()
  const portes: Porte[] = [
    porte({ id: 'p1', kmReales: 120, importeFacturado: 150 }),
    porte({ id: 'p2', kmReales: 80, importeFacturado: 100 }),
    porte({ id: 'p3', estado: 'cancelado', kmReales: 999, importeFacturado: 999 }), // ignorado
    porte({ id: 'p4', vehiculoId: 'v2', kmReales: 50, importeFacturado: 50 }), // otro vehículo
  ]
  const mant: Mantenimiento[] = [{ id: 'm1', vehiculoId: 'v1', fecha: '2026-06-01', tipo: 'revision', coste: 200 }]
  const rep: Repostaje[] = [
    { id: 'r1', vehiculoId: 'v1', fecha: '2026-06-02', litros: 50, importe: 100 },
    { id: 'r2', vehiculoId: 'v1', fecha: '2026-06-10', litros: 25, importe: 50 },
    { id: 'r3', vehiculoId: 'v2', fecha: '2026-06-10', litros: 25, importe: 50 }, // otro vehículo
  ]
  const rv = rentabilidadVehiculo(v, portes, mant, rep)
  assert.equal(rv.nPortes, 2)
  assert.equal(rv.kmTotales, 200)
  assert.equal(rv.ingresos, 250)
  assert.equal(rv.costeOperativo, 350) // 200 + 100 + 50
  assert.equal(rv.margen, -100)
  assert.equal(rv.margenPct, -40)
  assert.equal(rv.costePorKm, 1.75)
})

// ── Aptitud y asignación ──────────────────────────────────────────────────────

test('vehiculoAptoParaCarga respeta capacidad, tipo y estado', () => {
  assert.equal(vehiculoAptoParaCarga(veh(), { pesoKg: 800 }), true)
  assert.equal(vehiculoAptoParaCarga(veh(), { pesoKg: 1200 }), false)
  assert.equal(vehiculoAptoParaCarga(veh(), { volumenM3: 10 }), false)
  assert.equal(vehiculoAptoParaCarga(veh(), { tipoRequerido: 'frigorifico' }), false)
  assert.equal(
    vehiculoAptoParaCarga(veh({ tipo: 'frigorifico' }), { tipoRequerido: 'frigorifico' }),
    true,
  )
  assert.equal(vehiculoAptoParaCarga(veh({ activo: false }), { pesoKg: 1 }), false)
})

test('intervaloPorte y vehiculoDisponible (solape estricto, cancelados ignorados)', () => {
  assert.equal(intervaloPorte(porte({})), null)
  const portes: Porte[] = [
    porte({ id: 'a', horaSalida: '2026-07-01T10:00:00Z', horaLlegada: '2026-07-01T12:00:00Z' }),
  ]
  // Solapa [11:00,13:00]
  assert.equal(
    vehiculoDisponible('v1', { inicio: '2026-07-01T11:00:00Z', fin: '2026-07-01T13:00:00Z' }, portes),
    false,
  )
  // Toca el extremo [12:00,13:00] → NO solapa
  assert.equal(
    vehiculoDisponible('v1', { inicio: '2026-07-01T12:00:00Z', fin: '2026-07-01T13:00:00Z' }, portes),
    true,
  )
  // Porte cancelado no bloquea
  const cancelado: Porte[] = [
    porte({ id: 'a', estado: 'cancelado', horaSalida: '2026-07-01T10:00:00Z', horaLlegada: '2026-07-01T12:00:00Z' }),
  ]
  assert.equal(
    vehiculoDisponible('v1', { inicio: '2026-07-01T11:00:00Z', fin: '2026-07-01T11:30:00Z' }, cancelado),
    true,
  )
})

test('vehiculosAptos filtra y ordena por menor capacidad suficiente', () => {
  const grande = veh({ id: 'big', capacidadKg: 2000 })
  const pequeno = veh({ id: 'small', capacidadKg: 1000 })
  const incapaz = veh({ id: 'tiny', capacidadKg: 500 })
  const aptos = vehiculosAptos([grande, pequeno, incapaz], { pesoKg: 800 })
  assert.deepEqual(aptos.map((v) => v.id), ['small', 'big'])
})

test('asignarVehiculo elige el mejor libre; null si ninguno', () => {
  const grande = veh({ id: 'big', capacidadKg: 2000 })
  const pequeno = veh({ id: 'small', capacidadKg: 1000 })
  const intervalo = { inicio: '2026-07-01T10:00:00Z', fin: '2026-07-01T12:00:00Z' }
  // Sin ocupación → el pequeño (mejor ajuste)
  assert.equal(asignarVehiculo([grande, pequeno], { pesoKg: 800 })?.id, 'small')
  // El pequeño está ocupado en ese intervalo → cae al grande
  const ocupacion: Porte[] = [
    porte({ id: 'x', vehiculoId: 'small', horaSalida: intervalo.inicio, horaLlegada: intervalo.fin }),
  ]
  assert.equal(
    asignarVehiculo([grande, pequeno], { pesoKg: 800 }, { intervalo, portes: ocupacion })?.id,
    'big',
  )
  // Nadie cubre 5000 kg → null
  assert.equal(asignarVehiculo([grande, pequeno], { pesoKg: 5000 }), null)
})

// ── Gestión documental ────────────────────────────────────────────────────────

function doc(over: Partial<DocumentoVehiculo> = {}): DocumentoVehiculo {
  return { id: 'd1', vehiculoId: 'v1', tipo: 'itv', fechaCaducidad: '2026-09-01', ...over }
}

test('estadoDocumento clasifica caducado / por_caducar / vigente', () => {
  const hoy = '2026-06-25'
  assert.deepEqual(estadoDocumento(doc({ fechaCaducidad: '2026-06-20' }), hoy), {
    estado: 'caducado',
    diasParaCaducar: -5,
  })
  assert.deepEqual(estadoDocumento(doc({ fechaCaducidad: '2026-07-10' }), hoy), {
    estado: 'por_caducar',
    diasParaCaducar: 15,
  })
  assert.equal(estadoDocumento(doc({ fechaCaducidad: '2026-09-01' }), hoy).estado, 'vigente')
})

test('alertasDocumentos devuelve solo no-vigentes, ordenadas por urgencia', () => {
  const hoy = '2026-06-25'
  const docs: DocumentoVehiculo[] = [
    doc({ id: 'vig', fechaCaducidad: '2026-12-01' }), // vigente → fuera
    doc({ id: 'pron', tipo: 'seguro', fechaCaducidad: '2026-07-10' }), // +15
    doc({ id: 'cad', tipo: 'itv', fechaCaducidad: '2026-06-20' }), // −5
  ]
  const alertas = alertasDocumentos(docs, hoy)
  assert.deepEqual(alertas.map((a) => a.documentoId), ['cad', 'pron'])
  assert.equal(alertas[0].estado, 'caducado')
  assert.equal(alertas[1].estado, 'por_caducar')
})

// ── Intercompany ──────────────────────────────────────────────────────────────

test('esPorteIntercompany: interno entre dos sociedades distintas', () => {
  assert.equal(
    esPorteIntercompany(porte({ esInterno: true, sociedadOrigenId: 's1', sociedadDestinoId: 's2' })),
    true,
  )
  assert.equal(
    esPorteIntercompany(porte({ esInterno: true, sociedadOrigenId: 's1', sociedadDestinoId: 's1' })),
    false,
  )
  assert.equal(
    esPorteIntercompany(porte({ esInterno: false, sociedadOrigenId: 's1', sociedadDestinoId: 's2' })),
    false,
  )
  assert.equal(esPorteIntercompany(porte({ esInterno: true, sociedadOrigenId: 's1' })), false)
})

test('totalIntercompany suma facturación interna (excluye cancelados y externos)', () => {
  const portes: Porte[] = [
    porte({ id: 'i1', esInterno: true, sociedadOrigenId: 's1', sociedadDestinoId: 's2', importeFacturado: 100 }),
    porte({ id: 'i2', esInterno: true, sociedadOrigenId: 's1', sociedadDestinoId: 's2', importeFacturado: 50, estado: 'cancelado' }),
    porte({ id: 'ext', importeFacturado: 999 }), // externo
  ]
  assert.equal(totalIntercompany(portes), 100)
})

// ── Un vehículo sin documentos no está «en regla»: está sin documentar ───────

test('vehiculosSinDocumentar detecta ITV/seguro que nunca se han registrado', () => {
  const vehiculos: any[] = [
    { id: 'v1', matricula: '1234ABC' },
    { id: 'v2', matricula: '5678DEF' },
    { id: 'v3', matricula: '9012GHI' },
  ]
  const documentos: any[] = [
    { id: 'd1', vehiculoId: 'v1', tipo: 'itv', fechaCaducidad: '2027-01-01' },
    { id: 'd2', vehiculoId: 'v1', tipo: 'seguro', fechaCaducidad: '2027-01-01' },
    { id: 'd3', vehiculoId: 'v2', tipo: 'itv', fechaCaducidad: '2027-01-01' },
  ]

  const faltan = vehiculosSinDocumentar(vehiculos, documentos)
  // v1 completo; v2 sin seguro; v3 sin nada (el más peligroso, y el que antes
  // salía verde porque no generaba ninguna alerta de caducidad).
  assert.equal(faltan.length, 2)
  assert.deepEqual(faltan.find((f) => f.vehiculoId === 'v2')?.faltan, ['seguro'])
  assert.deepEqual(faltan.find((f) => f.vehiculoId === 'v3')?.faltan, ['itv', 'seguro'])
})

test('vehiculosSinDocumentar no señala nada cuando todo está registrado', () => {
  const vehiculos: any[] = [{ id: 'v1', matricula: '1234ABC' }]
  const documentos: any[] = [
    { id: 'd1', vehiculoId: 'v1', tipo: 'itv', fechaCaducidad: '2020-01-01' },
    { id: 'd2', vehiculoId: 'v1', tipo: 'seguro', fechaCaducidad: '2020-01-01' },
  ]
  // OJO: caducados, pero REGISTRADOS — de esos ya avisa `alertasDocumentos`.
  assert.deepEqual(vehiculosSinDocumentar(vehiculos, documentos), [])
})
