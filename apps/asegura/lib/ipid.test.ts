// Cepos de las fichas IPID. Leen el FUENTE: lo que vigilan vive dentro de SQL.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./ipid.ts', import.meta.url), 'utf8')
const acept = readFileSync(new URL('./presupuesto-aceptacion.ts', import.meta.url), 'utf8')

test('🪤 sustituir una ficha RETIRA la anterior en la misma transacción, nunca la borra', () => {
  const sub = src.slice(src.indexOf('export async function subirIpid'), src.indexOf('export async function retirarIpid'))
  const retira = sub.indexOf('update ipid set retirado_at = now()')
  const inserta = sub.indexOf('insert into ipid')
  assert.ok(sub.includes('$transaction') && retira > 0 && inserta > retira)
  assert.doesNotMatch(src, /delete from ipid/i)
})

test('🪤 todo va acotado a la correduría y solo cuenta la vigente', () => {
  assert.equal(src.match(/correduria_id = \$\{correduriaId\}::uuid/g)?.length, 4)
  assert.match(src, /clave = \$\{clave\} and retirado_at is null limit 1/)
})

test('🪤 lo firmado cita la ficha por la MISMA clave de producto que el portal (compañía + producto de la opción)', () => {
  assert.match(acept, /ipidDeOpcion\(correduriaId, f\.compania, f\.producto\)/)
  assert.match(acept, /ipid: f\.ipidHuella \? \{ huella: f\.ipidHuella \} : null/)
})

test('🪤 se comprueba la cabecera %PDF- antes de guardar', () => {
  assert.match(src, /toString\('latin1'\) !== '%PDF-'/)
})

test('🪤 el portal enlaza la ficha por la MISMA clave de producto (claveProducto) que cita lo firmado', () => {
  const portal = readFileSync(new URL('../../asegura-portal/lib/presupuesto.ts', import.meta.url), 'utf8')
  assert.match(portal, /ipidPorClave\.get\(claveProducto\(f\.compania, f\.producto\) \?\? ''\)/)
  assert.match(portal, /where: \{ correduriaId, retiradoAt: null \}/)
})
