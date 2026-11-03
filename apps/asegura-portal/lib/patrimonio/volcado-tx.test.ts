import { test } from 'node:test'
import assert from 'node:assert/strict'

import { evaluarVolcado, normalizarVolcadoLeido } from '@central/module-patrimonio'

import { escribirVolcadoTx, reservarVolcadoTx, type TxVolcado } from './volcado-tx.ts'

function txFalso(o: { facturas?: number; volcados?: number; edificio?: Record<string, unknown> | null } = {}) {
  const log: string[] = []
  const args: Record<string, Record<string, unknown>[]> = {}
  const anota = (k: string, a: unknown) => { log.push(k); (args[k] ??= []).push(a as Record<string, unknown>) }
  let n = 0
  const tx: TxVolcado = {
    $executeRaw: async (s, ...v) => { anota('lock', { sql: s.join('?'), v }); return 1 },
    portalPatrimonioGasto: { count: async (a) => { anota('gasto.count', a); return o.facturas ?? 0 } },
    portalPatrimonioImportacion: {
      count: async (a) => { anota('volcado.count', a); return o.volcados ?? 0 },
      create: async (a) => { anota('volcado.create', a); return { id: 'v1' } },
    },
    portalPatrimonioInmueble: {
      create: async (a) => { anota('inmueble.create', a); return { id: `inm${++n}` } },
      findFirst: async (a) => { anota('inmueble.find', a); return o.edificio === undefined ? null : o.edificio },
    },
    portalPatrimonioContrato: { create: async (a) => { anota('contrato.create', a); return { id: `ct${++n}` } } },
    portalPatrimonioPlantillaGasto: { create: async (a) => { anota('plantilla.create', a); return { id: `pl${++n}` } } },
  }
  return { tx, log, args }
}

const RES = { identidadId: 'ident', titularId: 'tit', hash: 'h'.repeat(64), nombre: 'pisos.xlsx', cupoMes: 60, desdeMes: new Date('2026-10-01T00:00:00Z') }

test('reservar: bloqueo por TITULAR → facturas del mes → volcados del mes → crear (en ese orden)', async () => {
  const { tx, log, args } = txFalso()
  assert.deepEqual(await reservarVolcadoTx(tx, RES), { ok: true, id: 'v1' })
  assert.deepEqual(log, ['lock', 'gasto.count', 'volcado.count', 'volcado.create'])
  assert.deepEqual((args.lock[0] as { v: unknown[] }).v, ['portal-cupo-ia:tit'])
  const data = args['volcado.create'][0].data as Record<string, unknown>
  assert.equal(data.titularId, 'tit')
  assert.equal(data.identidadId, 'ident')
  assert.equal(data.volcado, true)
})

test('🧮 reservar: facturas + volcados del mes agotan el MISMO cupo; agotado no se crea nada (ni se leerá)', async () => {
  const lleno = txFalso({ facturas: 50, volcados: 10 })
  assert.deepEqual(await reservarVolcadoTx(lleno.tx, RES), { ok: false, motivo: 'cupo' })
  assert.ok(!lleno.log.includes('volcado.create'))
  const justo = txFalso({ facturas: 50, volcados: 9 })
  assert.deepEqual(await reservarVolcadoTx(justo.tx, RES), { ok: true, id: 'v1' })
})

const PILOTO = {
  inmuebles: [
    { ref: 'E', nombre: 'Busto Tavera 22', uso: 'edificio', referencia_catastral: '5731022TG3453B0001AK', direccion: 'C/ Busto Tavera 22', cp: '41003', municipio: 'Sevilla' },
    ...Array.from({ length: 12 }, (_, i) => ({ ref: `P${i + 1}`, nombre: `Piso ${i + 1}`, uso: 'vivienda', edificio: 'E', superficie_m2: 60 })),
  ],
  contratos: [{ inmueble: 'P3', inquilino: 'Ana Pérez', inicio: '2024-09-01', renta_mensual: 700 }, { inmueble: 'P4', inicio: '2024-09-01' }],
  gastos: [{ inmueble: 'E', concepto: 'IBI', categoria: 'IMPUESTOS', periodicidad: 'anual', importe: 1200, dia_mes: 15, inicio: '2026-01-01' }],
}

test('🚨 escribir: solo las «nueva», edificio ANTES que sus unidades, y TODO con el titular del volcado', async () => {
  const { propuesta } = normalizarVolcadoLeido(PILOTO)
  const evaluacion = evaluarVolcado(propuesta, { inmuebles: [], existentes: new Map() })
  const { tx, log, args } = txFalso()
  const r = await escribirVolcadoTx(tx, { titularId: 'tit', identidadId: 'ident', propuesta, evaluacion })
  assert.equal(r.creados, 15, '1 edificio + 12 pisos + 1 contrato + 1 gasto fijo (el contrato sin renta no)')
  assert.deepEqual(log, [...Array(13).fill('inmueble.create'), 'contrato.create', 'plantilla.create'])
  const todas = [...args['inmueble.create'], ...args['contrato.create'], ...args['plantilla.create']].map((a) => a.data as Record<string, unknown>)
  assert.ok(todas.every((d) => d.titularId === 'tit' && d.creadoPorIdentidadId === 'ident'), 'ni un create sin el titular del volcado')
  const unidad = args['inmueble.create'][1].data as Record<string, unknown>
  assert.equal(unidad.inmueblePadreId, 'inm1', 'la unidad cuelga del edificio recién creado')
  assert.equal(unidad.referenciaCatastral, undefined, 'la RC NO se copia a la unidad (se hereda al leer)')
  assert.equal(unidad.direccionNormalizada, 'C/ Busto Tavera 22, 41003 Sevilla')
  const contrato = args['contrato.create'][0].data as Record<string, unknown>
  assert.equal(contrato.inmuebleId, 'inm4', 'Piso 3')
  assert.equal(contrato.rentaMensualCent, BigInt(70_000))
  assert.equal(contrato.clausula, 'ninguna')
  assert.deepEqual(r.contratos, [{ ref: 'C1', id: 'ct14', inquilino: { nombre: 'Ana Pérez', tipo: 'persona' } }])
  assert.equal((args['plantilla.create'][0].data as Record<string, unknown>).inmuebleId, 'inm1')
})

test('🚨 escribir: unidad de un edificio EXISTENTE — se busca dentro del titular; si no aparece, se aborta TODO', async () => {
  const ED = '11111111-1111-4111-8111-111111111111'
  const p = normalizarVolcadoLeido({ inmuebles: [{ ref: 'P', nombre: 'Piso 13', uso: 'vivienda' }] }).propuesta
  p.inmuebles[0].edificio = ED
  const evaluacion = evaluarVolcado(p, { inmuebles: [{ id: ED, alias: 'Busto', uso: 'edificio', inmueblePadreId: null }], existentes: new Map() })
  assert.equal(evaluacion.inmuebles[0].estado, 'nueva')
  const ok = txFalso({ edificio: { cp: '41003', municipioIne: null, via: null, numero: null, resto: null, direccionNormalizada: 'X', enComunidad: null } })
  await escribirVolcadoTx(ok.tx, { titularId: 'tit', identidadId: 'ident', propuesta: p, evaluacion })
  assert.deepEqual((ok.args['inmueble.find'][0] as { where: Record<string, unknown> }).where, { id: ED, titularId: 'tit', uso: 'edificio', inmueblePadreId: null, archivadoEn: null })
  const ajeno = txFalso({ edificio: null })
  await assert.rejects(escribirVolcadoTx(ajeno.tx, { titularId: 'tit', identidadId: 'ident', propuesta: p, evaluacion }))
  assert.ok(!ajeno.log.includes('inmueble.create'))
})
