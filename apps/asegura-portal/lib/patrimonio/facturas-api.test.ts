import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { NivelPatrimonio } from '@central/module-patrimonio'

import { PROPUESTA_VACIA } from './factura-propuesta.ts'
import {
  MAX_BYTES_FACTURA,
  MAX_FACTURAS_DIA,
  responderResolverFactura,
  responderSubidaFactura,
  validarConfirmacion,
  type FicheroFactura,
  type PuertosFacturas,
  type ResultadoLectura,
} from './facturas-api.ts'

const MIO = '11111111-1111-1111-1111-111111111111'
const AJENO = '33333333-3333-3333-3333-333333333333'
const INM = '44444444-4444-4444-4444-444444444444'
const INM_AJENO = '55555555-5555-5555-5555-555555555555'
const GASTO = '66666666-6666-6666-6666-666666666666'

const fichero = (extra: Partial<FicheroFactura> = {}): FicheroFactura => ({ nombre: 'f.pdf', mime: 'application/pdf', tamano: 1000, contenido: Buffer.from('x'), ...extra })
const ILEGIBLE: ResultadoLectura = { propuesta: PROPUESTA_VACIA, motivos: ['No legible'], fuente: 'none' }

function puertos(niveles: [string, NivelPatrimonio][], o: { hoy?: number; lectura?: ResultadoLectura; resolver?: 'ok' | 'no_encontrado' | 'ya_resuelto' } = {}) {
  const llamadas = { leer: 0, crear: [] as unknown[], confirmar: [] as unknown[], descartar: [] as unknown[] }
  const p: PuertosFacturas = {
    accesos: async () => new Map(niveles),
    inmuebleDelTitular: async (_c, i) => i === INM,
    contarFacturasHoy: async () => o.hoy ?? 0,
    leer: async () => { llamadas.leer++; return o.lectura ?? ILEGIBLE },
    crearPropuesta: async (x) => { llamadas.crear.push(x); return { ok: true, id: GASTO } },
    confirmar: async (x) => { llamadas.confirmar.push(x); return o.resolver ?? 'ok' },
    descartar: async (x) => { llamadas.descartar.push(x); return o.resolver ?? 'ok' },
  }
  return { p, llamadas }
}
const subir = (p: PuertosFacturas, titular: unknown, extra: { inmueble?: unknown; fichero?: FicheroFactura | null } = {}) =>
  responderSubidaFactura(p, { titular, inmueble: extra.inmueble ?? null, fichero: extra.fichero === undefined ? fichero() : extra.fichero })

test('titular ajeno o inexistente: 404 idéntica, sin gastar IA ni escribir', async () => {
  const { p, llamadas } = puertos([[MIO, 'total']])
  const ajeno = await subir(p, AJENO)
  assert.equal(ajeno.status, 404)
  assert.deepEqual(ajeno, await subir(p, 'no-existe'))
  assert.deepEqual(ajeno, await subir(p, undefined))
  assert.equal(llamadas.leer, 0)
  assert.deepEqual(llamadas.crear, [])
})

test('inmueble AJENO al titular: 404 y no se llama a la IA', async () => {
  const { p, llamadas } = puertos([[MIO, 'gestion']])
  const r = await subir(p, MIO, { inmueble: INM_AJENO })
  assert.equal(r.status, 404)
  assert.deepEqual(r, await subir(p, MIO, { inmueble: 'no-es-uuid' }))
  assert.equal(llamadas.leer, 0)
  assert.deepEqual(llamadas.crear, [])
})

test('tope diario contado en BD: al llegar al máximo, 429 y sin IA', async () => {
  const { p, llamadas } = puertos([[MIO, 'total']], { hoy: MAX_FACTURAS_DIA })
  const r = await subir(p, MIO)
  assert.equal(r.status, 429)
  assert.equal(r.body.error, 'tope_diario')
  assert.equal(llamadas.leer, 0)
  const justo = puertos([[MIO, 'total']], { hoy: MAX_FACTURAS_DIA - 1 })
  assert.equal((await subir(justo.p, MIO)).status, 201)
})

test('fichero: ausente 400, grande 413, formato raro 415; ninguno llama a la IA', async () => {
  const { p, llamadas } = puertos([[MIO, 'total']])
  assert.equal((await subir(p, MIO, { fichero: null })).status, 400)
  assert.equal((await subir(p, MIO, { fichero: fichero({ tamano: MAX_BYTES_FACTURA + 1 }) })).status, 413)
  assert.equal((await subir(p, MIO, { fichero: fichero({ mime: 'application/zip' }) })).status, 415)
  assert.equal(llamadas.leer, 0)
})

test('fuente none: crea una propuesta SIN importes (nunca un gasto de 0) y lo dice', async () => {
  const { p, llamadas } = puertos([[MIO, 'total']])
  const r = await subir(p, MIO, { inmueble: INM })
  assert.equal(r.status, 201)
  assert.equal(r.body.fuente, 'none')
  const creado = llamadas.crear[0] as { lectura: ResultadoLectura; inmuebleId: string }
  assert.equal(creado.inmuebleId, INM)
  assert.equal(creado.lectura.propuesta.totalCent, null)
  assert.equal(creado.lectura.propuesta.baseCent, null)
  assert.deepEqual(llamadas.confirmar, [])
})

const confirmacion = (extra: Record<string, unknown> = {}) => ({ accion: 'confirmar', titular: MIO, gasto: GASTO, fecha: '2026-10-03', categoria: 'SUMINISTROS', total: '121,00', base: '100,00', ...extra })

test('confirmar: un total vacío, 0 o negativo no crea gasto; categoría OTRO válida solo si la elige la persona', async () => {
  const { p, llamadas } = puertos([[MIO, 'total']])
  for (const total of [undefined, '', '0', '0,00', '-5', 'abc']) {
    const r = await responderResolverFactura(p, confirmacion({ total }))
    assert.equal(r.status, 400, `total=${String(total)}`)
  }
  assert.equal((await responderResolverFactura(p, confirmacion({ fecha: undefined }))).status, 400)
  assert.equal((await responderResolverFactura(p, confirmacion({ categoria: 'inventada' }))).status, 400)
  assert.deepEqual(llamadas.confirmar, [])
  assert.equal(validarConfirmacion(confirmacion({ categoria: 'OTRO' })).ok, true)
})

test('confirmar: ok llama al puerto con céntimos; titular ajeno, gasto ajeno e inmueble ajeno = 404; ya resuelto = 409', async () => {
  const bien = puertos([[MIO, 'gestion']])
  const ok = await responderResolverFactura(bien.p, confirmacion())
  assert.equal(ok.status, 200)
  assert.deepEqual((bien.llamadas.confirmar[0] as { datos: unknown }).datos, { inmuebleId: null, fecha: '2026-10-03', categoria: 'SUMINISTROS', concepto: null, baseCent: 10000, totalCent: 12100 })

  const { p, llamadas } = puertos([[MIO, 'total']])
  assert.equal((await responderResolverFactura(p, confirmacion({ titular: AJENO }))).status, 404)
  assert.equal((await responderResolverFactura(p, confirmacion({ inmueble: INM_AJENO }))).status, 404)
  assert.deepEqual(llamadas.confirmar, [])
  assert.equal((await responderResolverFactura(puertos([[MIO, 'total']], { resolver: 'no_encontrado' }).p, confirmacion())).status, 404)
  assert.equal((await responderResolverFactura(puertos([[MIO, 'total']], { resolver: 'ya_resuelto' }).p, confirmacion())).status, 409)
})

test('descartar y acción desconocida', async () => {
  const { p, llamadas } = puertos([[MIO, 'total']])
  assert.equal((await responderResolverFactura(p, { accion: 'descartar', titular: MIO, gasto: GASTO })).status, 200)
  assert.equal(llamadas.descartar.length, 1)
  assert.equal((await responderResolverFactura(p, { accion: 'borrar', titular: MIO, gasto: GASTO })).status, 400)
  assert.equal((await responderResolverFactura(p, { accion: 'descartar', titular: AJENO, gasto: GASTO })).status, 404)
})
