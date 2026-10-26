// Egress de la BD compartida (29/09/2026, plan Free 5 GB/mes): /correduria se bajaba
// ~3.500 leads y ~2.200 filas de recaptación en CADA visita solo para pintar dos
// contadores. Vigila que el contador de llamadas vaya por el endpoint cacheado.
// Lee el FUENTE. (El de recaptación se retiró con su bloque el 30/09/2026.)
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const leer = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const dir = 'apps/plataforma/app/(usuario)/correduria/'

test('ni «Gestión» ni «Mi mesa» bajan la lista de leads del volcado para pintar un contador', () => {
  // Desde el 13/10/2026 la franja de «llamadas hoy» se quitó (los 3.674 leads se trabajan en «Prospección»).
  // Lo que se vigila sigue siendo lo mismo: ninguna pantalla de la correduría puede traer `leads-competencia`
  // entera solo para contar; si vuelve un contador de llamadas, va por `/api/correduria/contador?c=llamadas`.
  for (const f of ['HoyCockpit.tsx', 'CorreduriaClient.tsx', 'mesa/MesaClient.tsx', 'mesa/BandaAvisos.tsx', 'mesa/BloquesSueltos.tsx', 'CampanaAvisos.tsx']) {
    assert.doesNotMatch(leer(dir + f), /leads-competencia/, `${f} baja la lista de leads del volcado`)
  }
})

test('el contador cacheado no cachea un fallo como número', () => {
  const s = leer('apps/plataforma/lib/correduria/contadores-cacheados.ts')
  assert.match(s, /unstable_cache\(/)
  assert.match(s, /if \(d\.estado !== 'ok'\) throw/)
  assert.match(s, /catch \{\s+return null/)
})
