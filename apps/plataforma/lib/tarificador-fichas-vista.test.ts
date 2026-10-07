import test from 'node:test'
import assert from 'node:assert/strict'
import { edicionDeFormulario, estadoExtraccion, formularioDe, leerRespuesta, numeroFormulario, textoFranquicia, textoLimite, type TarificacionConPdf } from './tarificador-fichas-vista.ts'

test('límites y franquicias en formato español; null = no consta (null, no 0,00€)', () => {
  assert.equal(textoLimite({ tipo: 'importe', eur: 3000 }), '3.000,00€')
  assert.equal(textoLimite({ tipo: 'primer_riesgo', eur: 1500 }), '1.500,00€ a primer riesgo')
  assert.equal(textoLimite({ tipo: 'porcentaje', pct: 12.5, sobre: 'continente' }), '12,5 % de continente')
  assert.equal(textoLimite(null), null)
  assert.equal(textoFranquicia({ tipo: 'sin_franquicia' }), 'Sin franquicia')
  assert.equal(textoFranquicia({ tipo: 'porcentaje', pct: 10, minimoEur: 150, maximoEur: null }), '10 % (mín. 150,00€)')
  assert.equal(textoFranquicia(null), null)
})

test('formulario: vacío = null, nunca 0', () => {
  const r = edicionDeFormulario(formularioDe(undefined))
  assert.deepEqual(r, { ok: true, edicion: { estado: null, limite: null, franquicia: null, notas: null } })
  const f = { ...formularioDe(undefined), estado: 'incluida' as const, limiteTipo: 'importe' as const, limiteValor: '3.500,00', franquiciaTipo: 'sin_franquicia' as const }
  assert.deepEqual(edicionDeFormulario(f), { ok: true, edicion: { estado: 'incluida', limite: { tipo: 'importe', eur: 3500 }, franquicia: { tipo: 'sin_franquicia' }, notas: null } })
  assert.equal(edicionDeFormulario({ ...f, limiteValor: '0' }).ok, false)
  assert.equal(numeroFormulario('abc'), null)
})

test('formulario ida y vuelta', () => {
  const c = { literal: null, estado: 'incluida' as const, limite: { tipo: 'porcentaje' as const, pct: 10, sobre: 'capital' }, sublimites: null,
    franquicia: { tipo: 'porcentaje' as const, pct: 5, minimoEur: 150, maximoEur: 600 }, notas: 'x', cita: null, pagina: null, origen: 'ia' as const }
  const r = edicionDeFormulario(formularioDe(c))
  assert.deepEqual(r, { ok: true, edicion: { estado: 'incluida', limite: c.limite, franquicia: c.franquicia, notas: 'x' } })
})

test('estado de la extracción', () => {
  const base: TarificacionConPdf = { tarificacionId: 't', creadaEn: '', compania: 'allianz', ramo: 'comunidades', producto: null, primaAnualEur: null, tienePdf: true, extraccion: null }
  assert.equal(estadoExtraccion({ ...base, tienePdf: false }).texto, 'Sin PDF del proyecto')
  assert.equal(estadoExtraccion(base).texto, 'Coberturas sin extraer')
  assert.equal(estadoExtraccion({ ...base, extraccion: { fichaId: null, textoLegible: false, avisos: 1, condicionadoCambiado: null, actualizadaEn: '' } }).tono, 'aviso')
  assert.equal(estadoExtraccion({ ...base, extraccion: { fichaId: 'f', textoLegible: true, avisos: 0, condicionadoCambiado: true, actualizadaEn: '' } }).texto, 'El condicionado ha cambiado')
})

test('respuestas del puerto: sin tabla, sin configurar, red', () => {
  const ex = (j: Record<string, unknown>) => (Array.isArray(j.fichas) ? j.fichas : null)
  assert.deepEqual(leerRespuesta(200, { fichas: [] }, ex), { ok: true, dato: [] })
  assert.match((leerRespuesta(503, { estado: 'sin_tabla', mensaje: 'falta el SQL' }, ex) as { mensaje: string }).mensaje, /SQL/)
  assert.match((leerRespuesta(503, { estado: 'sin_configurar' }, ex) as { mensaje: string }).mensaje, /ASEGURA_OPERADOR_SECRET/)
  assert.match((leerRespuesta(502, { estado: 'error', motivo: 'red' }, ex) as { mensaje: string }).mensaje, /red/)
  assert.equal(leerRespuesta(200, { otra: 1 }, ex).ok, false)
})
