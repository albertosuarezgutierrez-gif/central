import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import {
  interpretarSiniestro,
  leerSiniestro,
  leerSiniestros,
  ramosSiniestroParaPoliza,
  textoMotivoSiniestro,
} from '../apps/plataforma/lib/siniestros-asegura.ts'

// Siniestros desde la ficha (plataforma → puerto de asegura). Lo que se
// protege: `null` ≠ `[]` ≠ 0 en la lista y en la reserva; los defaults
// CONSERVADORES para una asegura desplegada más vieja; y que la pantalla no
// colapse un «no lo sé» en un dato.

const COMPLETO = {
  id: 's1', clienteId: 'c1', polizaId: 'p1', estado: 'en_tramitacion', tipo: 'lunas', referencia: 'R-77',
  fecha: '2026-08-30', fechaHora: '2026-08-30T10:15:00.000Z', reserva: 350.5, indemnizacion: null,
  tramitador: 'Ana', tramitadorTelefono: '600 000 000', tramitadorEmail: 'ana@cia.es',
  perito: null, peritoTelefono: null, peritoEmail: null, gravedad: 'leve',
  comentario: 'Piedra en la autovía.\n[01/09/2026] llamado al tramitador', lugar: 'Sevilla (41003)',
  origen: 'gestionado_correduria', confirmadoCima: false, abierto: true, actualizado: '2026-09-01T09:00:00.000Z',
}

test('un siniestro completo se lee con todos los campos nuevos', () => {
  const s = leerSiniestro(COMPLETO)
  assert.ok(s)
  assert.equal(s.clienteId, 'c1')
  assert.equal(s.fechaHora, '2026-08-30T10:15:00.000Z')
  assert.equal(s.reserva, 350.5)
  assert.equal(s.indemnizacion, null)
  assert.equal(s.tramitadorTelefono, '600 000 000')
  assert.equal(s.gravedad, 'leve')
  assert.equal(s.comentario, COMPLETO.comentario)
  assert.equal(s.lugar, 'Sevilla (41003)')
  assert.equal(s.origen, 'gestionado_correduria')
  assert.equal(s.confirmadoCima, false)
  assert.equal(s.actualizado, '2026-09-01T09:00:00.000Z')
})

test('🚨 una asegura vieja sin los campos nuevos cae a los defaults CONSERVADORES', () => {
  // Es la forma que mandaba el puerto antes: sin origen, sin confirmadoCima, sin clienteId.
  const s = leerSiniestro({ id: 's2', polizaId: 'p1', estado: 'abierto', tipo: '1107', referencia: null, fecha: '2026-02-01', reserva: null, indemnizacion: null, tramitador: null, abierto: true })
  assert.ok(s)
  // Sin origen se asume CIMA: el caso que NO permite tocar el estado a mano.
  assert.equal(s.origen, 'cima')
  assert.equal(s.confirmadoCima, true)
  assert.equal(s.clienteId, null)
  assert.equal(s.fechaHora, null)
  assert.equal(s.tramitadorTelefono, null)
  assert.equal(s.perito, null)
  assert.equal(s.gravedad, null)
  assert.equal(s.comentario, null)
  assert.equal(s.lugar, null)
  assert.equal(s.actualizado, null)
})

test('🚨 la reserva ausente se queda en null (no informada), y un 0 real se queda en 0', () => {
  assert.equal(leerSiniestro({ id: 's3', reserva: null })?.reserva, null)
  assert.equal(leerSiniestro({ id: 's3' })?.reserva, null)
  assert.equal(leerSiniestro({ id: 's3', reserva: 0 })?.reserva, 0)
  assert.equal(leerSiniestro({ id: 's3', reserva: 'cien' })?.reserva, null)
})

test('🚨 lista que no es lista → null; [] → []; una fila rara se salta sin tumbar el bloque', () => {
  assert.equal(leerSiniestros(undefined), null)
  assert.equal(leerSiniestros(null), null)
  assert.equal(leerSiniestros('nada'), null)
  assert.equal(leerSiniestros({}), null)
  assert.deepEqual(leerSiniestros([]), [])
  const l = leerSiniestros([COMPLETO, { sinId: true }, null, { id: '' }])
  assert.ok(l)
  assert.equal(l.length, 1)
  assert.equal(l[0].id, 's1')
})

test('interpretarSiniestro: 200 ok trae siniestro, aviso e ignorados', () => {
  const r = interpretarSiniestro(200, { estado: 'ok', siniestro: COMPLETO, aviso: 'Han pasado 12 días…', ignorados: ['referencia'] })
  assert.equal(r.estado, 'ok')
  if (r.estado !== 'ok') return
  assert.equal(r.siniestro.id, 's1')
  assert.equal(r.aviso, 'Han pasado 12 días…')
  assert.deepEqual(r.ignorados, ['referencia'])
  const sinAviso = interpretarSiniestro(200, { estado: 'ok', siniestro: COMPLETO })
  assert.equal(sinAviso.estado, 'ok')
  if (sinAviso.estado === 'ok') {
    assert.equal(sinAviso.aviso, null)
    assert.deepEqual(sinAviso.ignorados, [])
  }
})

test('🚨 un 200 ok sin siniestro legible NO se da por hecho', () => {
  assert.deepEqual(interpretarSiniestro(200, { estado: 'ok' }), { estado: 'error', motivo: 'respuesta_ilegible' })
  assert.deepEqual(interpretarSiniestro(200, { estado: 'ok', siniestro: { sinId: true } }), { estado: 'error', motivo: 'respuesta_ilegible' })
})

test('interpretarSiniestro: 404 / 422 / 503 / 401 / 500 son estados distintos y traen su motivo', () => {
  assert.deepEqual(interpretarSiniestro(404, { estado: 'no_encontrado', motivo: 'póliza ajena' }), { estado: 'no_encontrado', motivo: 'póliza ajena' })
  assert.deepEqual(interpretarSiniestro(404, null), { estado: 'no_encontrado', motivo: null })
  assert.deepEqual(interpretarSiniestro(422, { estado: 'invalido', motivo: 'fecha del siniestro no válida' }), { estado: 'invalido', motivo: 'fecha del siniestro no válida' })
  assert.deepEqual(interpretarSiniestro(422, null), { estado: 'invalido', motivo: 'datos no válidos' })
  assert.deepEqual(interpretarSiniestro(503, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarSiniestro(200, { estado: 'sin_configurar' }), { estado: 'sin_configurar' })
  assert.deepEqual(interpretarSiniestro(401, null), { estado: 'error', motivo: 'secreto_rechazado' })
  assert.deepEqual(interpretarSiniestro(500, { estado: 'error', causa: 'password authentication failed' }), { estado: 'error', motivo: 'password authentication failed' })
  assert.deepEqual(interpretarSiniestro(502, { estado: 'error', motivo: 'red' }), { estado: 'error', motivo: 'red' })
  assert.deepEqual(interpretarSiniestro(500, null), { estado: 'error', motivo: 'HTTP 500' })
  assert.match(textoMotivoSiniestro('red'), /asegura/)
  assert.equal(textoMotivoSiniestro('una frase ya hecha'), 'una frase ya hecha')
})

test('ramo de la póliza → tipos de siniestro: auto/hogar filtran (con los generales); lo demás, todos', () => {
  assert.deepEqual(ramosSiniestroParaPoliza('auto'), ['auto', 'general'])
  assert.deepEqual(ramosSiniestroParaPoliza('moto'), ['auto', 'general'])
  assert.deepEqual(ramosSiniestroParaPoliza('hogar'), ['hogar', 'general'])
  assert.deepEqual(ramosSiniestroParaPoliza('salud'), ['salud', 'general'])
  assert.deepEqual(ramosSiniestroParaPoliza('decesos'), ['vida', 'general'])
  assert.equal(ramosSiniestroParaPoliza('comercio'), null)
  assert.equal(ramosSiniestroParaPoliza('otros'), null)
  assert.equal(ramosSiniestroParaPoliza(null), null)
  assert.equal(ramosSiniestroParaPoliza(undefined), null)
})

// ── La pantalla, leída como texto ────────────────────────────────────────────
// Lo que un typecheck no ve: colapsar un null en 0 o en [] compila igual.

const PANTALLA = path.join(process.cwd(), 'apps/plataforma/app/(usuario)/correduria/Siniestros.tsx')

test('🚨 Siniestros.tsx no colapsa la reserva a 0 ni la lista a [] y no lleva colores hex', () => {
  const src = readFileSync(PANTALLA, 'utf8')
  assert.ok(src.startsWith("'use client'"), 'es un client component')
  assert.doesNotMatch(src, /reserva\s*\?\?\s*0/, 'reserva ?? 0 pintaría 0€ sobre una reserva no informada')
  assert.doesNotMatch(src, /\?\?\s*\[\]/, '?? [] convierte «no se pudo leer» en «sin siniestros»')
  assert.doesNotMatch(src, /\|\|\s*\[\]/, '|| [] convierte «no se pudo leer» en «sin siniestros»')
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,6}\b/, 'solo tokens var(--…), sin hex')
  // Los tres estados de la lista tienen su texto propio.
  assert.match(src, /lista === null/)
  assert.match(src, /lista\.length === 0/)
  assert.match(src, /sin dato/)
  assert.match(src, /sin referencia/)
  assert.match(src, /sin tramitador/)
  // La póliza sobre la que se abre tiene que ser viva Y confirmada por CIMA.
  assert.match(src, /p\.viva && p\.confirmadaCima/)
  // Los documentos del parte se filtran por siniestro y `null` sigue siendo `null`.
  assert.match(src, /d\.siniestroId === siniestroId/)
  assert.match(src, /documentos === null \|\| documentos === undefined \? null/)
})

test('la ficha del cliente y la de póliza montan el componente compartido, no una tabla propia', () => {
  const cliente = readFileSync(path.join(process.cwd(), 'apps/plataforma/app/(usuario)/correduria/cliente/[id]/page.tsx'), 'utf8')
  const poliza = readFileSync(path.join(process.cwd(), 'apps/plataforma/app/(usuario)/correduria/poliza/[id]/page.tsx'), 'utf8')
  assert.match(cliente, /import Siniestros from '\.\.\/\.\.\/Siniestros'/)
  assert.match(poliza, /import Siniestros from '\.\.\/\.\.\/Siniestros'/)
  assert.doesNotMatch(cliente, /function Siniestros\(/, 'el componente local viejo se borró')
  assert.doesNotMatch(poliza, /p\.siniestros\.length/, 'la lista puede ser null: no se cuenta a ciegas')
  // El titular «siniestros abiertos» distingue «no se pudo leer» de 0.
  assert.match(cliente, /ficha\.siniestros === null \? null/)
})
