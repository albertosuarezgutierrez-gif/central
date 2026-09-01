import test from 'node:test'
import assert from 'node:assert/strict'
import { yaLoMandoSmoobu, type MsgHilo } from './equivalentes-smoobu.ts'

const H = (subject: string, text = ''): MsgHilo => ({ from: 'host', subject, text })

test('detecta las plantillas reales de Smoobu por su asunto', () => {
  assert.equal(yaLoMandoSmoobu('confirmacion', [H('💃 Booking Confirmation')]), true)
  assert.equal(yaLoMandoSmoobu('acceso', [H('WHERE TO COLLECT THE KEYS? Duplex Center 👨‍✈️👩‍✈️ 🔑 ')]), true)
  assert.equal(yaLoMandoSmoobu('vispera_llegada', [H('⚠ RECORDATORIO - MUY IMPORTANTE‼')]), true)
  assert.equal(yaLoMandoSmoobu('bienvenida', [H('BIENVENIDO¡¡ ')]), true)
  assert.equal(yaLoMandoSmoobu('post_salida', [H('📈 Ayúdanos a mejorar')]), true)
  assert.equal(yaLoMandoSmoobu('estancia', [H('How can we make your stay better?')]), true)
})

test('un mensaje del HUÉSPED nunca cuenta como plantilla, y un hilo limpio tampoco', () => {
  const g: MsgHilo = { from: 'guest', subject: '', text: 'booking confirmation?' }
  assert.equal(yaLoMandoSmoobu('confirmacion', [g]), false)
  assert.equal(yaLoMandoSmoobu('acceso', [H('otro asunto', 'texto normal')]), false)
})

test('vispera_salida no tiene equivalente en Smoobu: nunca bloquea', () => {
  assert.equal(yaLoMandoSmoobu('vispera_salida', [H('cualquier cosa', 'deje las llaves en la caja')]), false)
})
