// `completarCoberturasTarificacion` con BD y vendor doblados. `node --test`.
//
// El `registerHooks` solo existe porque `lib/tenant.ts` importa `./db` sin extensión y el
// resolutor ESM de Node no adivina el `.ts` (mismo arreglo que
// test/regression-asegura-cotizaciones-guardadas.test.ts). Prisma se construye en el primer uso,
// así que importar el módulo no exige base de datos.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as modulo from 'node:module'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { DepsCoberturasTarificacion } from './coberturas-tarificacion.ts'

// `registerHooks` existe en Node 22.15+, pero los tipos de @types/node de esta app son anteriores.
type Siguiente = (e: string, c: { parentURL?: string }) => unknown
const { registerHooks } = modulo as unknown as {
  registerHooks: (h: { resolve: (e: string, c: { parentURL?: string }, s: Siguiente) => unknown }) => void
}
registerHooks({
  resolve(especificador, contexto, siguiente) {
    if (especificador.startsWith('.') && !/\.[a-z]+$/.test(especificador) && contexto.parentURL) {
      const url = new URL(`${especificador}.ts`, contexto.parentURL)
      if (existsSync(fileURLToPath(url))) return siguiente(`${especificador}.ts`, contexto)
    }
    return siguiente(especificador, contexto)
  },
})

const { completarCoberturasTarificacion, tarificacionACompletar } = await import('./coberturas-tarificacion.ts')
type Deps = DepsCoberturasTarificacion
type Fila = Awaited<ReturnType<Deps['pendientes']>>[number]

const IDS = { correduriaId: 'cor-1', tarificacionId: 'tar-1' }
const ESPERA = (ms: number) => new Promise((r) => setTimeout(r, ms))

type Escritura = { ids: string[]; sobre: Parameters<Deps['guardar']>[1]; garantias: Parameters<Deps['guardar']>[2] }

/** Doble de BD en memoria + vendor. `coberturas[f]` = lo que responde cada oferta. */
function doble(o: {
  filas: (Fila & { coberturas?: unknown })[]
  ramo?: string
  simulado?: boolean
  projectId?: string | null
  vendor?: ((ofertaId: string) => Promise<unknown>) | null
  topeMs?: number
}) {
  const bd = o.filas.map((f) => ({ ...f, coberturas: f.coberturas ?? null }))
  const llamadas: string[] = []
  const escrituras: Escritura[] = []
  let enVuelo = 0
  let picoEnVuelo = 0
  const vendor = o.vendor === undefined ? async () => [{ name: 'Lunas', included: true }] : o.vendor
  const deps: Deps = {
    cabecera: async () => ({ simulado: o.simulado ?? false, projectId: o.projectId === undefined ? 'P1' : o.projectId, ramo: o.ramo ?? 'auto' }),
    pendientes: async () => bd.filter((f) => f.coberturas === null).map((f) => ({ id: f.id, ofertaId: f.ofertaId })),
    coberturas: vendor
      ? async (_p, ofertaId) => {
          llamadas.push(ofertaId)
          enVuelo += 1
          picoEnVuelo = Math.max(picoEnVuelo, enVuelo)
          try {
            return await vendor(ofertaId)
          } finally {
            enVuelo -= 1
          }
        }
      : null,
    guardar: async (ids, sobre, garantias) => {
      escrituras.push({ ids, sobre, garantias })
      let n = 0
      for (const f of bd) if (ids.includes(f.id) && f.coberturas === null) { f.coberturas = sobre; n += 1 }
      return n
    },
    ahora: () => new Date('2026-09-29T10:00:00Z'),
    ...(o.topeMs !== undefined ? { topeMs: o.topeMs } : {}),
  }
  return { deps, bd, llamadas, escrituras, pico: () => picoEnVuelo }
}

test('concurrencia: nunca más de 5 GET a la vez', async () => {
  const filas = Array.from({ length: 12 }, (_, i) => ({ id: `f${i}`, ofertaId: `o${i}` }))
  const d = doble({ filas, vendor: async () => { await ESPERA(10); return [{ name: 'Lunas', included: true }] } })
  const r = await completarCoberturasTarificacion(IDS, d.deps)
  assert.equal(d.llamadas.length, 12)
  assert.ok(d.pico() <= 5, `pico de ${d.pico()} llamadas a la vez`)
  assert.equal(d.pico(), 5, 'con 12 ofertas lentas se llena el cupo')
  assert.equal(r.leidas, 12)
})

test('una oferta compartida por varias filas → UN GET, y se escriben todas', async () => {
  const d = doble({
    filas: [
      { id: 'a1', ofertaId: 'OF-A' },
      { id: 'a2', ofertaId: 'OF-A' },
      { id: 'a3', ofertaId: 'OF-A' },
      { id: 'b1', ofertaId: 'OF-B' },
    ],
  })
  const r = await completarCoberturasTarificacion(IDS, d.deps)
  assert.deepEqual([...d.llamadas].sort(), ['OF-A', 'OF-B'])
  assert.equal(r.leidas, 4)
  assert.ok(d.bd.every((f) => f.coberturas !== null))
})

test('idempotente: una fila con coberturas no se relee ni se toca', async () => {
  const yaLeidas = { estado: 'leidas', lista: [{ nombre: 'Robo', incluida: true, texto: null }], leidasAt: 'antes' }
  const d = doble({
    filas: [
      { id: 'x', ofertaId: 'OF-X', coberturas: yaLeidas },
      { id: 'y', ofertaId: 'OF-Y' },
    ],
  })
  await completarCoberturasTarificacion(IDS, d.deps)
  assert.deepEqual(d.llamadas, ['OF-Y'])
  assert.equal(d.bd[0].coberturas, yaLeidas, 'la fila ya leída sigue siendo el mismo objeto')
  // Segunda pasada: nada pendiente, nada que llamar.
  const r2 = await completarCoberturasTarificacion(IDS, d.deps)
  assert.deepEqual(d.llamadas, ['OF-Y'])
  assert.equal(r2.leidas, 0)
})

test('tarificación simulada → 0 llamadas y 0 escrituras', async () => {
  const d = doble({ filas: [{ id: 'a', ofertaId: 'OF-A' }], simulado: true })
  const r = await completarCoberturasTarificacion(IDS, d.deps)
  assert.equal(d.llamadas.length, 0)
  assert.equal(d.escrituras.length, 0)
  assert.equal(r.omitido, 'simulada')
})

test('sin project o sin vendor → 0 llamadas', async () => {
  const sinProyecto = doble({ filas: [{ id: 'a', ofertaId: 'OF-A' }], projectId: null })
  assert.equal((await completarCoberturasTarificacion(IDS, sinProyecto.deps)).omitido, 'sin_proyecto')
  assert.equal(sinProyecto.llamadas.length, 0)
  const sinVendor = doble({ filas: [{ id: 'a', ofertaId: 'OF-A' }], vendor: null })
  assert.equal((await completarCoberturasTarificacion(IDS, sinVendor.deps)).omitido, 'sin_vendor')
  assert.equal(sinVendor.escrituras.length, 0, 'sin vendor la fila se queda a NULL («no intentado»)')
})

test('🚨 fallo de red → estado `fallo`, lista NULL (nunca []) y garantías todas no_consta', async () => {
  const d = doble({ filas: [{ id: 'a', ofertaId: 'OF-A' }], vendor: async () => { throw new Error('ECONNRESET') } })
  const r = await completarCoberturasTarificacion(IDS, d.deps)
  assert.equal(r.fallos, 1)
  const e = d.escrituras[0]
  assert.equal(e.sobre.estado, 'fallo')
  assert.equal(e.sobre.lista, null)
  assert.ok(e.garantias)
  // Todo «no consta» salvo lo que da la LEY (RC obligatoria en auto/moto), que no depende de la compañía.
  const { rc_obligatoria, ...resto } = e.garantias!.porClave
  assert.equal(rc_obligatoria, 'si')
  assert.deepEqual([...new Set(Object.values(resto))], ['no_consta'], 'un fallo no puede decir «no incluye» nada')
})

test('lista vacía del vendor es `vacias` (un dato), no `fallo`', async () => {
  const d = doble({ filas: [{ id: 'a', ofertaId: 'OF-A' }], vendor: async () => [] })
  await completarCoberturasTarificacion(IDS, d.deps)
  assert.equal(d.escrituras[0].sobre.estado, 'vacias')
  assert.deepEqual(d.escrituras[0].sobre.lista, [])
})

test('clasifica con el catálogo del ramo; un ramo sin catálogo guarda coberturas y garantías NULL', async () => {
  const auto = doble({ filas: [{ id: 'a', ofertaId: 'OF-A' }] })
  await completarCoberturasTarificacion(IDS, auto.deps)
  assert.equal(auto.escrituras[0].garantias?.porClave.lunas, 'si')
  const vida = doble({ filas: [{ id: 'a', ofertaId: 'OF-A' }], ramo: 'responsabilidad_civil' })
  await completarCoberturasTarificacion(IDS, vida.deps)
  assert.equal(vida.escrituras[0].sobre.estado, 'leidas')
  assert.equal(vida.escrituras[0].garantias, null)
})

test('filas sin oferta_id no se leen ni se escriben (van por el camino viejo)', async () => {
  const d = doble({ filas: [{ id: 'a', ofertaId: null }, { id: 'b', ofertaId: 'OF-B' }] })
  const r = await completarCoberturasTarificacion(IDS, d.deps)
  assert.equal(r.sinOferta, 1)
  assert.equal(d.bd[0].coberturas, null)
  assert.deepEqual(d.llamadas, ['OF-B'])
})

test('tope agotado: lo no empezado se queda a NULL («no intentado»), no se inventa un fallo', async () => {
  const filas = Array.from({ length: 8 }, (_, i) => ({ id: `f${i}`, ofertaId: `o${i}` }))
  const d = doble({ filas, topeMs: 30, vendor: async () => { await ESPERA(60); return [] } })
  const r = await completarCoberturasTarificacion(IDS, d.deps)
  assert.equal(d.llamadas.length, 5, 'solo arrancan las 5 primeras')
  assert.equal(r.fallos, 5, 'las que estaban en vuelo cuando venció el tope son fallo')
  assert.equal(r.sinIntentar, 3)
  assert.equal(d.bd.filter((f) => f.coberturas === null).length, 3)
})

test('nunca lanza: si la BD revienta, devuelve resumen con omitido=error', async () => {
  const d = doble({ filas: [] })
  d.deps.cabecera = async () => { throw new Error('boom') }
  const r = await completarCoberturasTarificacion(IDS, d.deps)
  assert.equal(r.omitido, 'error')
})

test('tarificacionACompletar: solo una REAL y guardada', () => {
  const base = { ok: true as const, cotizacion: {} as never, coste: '0,50€', restantesHoy: 1 }
  assert.deepEqual(
    tarificacionACompletar({ ...base, simulado: false, guardado: { estado: 'guardada', cotizacionId: 't9' } }, 'cor-1'),
    { correduriaId: 'cor-1', tarificacionId: 't9' },
  )
  assert.equal(tarificacionACompletar({ ...base, simulado: true, guardado: { estado: 'guardada', cotizacionId: 't9' } }, 'cor-1'), null)
  assert.equal(tarificacionACompletar({ ...base, simulado: false, guardado: { estado: 'no_guardada', motivo: 'x' } }, 'cor-1'), null)
  assert.equal(tarificacionACompletar({ ok: false, razon: 'tope', mensaje: 'x' }, 'cor-1'), null)
})

test('sobreReutilizable: solo reutiliza lo que la compañía RESPONDIÓ; fallo/sin_oferta/NULL se vuelven a pedir', async () => {
  const { sobreReutilizable } = await import('./coberturas-presupuesto.ts')
  const leido = { estado: 'leidas', lista: [{ nombre: 'Lunas', incluida: true, texto: null }], leidasAt: '2026-09-29T10:00:00.000Z' }
  assert.deepEqual(sobreReutilizable(leido), leido)
  assert.deepEqual(sobreReutilizable({ estado: 'vacias', lista: [], leidasAt: 'x' }), { estado: 'vacias', lista: [], leidasAt: 'x' })
  assert.equal(sobreReutilizable({ estado: 'fallo', lista: null, leidasAt: 'x' }), null)
  assert.equal(sobreReutilizable({ estado: 'sin_oferta', lista: null, leidasAt: 'x' }), null)
  assert.equal(sobreReutilizable(null), null)
  assert.equal(sobreReutilizable([]), null)
})
