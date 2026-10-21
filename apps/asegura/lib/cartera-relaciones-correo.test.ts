// Cepo (21/10/2026): `listarRelaciones` (cada carga de una ficha) solo descifra el correo de cada relacionado cuando hace
// falta —tomador jurídico o sin correo—, y sirve los tipos crudos POR SENTIDO para que plataforma aplique la regla del
// presupuesto a un contacto como asegura. Lee el FUENTE: el módulo importa Prisma.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./cartera-relaciones.ts', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const listar = src.slice(src.indexOf('export async function listarRelaciones('), src.indexOf('export async function clientesQuePuedeVer('))

test('🪤 el correo de cada relacionado solo se mira con tomador jurídico o sin correo', () => {
  assert.match(listar, /const hacenFaltaCorreos = tipoOtorgante === 'juridica' \|\| \(await correoDe\(correduriaId, clienteId\)\) !== 'con_email'/)
  const porRelacion = listar.indexOf('otros.map(async (o) => [o.id, await correoDe(correduriaId, o.id)]')
  assert.ok(porRelacion > 0)
  assert.match(listar.slice(porRelacion - 40, porRelacion), /hacenFaltaCorreos \? await Promise\.all\($/)
  // Sin mirarlo es «no se sabe», nunca «no tiene».
  assert.match(listar, /correo: correos\.get\(o\.id\) \?\? 'no_se_sabe'/)
})

test('🪤 cada relación lleva sus tipos crudos por sentido', () => {
  assert.match(listar, /const sentidos = tiposPorSentido\(filas, clienteId\)/)
  assert.match(listar, /tiposIda: sentidos\.get\(o\.id\)\?\.ida \?\? \[\],/)
  assert.match(listar, /tiposVuelta: sentidos\.get\(o\.id\)\?\.vuelta \?\? \[\],/)
})
