import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CAMPOS_CONTACTO_PROPIO,
  CAMPOS_VETADOS_AL_CLIENTE,
  confirmacionContactoVigente,
  decidirFichaPropia,
  enmascararDireccion,
  enmascararEmail,
  enmascararTelefono,
  estadoConfirmacion,
  textoHistorialConfirmacionContacto,
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

// ─── «Comprueba tus datos de contacto» (08/09/2026) ──────────────────────────

test('el teléfono enmascarado solo deja ver los 3 últimos dígitos', () => {
  assert.equal(enmascararTelefono('612345512'), '··· ··· 512')
  assert.equal(enmascararTelefono('+34 612 34 55 12'), '··· ··· 512')
  // Nunca puede salir el número entero ni su prefijo.
  assert.ok(!enmascararTelefono('+441234567890').includes('44123'))
})

test('un teléfono con menos de 5 dígitos no se enseña ni enmascarado', () => {
  // Con 4 dígitos, «los 3 últimos» ya es casi el número entero.
  assert.equal(enmascararTelefono('1234'), '···')
  assert.equal(enmascararTelefono(''), '···')
})

test('el email enmascarado deja la primera letra y el dominio', () => {
  assert.equal(enmascararEmail('maria@gmail.com'), 'm···@gmail.com')
  assert.equal(enmascararEmail('  Ana.Lopez@empresa.es '), 'A···@empresa.es')
})

test('un email sin forma de email no se enseña', () => {
  assert.equal(enmascararEmail('sin-arroba'), '···')
  assert.equal(enmascararEmail('@dominio.com'), '···')
  assert.equal(enmascararEmail('a@'), '···')
})

test('la dirección enmascarada: 6 letras de la calle, CP y ciudad', () => {
  assert.equal(enmascararDireccion('Calle Socorro 24, 2ºB', '41003', 'Sevilla'), 'Calle ···, 41003 Sevilla')
  // El número de portal y el piso NUNCA salen: es lo que identifica la casa.
  assert.ok(!enmascararDireccion('Calle Socorro 24, 2ºB', '41003', 'Sevilla')!.includes('24'))
})

test('la dirección se sostiene con partes vacías, y todo vacío es null', () => {
  assert.equal(enmascararDireccion(null, '41003', 'Sevilla'), '41003 Sevilla')
  assert.equal(enmascararDireccion('Avenida de la Constitución', null, null), 'Avenid···')
  assert.equal(enmascararDireccion(null, null, 'Sevilla'), 'Sevilla')
  assert.equal(enmascararDireccion(null, null, null), null)
  assert.equal(enmascararDireccion('  ', '', null), null)
})

test('la confirmación tiene TRES estados: nunca ≠ caducada', () => {
  const hoy = new Date('2026-09-08T10:00:00Z')
  assert.equal(estadoConfirmacion(null, hoy), 'nunca')
  assert.equal(estadoConfirmacion(new Date('2026-09-01T10:00:00Z'), hoy), 'vigente')
  assert.equal(estadoConfirmacion(new Date('2025-09-09T10:00:00Z'), hoy), 'vigente') // 364 días
  assert.equal(estadoConfirmacion(new Date('2025-09-08T10:00:00Z'), hoy), 'caducada') // 365 justos
  assert.equal(estadoConfirmacion(new Date('2024-01-01T00:00:00Z'), hoy), 'caducada')
})

test('confirmacionContactoVigente: solo con sello reciente; NULL es false', () => {
  const hoy = new Date('2026-09-08T10:00:00Z')
  assert.equal(confirmacionContactoVigente(null, hoy), false)
  assert.equal(confirmacionContactoVigente(new Date('2026-08-08T10:00:00Z'), hoy), true)
  assert.equal(confirmacionContactoVigente(new Date('2025-01-08T10:00:00Z'), hoy), false)
  // Un sello en el futuro (reloj mal puesto) no le hace confirmar dos veces.
  assert.equal(confirmacionContactoVigente(new Date('2026-09-09T10:00:00Z'), hoy), true)
})

test('el historial de la confirmación nombra al cliente y no lleva valores', () => {
  const t = textoHistorialConfirmacionContacto()
  assert.match(t, /^El cliente confirmó desde el portal/)
  assert.match(t, /siguen siendo correctos/)
  assert.ok(!/\d/.test(t), 'ni un dígito: el historial no repite teléfonos ni CPs')
})
