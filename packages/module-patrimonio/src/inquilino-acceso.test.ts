import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CAMPOS_VISTA_CONTRATO_INQUILINO,
  VERSION_CONSENTIMIENTO_INQUILINO as V,
  accesoParaContrato,
  accesosVivosDe,
  caducidadEnlaceInquilino,
  consentimientoAdmisible,
  enlaceCanjeable,
  estadoConsentimiento,
  estadoEnlaceDeAcceso,
  normalizarContactoPropietario,
  normalizarTokenEnlaceInquilino,
  puedeRecibirOfertasInquilino,
  rentaParaInquilino,
  vistaContratoParaInquilino,
  type AccesoInquilino,
  type ConsentimientoInquilino,
} from './inquilino-acceso.ts'

const t0 = new Date('2026-10-26T10:00:00Z')
const dia = (n: number) => new Date(t0.getTime() + n * 86_400_000)
const acc = (p: Partial<AccesoInquilino>): AccesoInquilino => ({ id: 'a1', contratoId: 'c1', inquilinoId: 'q1', identidadId: 'i1', revocadoEn: null, ...p })
const cons = (concedido: boolean, versionTexto: string, n: number): ConsentimientoInquilino => ({ concedido, versionTexto, creadoEn: dia(n) })

function base() {
  return {
    contacto: 'R', direccion: 'x', alias: null as string | null, inicio: '2026-01-01', fin: null, terminadoEn: null,
    rentaMensualCent: 1 as number | null, seguroExigido: null as boolean | null, seguroVence: null as string | null, recibos: [],
  }
}

test('token: solo 64 hex, normalizado; lo demás es null', () => {
  const ok = 'a'.repeat(64)
  assert.equal(normalizarTokenEnlaceInquilino(` ${ok.toUpperCase()} `), ok)
  for (const mal of [undefined, null, 5, '', 'abc', 'g'.repeat(64), ok + 'a']) assert.equal(normalizarTokenEnlaceInquilino(mal), null)
})

test('enlace: anulado > usado > caducado; caducidad ausente o ilegible = caducado (fail-closed)', () => {
  const b = { anuladoEn: null, caducaEn: dia(14), usado: false }
  assert.equal(estadoEnlaceDeAcceso(b, t0), 'vigente')
  assert.equal(estadoEnlaceDeAcceso({ ...b, usado: true }, t0), 'usado')
  assert.equal(estadoEnlaceDeAcceso({ ...b, usado: true, anuladoEn: t0 }, t0), 'anulado')
  assert.equal(estadoEnlaceDeAcceso(b, dia(14)), 'caducado')
  assert.equal(estadoEnlaceDeAcceso({ ...b, caducaEn: null }, t0), 'caducado')
  assert.equal(estadoEnlaceDeAcceso({ ...b, caducaEn: new Date('x') }, t0), 'caducado')
  assert.equal(enlaceCanjeable({ ...b, usado: true }, t0), false)
  assert.equal(caducidadEnlaceInquilino(t0).getTime(), dia(14).getTime())
})

test('🚨 aislamiento: el contrato pedido se busca DENTRO de los accesos vivos de ESTA identidad', () => {
  const lista = [
    acc({ contratoId: 'c1' }),
    acc({ id: 'a2', contratoId: 'c2', identidadId: 'otra' }),
    acc({ id: 'a3', contratoId: 'c3', revocadoEn: t0 }),
  ]
  assert.equal(accesoParaContrato(lista, 'i1', 'c1')?.id, 'a1')
  assert.equal(accesoParaContrato(lista, 'i1', 'c2'), null, 'contrato de otra identidad')
  assert.equal(accesoParaContrato(lista, 'i1', 'c3'), null, 'acceso revocado')
  assert.equal(accesoParaContrato(lista, 'i1', 'c9'), null, 'contrato inexistente: la misma respuesta')
  assert.equal(accesoParaContrato(lista, 'i1', undefined), null)
  assert.equal(accesoParaContrato(lista, 'i1', ''), null)
  assert.deepEqual(accesosVivosDe(lista, 'i1').map((a) => a.id), ['a1'])
  assert.deepEqual(accesosVivosDe([], 'i1'), [])
})

test('consentimiento: el último gesto manda, y una versión vieja cuenta como NO', () => {
  assert.equal(estadoConsentimiento([]), 'sin_decidir')
  assert.equal(estadoConsentimiento([cons(true, V, 1)]), 'concedido')
  assert.equal(estadoConsentimiento([cons(true, V, 1), cons(false, V, 2)]), 'retirado')
  assert.equal(estadoConsentimiento([cons(true, V, 1), cons(false, V, 2), cons(true, V, 3)]), 'concedido')
  assert.equal(estadoConsentimiento([cons(true, 'vieja', 1)]), 'version_antigua')
  // El orden de llegada no cuenta: cuenta la fecha.
  assert.equal(estadoConsentimiento([cons(false, V, 5), cons(true, V, 1)]), 'retirado')
  assert.equal(consentimientoAdmisible(V), true)
  assert.equal(consentimientoAdmisible('vieja'), false)
  assert.equal(consentimientoAdmisible(undefined), false)
})

test('🚨 ofertas: cero mientras no haya consentimiento vigente Y acceso vivo', () => {
  const vivo = acc({})
  assert.equal(puedeRecibirOfertasInquilino({ acceso: vivo, consentimientos: [] }), false)
  assert.equal(puedeRecibirOfertasInquilino({ acceso: vivo, consentimientos: [cons(true, 'vieja', 1)] }), false)
  assert.equal(puedeRecibirOfertasInquilino({ acceso: vivo, consentimientos: [cons(true, V, 1), cons(false, V, 2)] }), false)
  assert.equal(puedeRecibirOfertasInquilino({ acceso: null, consentimientos: [cons(true, V, 1)] }), false)
  assert.equal(puedeRecibirOfertasInquilino({ acceso: acc({ revocadoEn: t0 }), consentimientos: [cons(true, V, 1)] }), false)
  assert.equal(puedeRecibirOfertasInquilino({ acceso: vivo, consentimientos: [cons(true, V, 1)] }), true)
})

test('vista: solo la lista blanca; ni fianza, ni gastos, ni propietario más allá del contacto', () => {
  const v = vistaContratoParaInquilino({
    ...base(), contacto: ' Rosa ', direccion: ' Calle Socorro 24 ', alias: 'Piso del centro', fin: '2027-01-01', rentaMensualCent: 85000,
    seguroExigido: true, recibos: [{ id: 'd1', nombre: 'ene.pdf', creadoEn: '2026-02-01' }],
  })
  assert.deepEqual(Object.keys(v).sort(), [...CAMPOS_VISTA_CONTRATO_INQUILINO].sort())
  assert.equal(v.contacto, 'Rosa')
  assert.equal(v.inmueble, 'Calle Socorro 24', 'la dirección manda sobre el alias interno')
  assert.equal(vistaContratoParaInquilino({ ...base(), direccion: null, alias: 'Piso del centro' }).inmueble, 'Piso del centro')
  assert.equal(vistaContratoParaInquilino({ ...base(), direccion: null, alias: null }).inmueble, null)
  assert.equal(vistaContratoParaInquilino({ ...base(), rentaMensualCent: 0 }).rentaMensualCent, null, '0 no es una renta: no consta')
  assert.equal(vistaContratoParaInquilino({ ...base(), seguroExigido: null, seguroVence: null }).seguro, null)
})

test('renta para el inquilino: solo actualizaciones NOTIFICADAS y ya en vigor', () => {
  const acts = [
    { desde: '2026-06-01', rentaMensualCent: 90000, notificada: true },
    { desde: '2026-09-01', rentaMensualCent: 95000, notificada: false },
    { desde: '2027-01-01', rentaMensualCent: 99000, notificada: true },
  ]
  assert.equal(rentaParaInquilino(85000, acts, '2026-10-26'), 90000)
  assert.equal(rentaParaInquilino(85000, acts, '2026-05-01'), 85000)
  assert.equal(rentaParaInquilino(85000, [], '2026-10-26'), 85000)
  assert.equal(rentaParaInquilino(0, [], '2026-10-26'), null)
  assert.equal(rentaParaInquilino(85000, [], 'mañana'), null)
})

test('contacto del propietario: 1–80, sin control ni bidi ni marcas', () => {
  assert.equal(normalizarContactoPropietario('  Rosa   Gil '), 'Rosa Gil')
  assert.equal(normalizarContactoPropietario('Ro‮sa'), 'Rosa')
  assert.equal(normalizarContactoPropietario('<b>x</b>'), 'bx/b')
  assert.equal(normalizarContactoPropietario(''), null)
  assert.equal(normalizarContactoPropietario('a'.repeat(81)), null)
  assert.equal(normalizarContactoPropietario(7), null)
})
