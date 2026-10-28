import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  claseSeguroArt23,
  diasEntre,
  diasEsperandoCompania,
  plazosSiniestro,
  sumarMeses,
  validarCierreSiniestro,
  validarMensajeSiniestro,
  type MensajeParaPlazos,
} from './siniestro-plazos.ts'

const HOY = '2026-10-28'
const msg = (autor: string, tipo: string, creadoAt: string, meta?: Record<string, unknown>): MensajeParaPlazos =>
  ({ autor, tipo, creadoAt, dia: creadoAt.slice(0, 10), meta: meta ?? null })
const de = (lista: ReturnType<typeof plazosSiniestro>, clave: string) => lista.find((p) => p.clave === clave)

test('fechas: de fecha a fecha, y último día del mes si el de llegada no existe', () => {
  assert.equal(sumarMeses('2026-01-31', 1), '2026-02-28')
  assert.equal(sumarMeses('2024-02-29', 24), '2026-02-28')
  assert.equal(sumarMeses('2026-10-28', 3), '2027-01-28')
  assert.equal(sumarMeses('no-es-fecha', 3), null)
  assert.equal(diasEntre('2026-10-28', '2026-10-27'), -1)
  assert.equal(diasEntre('2026-02-30', '2026-03-01'), null, 'un día imposible no es una fecha')
})

test('art. 23: daños 2 años, personas 5, ramo desconocido → 2 y se dice', () => {
  const danos = de(plazosSiniestro({ fechaOcurrencia: '2026-01-10', fechaDeclaracion: null, ramo: 'auto' }, HOY), 'prescripcion_art23')!
  assert.equal(danos.fecha, '2028-01-10')
  assert.equal(danos.nota, null)
  const personas = de(plazosSiniestro({ fechaOcurrencia: '2026-01-10', fechaDeclaracion: null, ramo: 'vida' }, HOY), 'prescripcion_art23')!
  assert.equal(personas.fecha, '2031-01-10')
  for (const ramo of [null, 'otros', 'viaje', 'ramo_nuevo']) {
    const p = de(plazosSiniestro({ fechaOcurrencia: '2026-01-10', fechaDeclaracion: null, ramo }, HOY), 'prescripcion_art23')!
    assert.equal(p.fecha, '2028-01-10', `ramo ${ramo}: el conservador es 2 años`)
    assert.match(p.nota ?? '', /conservador/)
  }
  assert.equal(claseSeguroArt23('accidentes'), 'personas')
  assert.equal(claseSeguroArt23('hogar'), 'danos')
})

test('art. 18 (40 días desde la declaración) y art. 20 (3 meses desde el siniestro), con días restantes', () => {
  const l = plazosSiniestro({ fechaOcurrencia: '2026-09-01', fechaDeclaracion: '2026-09-20', ramo: 'hogar' }, HOY)
  const a18 = de(l, 'pago_minimo_art18')!
  assert.equal(a18.fecha, '2026-10-30')
  assert.equal(a18.diasRestantes, 2)
  assert.equal(a18.verificado, true)
  const a20 = de(l, 'intereses_demora_art20')!
  assert.equal(a20.fecha, '2026-12-01')
  assert.equal(a20.diasRestantes, 34)
  assert.equal(de(l, 'respuesta_sac'), undefined, 'sin reclamación al SAC no hay plazo del SAC')
})

test('sin fecha base el plazo sale con fecha null (no se inventa) y lo dice', () => {
  const l = plazosSiniestro({ fechaOcurrencia: null, fechaDeclaracion: null, ramo: 'auto' }, HOY)
  for (const p of l) {
    assert.equal(p.fecha, null, p.clave)
    assert.equal(p.diasRestantes, null, p.clave)
    assert.ok(p.nota && p.nota.length > 0, `${p.clave} explica por qué no hay fecha`)
  }
  assert.equal(de(plazosSiniestro({ fechaOcurrencia: '2026-13-01', fechaDeclaracion: null, ramo: 'auto' }, HOY), 'prescripcion_art23')!.fecha, null)
})

test('plazo SAC: arranca del último «enviado» con reclamacionSac, verificado:false; hilo ilegible → fecha null', () => {
  const hilo = [
    msg('corredor', 'enviado', '2026-08-01T10:00:00.000Z', { reclamacionSac: true }),
    msg('corredor', 'enviado', '2026-09-15T10:00:00.000Z', { reclamacionSac: true }),
    msg('corredor', 'enviado', '2026-10-01T10:00:00.000Z'),
  ]
  const sac = de(plazosSiniestro({ fechaOcurrencia: '2026-06-01', fechaDeclaracion: null, ramo: 'auto' }, HOY, hilo), 'respuesta_sac')!
  assert.equal(sac.fecha, '2026-11-15')
  assert.equal(sac.verificado, false)
  const ilegible = de(plazosSiniestro({ fechaOcurrencia: '2026-06-01', fechaDeclaracion: null, ramo: 'auto' }, HOY, null), 'respuesta_sac')!
  assert.equal(ilegible.fecha, null)
  assert.match(ilegible.nota ?? '', /No se pudo leer/)
})

test('diasEsperandoCompania: desde el último enviado del corredor sin respuesta posterior de la compañía', () => {
  assert.equal(diasEsperandoCompania(null, HOY), null, 'hilo ilegible = no se sabe')
  assert.equal(diasEsperandoCompania([], HOY), null)
  assert.equal(diasEsperandoCompania([msg('corredor', 'borrador', '2026-10-01T09:00:00.000Z')], HOY), null, 'un borrador no se ha enviado')
  const enviado = msg('corredor', 'enviado', '2026-10-18T09:00:00.000Z')
  assert.equal(diasEsperandoCompania([enviado], HOY), 10)
  assert.equal(diasEsperandoCompania([enviado, msg('compania', 'comentario', '2026-10-20T09:00:00.000Z')], HOY), null)
  assert.equal(
    diasEsperandoCompania([msg('compania', 'rehuse', '2026-10-10T09:00:00.000Z'), enviado], HOY),
    10,
    'una respuesta ANTERIOR al envío no cuenta',
  )
  assert.equal(diasEsperandoCompania([enviado, msg('interna', 'nota', '2026-10-25T09:00:00.000Z')], HOY), 10, 'una nota interna no es respuesta')
})

test('validarMensajeSiniestro: el puerto no escribe como IA; coherencia autor↔tipo; tope de texto', () => {
  const r = validarMensajeSiniestro({ autor: 'ia', tipo: 'analisis', texto: 'x' }, 'operador')
  assert.equal(r.ok, false)
  assert.ok(!r.ok && /servidor/.test(r.motivo))
  assert.equal(validarMensajeSiniestro({ autor: 'ia', tipo: 'analisis', texto: 'x' }, 'servidor').ok, true)
  assert.equal(validarMensajeSiniestro({ autor: 'compania', tipo: 'enviado', texto: 'x' }, 'operador').ok, false)
  assert.equal(validarMensajeSiniestro({ autor: 'corredor', tipo: 'rehuse', texto: 'x' }, 'operador').ok, false)
  assert.equal(validarMensajeSiniestro({ autor: 'corredor', tipo: 'analisis', texto: 'x' }, 'operador').ok, false)
  assert.equal(validarMensajeSiniestro({ autor: 'corredor', tipo: 'comentario', texto: '   ' }, 'operador').ok, false)
  assert.equal(validarMensajeSiniestro({ autor: 'corredor', tipo: 'comentario', texto: 'a'.repeat(50_001) }, 'operador').ok, false)
  assert.equal(validarMensajeSiniestro({ autor: 'corredor', tipo: 'comentario', texto: 'a'.repeat(50_000) }, 'operador').ok, true)
  assert.equal(validarMensajeSiniestro({ autor: 'corredor', tipo: 'nota', texto: 'x', reclamacionSac: true }, 'operador').ok, false)
  const ok = validarMensajeSiniestro({ autor: 'corredor', tipo: 'enviado', texto: '  hola  ', reclamacionSac: true }, 'operador')
  assert.deepEqual(ok, { ok: true, mensaje: { autor: 'corredor', tipo: 'enviado', texto: 'hola', reclamacionSac: true } })
})

test('validarCierreSiniestro: resultado cerrado y motivo obligatorio', () => {
  assert.equal(validarCierreSiniestro('ganado', 'pagó tras la reclamación').ok, true)
  assert.equal(validarCierreSiniestro('otro', 'x').ok, false)
  assert.equal(validarCierreSiniestro('perdido', '  ').ok, false)
  assert.equal(validarCierreSiniestro(null, 'x').ok, false)
})
