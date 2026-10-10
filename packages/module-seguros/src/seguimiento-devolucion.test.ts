import test from 'node:test'
import assert from 'node:assert/strict'
import { PREFIJO_TAREA_DEVOLUCION, hitoDevolucion, suspensionDesde, textoTareaDevolucion } from './seguimiento-devolucion.ts'

const hoy = (iso: string) => new Date(`${iso}T10:00:00Z`)

test('hitos desde el EFECTO del recibo: 0 / 7 / 25 / 30, y extinguida a los 180', () => {
  assert.equal(hitoDevolucion('2026-09-19', hoy('2026-09-28')), 'segunda_llamada')
  assert.equal(hitoDevolucion('2026-09-19', hoy('2026-09-20')), 'inicial')
  assert.equal(hitoDevolucion('2026-09-01', hoy('2026-09-26')), 'ultimo_aviso')
  assert.equal(hitoDevolucion('2026-05-22', hoy('2026-09-28')), 'sin_cobertura')
  assert.equal(hitoDevolucion('2026-01-01', hoy('2026-09-28')), null)
  assert.equal(hitoDevolucion(null, hoy('2026-09-28')), 'inicial')
})

test('suspensión = efecto + 30 días; sin efecto, null', () => {
  assert.equal(suspensionDesde('2026-09-19'), '2026-10-19')
  assert.equal(suspensionDesde(null), null)
})

test('el texto de la tarea dice qué preguntar según el motivo', () => {
  const base = { hito: 'inicial' as const, ramo: 'auto', compania: 'Reale', importe: 184.58, fechaEfecto: '2026-09-19' }
  const cuenta = textoTareaDevolucion({ ...base, tipoMotivo: 'cuenta', motivo: 'RAZONES.REG.' })
  assert.match(cuenta, /184,58€/)
  assert.match(cuenta, /IBAN y titular/)
  assert.match(cuenta, /19\/10\/2026/)
  assert.match(textoTareaDevolucion({ ...base, tipoMotivo: 'cliente_rechaza', motivo: 'no conforme' }), /presupuesto/)
  assert.match(textoTareaDevolucion({ ...base, tipoMotivo: null, motivo: null }), /ha vendido/)
  assert.match(textoTareaDevolucion({ ...base, hito: 'ultimo_aviso', tipoMotivo: null, motivo: null }), /no puede circular/)
  assert.match(textoTareaDevolucion({ ...base, fechaEfecto: null, tipoMotivo: null, motivo: null }), /portal de la compañía/)
})

test('toda tarea del seguimiento lleva su marca (y solo esas se cierran al pasar de hito)', () => {
  const t = textoTareaDevolucion({ hito: 'sin_cobertura', ramo: null, compania: null, importe: null, fechaEfecto: null, tipoMotivo: null, motivo: null })
  assert.ok(t.startsWith(PREFIJO_TAREA_DEVOLUCION))
})

test('la primera línea es un titular corto; el motivo y el plazo van debajo', () => {
  const base = { ramo: 'responsabilidad_civil', compania: 'Occident', importe: 1234.56, fechaEfecto: '2026-09-19', tipoMotivo: 'cuenta' as const, motivo: 'RAZONES.REG.' }
  for (const hito of ['inicial', 'segunda_llamada', 'ultimo_aviso', 'sin_cobertura'] as const) {
    const [titular, ...resto] = textoTareaDevolucion({ ...base, hito }).split('\n')
    assert.ok(titular.length <= 90, `${hito}: titular de ${titular.length} caracteres`)
    assert.match(titular, /1\.234,56€/)
    assert.ok(resto.join(' ').trim().length > 0, `${hito}: sin detalle`)
    assert.doesNotMatch(titular, /suspenso el|Motivo/)
  }
})
