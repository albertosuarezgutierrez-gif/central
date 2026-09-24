import test from 'node:test'
import assert from 'node:assert/strict'
import {
  anadirNota,
  etiquetaTipoSiniestro,
  plazoComunicacion,
  revisarApertura,
  revisarSeguimiento,
  revisarTransicion,
  textoHistorialSiniestro,
} from './siniestros.ts'

const HOY = new Date('2026-09-02T12:00:00Z')

test('siniestros: el código de CIMA que está en la tabla EIAC se pinta con su nombre; el que no, como código', () => {
  // Desde el 04/09/2026 tenemos la tabla oficial (ver `eiac-siniestros.ts`).
  assert.equal(etiquetaTipoSiniestro('1107'), 'Otras Asistencias')
  assert.equal(etiquetaTipoSiniestro('17'), 'Otras Causas')
  // Fuera de la tabla no se inventa nombre.
  assert.equal(etiquetaTipoSiniestro('9999'), 'código CIMA 9999')
  assert.equal(etiquetaTipoSiniestro('lunas'), 'Lunas y cristales')
  assert.equal(etiquetaTipoSiniestro(null), 'sin tipo')
  assert.equal(etiquetaTipoSiniestro('Texto libre'), 'Texto libre')
})

test('siniestros: plazo del art. 16 LCS son 7 días desde el hecho; sin fecha no hay plazo', () => {
  const p = plazoComunicacion('2026-08-30T20:00:00Z', HOY)
  assert.deepEqual(p, { limite: '2026-09-06', diasRestantes: 4, vencido: false })
  assert.equal(plazoComunicacion('2026-08-20', HOY)?.vencido, true)
  assert.equal(plazoComunicacion(null, HOY), null)
  assert.equal(plazoComunicacion('no es fecha', HOY), null)
})

test('siniestros: la apertura exige póliza, tipo del catálogo, descripción y fecha pasada; fuera de plazo avisa pero no bloquea', () => {
  const base = { polizaId: 'p1', tipo: 'colision', fechaHora: '2026-09-01T09:30:00Z', descripcion: 'Alcance por detrás en semáforo' }
  const ok = revisarApertura(base, HOY)
  assert.ok(ok.ok)
  if (ok.ok) {
    assert.equal(ok.apertura.aviso, null)
    assert.equal(ok.apertura.lugarCp, null)
    assert.equal(ok.apertura.seConsideraCulpable, null)
  }
  const tarde = revisarApertura({ ...base, fechaHora: '2026-08-01' }, HOY)
  assert.ok(tarde.ok && tarde.apertura.aviso !== null && /art\. 16 LCS/.test(tarde.apertura.aviso))

  assert.deepEqual(revisarApertura({ ...base, tipo: '1107' }, HOY), { ok: false, motivo: 'tipo de siniestro desconocido' })
  assert.equal(revisarApertura({ ...base, descripcion: 'ok' }, HOY).ok, false)
  assert.equal(revisarApertura({ ...base, fechaHora: '2026-12-01' }, HOY).ok, false)
  assert.equal(revisarApertura({ ...base, lugarCp: '4100' }, HOY).ok, false)
  assert.equal(revisarApertura({ ...base, gravedad: 'catastrofico' }, HOY).ok, false)
  assert.equal(revisarApertura({ ...base, polizaId: '' }, HOY).ok, false)
})

test('siniestros: el estado de uno de CIMA no se toca a mano; en los nuestros solo las transiciones del cuadro', () => {
  assert.equal(revisarTransicion('cima', 'abierto', 'cerrado').ok, false)
  assert.ok(revisarTransicion('gestionado_correduria', 'abierto', 'en_tramitacion').ok)
  assert.ok(revisarTransicion('gestionado_correduria', 'cerrado', 'en_tramitacion').ok)
  assert.equal(revisarTransicion('gestionado_correduria', 'cerrado', 'abierto').ok, false)
  assert.equal(revisarTransicion('gestionado_correduria', 'abierto', 'abierto').ok, false)
  assert.equal(revisarTransicion('gestionado_correduria', 'abierto', 'perdido').ok, false)
})

test('siniestros: en uno de CIMA el seguimiento ignora lo que CIMA reescribe; en uno nuestro entra todo, con importes válidos', () => {
  const cima = revisarSeguimiento('cima', { tramitadorNombre: ' Ana ', referencia: 'X1', reservaImporte: 100, nota: 'llamado' })
  assert.ok(cima.ok)
  if (cima.ok) {
    // reserva/indemnización/gravedad son del corredor (CIMA no las provee): entran también en uno de CIMA
    assert.deepEqual(cima.seguimiento.cambios, { tramitadorNombre: 'Ana', reservaImporte: 100 })
    assert.equal(cima.seguimiento.nota, 'llamado')
    assert.deepEqual(cima.seguimiento.ignorados, ['referencia'])
  }
  const soloIgnorados = revisarSeguimiento('cima', { referencia: 'X1' })
  assert.equal(soloIgnorados.ok, false)

  const propio = revisarSeguimiento('gestionado_correduria', { referencia: 'X1', reservaImporte: 1234.567, peritoEmail: 'P@X.ES', gravedad: 'leve' })
  assert.ok(propio.ok)
  if (propio.ok) assert.deepEqual(propio.seguimiento.cambios, { referencia: 'X1', reservaImporte: 1234.57, peritoEmail: 'p@x.es', gravedad: 'leve' })
  assert.equal(revisarSeguimiento('gestionado_correduria', { reservaImporte: -1 }).ok, false)
  assert.equal(revisarSeguimiento('gestionado_correduria', { peritoEmail: 'no-es-email' }).ok, false)
  assert.equal(revisarSeguimiento('gestionado_correduria', {}).ok, false)
})

test('siniestros: la nota se añade fechada al comentario, sin sustituirlo', () => {
  assert.equal(anadirNota(null, 'Primera', HOY), '[02/09/2026] Primera')
  assert.equal(anadirNota('Lo que trajo CIMA', ' Segunda ', HOY), 'Lo que trajo CIMA\n[02/09/2026] Segunda')
})

test('siniestros: el historial dice qué se hizo, sin la descripción del hecho ni datos personales', () => {
  assert.equal(
    textoHistorialSiniestro({ accion: 'apertura', tipo: 'lunas', fechaHora: '2026-09-01T09:30:00Z', numeroPoliza: '123', aviso: null }),
    'Siniestro abierto desde la ficha: Lunas y cristales del 01/09/2026 (póliza 123)',
  )
  assert.equal(textoHistorialSiniestro({ accion: 'estado', referencia: 'R9', de: 'abierto', a: 'en_tramitacion' }), 'Siniestro R9: abierto → en tramitación')
  assert.equal(
    textoHistorialSiniestro({ accion: 'seguimiento', referencia: null, campos: ['tramitadorNombre', 'reservaImporte'], conNota: true }),
    'Siniestro: seguimiento (tramitador nombre, reserva, nota)',
  )
})
