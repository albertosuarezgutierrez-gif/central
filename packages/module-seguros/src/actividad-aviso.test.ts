import test from 'node:test'
import assert from 'node:assert/strict'
import {
  decidirAvisosActividad,
  desdeConsulta,
  leerMarcaActividad,
  mensajeActividad,
  serializarMarcaActividad,
  type MarcaActividad,
} from './actividad-aviso.ts'
import type { EventoActividad } from './actividad.ts'

const ahora = new Date('2026-09-23T10:00:00Z')
const ev = (id: string, tipo: string, fecha: string, extra: Partial<EventoActividad> = {}): EventoActividad => ({
  id, tipo, fecha, clienteId: 'c1', cliente: 'Rafael Martínez Sáez', texto: null, ...extra,
})

test('la primera pasada ancla y no manda el histórico', () => {
  const d = decidirAvisosActividad({ marca: null, eventos: [ev('1', 'acceso', '2026-09-23T09:00:00Z')], ahora, truncado: false })
  assert.equal(d.avisar, false)
  assert.equal(d.motivo, 'primera_vez')
  assert.ok(d.motivo === 'primera_vez')
  assert.deepEqual(d.marca.claves, ['acceso:1'])
})

test('lo ya avisado no se repite; lo nuevo sí, y el acceso fallido tardío entra', () => {
  const marca: MarcaActividad = { instante: '2026-09-23T09:55:00Z', claves: ['acceso:1'] }
  const d = decidirAvisosActividad({
    marca,
    eventos: [
      ev('1', 'acceso', '2026-09-23T09:00:00Z'),
      // Pidió el código a las 08:40: solo aparece en el feed a partir de las 09:40.
      ev('2', 'acceso_fallido', '2026-09-23T08:40:00Z'),
      ev('3', 'direccion', '2026-09-23T09:58:00Z'),
    ],
    ahora,
    truncado: false,
  })
  assert.ok(d.motivo === 'nuevos')
  assert.deepEqual(d.nuevos.map(e => e.id), ['2', '3'])
  assert.deepEqual(d.marca.claves.sort(), ['acceso:1', 'acceso_fallido:2', 'direccion:3'])
})

test('lo que el portal ya avisa al instante no se repite', () => {
  const marca: MarcaActividad = { instante: '2026-09-23T09:55:00Z', claves: [] }
  const d = decidirAvisosActividad({
    marca,
    eventos: [ev('1', 'poliza_declarada', '2026-09-23T09:58:00Z'), ev('2', 'sugerencia', '2026-09-23T09:59:00Z')],
    ahora,
    truncado: false,
  })
  assert.equal(d.avisar, false)
})

test('si el puerto trunca, la marca solo avanza hasta lo visto', () => {
  const marca: MarcaActividad = { instante: '2026-09-23T09:00:00Z', claves: [] }
  const d = decidirAvisosActividad({ marca, eventos: [ev('1', 'acceso', '2026-09-23T09:10:00Z')], ahora, truncado: true })
  assert.ok(d.motivo === 'nuevos')
  assert.equal(d.marca.instante, '2026-09-23T09:10:00.000Z')
})

test('truncado sin avance o en la primera pasada: atascado, nunca «nada nuevo»', () => {
  const marca: MarcaActividad = { instante: '2026-09-23T09:30:00Z', claves: ['acceso:1'] }
  const d = decidirAvisosActividad({ marca, eventos: [ev('1', 'acceso', '2026-09-23T09:00:00Z')], ahora, truncado: true })
  assert.equal(d.motivo, 'atascado')
  const p = decidirAvisosActividad({ marca: null, eventos: [ev('1', 'acceso', '2026-09-23T09:00:00Z')], ahora, truncado: true })
  assert.equal(p.motivo, 'atascado')
})

test('un cliente con demasiadas líneas se recorta, no desaparece', () => {
  const muchos = Array.from({ length: 60 }, (_, i) => ev(String(i).padStart(8, '0'), 'acceso_fallido', `2026-09-23T09:${String(i % 60).padStart(2, '0')}:00Z`))
  const m = mensajeActividad(muchos, id => `https://p.test/c/${id}`)
  assert.ok(m.length <= 3500)
  assert.match(m, /Rafael Martínez Sáez/)
  assert.match(m, /más de este cliente/)
})

test('se consulta con la ventana hacia atrás', () => {
  assert.equal(desdeConsulta({ instante: '2026-09-23T10:00:00Z', claves: [] }, ahora), '2026-09-23T07:00:00.000Z')
})

test('el mensaje agrupa por cliente, lleva el aviso de riesgo y el enlace, y NO el texto libre', () => {
  const m = mensajeActividad(
    [
      ev('1', 'direccion', '2026-09-23T09:42:00Z', { texto: 'El cliente actualizó desde el portal: codigoPostal, direccion.' }),
      ev('2', 'parte', '2026-09-23T09:50:00Z', { texto: 'Me dieron un golpe en la calle Mayor 3, mi teléfono 600111222' }),
      ev('3', 'acceso', '2026-09-23T09:30:00Z', { clienteId: 'c2', cliente: 'Ana <Pérez>' }),
    ],
    id => `https://p.test/correduria/cliente/${id}`,
  )
  assert.equal((m.match(/abrir ficha/g) ?? []).length, 2)
  assert.match(m, /Cambió su dirección de contacto/)
  assert.match(m, /El domicilio tarifica en hogar y auto/)
  assert.match(m, /Ana &lt;Pérez&gt;/)
  assert.doesNotMatch(m, /600111222|calle Mayor|codigoPostal/)
})

test('la marca se serializa y se lee de vuelta; un detalle ilegible es primera vez', () => {
  const marca = { instante: '2026-09-23T10:00:00.000Z', claves: ['acceso:1', 'parte:2'] }
  assert.deepEqual(leerMarcaActividad(serializarMarcaActividad(marca, 'texto')), marca)
  assert.equal(leerMarcaActividad('basura'), null)
  assert.equal(leerMarcaActividad(null), null)
})
