// Los tres defectos que la validación en producción destapó en el lector
// registral (30/07/2026). Cada uno vale dinero: una fecha que no se lee deja
// sin evaluar la caducidad, una fórmula de cierre tomada por carga ensucia el
// coste, y un asiento contado dos veces lo infla directamente.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsearFechaRegistral, estadoCaducidad } from '../src/caducidad.ts'
import {
  esFormulaDeCierre,
  fusionarCargas,
  identidadCarga,
  letraAnotacion,
  normalizarCuadroCargas,
  cargasQueSubsisten,
} from '../src/cargas.ts'
import type { Carga } from '../src/cargas.ts'

const carga = (extra: Partial<Carga> = {}): Carga => ({
  tipo: 'embargo',
  acreedor: 'AEAT',
  importe: 3600,
  fecha: null,
  rango: 'anterior',
  cancelada: false,
  literal: null,
  ...extra,
})

// ── 1. Fechas registrales EN LETRA ──────────────────────────────────────────

test('lee una fecha escrita enteramente en letra', () => {
  const r = parsearFechaRegistral('diecisiete de agosto de dos mil nueve')
  assert.equal(r?.fecha.toISOString().slice(0, 10), '2009-08-17')
  assert.equal(r?.exacta, true)
})

test('lee las formas mixtas (día en cifra, año en letra y al revés)', () => {
  assert.equal(parsearFechaRegistral('17 de agosto de dos mil nueve')?.fecha.toISOString().slice(0, 10), '2009-08-17')
  assert.equal(parsearFechaRegistral('diecisiete de agosto de 2009')?.fecha.toISOString().slice(0, 10), '2009-08-17')
})

test('lee la fecha en letra dentro de una frase del asiento', () => {
  const r = parsearFechaRegistral('anotacion letra C de fecha veintitres de enero de dos mil quince')
  assert.equal(r?.fecha.toISOString().slice(0, 10), '2015-01-23')
})

test('sin día legible toma el ÚLTIMO del mes: menos antigüedad, menos caducidad', () => {
  const r = parsearFechaRegistral('en agosto de dos mil nueve')
  assert.equal(r?.fecha.toISOString().slice(0, 10), '2009-08-31')
  assert.equal(r?.exacta, false)
})

test('un año suelto en letra vale como último recurso, a 31 de diciembre', () => {
  const r = parsearFechaRegistral('del año dos mil nueve')
  assert.equal(r?.fecha.toISOString().slice(0, 10), '2009-12-31')
  assert.equal(r?.exacta, false)
})

test('no inventa fecha cuando no hay ninguna', () => {
  assert.equal(parsearFechaRegistral('anotación letra C, sin fecha'), null)
  assert.equal(parsearFechaRegistral('finca cuarenta y dos'), null)
})

test('la caducidad del art. 86 LH YA se evalúa sobre una fecha en letra', () => {
  const hoy = new Date('2026-07-30T00:00:00Z')
  const e = estadoCaducidad(carga({ fecha: 'diecisiete de agosto de dos mil nueve' }), hoy)
  // Antes salía `sin_fecha` y la anotación se contaba entera sin decir nada.
  assert.equal(e.estado, 'posible_caducada')
  assert.equal(e.fechaExacta, true)
})

// ── 2. La fórmula de cierre NO es una carga ─────────────────────────────────

test('«SIN MÁS CARGAS, salvo AFECCIONES FISCALES» no es un asiento', () => {
  const cuadro = normalizarCuadroCargas(
    {
      procedimiento: 'embargo',
      confianza: 0.9,
      cargas: [
        { tipo: 'embargo', acreedor: 'AEAT', importe: 3600, rango: 'la_que_ejecuta', literal: 'Anotación letra C' },
        { tipo: 'afeccion_fiscal', literal: 'SIN MÁS CARGAS, salvo AFECCIONES FISCALES vigentes' },
      ],
    },
    'ocr_ia',
  )

  assert.equal(cuadro.cargas.length, 1)
  assert.equal(cuadro.cargas[0].tipo, 'embargo')
  // La fórmula dice justo lo contrario de lo que se le hacía decir.
  assert.equal(cuadro.sinMasCargas, true)
  assert.ok(cuadro.notas.some((n) => /Fórmula de cierre/.test(n)))
  assert.ok(cuadro.notas.some((n) => /AFECCIONES FISCALES/i.test(n)))

  // Y deja de aparecer como carga de rango indeterminado en los avisos.
  const s = cargasQueSubsisten(cuadro)
  assert.equal(s.importe, 0)
  assert.ok(!s.avisos.some((a) => /rango indeterminado/.test(a)))
})

test('una afección fiscal DE VERDAD sigue siendo una carga', () => {
  // Con importe o fecha es un asiento, aunque el literal repita la fórmula.
  assert.equal(esFormulaDeCierre(carga({ tipo: 'afeccion_fiscal', importe: 1200, literal: 'sin más cargas' })), false)
  assert.equal(esFormulaDeCierre(carga({ tipo: 'afeccion_fiscal', importe: null, fecha: '2020-01-02', literal: 'sin más cargas' })), false)
  assert.equal(esFormulaDeCierre(carga({ tipo: 'afeccion_fiscal', importe: null, literal: 'Afección fiscal por ITP, 5 años' })), false)
})

// ── 3. El mismo asiento leído en dos documentos ────────────────────────────

test('la letra identifica el asiento por encima del importe', () => {
  assert.equal(letraAnotacion(carga({ literal: 'Anotación preventiva de embargo letra C, a favor de la AEAT' })), 'C')
  assert.equal(letraAnotacion(carga({ literal: 'letra de cambio protestada' })), null)
  assert.equal(
    identidadCarga(carga({ importe: 3600, literal: 'Anotación letra C' })),
    identidadCarga(carga({ importe: 2600, literal: 'anotación letra c) del registro' })),
  )
})

test('el embargo letra C ya no se cuenta dos veces (caso real, 30/07/2026)', () => {
  // La certificación cita la responsabilidad TOTAL (3.600€) y el informe de
  // valoración solo el principal (2.600€): mismo asiento, dos importes.
  const hipoteca = carga({ tipo: 'hipoteca', acreedor: 'BANCO X', importe: 44850, literal: 'Hipoteca inscripción 3ª' })
  const { cargas, avisos } = fusionarCargas([
    hipoteca,
    carga({ importe: 3600, literal: 'Anotación letra C de embargo' }),
    carga({ importe: 2600, literal: 'anotación letra C, principal' }),
  ])

  assert.equal(cargas.length, 2)
  const total = cargas.reduce((s, c) => s + (c.importe ?? 0), 0)
  assert.equal(total, 48450) // antes: 51.050€
  assert.ok(avisos.some((a) => /letra C/.test(a) && /MAYOR/.test(a)))
})

test('al fusionar se queda con el rango más CARO y no da nada por cancelado', () => {
  const { cargas } = fusionarCargas([
    carga({ rango: 'posterior', cancelada: true, literal: 'Anotación letra B' }),
    carga({ rango: 'anterior', cancelada: false, literal: 'anotación letra B' }),
  ])
  assert.equal(cargas.length, 1)
  assert.equal(cargas[0].rango, 'anterior')
  assert.equal(cargas[0].cancelada, false)
})

test('sin letra, dos asientos distintos NO se colapsan', () => {
  const { cargas } = fusionarCargas([
    carga({ acreedor: 'AEAT', fecha: '2015-04-10', importe: 3600 }),
    carga({ acreedor: 'TGSS', fecha: '2018-02-01', importe: 900 }),
  ])
  assert.equal(cargas.length, 2)
})
