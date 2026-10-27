import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { ContextoVolcado, EvaluacionVolcado, NivelPatrimonio, PropuestaVolcado } from '@central/module-patrimonio'

import {
  responderConfirmarVolcado,
  responderDescartarVolcado,
  responderSubirVolcado,
  responderVerVolcado,
  type LecturaVolcado,
  type PuertosVolcado,
  type VolcadoLeido,
} from './volcado-api.ts'

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const VID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const INM_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const CSV = new TextEncoder().encode('Piso;Inquilino;Renta;Inicio\n1ºA;Ana Pérez;700;01/09/2024\n')

const PROP: PropuestaVolcado = {
  inmuebles: [{ ref: 'I1', alias: 'Piso 1', uso: 'vivienda', edificio: null, referenciaCatastral: null, direccion: null, cp: null, municipio: null, provincia: null, superficieM2: null }],
  contratos: [{ ref: 'C1', inmueble: 'I1', inquilino: { nombre: 'Ana Pérez', tipo: 'persona' }, inicio: '2024-09-01', fin: null, rentaCent: 70_000, fianzaCent: null, indice: null }],
  gastos: [],
}

type Llamadas = Record<string, unknown[]>
function puertos(o: {
  accesos?: [string, NivelPatrimonio][]
  volcado?: Partial<VolcadoLeido> | null
  cupo?: boolean
  abierto?: string | null
  reserva?: 'abierto'
  lectura?: LecturaVolcado
  ctx?: ContextoVolcado
  puente?: 'ok' | 'error'
} = {}) {
  const ll: Llamadas = {}
  const anota = (k: string, a: unknown) => (ll[k] ??= []).push(a)
  const p: PuertosVolcado = {
    accesos: async () => new Map(o.accesos ?? [[A, 'total']]),
    creadasHoy: async () => 0,
    abierto: async (c, h) => { anota('abierto', [c, h]); return o.abierto ? { id: o.abierto } : null },
    valorCliente: async () => ({ comisionAnualCent: null, polizasEnVigor: 2 }),
    reservar: async (x) => { anota('reservar', x); if (o.reserva === 'abierto') return { ok: false, motivo: 'abierto' }; return o.cupo === false ? { ok: false, motivo: 'cupo' } : { ok: true, id: VID } },
    leer: async (f) => { anota('leer', f.tipo); return o.lectura ?? { leido: true, propuesta: PROP, motivos: [] } },
    guardarPropuesta: async (id, prop) => { anota('guardarPropuesta', [id, prop]); return true },
    ver: async (id) => (o.volcado === null ? null : { id, clienteId: A, estado: 'propuesta', nombre: 'x.csv', propuesta: PROP, motivos: [], resultado: null, ...o.volcado }),
    contexto: async (c) => { anota('contexto', c); return o.ctx ?? { inmuebles: [], existentes: new Map() } },
    confirmar: async (id, prop, evaluar) => {
      const evaluacion: EvaluacionVolcado = evaluar(o.ctx ?? { inmuebles: [], existentes: new Map() })
      anota('confirmar', { id, prop, evaluacion })
      const nuevos = evaluacion.contratos.filter((c) => c.estado === 'nueva').map((c) => ({ ref: c.ref, id: `ct-${c.ref}`, inquilino: prop.contratos.find((x) => x.ref === c.ref)!.inquilino }))
      return { ok: true, evaluacion, creados: evaluacion.resumen.nuevos, contratos: nuevos }
    },
    descartar: async (id) => { anota('descartar', id); return true },
    altaInquilino: async (c, q) => { anota('altaInquilino', [c, q]); return o.puente ?? 'ok' },
  }
  return { p, ll }
}

test('🚨 subir deja SOLO una propuesta: lee, guarda la propuesta y no confirma ni escribe nada del patrimonio', async () => {
  const { p, ll } = puertos()
  const r = await responderSubirVolcado(p, { titular: A, nombre: 'pisos.csv', bytes: CSV })
  assert.equal(r.status, 201)
  assert.deepEqual(ll.leer, ['hoja'])
  assert.equal(ll.guardarPropuesta.length, 1)
  assert.equal(ll.confirmar, undefined, 'subir NO confirma')
  assert.equal(ll.altaInquilino, undefined, 'subir NO da de alta inquilinos')
})

test('🚨 subir: titular ajeno o sin nivel Total = la misma 404, sin leer ni gastar cupo', async () => {
  for (const acc of [[[B, 'total']], [[A, 'gestion']], []] as [string, NivelPatrimonio][][]) {
    const { p, ll } = puertos({ accesos: acc })
    const r = await responderSubirVolcado(p, { titular: A, nombre: null, bytes: CSV })
    assert.deepEqual(r, { status: 404, body: { error: 'no_encontrado' } })
    assert.equal(ll.reservar, undefined)
    assert.equal(ll.leer, undefined)
  }
})

test('🧮 subir: cupo agotado = 429 sin llamar a la IA; el mismo fichero abierto no se vuelve a leer; basura no gasta cupo', async () => {
  const sin = puertos({ cupo: false })
  assert.deepEqual(await responderSubirVolcado(sin.p, { titular: A, nombre: null, bytes: CSV }), { status: 429, body: { error: 'cupo_ia_agotado' } })
  assert.equal(sin.ll.leer, undefined)
  const ya = puertos({ abierto: VID })
  assert.deepEqual(await responderSubirVolcado(ya.p, { titular: A, nombre: null, bytes: CSV }), { status: 200, body: { id: VID, nueva: false } })
  assert.equal(ya.ll.reservar, undefined)
  assert.equal(ya.ll.leer, undefined)
  const basura = puertos()
  const r = await responderSubirVolcado(basura.p, { titular: A, nombre: null, bytes: new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0, 0]) })
  assert.equal(r.status, 400)
  assert.equal(basura.ll.reservar, undefined)
})

test('subir: lectura fallida o vacía → se cierra el volcado (sin dejarlo abierto) y se dice por qué', async () => {
  const { p, ll } = puertos({ lectura: { leido: false, motivos: ['La lectura automática no está disponible ahora.'] } })
  const r = await responderSubirVolcado(p, { titular: A, nombre: null, bytes: CSV })
  assert.equal(r.status, 422)
  assert.deepEqual(ll.descartar, [VID])
  assert.equal(ll.guardarPropuesta, undefined)
})

test('🚨 confirmar SIN `confirmar: true` no escribe nada', async () => {
  const { p, ll } = puertos()
  for (const cuerpo of [{ propuesta: PROP }, { propuesta: PROP, confirmar: 'true' }, null]) {
    assert.deepEqual(await responderConfirmarVolcado(p, VID, cuerpo), { status: 400, body: { error: 'falta_confirmacion' } })
  }
  assert.equal(ll.confirmar, undefined)
})

test('🚨 confirmar: volcado ajeno, de otro titular o sin nivel Total = 404 y nada se escribe', async () => {
  const casos = [
    puertos({ volcado: null }),
    puertos({ volcado: { clienteId: B } }),
    puertos({ accesos: [[A, 'gestion']] }),
  ]
  for (const { p, ll } of casos) {
    assert.deepEqual(await responderConfirmarVolcado(p, VID, { confirmar: true, propuesta: PROP }), { status: 404, body: { error: 'no_encontrado' } })
    assert.equal(ll.confirmar, undefined)
  }
  const cerrado = puertos({ volcado: { estado: 'confirmada' } })
  assert.equal((await responderConfirmarVolcado(cerrado.p, VID, { confirmar: true, propuesta: PROP })).status, 409)
  assert.equal(cerrado.ll.confirmar, undefined)
})

test('🚨 confirmar no cruza titulares: un inmueble de OTRO titular en la propuesta no se encuentra y no se crea nada contra él', async () => {
  const ajena: PropuestaVolcado = { inmuebles: [], contratos: [{ ...PROP.contratos[0], inmueble: INM_B }], gastos: [] }
  // El contexto es el del titular A (el del volcado): el inmueble de B no está.
  const { p, ll } = puertos({ ctx: { inmuebles: [], existentes: new Map() } })
  const r = await responderConfirmarVolcado(p, VID, { confirmar: true, propuesta: ajena })
  assert.equal(r.status, 200)
  const { evaluacion } = ll.confirmar[0] as { evaluacion: EvaluacionVolcado }
  assert.equal(evaluacion.contratos[0].estado, 'con_problema')
  assert.equal(evaluacion.resumen.nuevos, 0)
  assert.equal(ll.altaInquilino, undefined)
})

test('confirmar: crea, y el inquilino va DESPUÉS por el puente; si el puente falla, se dice qué falta (no se da por hecho)', async () => {
  const ok = puertos()
  const r = await responderConfirmarVolcado(ok.p, VID, { confirmar: true, propuesta: PROP })
  assert.equal(r.status, 200)
  assert.deepEqual(r.body.inquilinos, { creados: 1, pendientes: [] })
  assert.deepEqual(ok.ll.altaInquilino, [['ct-C1', { nombre: 'Ana Pérez', tipo: 'persona' }]])
  const mal = puertos({ puente: 'error' })
  const r2 = await responderConfirmarVolcado(mal.p, VID, { confirmar: true, propuesta: PROP })
  assert.deepEqual(r2.body.inquilinos, { creados: 0, pendientes: [{ contrato: 'ct-C1', motivo: 'error' }] })
})

test('ver y descartar: dentro de lo autorizado; el contexto que se enseña es el del titular DEL VOLCADO', async () => {
  const { p, ll } = puertos()
  const v = await responderVerVolcado(p, VID)
  assert.equal(v.status, 200)
  assert.deepEqual(ll.contexto, [A])
  assert.deepEqual(await responderVerVolcado(p, 'no-uuid'), { status: 404, body: { error: 'no_encontrado' } })
  const ajeno = puertos({ volcado: { clienteId: B } })
  assert.equal((await responderDescartarVolcado(ajeno.p, VID)).status, 404)
  assert.equal(ajeno.ll.descartar, undefined)
})

test('🧱 subir: el mismo fichero ya está en una importación CSV (índice único titular+hash) = 409 fichero_ya_importado, NUNCA 404', async () => {
  const csv = puertos({ reserva: 'abierto' })
  const r = await responderSubirVolcado(csv.p, { titular: A, nombre: null, bytes: CSV })
  assert.deepEqual(r, { status: 409, body: { error: 'fichero_ya_importado' } })
  assert.equal(csv.ll.leer, undefined)
})
