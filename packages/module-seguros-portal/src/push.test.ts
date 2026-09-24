import assert from 'node:assert/strict'
import { test } from 'node:test'

import { textoPushObligacion } from './push.ts'
import { TIPOS_RECORDATORIO_PROPIO } from './recordatorio-libre.ts'

test('🚨 un recordatorio PROPIO no recibe el texto de una renovación de póliza', () => {
  // El daño concreto: «te queda poco margen para decidir si lo renuevas» sobre
  // una ITV le dice a alguien que se queda sin cobertura cuando lo que vence es
  // la inspección del coche. Es el mismo fallo que el cron de correo de
  // `apps/asegura` evita excluyéndolos; aquí no se pueden excluir, porque el
  // push es el ÚNICO canal que puede avisar de un recordatorio sin póliza.
  for (const tipo of TIPOS_RECORDATORIO_PROPIO) {
    const { title, body } = textoPushObligacion({ tipo, titulo: 'ITV del Ibiza' })
    const texto = `${title} ${body}`
    assert.ok(!/renuev/i.test(texto), `«${tipo}» habla de renovar`)
    assert.ok(!/seguro/i.test(texto), `«${tipo}» lo llama seguro`)
    assert.match(body, /ITV del Ibiza/)
  }
})

test('una obligación derivada de la póliza conserva su texto de siempre', () => {
  const { title, body } = textoPushObligacion({ tipo: 'poliza', titulo: 'Renovación 302…' })
  assert.match(title, /seguro/i)
  assert.match(body, /renuev/i)
})
