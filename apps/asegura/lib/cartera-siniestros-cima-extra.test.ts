import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { leerCimaExtraSiniestro } from './cima-extra-siniestro.ts'

test('cimaExtra: no-lista = null (no se sabe); [] = CIMA no trae más; solo pares de texto', () => {
  assert.equal(leerCimaExtraSiniestro(undefined), null)
  assert.equal(leerCimaExtraSiniestro(null), null)
  assert.equal(leerCimaExtraSiniestro({ ruta: 'a', valor: 'b' }), null)
  assert.deepEqual(leerCimaExtraSiniestro([]), [])
  assert.deepEqual(
    leerCimaExtraSiniestro([{ ruta: 'A.B', valor: 'x' }, { ruta: 'C', valor: 3 }, null, 'z', { ruta: 'D' }]),
    [{ ruta: 'A.B', valor: 'x' }],
  )
})

test('la lectura sale de cima_extra -> cimaExtra y NO entra en el helper que usa el portal', () => {
  const src = readFileSync(new URL('./cartera-siniestros.ts', import.meta.url), 'utf8')
  assert.match(src, /cima_extra -> 'cimaExtra'/)
  const f = /export async function tercerosCimaCrudos[\s\S]*?\n}\n/.exec(src)
  assert.ok(f && !/cimaExtra/.test(f[0]), 'tercerosCimaCrudos (lo usa el portal) no debe tocar cimaExtra')
})
