// Cepos del botón «Pedir emisión» (11/10/2026). `node --test`. Sin datos personales.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { clavesEmision } from '@central/module-tarificacion'
import {
  EMISION_PERMITIDA, TEXTO_CONFIRMACION, TEXTO_ESPERANDO, candidatosPresupuesto, leerRespuestaEmision, primaDeCompania, visibilidadEmision,
  type EntradaVisibilidad,
} from './tarificador-emision-boton.ts'
import type { PresupuestoEnLista } from './presupuesto-asegura.ts'

const base: EntradaVisibilidad = { compania: 'allianz', ramo: 'comunidades', estadoTrabajo: 'ok', conOferta: true, estadoPresupuesto: 'aceptado', ipidConsta: true, emisionEnCurso: false }

const pres = (o: Partial<PresupuestoEnLista> = {}): PresupuestoEnLista => ({
  id: '11111111-1111-4111-8111-111111111111', referencia: 'AS-26-0001', documentoDescargadoAt: null, estado: 'aceptado', clienteId: 'c1', ramo: 'comunidades',
  creadoAt: '2026-10-01T10:00:00Z', venceEl: '2026-11-01', enviadoAt: null, enlaceGeneradoAt: null, vistoAt: null, opciones: 1, desdeEur: 347.55, necesidades: null,
  detalle: [{ id: 'o1', compania: 'Allianz', modalidad: null, primaEur: 347.55, garantias: null }], ...o,
})

test('la lista blanca de la pantalla es la del robot', () => {
  assert.deepEqual([...EMISION_PERMITIDA].sort(), clavesEmision())
})

test('activo solo con trabajo ok con oferta, Allianz Comunidades y presupuesto aceptado con IPID', () => {
  assert.deepEqual(visibilidadEmision(base), { visible: true, activo: true, motivo: null, aviso: null })
})

test('otra compañía o ramo, trabajo no terminado o sin oferta: no se ve', () => {
  for (const x of [{ compania: 'mapfre' }, { ramo: 'hogar' }, { estadoTrabajo: 'en_curso' }, { estadoTrabajo: 'requiere_humano' }, { conOferta: false }, { estadoPresupuesto: null }, { estadoPresupuesto: 'enviado' }, { estadoPresupuesto: 'elegido' }]) {
    assert.equal(visibilidadEmision({ ...base, ...x }).visible, false, JSON.stringify(x))
  }
})

test('sin IPID (false) se ve pero inactivo; IPID desconocido (null) activo con aviso', () => {
  const sin = visibilidadEmision({ ...base, ipidConsta: false })
  assert.equal(sin.visible, true); assert.equal(sin.activo, false); assert.match(sin.motivo ?? '', /IPID/)
  const desc = visibilidadEmision({ ...base, ipidConsta: null })
  assert.equal(desc.activo, true); assert.match(desc.aviso ?? '', /IPID/)
})

test('emisión en curso: inactivo y dice que espera el OK', () => {
  const v = visibilidadEmision({ ...base, emisionEnCurso: true })
  assert.equal(v.activo, false); assert.equal(v.motivo, TEXTO_ESPERANDO)
  assert.equal(TEXTO_ESPERANDO, 'Esperando tu OK en Telegram (caduca en 24 h)')
})

test('presupuesto ya emitido: visible e inactivo', () => {
  const v = visibilidadEmision({ ...base, estadoPresupuesto: 'emitido' })
  assert.equal(v.visible, true); assert.equal(v.activo, false)
})

test('candidatos: aceptado, mismo ramo (ramo desconocido no vale) y con opción de esa compañía', () => {
  const lista = [pres(), pres({ id: 'b', estado: 'enviado' }), pres({ id: 'c', ramo: null }), pres({ id: 'd', ramo: 'hogar' }),
    pres({ id: 'e', detalle: [{ id: 'o', compania: 'Mapfre', modalidad: null, primaEur: 1, garantias: null }] }), pres({ id: 'f', detalle: null }), pres({ id: 'g', clienteId: 'otro' })]
  assert.deepEqual(candidatosPresupuesto(lista, { compania: 'allianz', ramo: 'comunidades', clienteId: 'c1' }).map((p) => p.id), [lista[0].id, 'f'])
})

test('prima de la compañía: solo si es inequívoca', () => {
  assert.equal(primaDeCompania(pres(), 'allianz'), 347.55)
  const dos = pres({ detalle: [{ id: 'a', compania: 'Allianz', modalidad: 'x', primaEur: 1, garantias: null }, { id: 'b', compania: 'Allianz', modalidad: 'y', primaEur: 2, garantias: null }] })
  assert.equal(primaDeCompania(dos, 'allianz'), null)
  assert.equal(primaDeCompania(pres({ detalle: null }), 'allianz'), null)
})

test('respuestas del API: 202, 403, 409, 503 con su motivo', () => {
  const ok = leerRespuestaEmision(202, { estado: 'encolado', trabajoId: 'x' })
  assert.equal(ok.pendiente, true); assert.equal(ok.texto, TEXTO_ESPERANDO)
  assert.match(leerRespuestaEmision(403, { estado: 'rechazado' }).texto, /No autorizado/)
  const viva = leerRespuestaEmision(409, { estado: 'rechazado', motivo: 'ya_hay_emision_viva para este presupuesto' })
  assert.match(viva.texto, /pendiente o incierta/); assert.equal(viva.pendiente, true)
  assert.match(leerRespuestaEmision(409, { motivo: 'emision_incierta_sin_resolver: x' }).texto, /pendiente o incierta/)
  const otro = leerRespuestaEmision(409, { motivo: 'IPID no consta en la aceptación: no se emite' })
  assert.match(otro.texto, /IPID no consta/); assert.equal(otro.pendiente, false)
  assert.match(leerRespuestaEmision(503, { motivo: 'emision_apagada (TARIFICADOR_EMISION_ACTIVA)' }).texto, /desactivada/)
  assert.match(leerRespuestaEmision(503, { motivo: 'emision_sin_esquema (x)' }).texto, /SQL/)
  assert.match(leerRespuestaEmision(503, { estado: 'apagado' }).texto, /apagado/)
  assert.match(leerRespuestaEmision(500, null).texto, /No consta que se haya pedido/)
})

test('un 202 sin estado encolado NO se da por pedido', () => {
  assert.equal(leerRespuestaEmision(202, {}).pendiente, false)
})

test('el modal y la pantalla usan los textos acordados y eur(), sin € a mano (lee el FUENTE)', () => {
  const src = readFileSync(new URL('../app/(usuario)/correduria/oportunidad/[id]/PedirEmision.tsx', import.meta.url), 'utf8')
  assert.match(src, /TEXTO_CONFIRMACION/)
  assert.match(src, /eur\(/)
  assert.doesNotMatch(src, /toFixed\(2\)/)
  assert.match(src, /95vw/)
  assert.match(src, /minHeight: 44/)
  assert.match(src, /\/api\/correduria\/tarificador\/emision/)
  assert.equal(TEXTO_CONFIRMACION, 'Se te pedirá el OK por Telegram. El robot pulsará "Aceptar" una sola vez.')
})
