// Cron de índices del INE: fallo de red/formato no escribe y avisa; dos pasadas no duplican. Sin red ni BD.
import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { IndiceIne, InsercionIndice } from '@central/module-patrimonio'
import { ejecutarIndicesRenta, serieDe, type DepsIndicesRenta } from './indices-renta.ts'

const HOY = '2026-10-20' // ambos esperan 2026-09

function serie(nombre: string, hasta: string, n = 6, pct = 3.0) {
  const [y, m] = hasta.split('-').map(Number) as [number, number]
  const Data = []
  for (let i = n - 1; i >= 0; i--) {
    const t = y * 12 + (m - 1) - i
    Data.push({ Anyo: Math.floor(t / 12), FK_Periodo: (t % 12) + 1, Valor: pct })
  }
  return { COD: 'X', Nombre: nombre, Data }
}
const IPC_OK = serie('Total Nacional. Índice general. Variación anual.', '2026-09')
// DATOS_TABLA/72975: array de series; solo una es la «variación anual».
const IRAV_OK = [
  serie('Nacional. Índice de Referencia de Arrendamientos de Vivienda. Índice.', '2026-09', 6, 5),
  serie('Nacional. IRAV. Variación anual.', '2026-09', 6, 2.44),
  serie('Nacional. IRAV. Variación mensual.', '2026-09', 6, 0.2),
]

/** BD en memoria con los dos índices únicos del SQL (original por periodo; revisión por periodo+pct). */
function entorno(respuestas: Partial<Record<IndiceIne, unknown>>, opts: { redCae?: IndiceIne } = {}) {
  const filas: Array<{ indice: IndiceIne; periodo: string; pct: number; revisado: boolean }> = []
  const avisos: string[] = []
  const deps: DepsIndicesRenta = {
    hoy: HOY,
    serie: (i) => (i === 'IPC' ? 'COD' : null),
    descargar: async () => {
      // el cron pide IPC primero, IRAV después; se distingue por orden de llamada
      const indice: IndiceIne = ++llamadas % 2 === 1 ? 'IPC' : 'IRAV'
      if (opts.redCae === indice) throw new Error('ECONNRESET')
      return respuestas[indice] ?? null
    },
    leerGuardados: async (i) => filas.filter((f) => f.indice === i).map(({ periodo, pct }) => ({ periodo, pct })),
    insertar: async (indice, nuevas: InsercionIndice[]) => {
      for (const f of nuevas) {
        const choca = filas.some((x) => x.indice === indice && x.periodo === f.periodo &&
          (f.revisado ? x.revisado && x.pct === f.pct : !x.revisado))
        if (!choca) filas.push({ indice, ...f })
      }
    },
    avisar: async (t) => { avisos.push(t) },
  }
  let llamadas = 0
  return { deps, filas, avisos }
}

test('camino feliz: guarda ambos índices como originales y no avisa', async () => {
  const e = entorno({ IPC: IPC_OK, IRAV: IRAV_OK })
  const r = await ejecutarIndicesRenta(e.deps)
  assert.deepEqual(r.map((x) => x.estado), ['ok', 'ok'])
  assert.equal(e.filas.length, 12)
  assert.ok(e.filas.filter((f) => f.indice === 'IRAV').every((f) => f.pct === 2.44)) // eligió la anual por nombre
  assert.ok(e.filas.every((f) => !f.revisado))
  assert.equal(e.avisos.length, 0)
})

test('dos pasadas no duplican', async () => {
  const e = entorno({ IPC: IPC_OK, IRAV: IRAV_OK })
  await ejecutarIndicesRenta(e.deps)
  const antes = e.filas.length
  const r = await ejecutarIndicesRenta(e.deps)
  assert.equal(e.filas.length, antes)
  assert.ok(r.every((x) => x.estado === 'ok' && x.nuevas === 0 && x.revisiones === 0))
})

test('una revisión del INE entra como fila nueva revisado=true y no pisa la original', async () => {
  const e = entorno({ IPC: IPC_OK, IRAV: IRAV_OK })
  await ejecutarIndicesRenta(e.deps)
  const rev = structuredClone(IPC_OK)
  rev.Data[rev.Data.length - 1]!.Valor = 3.4
  const e2 = { ...e }
  e2.deps = { ...e.deps, descargar: (() => { let n = 0; return async () => (++n % 2 === 1 ? rev : IRAV_OK) })() }
  const r = await ejecutarIndicesRenta(e2.deps)
  assert.equal(r[0]!.estado === 'ok' && r[0]!.revisiones, 1)
  const ipc09 = e.filas.filter((f) => f.indice === 'IPC' && f.periodo === '2026-09')
  assert.deepEqual(ipc09.map((f) => [f.pct, f.revisado]), [[3, false], [3.4, true]])
})

test('fallo de red: no escribe ese índice y avisa; el otro sí se guarda', async () => {
  const e = entorno({ IPC: IPC_OK, IRAV: IRAV_OK }, { redCae: 'IPC' })
  const r = await ejecutarIndicesRenta(e.deps)
  assert.equal(r[0]!.estado, 'error')
  assert.equal(r[1]!.estado, 'ok')
  assert.ok(e.filas.every((f) => f.indice === 'IRAV'))
  assert.equal(e.avisos.length, 1)
  assert.match(e.avisos[0]!, /IPC/)
})

test('formato roto, valor absurdo, serie equivocada y periodo sin llegar: nada se escribe y avisa', async () => {
  const roto = { Nombre: 'Variación anual', Data: [{ Anyo: 2026, FK_Periodo: 9, Valor: null }] }
  const absurdo = serie('IPC Variación anual', '2026-09', 6, 55)
  const otra = serie('Total Nacional. Índice general. Índice.', '2026-09')
  const atrasado = serie('IPC Variación anual', '2026-07')
  const tablaSinAnual = [serie('Nacional. IRAV. Índice.', '2026-09')]
  const tablaAmbigua = [serie('A. Variación anual.', '2026-09'), serie('B. Variación anual.', '2026-09')]
  for (const mala of [roto, absurdo, otra, atrasado, null, 'html', tablaSinAnual, tablaAmbigua]) {
    const e = entorno({ IPC: mala, IRAV: mala })
    const r = await ejecutarIndicesRenta(e.deps)
    assert.ok(r.every((x) => x.estado === 'error'), JSON.stringify(mala))
    assert.equal(e.filas.length, 0)
    assert.equal(e.avisos.length, 2)
  }
})

test('fallo de la BD al insertar: error + aviso, no revienta', async () => {
  const e = entorno({ IPC: IPC_OK, IRAV: IRAV_OK })
  e.deps.insertar = async () => { throw new Error('permission denied') }
  const r = await ejecutarIndicesRenta(e.deps)
  assert.ok(r.every((x) => x.estado === 'error'))
  assert.equal(e.avisos.length, 2)
})

test('series: IPC por código, IRAV por tabla 72975; override opcional por env', async () => {
  assert.equal(serieDe('IRAV', {}), null)
  assert.equal(serieDe('IRAV', { INE_SERIE_IRAV: ' ABC1 ' }), 'ABC1')
  assert.equal(serieDe('IPC', {}), 'IPC251852')
  const urls: string[] = []
  const e = entorno({ IPC: IPC_OK, IRAV: IRAV_OK })
  e.deps.serie = undefined
  const d = e.deps.descargar
  e.deps.descargar = async (u) => { urls.push(u); return d(u) }
  await ejecutarIndicesRenta(e.deps)
  assert.match(urls[0]!, /DATOS_SERIE\/IPC251852\?nult=/)
  assert.match(urls[1]!, /DATOS_TABLA\/72975\?nult=\d+&tip=AM/)
})
