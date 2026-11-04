// (a) conTaller falla CERRADO: sin taller válido no abre transacción; con él, fija el ajuste ANTES de la función.
// Cepo visto fallar el 04/11/2026: quitando la guarda `esTallerId` de lib/rls.ts, el caso «sin taller» abría
// transacción y llegaba a la función (rojo en 'sin taller no abre transacción'); restaurado → verde.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crearConTaller, SinTallerError } from '../lib/rls.ts'
import { tallerDeDesarrollo } from '../lib/dispositivo.ts'
import { crearBdFake } from './_fake-prisma.ts'

const T = 'f9e29b9a-0fb8-4196-ac7a-01c1722b1d8b'

test('sin taller (o no uuid) no abre transacción ni ejecuta la función', async () => {
  const bd = crearBdFake()
  const conTaller = crearConTaller(bd.cliente)
  let ejecutada = false
  for (const malo of [undefined, null, '', 'piloto', `${T}' OR 1=1 --`, 42, {}]) {
    await assert.rejects(
      conTaller(malo, async () => { ejecutada = true }),
      SinTallerError,
      `debió rechazar ${String(malo)}`,
    )
  }
  assert.equal(ejecutada, false)
  assert.equal(bd.transacciones, 0)
})

test('con taller: el ajuste se fija dentro de la transacción y antes de la función', async () => {
  const bd = crearBdFake()
  const conTaller = crearConTaller(bd.cliente)
  const visto = await conTaller(T, async (tx) => (tx as unknown as { __ajuste: string }).__ajuste)
  assert.equal(visto, T)
  assert.match(bd.llamadasRaw[0], /set_config\('taller\.taller_id', \?, true\)/, 'set_config LOCAL (true) a la transacción')
})

test('si el ajuste no se aplica, aborta sin ejecutar la función', async () => {
  let ejecutada = false
  const conTaller = crearConTaller({
    $transaction: async (fn) => fn({ $queryRaw: async () => [] }),
  })
  await assert.rejects(conTaller(T, async () => { ejecutada = true }), SinTallerError)
  assert.equal(ejecutada, false)
})

test('la BD (fake RLS) no devuelve nada fuera de conTaller y rechaza escribir en otro taller', async () => {
  const bd = crearBdFake()
  bd.sembrar('taller', { id: T, razonSocial: 'G2' })
  assert.deepEqual(await bd.sinAjuste().taller.findMany(), [])
  const conTaller = crearConTaller(bd.cliente)
  await assert.rejects(
    conTaller(T, (tx: any) => tx.proveedor.create({ data: { tallerId: '00000000-0000-4000-8000-000000000000', nombre: 'x' } })),
    /row-level security/,
  )
})

test('tallerDeDesarrollo: sin TALLER_PILOTO_ID uuid no hay taller (nunca uno por defecto) y en producción NUNCA', () => {
  assert.equal(tallerDeDesarrollo({}), null)
  assert.equal(tallerDeDesarrollo({ TALLER_PILOTO_ID: 'piloto' }), null)
  assert.equal(tallerDeDesarrollo({ TALLER_PILOTO_ID: ` ${T} ` }), T)
  assert.equal(tallerDeDesarrollo({ TALLER_PILOTO_ID: T, NODE_ENV: 'production' }), null, 'en producción el taller sale del código del dispositivo')
})
