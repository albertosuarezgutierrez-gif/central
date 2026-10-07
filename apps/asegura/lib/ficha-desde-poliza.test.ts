// Cepos de FUENTE del volcado póliza → ficha (revisión del PR #4147, 03/10/2026). Las reglas puras
// tienen sus tests en `@central/module-seguros` y `oportunidad-documento-reglas.test.ts`; aquí se
// vigila que la orquestación las USE como se decidió.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const leer = (f: string) => readFileSync(join(import.meta.dirname, f), 'utf8')
const volcado = leer('ficha-desde-poliza.ts')
const orquesta = leer('oportunidad-documento.ts')

test('🪤 el email volcado NUNCA queda principal (el portal enlaza la sesión por el email principal)', () => {
  const llamada = volcado.slice(volcado.indexOf('await anadirContacto('), volcado.indexOf('await anadirContacto(') + 300)
  assert.match(llamada, /nuncaPrincipal: tipo === 'email'/)
  assert.doesNotMatch(llamada, /principal: true/)
})

test('🪤 la nota y la auditoría cuentan lo ESCRITO (RETURNING), no lo propuesto', () => {
  assert.match(volcado, /returning \$\{Prisma\.join\(campos\.map/)
  assert.match(volcado, /if \(escrito\?\.\[x\.flag\] !== true\) continue/)
  assert.doesNotMatch(volcado, /if \(n > 0\)/)
})

test('🪤 quién vuelca lo decide puedeVolcarEnFicha (portal: solo la ficha propia)', () => {
  // `quienSube` lo comparten el volcado y las figuras (`puedeAbrirFiguras`, más estricto).
  const i = orquesta.indexOf('const identificado = puedeVolcarEnFicha(quienSube)')
  assert.ok(i > 0 && i < orquesta.indexOf('await volcarPolizaEnFicha('))
  assert.match(orquesta, /const volcado = identificado\n\s+\? await volcarPolizaEnFicha\(/)
})

test('🪤 por teléfono o email no se asigna ficha: solo nota de posible duplicado', () => {
  assert.doesNotMatch(orquesta, /clienteId\s*=\s*[^\n;]*(compartenContacto|fichasPorContacto|porContacto|usar)/)
  assert.doesNotMatch(orquesta, /'usar' in lead/)
})

test('🪤 sin nada escrito, los avisos NO se pierden: «nada_que_rellenar» los lleva', () => {
  const retornos = volcado.match(/\{ estado: 'nada_que_rellenar'[^}]*\}/g) ?? []
  assert.ok(retornos.length >= 3, 'esperaba el tipo y los retornos de «nada_que_rellenar»')
  for (const r of retornos) assert.match(r, /avisos/, `«nada_que_rellenar» sin avisos: ${r}`)
  // El retorno final (hechos vacío) debe llevar los avisos RECOGIDOS, no una lista vacía.
  const fin = volcado.slice(volcado.indexOf("? { estado: 'rellenada'"))
  assert.match(fin, /: \{ estado: 'nada_que_rellenar', avisos \}/)
})
