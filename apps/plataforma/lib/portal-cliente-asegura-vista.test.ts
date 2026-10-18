// Revisión 18/10/2026: el 404 de la vista previa de un PRESUPUESTO no es «la ficha ya no está».
// Para verlo en rojo: en `textoVista`, quita la rama `que === 'presupuesto'`.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { TEXTO_PRESUPUESTO_NO_DISPONIBLE, textoVista } from './portal-cliente-asegura.ts'

test('404 de un presupuesto: texto propio, no el de la ficha', () => {
  const r = { estado: 'no_encontrado' as const, motivo: 'Ese presupuesto no existe en esta correduría o está retirado.' }
  assert.equal(textoVista(r, 'este cliente', 'presupuesto'), 'Este presupuesto ya no está disponible (retirado o la ficha cambió).')
  assert.match(textoVista(r, 'Ana'), /ficha ya no está/)
})

test('la vista previa del presupuesto pide el texto de presupuesto', () => {
  const src = readFileSync(new URL('../app/(usuario)/correduria/oportunidad/[id]/PrepararPresupuestoBot.tsx', import.meta.url), 'utf8')
  assert.match(src, /textoVista\(r, 'este cliente', 'presupuesto'\)/)
  assert.ok(TEXTO_PRESUPUESTO_NO_DISPONIBLE.length > 0)
})
