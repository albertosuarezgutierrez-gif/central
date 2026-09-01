// ────────────────────────────────────────────────────────────────────────────
// La REGLA del interruptor del panel /telegram, probada sin BD.
//
// Es el corazón del panel: decide si un aviso sale o se calla. Un fallo aquí no lo caza `tsc`
// (todo son booleanos válidos) y no se ve hasta que un aviso deja de llegar — o hasta que uno
// silenciado sigue llegando y Alberto deja de creerse la pantalla.
// ────────────────────────────────────────────────────────────────────────────
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolverActivo } from './regla.ts'

const NORMAL = 'correo.huespedes'
const CRITICO = 'sistema.canal-mudo'

test('sin fila en BD, el aviso SALE (un aviso nuevo llega hasta que se decida callarlo)', () => {
  assert.equal(resolverActivo(NORMAL, new Map()), true)
})

test('con fila a false, el aviso se CALLA', () => {
  assert.equal(resolverActivo(NORMAL, new Map([[NORMAL, false]])), false)
})

test('con fila a true, el aviso SALE', () => {
  assert.equal(resolverActivo(NORMAL, new Map([[NORMAL, true]])), true)
})

test('🚨 fail-open: si NO se pudieron leer las preferencias, el aviso SALE', () => {
  // Es la decisión de diseño más importante del gate: un fallo de red o una migración sin
  // aplicar no puede convertirse en silencio — sería el modo de fallo que CLAUDE.md marca
  // como el más caro (un canal que se calla sin que nadie lo note).
  assert.equal(resolverActivo(NORMAL, null), true)
})

test('🚨 un aviso CRÍTICO sale aunque exista una fila que lo silencie', () => {
  // Defensa en profundidad: la API ya lo rechaza y la UI no ofrece el interruptor, pero si
  // alguien escribiera la fila a mano en BD, el aviso de «los demás avisos están mudos»
  // tiene que seguir saliendo.
  assert.equal(resolverActivo(CRITICO, new Map([[CRITICO, false]])), true)
  assert.equal(resolverActivo(CRITICO, null), true)
})

test('el silencio de un aviso NO arrastra a los demás', () => {
  const prefs = new Map([[NORMAL, false]])
  assert.equal(resolverActivo('correo.leads', prefs), true)
  assert.equal(resolverActivo('subastas.avisos', prefs), true)
})
