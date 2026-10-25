import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { DatosCatastro } from '@central/core-catastro'

import { VIGENCIA_DIAS, cacheDeCatastro, debeConsultarCatastro } from './catastro-inmueble.ts'

const REF = '9872023VH5797S0001WX'
const AHORA = new Date('2026-10-25T10:00:00Z')
const haceDias = (n: number) => new Date(AHORA.getTime() - n * 86_400_000)
const base = { referenciaCatastral: REF, uso: 'vivienda', estado: null as string | null, consultadoEn: null as Date | null, ahora: AHORA }

const datos = (x: Partial<DatosCatastro> = {}): DatosCatastro => ({
  direccion: null, superficie: 90, anioConstruccion: null, uso: null, cuotaParticipacion: null, clase: null,
  provincia: null, municipio: null, codigoPostal: null, construcciones: [], ...x,
})

test('nunca consultado → se consulta; con referencia de 14, sin referencia o uso sin estimación → no', () => {
  assert.equal(debeConsultarCatastro(base), true)
  assert.equal(debeConsultarCatastro({ ...base, referenciaCatastral: REF.slice(0, 14) }), false)
  assert.equal(debeConsultarCatastro({ ...base, referenciaCatastral: null }), false)
  assert.equal(debeConsultarCatastro({ ...base, uso: 'garaje' }), false)
})

test('🚨 la caché caduca por estado: ok 365 d, sin_datos 30 d, no_responde 1 d (no se llama en cada pintado)', () => {
  for (const estado of ['ok', 'sin_datos', 'no_responde'] as const) {
    const v = VIGENCIA_DIAS[estado]
    assert.equal(debeConsultarCatastro({ ...base, estado, consultadoEn: haceDias(v - 1) }), false, `${estado} fresca`)
    assert.equal(debeConsultarCatastro({ ...base, estado, consultadoEn: haceDias(v) }), true, `${estado} caducada`)
  }
  assert.equal(debeConsultarCatastro({ ...base, estado: 'raro', consultadoEn: haceDias(1) }), true, 'estado ilegible: se vuelve a mirar')
})

test('respuesta → caché: sin respuesta ≠ sin datos ≠ ok; superficie ≤ 0 o ausente nunca es 0', () => {
  assert.deepEqual(cacheDeCatastro(null), { estado: 'no_responde', superficieM2: null, tipoVivienda: null })
  assert.deepEqual(cacheDeCatastro(datos({ superficie: null })), { estado: 'sin_datos', superficieM2: null, tipoVivienda: null })
  assert.deepEqual(cacheDeCatastro(datos({ superficie: 0 })), { estado: 'sin_datos', superficieM2: null, tipoVivienda: null })
  assert.deepEqual(cacheDeCatastro(datos({ superficie: 87.456 })), { estado: 'ok', superficieM2: 87.46, tipoVivienda: null })
})

test('el tipo de vivienda sale del Catastro (piso con elementos comunes); si no se puede decir, null', () => {
  const piso = datos({
    cuotaParticipacion: 12.5,
    construcciones: [{ uso: 'VIVIENDA', planta: '02', superficie: 90 } as never, { uso: 'ELEMENTOS COMUNES', planta: '00', superficie: 5 } as never],
  })
  assert.equal(cacheDeCatastro(piso).tipoVivienda, 'piso')
})
