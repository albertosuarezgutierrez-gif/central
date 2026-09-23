// Cepo de «datos para emitir» (§4bis). Lee el FUENTE: lo que vigila vive en SQL crudo.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./datos-emision.ts', import.meta.url), 'utf8')

test('🪤 solo se rellena con lo PROPIO del tomador: intervinientes con SU cliente_id, nunca otra persona de la póliza', () => {
  assert.match(src, /from poliza_intervinientes i\s+where i\.cliente_id = \$\{clienteId\}::uuid and i\.correduria_id = \$\{correduriaId\}::uuid/)
  assert.match(src, /from clientes c\s+where c\.id = \$\{clienteId\}::uuid and c\.correduria_id = \$\{correduriaId\}::uuid/)
})

test('🪤 el portal no elige ficha: sale de portal_vinculo', () => {
  const portal = src.slice(src.indexOf('export async function datosParaEmitirDePortal'))
  assert.match(portal, /fichaPropiaDe\(correduriaId, identidadId\)/)
  // Y la ficha tiene que ser la del TOMADOR del presupuesto (el portal deja verlo también por canal).
  assert.match(portal, /if \(p\.clienteId !== ficha\.clienteId\) return \{ estado: 'otra_ficha' \}/)
  assert.match(portal, /datosParaEmitir\(correduriaId, ficha\.clienteId\)/)
})

test('🪤 un cifrado que no abre llega como NO legible, no como vacío', () => {
  assert.match(src, /legible: !campoIlegible\(v\)/)
})

test('🪤 el correo sale de la MISMA regla que los avisos (estadoEmailDeFicha), no de la columna espejo', () => {
  assert.match(src, /estadoEmailDeFicha\(correduriaId, clienteId\)/)
  assert.doesNotMatch(src, /select c\.email|c\.email,/)
  assert.match(src, /c\.merged_into_cliente_id is null/)
})
