import { test } from 'node:test'
import assert from 'node:assert/strict'

import type { Contrato, NivelPatrimonio, PreferenciaTope } from '@central/module-patrimonio'

import {
  responderAltaContrato,
  responderAltaInquilino,
  responderAplicarRenta,
  responderTopeRenta,
  responderPiiInquilino,
  validarAltaContrato,
  validarAltaInquilino,
  type PuertosContratos,
  type ResultadoPuenteAlta,
} from './contratos-api.ts'
import type { FilaIndice } from './indices.ts'

const MIO = '11111111-1111-1111-1111-111111111111'
const GESTION = '22222222-2222-2222-2222-222222222222'
const AJENO = '33333333-3333-3333-3333-333333333333'
const C_MIO = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const C_GESTION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const C_AJENO = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

const contrato = (id: string, over: Partial<Contrato> = {}): Contrato => ({
  id,
  inmuebleId: 'i',
  inquilinoIds: [],
  inicio: '2025-11-01',
  fin: null,
  terminadoEn: null,
  rentaMensual: 100_000,
  clausula: { tipo: 'indice', indice: 'IRAV' },
  actualizaciones: [],
  fianza: null,
  seguroInquilino: null,
  ...over,
})
const DUENO: Record<string, string> = { [C_MIO]: MIO, [C_GESTION]: GESTION, [C_AJENO]: AJENO }

function puertos(accesos: [string, NivelPatrimonio][], over: Partial<PuertosContratos> = {}, indices: FilaIndice[] = []) {
  const llamadas = { crear: 0, aplicar: [] as unknown[], puente: [] as unknown[], pii: [] as string[], busquedas: [] as string[][], topes: [] as unknown[] }
  const p: PuertosContratos = {
    accesos: async () => new Map(accesos),
    hoy: () => '2026-10-20',
    async inmueble(id, ids) {
      llamadas.busquedas.push([...ids])
      const due = DUENO[id]
      return due && ids.includes(due) ? { clienteId: due, titularId: `t-${due}` } : null
    },
    async contrato(id, ids) {
      llamadas.busquedas.push([...ids])
      const due = DUENO[id]
      return due && ids.includes(due) ? { clienteId: due, contrato: contrato(id), tope: { modo: 'defecto' as const } } : null
    },
    async inquilino(id, ids) {
      const due = DUENO[id]
      return due && ids.includes(due) ? { clienteId: due, inquilinoId: id } : null
    },
    async crearContrato() {
      llamadas.crear++
      return { id: 'nuevo' }
    },
    indices: async () => indices,
    async guardarTope(x) {
      llamadas.topes.push(x)
      return true
    },
    async aplicarRenta(x) {
      llamadas.aplicar.push(x)
      return { ok: true, id: 'r1' }
    },
    async altaInquilinoPuente(x) {
      llamadas.puente.push(x)
      return { estado: 'ok', id: 'q1' }
    },
    async piiInquilinoPuente(id) {
      llamadas.pii.push(id)
      return { estado: 'ok', nif: '12345678Z', email: null, telefono: null, ilegibles: [] }
    },
    ...over,
  }
  return { p, llamadas }
}

const altaOk = { inicio: '2025-11-01', renta: '1.000,00', clausula: 'indice', indice: 'IRAV', seguroInquilinoExigido: null }
const IRAV = [{ indice: 'IRAV', periodo: '2026-10', pct: 2.95, descargadoEn: new Date('2026-10-15T08:00:00Z') }]
const confirmar = { desde: '2026-11-01', rentaNuevaCent: 102_950, indice: 'IRAV', periodo: '2026-10' }

test('validarAltaContrato: cláusula ⇔ índice, «otro» descrito, fianza vacía = null (nunca 0), seguro tri-estado', () => {
  const v = validarAltaContrato(altaOk)
  assert.equal(v.ok, true)
  if (v.ok) {
    assert.equal(v.datos.rentaMensualCent, 100_000)
    assert.equal(v.datos.fianzaCent, null)
    assert.equal(v.datos.seguroInquilinoExigido, null)
  }
  assert.deepEqual(validarAltaContrato({ ...altaOk, indice: undefined }), { ok: false, campo: 'indice' })
  assert.deepEqual(validarAltaContrato({ ...altaOk, indice: 'otro' }), { ok: false, campo: 'indiceDescripcion' })
  assert.deepEqual(validarAltaContrato({ ...altaOk, renta: '' }), { ok: false, campo: 'renta' })
  assert.deepEqual(validarAltaContrato({ ...altaOk, fin: '2025-10-01' }), { ok: false, campo: 'fin' })
  const sin = validarAltaContrato({ ...altaOk, clausula: 'ninguna', indice: 'IPC' })
  assert.equal(sin.ok && sin.datos.indice, null, 'sin cláusula no se guarda índice (CHECK de la BD)')
})

test('validarAltaInquilino: solo forma; PII vacía = null', () => {
  const v = validarAltaInquilino({ tipo: 'persona', nombre: '  Ana  López ', nif: '', email: 'a@b.es' })
  assert.deepEqual(v, { ok: true, datos: { tipo: 'persona', nombre: 'Ana López', papel: 'titular', nif: null, email: 'a@b.es', telefono: null } })
  assert.deepEqual(validarAltaInquilino({ tipo: 'x', nombre: 'A' }), { ok: false, campo: 'tipo' })
  assert.deepEqual(validarAltaInquilino({ tipo: 'persona', nombre: 'A', nif: 12 }), { ok: false, campo: 'nif' })
})

test('🚨 alta de contrato: inmueble AJENO, inexistente o con nivel Gestión → la misma 404, sin escribir', async () => {
  const { p, llamadas } = puertos([[MIO, 'total'], [GESTION, 'gestion']])
  const ajeno = await responderAltaContrato(p, { ...altaOk, inmueble: C_AJENO })
  const nada = await responderAltaContrato(p, { ...altaOk, inmueble: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' })
  const gestion = await responderAltaContrato(p, { ...altaOk, inmueble: C_GESTION })
  assert.equal(ajeno.status, 404)
  assert.deepEqual(ajeno, nada)
  assert.deepEqual(ajeno, gestion)
  assert.equal(llamadas.crear, 0)
  // El puerto solo busca dentro de los titulares autorizados.
  for (const ids of llamadas.busquedas) assert.ok(!ids.includes(AJENO))
  assert.equal((await responderAltaContrato(p, { ...altaOk, inmueble: C_MIO })).status, 201)
  assert.equal(llamadas.crear, 1)
})

test('🚨 aplicar renta: ajeno 404; sin cláusula / índice distinto / sin índice → 409 sin escribir', async () => {
  const { p, llamadas } = puertos([[MIO, 'total']], {}, IRAV)
  assert.equal((await responderAplicarRenta(p, C_AJENO, confirmar)).status, 404)
  assert.deepEqual(await responderAplicarRenta(p, C_MIO, { ...confirmar, indice: 'IPC' }), { status: 409, body: { error: 'indice_distinto' } })
  assert.deepEqual(await responderAplicarRenta(p, C_MIO, { ...confirmar, rentaNuevaCent: 200_000 }), { status: 409, body: { error: 'propuesta_cambiada' } })

  const sinClausula = puertos([[MIO, 'total']], {
    contrato: async (id) => ({ clienteId: MIO, contrato: contrato(id, { clausula: { tipo: 'ninguna' } }), tope: { modo: 'defecto' as const } }),
  }, IRAV)
  assert.deepEqual(await responderAplicarRenta(sinClausula.p, C_MIO, confirmar), { status: 409, body: { error: 'sin_clausula' } })

  // Solo hay IPC y el contrato pacta IRAV: no se usa el IPC.
  const soloIpc = puertos([[MIO, 'total']], {}, [{ ...IRAV[0], indice: 'IPC' }])
  assert.deepEqual(await responderAplicarRenta(soloIpc.p, C_MIO, confirmar), { status: 409, body: { error: 'sin_indice' } })

  assert.equal(llamadas.aplicar.length + sinClausula.llamadas.aplicar.length + soloIpc.llamadas.aplicar.length, 0)
})

test('aplicar renta: lo que se escribe es lo RECALCULADO por el servidor (fila nueva); duplicado → 409', async () => {
  const { p, llamadas } = puertos([[MIO, 'total']], {}, IRAV)
  const r = await responderAplicarRenta(p, C_MIO, confirmar)
  assert.equal(r.status, 201)
  const x = llamadas.aplicar[0] as { contratoId: string; propuesta: { rentaNueva: number; indice: string; aplicableDesde: string } }
  assert.equal(x.contratoId, C_MIO)
  assert.equal(x.propuesta.rentaNueva, 102_950)
  assert.equal(x.propuesta.indice, 'IRAV')
  const dup = puertos([[MIO, 'total']], { aplicarRenta: async () => ({ ok: false, motivo: 'duplicado' }) }, IRAV)
  assert.deepEqual(await responderAplicarRenta(dup.p, C_MIO, confirmar), { status: 409, body: { error: 'ya_aplicada' } })
})

test('aplicar renta: nivel Gestión no aplica (404, no 403)', async () => {
  const { p, llamadas } = puertos([[GESTION, 'gestion']], {}, IRAV)
  assert.equal((await responderAplicarRenta(p, C_GESTION, confirmar)).status, 404)
  assert.equal(llamadas.aplicar.length, 0)
})

test('🚨 alta de inquilino: la PII va SOLO al puente; contrato ajeno o Gestión → 404 sin llamar al puente', async () => {
  const { p, llamadas } = puertos([[MIO, 'total'], [GESTION, 'gestion']])
  const datos = { tipo: 'persona', nombre: 'Ana', nif: '12345678Z', email: 'ana@x.es', telefono: '600000000' }
  assert.equal((await responderAltaInquilino(p, C_AJENO, datos)).status, 404)
  assert.equal((await responderAltaInquilino(p, C_GESTION, datos)).status, 404)
  assert.equal(llamadas.puente.length, 0)
  const ok = await responderAltaInquilino(p, C_MIO, datos)
  assert.deepEqual(ok, { status: 201, body: { id: 'q1' } })
  assert.equal(llamadas.crear, 0, 'ningún puerto de BD de esta app recibe el inquilino')
  assert.deepEqual(llamadas.puente, [{ contratoId: C_MIO, datos: { ...datos, papel: 'titular' } }])
  // La respuesta no devuelve la PII.
  assert.doesNotMatch(JSON.stringify(ok), /12345678Z|ana@x\.es|600000000/)
})

test('alta de inquilino: los fallos del puente NO se colapsan (sin_puente 503 ≠ sin_clave 503 ≠ fallo 502)', async () => {
  const con = (r: ResultadoPuenteAlta) => puertos([[MIO, 'total']], { altaInquilinoPuente: async () => r }).p
  const d = { tipo: 'persona', nombre: 'Ana' }
  assert.deepEqual(await responderAltaInquilino(con({ estado: 'sin_puente' }), C_MIO, d), { status: 503, body: { error: 'sin_puente' } })
  assert.deepEqual(await responderAltaInquilino(con({ estado: 'sin_clave' }), C_MIO, d), { status: 503, body: { error: 'sin_clave' } })
  assert.deepEqual(await responderAltaInquilino(con({ estado: 'error', causa: 'red' }), C_MIO, d), { status: 502, body: { error: 'puente_fallido' } })
  assert.equal((await responderAltaInquilino(con({ estado: 'no_encontrado' }), C_MIO, d)).status, 404)
  assert.deepEqual(
    await responderAltaInquilino(con({ estado: 'invalido', campo: 'nif', motivo: 'La letra del DNI no cuadra con los números.' }), C_MIO, d),
    { status: 400, body: { error: 'datos_invalidos', campo: 'nif', motivo: 'La letra del DNI no cuadra con los números.' } },
  )
})

test('🚨 PII del inquilino: solo Total; Gestión y ajeno → 404 sin llamar al puente', async () => {
  const { p, llamadas } = puertos([[MIO, 'total'], [GESTION, 'gestion']])
  assert.equal((await responderPiiInquilino(p, C_GESTION)).status, 404)
  assert.equal((await responderPiiInquilino(p, C_AJENO)).status, 404)
  assert.deepEqual(llamadas.pii, [])
  const r = await responderPiiInquilino(p, C_MIO)
  assert.equal(r.status, 200)
  assert.equal(r.body.email, null, 'lo que no dio sigue null, no «»')
})

test('🚨 tope: solo Total y dentro de los accesos; ajeno o con nivel Gestión = la misma 404 y no escribe', async () => {
  const { p, llamadas } = puertos([[MIO, 'total']])
  assert.equal((await responderTopeRenta(p, C_AJENO, { modo: 'sin_tope' })).status, 404)
  assert.equal((await responderTopeRenta(p, 'no-uuid', { modo: 'sin_tope' })).status, 404)
  const gestion = puertos([[MIO, 'gestion']])
  assert.equal((await responderTopeRenta(gestion.p, C_MIO, { modo: 'sin_tope' })).status, 404)
  assert.equal(llamadas.topes.length + gestion.llamadas.topes.length, 0)
})

test('tope: si la BD no cambia ninguna fila responde la misma 404 (no un 200 falso)', async () => {
  const { p } = puertos([[MIO, 'total']], { guardarTope: async () => false })
  assert.equal((await responderTopeRenta(p, C_MIO, { modo: 'sin_tope' })).status, 404)
})

test('tope: valida el cuerpo y guarda lo que el cliente dijo (coma decimal incluida); un texto no es 0', async () => {
  const { p, llamadas } = puertos([[MIO, 'total']])
  assert.equal((await responderTopeRenta(p, C_MIO, { modo: 'propio', pct: '2,5' })).status, 200)
  assert.equal((await responderTopeRenta(p, C_MIO, { modo: 'propio', pct: 0 })).status, 200)
  assert.equal((await responderTopeRenta(p, C_MIO, { modo: 'sin_tope' })).status, 200)
  assert.equal((await responderTopeRenta(p, C_MIO, { modo: 'defecto' })).status, 200)
  assert.deepEqual(llamadas.topes.map((x) => (x as { tope: unknown }).tope), [
    { modo: 'propio', pct: 2.5 }, { modo: 'propio', pct: 0 }, { modo: 'sin_tope' }, { modo: 'defecto' },
  ])
  for (const malo of [{ modo: 'propio' }, { modo: 'propio', pct: 'mucho' }, { modo: 'propio', pct: 101 }, { modo: 'propio', pct: -1 }, { modo: 'otro' }, null]) {
    assert.deepEqual((await responderTopeRenta(p, C_MIO, malo)).status, 400, JSON.stringify(malo))
  }
  assert.equal(llamadas.topes.length, 4)
})

test('el tope del cliente llega a la propuesta que se aplica: con 1 % topa, sin tope no', async () => {
  const conTope = (tope: PreferenciaTope) =>
    puertos([[MIO, 'total']], { contrato: async (id) => ({ clienteId: MIO, contrato: contrato(id), tope }) }, IRAV)
  const a = conTope({ modo: 'propio', pct: 1 })
  const r = await responderAplicarRenta(a.p, C_MIO, confirmar)
  // La propuesta con el 1 % no es la que vio con el defecto (2,95 %): el servidor la recalcula y no coincide.
  assert.deepEqual(r, { status: 409, body: { error: 'propuesta_cambiada' } })
  assert.equal(a.llamadas.aplicar.length, 0)
})
