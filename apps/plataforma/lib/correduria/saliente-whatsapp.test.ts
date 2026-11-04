import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registroWaCabecera, cuerpoSaliente, deEnlaceWa, registrarSaliente, registrarSalienteDeEnlace, RUTA_SALIENTE } from './saliente-whatsapp.ts'

const R = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b'
const O = '0b6c1f7e-3a52-4d7e-9f0a-1c2d3e4f5a6b'

test('cuerpo: recibo devuelto con su ancla', () => {
  assert.deepEqual(cuerpoSaliente({ origen: 'recibo_devuelto', reciboId: R, clienteId: O }, '600 11 22 33', 'Hola'), {
    origen: 'recibo_devuelto', telefono: '600 11 22 33', texto: 'Hola', reciboId: R, clienteId: O,
  })
})

test('cuerpo: sin el ancla que exige el origen, o sin texto, cae a generico', () => {
  assert.equal(cuerpoSaliente({ origen: 'recibo_devuelto', reciboId: null }, '600112233', 'Hola')?.origen, 'generico')
  assert.equal(cuerpoSaliente({ origen: 'lead', oportunidadId: 'x' }, '600112233', 'Hola')?.origen, 'generico')
  assert.equal(cuerpoSaliente({ origen: 'solicitud_datos' }, '600112233', 'Hola')?.origen, 'generico')
  assert.equal(cuerpoSaliente({ origen: 'lead', oportunidadId: O }, '600112233', '  ')?.origen, 'generico')
  assert.equal(cuerpoSaliente({ origen: 'lead', oportunidadId: O }, '600112233', 'Hola')?.origen, 'lead')
})

test('cuerpo: teléfono raro u origen desconocido → null (no se registra)', () => {
  assert.equal(cuerpoSaliente({ origen: 'generico' }, '', 'x'), null)
  assert.equal(cuerpoSaliente({ origen: 'generico' }, 'abc', 'x'), null)
  assert.equal(cuerpoSaliente({ origen: 'otro' as never }, '600112233', 'x'), null)
})

test('deEnlaceWa: número y texto del wa.me; sin número → null', () => {
  assert.deepEqual(deEnlaceWa('https://wa.me/34600112233?text=Hola%20Ana'), { telefono: '+34600112233', texto: 'Hola Ana' })
  assert.equal(deEnlaceWa('https://wa.me/?text=Hola'), null)
  assert.equal(deEnlaceWa('https://evil.example/34600112233'), null)
  assert.equal(deEnlaceWa('no es url'), null)
})

test('registro: hace UN POST a la ruta de plataforma con el cuerpo', () => {
  const llamadas: [string, RequestInit][] = []
  const f = ((u: string, i: RequestInit) => { llamadas.push([u, i]); return Promise.resolve(new Response('{}')) }) as unknown as typeof fetch
  registrarSaliente({ origen: 'presupuesto', oportunidadId: O }, '+34600112233', 'Tu presupuesto', f)
  assert.equal(llamadas.length, 1)
  assert.equal(llamadas[0][0], RUTA_SALIENTE)
  assert.equal(llamadas[0][1].keepalive, true)
  assert.equal(JSON.parse(String(llamadas[0][1].body)).origen, 'presupuesto')
})

test('registro: no bloquea ni lanza si falla (rechazo, excepción síncrona, sin fetch)', async () => {
  const rechaza = (() => Promise.reject(new Error('red'))) as unknown as typeof fetch
  const lanza = (() => { throw new Error('síncrono') }) as unknown as typeof fetch
  assert.equal(registrarSaliente({ origen: 'generico' }, '600112233', null, rechaza), undefined)
  assert.doesNotThrow(() => registrarSaliente({ origen: 'generico' }, '600112233', null, lanza))
  assert.doesNotThrow(() => registrarSaliente({ origen: 'generico' }, '600112233', null, undefined))
  await new Promise((r) => setTimeout(r, 0)) // el rechazo no queda sin capturar
})

test('registro: null o teléfono inválido → no llama', () => {
  let n = 0
  const f = (() => { n++; return Promise.resolve(new Response('{}')) }) as unknown as typeof fetch
  registrarSaliente(null, '600112233', 'x', f)
  registrarSaliente({ origen: 'generico' }, 'x', 'x', f)
  assert.equal(n, 0)
})

test('registro desde el wa.me: saca teléfono y texto; sin número no llama', () => {
  const cuerpos: Record<string, unknown>[] = []
  const f = ((_u: string, i: RequestInit) => { cuerpos.push(JSON.parse(String(i.body))); return Promise.resolve(new Response('{}')) }) as unknown as typeof fetch
  registrarSalienteDeEnlace({ origen: 'presupuesto', oportunidadId: O }, 'https://wa.me/34600112233?text=Tu%20presupuesto', f)
  registrarSalienteDeEnlace({ origen: 'presupuesto', oportunidadId: O }, 'https://wa.me/?text=x', f)
  assert.equal(cuerpos.length, 1)
  assert.deepEqual(cuerpos[0], { origen: 'presupuesto', telefono: '+34600112233', texto: 'Tu presupuesto', oportunidadId: O })
})

test('cabecera de la ficha: el WhatsApp genérico se registra CON el clienteId de la ficha', () => {
  const id = '11111111-1111-4111-8111-111111111111'
  assert.deepEqual(cuerpoSaliente(registroWaCabecera(id), '+34600111222', 'hola'), { origen: 'generico', telefono: '+34600111222', texto: 'hola', clienteId: id })
  assert.equal(cuerpoSaliente(registroWaCabecera(null), '+34600111222', 'hola')?.clienteId, undefined)
})

test('CEPO cabecera: Cabecera.tsx pasa el registro con el clienteId a AccionesContacto', () => {
  const src = readFileSync(new URL('../../app/(usuario)/correduria/cliente/[id]/Cabecera.tsx', import.meta.url), 'utf8')
  assert.ok(src.includes('registro={registroWaCabecera(clienteId)}'))
  assert.ok(src.includes('<Contacto clienteId={ficha.id}'))
})
