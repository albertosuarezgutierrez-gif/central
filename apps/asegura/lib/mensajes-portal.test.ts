// Cepo de los mensajes con el cliente (§Q.7), lado del corredor. Lee el FUENTE: lo que vigila es
// SQL crudo con un rol BYPASSRLS y el texto de un correo, donde ni tsc ni el build miran.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./mensajes-portal.ts', import.meta.url), 'utf8')

test('🪤 toda consulta a portal_mensaje filtra por correduría Y ficha (un id suelto contesta en la ficha de otro)', () => {
  const trozos = src.split(/(?=\b(?:from|update) portal_mensaje\b)/).slice(1)
  assert.ok(trozos.length >= 3, 'se esperaban al menos tres consultas a portal_mensaje')
  for (const t of trozos) {
    const where = t.slice(0, t.indexOf('`'))
    if (/^from portal_mensaje m\b/.test(t)) {
      // La cola de «Hoy» es de toda la correduría, pero sigue anclada a ella.
      assert.match(where, /m\.correduria_id = \$\{correduriaId\}::uuid/)
      continue
    }
    assert.match(where, /correduria_id = \$\{correduriaId\}::uuid and cliente_id = \$\{clienteId\}::uuid/, where.slice(0, 80))
  }
  assert.match(src, /from clientes where id = \$\{clienteId\}::uuid and correduria_id = \$\{correduriaId\}::uuid and merged_into_cliente_id is null/,
    'responder comprueba que la ficha es de esta correduría antes de escribir')
})

test('🪤 el correo de aviso NO lleva el texto del mensaje', () => {
  const aviso = src.slice(src.indexOf('async function avisarAlCliente'))
  assert.doesNotMatch(aviso, /cuerpo/, 'el contenido se queda en el portal, que es donde hay sesión')
  assert.match(src, /if \(avisar\) aviso = await avisarAlCliente/, 'sin la casilla marcada no sale ningún correo')
})
