import { test } from 'node:test'
import assert from 'node:assert/strict'
import { leerAprobacion, textoDesenlace, type Desenlace } from './aprobaciones-asegura.ts'

test('ningún fallo se lee como «enviado»', () => {
  const fallos: Desenlace[] = ['no_encontrada', 'ya_decidida', 'sin_email', 'sin_correo_configurado', 'fallida', 'incierto', 'invalida', 'error']
  for (const f of fallos) assert.doesNotMatch(textoDesenlace(f), /^Enviado/, f)
  assert.match(textoDesenlace('error'), /NO se sabe/)
  // Un corte esperando al proveedor pudo salir: ni «enviado» ni «NO enviado».
  assert.match(textoDesenlace('incierto'), /NO se sabe/)
  assert.doesNotMatch(textoDesenlace('incierto'), /NO enviado/)
  assert.match(textoDesenlace('sin_correo_configurado', 'Falta ASEGURA_MAIL_FROM'), /Falta ASEGURA_MAIL_FROM.*reintentarlo no lo arregla/)
})

test('una propuesta sin asunto o texto es ilegible, no una vacía', () => {
  assert.equal(leerAprobacion({ id: 'a', clienteId: 'c', asunto: '', texto: 'x' }), null)
  const a = leerAprobacion({ id: 'a', clienteId: 'c', asunto: 's', texto: 't', urgente: true })
  assert.equal(a?.urgente, true)
  assert.equal(a?.cliente, null)
})

test('🪤 solo es para la compañía si asegura lo dice: un valor raro sigue siendo «al cliente»', () => {
  const base = { id: 'a', clienteId: 'c', asunto: 's', texto: 't' }
  assert.equal(leerAprobacion({ ...base, accion: 'enviar_correo_compania', destinatario: 'Allianz' })?.para, 'compania')
  assert.equal(leerAprobacion({ ...base, accion: 'enviar_correo_compania', destinatario: 'Allianz' })?.destinatario, 'Allianz')
  assert.equal(leerAprobacion({ ...base, accion: 'otra' })?.para, 'cliente')
  assert.equal(leerAprobacion(base)?.para, 'cliente')
})

test('🪤 el buzón sugerido solo se preselecciona si está en la lista que se enseña', () => {
  const base = { id: 'a', clienteId: 'c', asunto: 's', texto: 't', accion: 'enviar_correo_compania' }
  const buzones = [{ id: 'b1', nombre: 'Bajas', email: 'bajas@x.es', area: 'administracion' }, { id: 'b2', nombre: 'sin correo' }]
  const a = leerAprobacion({ ...base, buzones, buzonSugerido: 'b1' })
  assert.deepEqual(a?.buzones.map((b) => b.id), ['b1'])
  assert.equal(a?.buzonSugerido, 'b1')
  assert.equal(leerAprobacion({ ...base, buzones, buzonSugerido: 'b2' })?.buzonSugerido, null)
  assert.equal(leerAprobacion({ ...base, buzonSugerido: 'b1' })?.buzonSugerido, null)
})
