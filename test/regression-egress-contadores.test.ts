// Egress de la BD compartida (29/09/2026, plan Free 5 GB/mes): /correduria se bajaba
// ~3.500 leads y ~2.200 filas de recaptación en CADA visita solo para pintar dos
// contadores. Vigila que los contadores vayan por el endpoint cacheado y que la
// cola de recaptación no se monte hasta abrir Clientes. Lee el FUENTE.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const leer = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const dir = 'apps/plataforma/app/(usuario)/correduria/'

test('«Hoy» cuenta las llamadas con el contador, no con la lista de leads', () => {
  const s = leer(dir + 'HoyCockpit.tsx')
  assert.doesNotMatch(s, /leads-competencia/)
  assert.match(s, /\/api\/correduria\/contador\?c=llamadas/)
})

test('la cola de recaptación solo se monta al abrir Clientes', () => {
  const s = leer(dir + 'CorreduriaClient.tsx')
  assert.match(s, /\{montada\('clientes'\) && <Recaptacion onContador=\{setNRecaptacion\} \/>\}/)
  assert.doesNotMatch(s, /^\s*<Recaptacion onContador/m)
  assert.match(s, /\/api\/correduria\/contador\?c=recaptacion/)
})

test('el contador cacheado no cachea un fallo como número', () => {
  const s = leer('apps/plataforma/lib/correduria/contadores-cacheados.ts')
  assert.match(s, /unstable_cache\(/)
  assert.match(s, /if \(d\.estado !== 'ok'\) throw/)
  assert.match(s, /if \(cola\.estado !== 'ok'\) throw/)
  assert.match(s, /catch \{\s+return null/)
})
