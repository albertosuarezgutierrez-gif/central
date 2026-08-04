import assert from 'node:assert/strict'
import { test } from 'node:test'
import { evaluarFlip, reformaEstimada, FLIP_MARGEN_MIN } from '../src/flip.ts'
import type { Oportunidad, SubastaInmueble } from '../src/types.ts'

const ANIO = 2026

function subasta(extra: Partial<SubastaInmueble> = {}): SubastaInmueble {
  return {
    dedupeKey: 'X',
    fuente: 'boe',
    tipo: 'judicial',
    descripcion: 'URBANA. VIVIENDA en calle Real 1, de Sevilla.',
    superficie: 100,
    anioConstruccion: 1990,
    situacionPosesoria: 'desconocida',
    ...extra,
  }
}

function oportunidad(extra: Partial<Oportunidad> = {}): Oportunidad {
  return {
    coste: {
      remate: 80000, cargasPreferentes: 0, impuestoTransmision: 7000, baseImponible: 100000,
      impuestoConcepto: 'ITP 7%', notariaRegistro: 2500, cancelacionCargas: 0,
      plusvaliaMunicipal: 1000, comunidadPendiente: 0, ibiPendiente: 0, lanzamiento: 0,
      total: 90500, avisos: [],
    },
    valorMercado: 180000,
    origenValor: 'tasacion',
    descuento: 0.5,
    deposito: 4000,
    puntuacion: 60,
    factorRiesgo: 1,
    motivos: [],
    avisos: [],
    ...extra,
  }
}

test('reforma por edad: integral / media / ligera', () => {
  assert.equal(reformaEstimada(100, 1970, ANIO).nivel, 'integral')  // 56 años
  assert.equal(reformaEstimada(100, 1970, ANIO).importe, 70000)
  assert.equal(reformaEstimada(100, 1996, ANIO).nivel, 'media')     // 30 años
  assert.equal(reformaEstimada(100, 2015, ANIO).nivel, 'ligera')    // 11 años
})

test('reforma sin superficie no se estima; sin año asume media con aviso', () => {
  assert.equal(reformaEstimada(null, 1990, ANIO).importe, null)
  const sinAnio = reformaEstimada(100, null, ANIO)
  assert.equal(sinAnio.nivel, 'media')
  assert.match(sinAnio.aviso ?? '', /Sin año/)
})

test('flip viable: vivienda de 1990, 100 m², compra 90.5k, mercado 180k', () => {
  const f = evaluarFlip(subasta(), oportunidad(), ANIO)
  // invertido = 90.500 + 40.000 reforma = 130.500; venta neta = 180.000 − 5.400
  assert.equal(f.reforma, 40000)
  assert.equal(f.costesVenta, 5400)
  assert.equal(f.margen, 180000 - 130500 - 5400)
  assert.ok((f.margenPct ?? 0) > FLIP_MARGEN_MIN)
  assert.ok(f.apto)
})

test('ocupada o proindiviso NO es apta para flip', () => {
  assert.equal(evaluarFlip(subasta({ situacionPosesoria: 'ocupada' }), oportunidad(), ANIO).apto, false)
  assert.equal(evaluarFlip(subasta({ porcentajeSubastado: 50 }), oportunidad(), ANIO).apto, false)
})

test('un garaje queda fuera de la lente flip pero conserva el cálculo', () => {
  const f = evaluarFlip(subasta({ descripcion: 'PLAZA DE GARAJE Nº 12 EN SÓTANO' }), oportunidad(), ANIO)
  assert.equal(f.apto, false)
  assert.match(f.motivos.join(' '), /garaje/)
})

test('sin valor de mercado el margen es null con motivo, nunca inventado', () => {
  const f = evaluarFlip(subasta(), oportunidad({ valorMercado: null, origenValor: null }), ANIO)
  assert.equal(f.margen, null)
  assert.equal(f.margenPct, null)
  assert.match(f.motivos.join(' '), /Sin valor de mercado/)
})

test('valor por comparables lleva aviso de estimación', () => {
  const f = evaluarFlip(subasta(), oportunidad({ origenValor: 'comparables' }), ANIO)
  assert.match(f.avisos.join(' '), /ESTIMADO/)
})
