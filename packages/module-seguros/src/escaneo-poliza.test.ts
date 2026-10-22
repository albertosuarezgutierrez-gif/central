import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ACCION_ACTUALIZADA_DOCUMENTO,
  MODELO_POLIZA_DEFECTO,
  MODELO_POLIZA_SUPLENTE,
  decidirFichaPorIdentidad,
  fusionarLecturaEnOportunidad,
  importeLeido,
  modelosLecturaPoliza,
  normalizarPersonasPoliza,
  procedenciaCamposOportunidad,
  riesgoLeidoDeDocumento,
} from './escaneo-poliza.ts'

// DNI/CIF con la letra/control correctos.
const DNI_A = '12345678Z'
const DNI_B = '87654321X'
const CIF = 'B12345674'

test('modelo: por defecto Gemini 3.8 Flash con Sonnet 4.5 de suplente', () => {
  assert.deepEqual(modelosLecturaPoliza({}), [MODELO_POLIZA_DEFECTO, MODELO_POLIZA_SUPLENTE])
  assert.equal(MODELO_POLIZA_DEFECTO, 'google/gemini-3.8-flash')
})

test('modelo: la env lo cambia; un valor sin forma de slug se ignora; sin duplicados', () => {
  assert.deepEqual(modelosLecturaPoliza({ OPENROUTER_POLIZA_MODEL: ' openai/gpt-5.1 ' }), ['openai/gpt-5.1', MODELO_POLIZA_SUPLENTE])
  assert.deepEqual(modelosLecturaPoliza({ OPENROUTER_POLIZA_MODEL: 'gemini' }), [MODELO_POLIZA_DEFECTO, MODELO_POLIZA_SUPLENTE])
  assert.deepEqual(modelosLecturaPoliza({ OPENROUTER_POLIZA_MODEL_SUPLENTE: MODELO_POLIZA_DEFECTO }), [MODELO_POLIZA_DEFECTO])
})

test('personas: todos los roles, de cualquier ramo, con su identificador', () => {
  const p = normalizarPersonasPoliza({
    tomador: 'SOTO CUATRO SL', cifTomador: `ES${CIF}`, dni: null,
    personas: [
      { rol: 'asegurado', nombre: 'Ana Ruiz Gil', dni: DNI_A },
      { rol: 'Beneficiarios', nombre: 'Luis Ruiz', dni: DNI_B },
      { rol: 'tomador', nombre: 'Soto Cuatro S.L.', dni: CIF },
      { rol: 'inventado', nombre: 'X', dni: DNI_A },
      { rol: 'asegurado', nombre: null, dni: null },
    ],
    figuras: [{ rol: 'conductor_principal', nombre: 'Ana Ruiz Gil', dni: DNI_A }],
  })
  assert.deepEqual(p.map((x) => [x.rol, x.identificador, x.tipoPersona]), [
    ['tomador', CIF, 'juridica'],
    ['asegurado', DNI_A, 'fisica'],
    ['beneficiario', DNI_B, 'fisica'],
    ['conductor_habitual', DNI_A, 'fisica'],
  ])
})

test('personas: misma persona sin DNI en una mención se une; dos DNI distintos nunca', () => {
  const p = normalizarPersonasPoliza({ personas: [
    { rol: 'asegurado', nombre: 'Ana Ruiz', dni: null },
    { rol: 'asegurado', nombre: 'RUIZ ANA', dni: DNI_A },
    { rol: 'asegurado', nombre: 'Ana Ruiz', dni: DNI_B },
  ] })
  assert.equal(p.length, 2)
  assert.deepEqual(p.map((x) => x.identificador), [DNI_A, DNI_B])
  assert.deepEqual(normalizarPersonasPoliza(null), [])
})

test('riesgo: capitales en euros (texto español incluido) y garantías; null = no leído', () => {
  const r = riesgoLeidoDeDocumento({ capitalContinente: '61.000,00 €', capitalContenido: 7000, capitalAsegurado: 'no consta', garantias: ['Incendio', { nombre: 'incendio' }, { nombre: 'RC', capital: '300.000', franquicia: 0 }] })
  assert.deepEqual(r.capitales, { continente: 61000, contenido: 7000, asegurado: null })
  assert.deepEqual(r.garantias, [{ nombre: 'Incendio', capital: null, franquicia: null }, { nombre: 'RC', capital: 300000, franquicia: null }])
  assert.equal(riesgoLeidoDeDocumento({}).garantias, null)
  assert.equal(importeLeido(0), null)
})

test('ficha: la única activa gana a la descartada', () => {
  assert.deepEqual(decidirFichaPorIdentidad([{ id: 'vieja', activo: false }, { id: 'buena', activo: true }]), { tipo: 'ficha', clienteId: 'buena', reactivar: false, porque: 'unica_activa' })
})

test('ficha: la única, descartada, se usa y se REACTIVA', () => {
  assert.deepEqual(decidirFichaPorIdentidad([{ id: 'd', activo: false }]), { tipo: 'ficha', clienteId: 'd', reactivar: true, porque: 'unica_descartada' })
})

test('ficha: dos activas con la misma identidad = ambigua (no se elige a ciegas)', () => {
  assert.deepEqual(decidirFichaPorIdentidad([{ id: 'a', activo: true }, { id: 'b', activo: true }]), { tipo: 'ambigua', candidatas: ['a', 'b'] })
  assert.deepEqual(decidirFichaPorIdentidad([{ id: 'a', activo: false }, { id: 'b', activo: false }]), { tipo: 'ambigua', candidatas: ['a', 'b'] })
})

test('ficha: la de donde se sube manda si tiene esa identidad; null = no mirado', () => {
  assert.deepEqual(decidirFichaPorIdentidad([{ id: 'a', activo: true }, { id: 'b', activo: false }], 'b'), { tipo: 'ficha', clienteId: 'b', reactivar: true, porque: 'preferida' })
  assert.deepEqual(decidirFichaPorIdentidad(null), { tipo: 'sin_mirar' })
  assert.deepEqual(decidirFichaPorIdentidad([]), { tipo: 'ninguna' })
})

test('procedencia: abierta por documento → documento; editada a mano → manual; sin historial → null', () => {
  const ev = [
    { accion: 'creada_mano', detalle: { fechaFinVigencia: '2027-01-01', prima: 300, origen: 'documento:portal' } },
    { accion: 'editada', detalle: { prima: { antes: 300, despues: 280 } } },
  ]
  assert.deepEqual(procedenciaCamposOportunidad(ev), { fechaFinVigencia: 'documento', prima: 'manual' })
  assert.deepEqual(procedenciaCamposOportunidad([{ accion: 'creada_mano', detalle: { fechaFinVigencia: '2027-01-01', prima: null } }]), { fechaFinVigencia: 'manual', prima: null })
  assert.deepEqual(procedenciaCamposOportunidad([...ev, { accion: ACCION_ACTUALIZADA_DOCUMENTO, detalle: { cambios: { prima: 310 } } }]).prima, 'documento')
  assert.deepEqual(procedenciaCamposOportunidad([{ accion: 'creada_portal', detalle: { prima: 100 } }]).prima, 'otra')
  assert.deepEqual(procedenciaCamposOportunidad([]), { fechaFinVigencia: null, prima: null })
})

const sinRiesgo = { capitales: { continente: null, contenido: null, asegurado: null }, garantias: null }

test('fusión: leído pisa lo leído antes; lo manual NO se pisa y queda la discrepancia', () => {
  const r = fusionarLecturaEnOportunidad({
    actual: { fechaFinVigencia: '2026-11-01', prima: 280, lectura: null },
    procedencia: { fechaFinVigencia: 'documento', prima: 'manual' },
    leido: { fechaFinVigencia: '2027-11-01', prima: 310, vencimientoDocumento: '2027-11-01', riesgo: sinRiesgo },
    leidoEn: '2026-10-22T10:00:00Z',
  })
  assert.deepEqual(r.cambios, { fechaFinVigencia: '2027-11-01' })
  assert.deepEqual(r.discrepancias, [{ campo: 'prima', actual: 280, leido: 310, motivo: 'manual' }])
  assert.deepEqual(r.antes, { fechaFinVigencia: '2026-11-01', prima: 280, lectura: {} })
})

test('fusión: null no pisa (null = no leído); hueco se rellena; sin procedencia = conservador', () => {
  const r = fusionarLecturaEnOportunidad({
    actual: { fechaFinVigencia: '2026-11-01', prima: null, lectura: null },
    procedencia: { fechaFinVigencia: null, prima: null },
    leido: { fechaFinVigencia: '2027-01-01', prima: 199.9, vencimientoDocumento: null, riesgo: sinRiesgo },
    leidoEn: 'x',
  })
  assert.deepEqual(r.cambios, { prima: 199.9 })
  assert.equal(r.discrepancias[0].motivo, 'sin_procedencia')
  const nada = fusionarLecturaEnOportunidad({
    actual: { fechaFinVigencia: '2026-11-01', prima: 280, lectura: null },
    procedencia: { fechaFinVigencia: 'documento', prima: 'documento' },
    leido: { fechaFinVigencia: null, prima: null, vencimientoDocumento: null, riesgo: sinRiesgo },
    leidoEn: 'x',
  })
  assert.deepEqual(nada.cambios, {})
  assert.equal(nada.lecturaCambiada, false)
})

test('fusión: capitales y garantías con fuente y fecha; un documento más antiguo no pisa', () => {
  const primera = fusionarLecturaEnOportunidad({
    actual: { fechaFinVigencia: null, prima: null, lectura: null },
    procedencia: { fechaFinVigencia: null, prima: null },
    leido: { fechaFinVigencia: '2027-03-01', prima: 400, vencimientoDocumento: '2027-03-01', riesgo: { capitales: { continente: 61000, contenido: null, asegurado: null }, garantias: [{ nombre: 'Incendio', capital: null, franquicia: null }] } },
    leidoEn: '2026-10-22',
  })
  assert.deepEqual(primera.lectura.capitales, { continente: { valor: 61000, fuente: 'documento', leido_en: '2026-10-22' } })
  assert.equal(primera.lectura.garantias?.fuente, 'documento')
  const vieja = fusionarLecturaEnOportunidad({
    actual: { fechaFinVigencia: '2027-03-01', prima: 400, lectura: primera.lectura },
    procedencia: { fechaFinVigencia: 'documento', prima: 'documento' },
    leido: { fechaFinVigencia: '2027-03-01', prima: 350, vencimientoDocumento: '2026-03-01', riesgo: { capitales: { continente: 55000, contenido: null, asegurado: null }, garantias: null } },
    leidoEn: '2026-10-23',
  })
  assert.deepEqual(vieja.cambios, {})
  assert.deepEqual(vieja.discrepancias.map((d) => [d.campo, d.motivo]), [['prima', 'documento_mas_antiguo'], ['capitales.continente', 'documento_mas_antiguo']])
  // Un capital puesto a mano (fuente ≠ documento) no se pisa.
  const manual = fusionarLecturaEnOportunidad({
    actual: { fechaFinVigencia: null, prima: null, lectura: { capitales: { contenido: { valor: 9000, fuente: 'manual', leido_en: '' } } } },
    procedencia: { fechaFinVigencia: null, prima: null },
    leido: { fechaFinVigencia: null, prima: null, vencimientoDocumento: null, riesgo: { capitales: { continente: null, contenido: 7000, asegurado: null }, garantias: [] } },
    leidoEn: 'y',
  })
  assert.equal(manual.lectura.capitales?.contenido?.valor, 9000)
  assert.equal(manual.discrepancias[0].motivo, 'manual')
})
