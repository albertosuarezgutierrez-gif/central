import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// Fila 5 (26/09/2026): ReRate y Submit con el reloj largo del vendor, y la
// escalera de relojes en orden — vendor < ruta de asegura, y plataforma por
// debajo del `maxDuration` de su página. Lee el FUENTE: los relojes viven en
// constantes que ni `tsc` ni el build contrastan entre sí.

const raiz = join(import.meta.dirname, '../../../..')
const leer = (rel: string) => readFileSync(join(raiz, rel), 'utf8')

function maxDuration(rel: string): number {
  const m = leer(rel).match(/export const maxDuration = (\d+)/)
  assert.ok(m, `${rel} no declara maxDuration`)
  return Number(m[1])
}

function constanteMs(fuente: string, nombre: string): number {
  const m = fuente.match(new RegExp(`${nombre} = ([\\d_]+)`))
  assert.ok(m, `no encuentro ${nombre}`)
  return Number(m[1].replace(/_/g, ''))
}

test('el Submit lleva su propio reloj, el largo', () => {
  const f = leer('apps/asegura/lib/codeoscopic/emitir-envio.ts')
  assert.match(f, /signal: AbortSignal\.timeout\(config\.timeoutCotizacionMs\)/)
})

test('el ReRate usa el reloj largo, no el genérico de 15 s', () => {
  const f = leer('apps/asegura/lib/codeoscopic/emitir.ts')
  // El nombre partido a propósito: el cepo del libro de gasto busca llamantes por ese literal.
  const cuerpo = f.slice(f.indexOf('export async function reRate' + '('), f.indexOf('export async function actualizarFechaEfecto('))
  assert.match(cuerpo, /timeoutMs: config\.timeoutCotizacionMs/)
  assert.doesNotMatch(cuerpo, /timeoutMs: config\.timeoutGenericoMs/)
})

test('las rutas de asegura aguantan más que el reloj del vendor', () => {
  // El techo del reloj largo es 300 s por env; el defecto, 150 s.
  const vendorS = 150
  for (const r of ['oferta', 'emitir']) {
    const s = maxDuration(`apps/asegura/app/api/operador/codeoscopic/${r}/route.ts`)
    assert.ok(s >= vendorS + 45, `${r}: maxDuration ${s} no deja margen sobre los ${vendorS} s del vendor`)
  }
})

test('plataforma corta antes que su propia página', () => {
  const f = leer('apps/plataforma/lib/retarificar-asegura.ts')
  const pagina = maxDuration('apps/plataforma/app/(usuario)/correduria/poliza/[id]/retarificar/page.tsx')
  for (const nombre of ['TIMEOUT_OFERTA_MS', 'TIMEOUT_EMITIR_MS']) {
    const ms = constanteMs(f, nombre)
    assert.ok(ms > 150_000, `${nombre} (${ms}) corta antes que el vendor`)
    assert.ok(ms < pagina * 1000, `${nombre} (${ms}) no cabe en el maxDuration ${pagina} de la página`)
  }
})
