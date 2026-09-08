import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CAMPOS_CONTACTO_PROPIO,
  CAMPOS_VETADOS_AL_CLIENTE,
  decidirFichaPropia,
  textoHistorialContactoPropio,
} from './contacto-propio.ts'

test('una sola ficha: se aplica ahí', () => {
  assert.deepEqual(decidirFichaPropia(['a']), { estado: 'ok', clienteId: 'a' })
})

test('dos vínculos a la MISMA ficha siguen siendo una ficha', () => {
  // Es el caso real de una identidad que se vinculó dos veces (dos canjes de
  // código). Tratarlo como ambiguo dejaría a esa persona sin poder corregir su
  // dirección para siempre, sin ningún motivo.
  assert.deepEqual(decidirFichaPropia(['a', 'a']), { estado: 'ok', clienteId: 'a' })
})

test('dos fichas DISTINTAS: no se adivina', () => {
  // El fallo que esto evita: escribir el domicilio nuevo de una persona en la
  // ficha de su sociedad porque el vínculo era más antiguo. Nada falla, nadie
  // se entera, y queda un dato falso con cara de bueno.
  assert.deepEqual(decidirFichaPropia(['b', 'a']), { estado: 'varias_fichas', clienteIds: ['a', 'b'] })
})

test('sin vínculo: sin ficha, que NO es lo mismo que varias', () => {
  assert.deepEqual(decidirFichaPropia([]), { estado: 'sin_ficha' })
  assert.deepEqual(decidirFichaPropia(['  ']), { estado: 'sin_ficha' })
})

test('el historial dice quién y qué campos, y NUNCA los valores', () => {
  const t = textoHistorialContactoPropio(['direccion', 'ciudad'])
  assert.match(t, /^El cliente actualizó desde el portal: ciudad, direccion\./)
  // Lo que importa del aviso: que no se lea como un cambio en la póliza.
  assert.match(t, /No se ha comunicado a ninguna compañía/)
})

test('el historial se sostiene sin campos', () => {
  assert.match(textoHistorialContactoPropio([]), /sus datos de contacto/)
})

test('los campos vetados y los permitidos no se solapan', () => {
  // Si alguien mueve `notas` o `dni` a la lista de permitidos, este test cae
  // antes de que el portal ofrezca editar la identidad con un código de correo.
  for (const vetado of CAMPOS_VETADOS_AL_CLIENTE) {
    assert.ok(
      !(CAMPOS_CONTACTO_PROPIO as readonly string[]).includes(vetado),
      `${vetado} no puede estar entre los campos que el cliente edita`,
    )
  }
})
