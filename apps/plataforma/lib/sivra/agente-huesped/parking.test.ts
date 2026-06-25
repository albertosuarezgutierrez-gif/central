import { test } from 'node:test'
import assert from 'node:assert'
import { bloqueParking, PARKINGS_CERCANOS } from './parking.ts'
import { contieneDatoInventado } from './guardrail.ts'

test('bloqueParking nombra los 4 parkings recomendados', () => {
  const b = bloqueParking()
  for (const nombre of ['José Laguillo', 'Escuelas Pías', 'Imagen', 'Plaza de la Concordia']) {
    assert.ok(b.includes(nombre), `falta ${nombre} en el bloque`)
  }
})

test('bloqueParking deja claro que el parking propio está ocupado/no disponible', () => {
  assert.match(bloqueParking(), /ocupado|no dispone/i)
})

test('los teléfonos del bloque NO disparan el guardrail (están en la ficha)', () => {
  // El guardrail valida los teléfonos de la respuesta contra las fuentes; como el bloque va en
  // la ficha (una fuente), una respuesta que use esos teléfonos no debe marcarse como inventada.
  const ficha = bloqueParking()
  for (const p of PARKINGS_CERCANOS) {
    if (!p.telefono) continue
    const reply = `Siento comunicarle que nuestro parking está ocupado. Puede usar ${p.nombre}, teléfono ${p.telefono}.`
    assert.equal(contieneDatoInventado(reply, ficha), false, `${p.nombre} marcado como inventado`)
  }
})

test('un teléfono que NO está en la ficha sí lo detecta el guardrail (control)', () => {
  assert.equal(contieneDatoInventado('Llame al 954 99 99 99', bloqueParking()), true)
})
