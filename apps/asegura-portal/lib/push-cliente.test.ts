import test from 'node:test'
import assert from 'node:assert/strict'

import {
  enviarPushACliente,
  leerPeticionPushCliente,
  payloadPushCliente,
  pushClienteAutorizado,
  urlInternaPortal,
  type DepsPushCliente,
  type SuscripcionPush,
} from './push-cliente.ts'

const CLIENTE = '11111111-2222-4333-8444-555555555555'
const TOKEN = 'A'.repeat(43)
const ok = { clienteId: CLIENTE, motivo: 'regularizacion_rc', url: `/datos/${TOKEN}` }

test('🪤 url: solo rutas internas con el prefijo del motivo; nada externo', () => {
  assert.equal(urlInternaPortal(`/datos/${TOKEN}`, '/datos/'), `/datos/${TOKEN}`)
  for (const mala of [
    'https://evil.example/datos/x',
    '//evil.example/datos/x',
    '/\\evil.example',
    'javascript:alert(1)',
    '/datos/../boveda',
    '/datos/x?y=1',
    '/datos/x#f',
    '/datos/',
    '/boveda',
    'datos/x',
    ' /datos/x',
    42,
    null,
  ]) {
    assert.equal(urlInternaPortal(mala, '/datos/'), null, String(mala))
  }
  // Aunque un motivo futuro use el prefijo «/», `//host` (protocolo relativo = otro dominio) sigue fuera.
  assert.equal(urlInternaPortal('//evil/x', '/'), null)
  assert.equal(urlInternaPortal('/inicio', '/'), '/inicio')
})

test('🪤 petición: clienteId uuid, motivo de la lista cerrada y url interna; si no, null (400)', () => {
  assert.deepEqual(leerPeticionPushCliente(ok), ok)
  assert.equal(leerPeticionPushCliente({ ...ok, url: 'https://evil.example/' }), null)
  assert.equal(leerPeticionPushCliente({ ...ok, motivo: 'otro' }), null)
  assert.equal(leerPeticionPushCliente({ ...ok, motivo: 'toString' }), null)
  assert.equal(leerPeticionPushCliente({ ...ok, clienteId: 'x' }), null)
  assert.equal(leerPeticionPushCliente(null), null)
})

test('🪤 el texto lo fija el portal: un titulo/cuerpo de la petición no llega al aviso', () => {
  const p = leerPeticionPushCliente({ ...ok, titulo: 'Paga aquí 1.234,00€', cuerpo: 'póliza 0123456789' })!
  const payload = payloadPushCliente(p)
  assert.equal(payload.title, 'Grupo ASegura')
  assert.match(payload.body, /petición pendiente de datos de tu póliza/)
  const todo = JSON.stringify(payload)
  assert.doesNotMatch(todo, /Paga|0123456789|€|\d{4,}/)
  assert.deepEqual(Object.keys(payload.data).sort(), ['tag', 'url'])
})

test('🪤 secreto obligatorio: sin secreto configurado o sin cabecera correcta, no autoriza', () => {
  const con = () => 's3creto-largo'
  const sin = (n: string): string => {
    throw new Error(`${n} no configurado`)
  }
  assert.equal(pushClienteAutorizado('Bearer s3creto-largo', con), true)
  assert.equal(pushClienteAutorizado(null, con), false)
  assert.equal(pushClienteAutorizado('Bearer otro', con), false)
  assert.equal(pushClienteAutorizado('Bearer ', sin), false)
  assert.equal(pushClienteAutorizado('Bearer undefined', sin), false)
})

function deps(o: { vinculos?: Record<string, string[]>; subs?: SuscripcionPush[]; omitir?: string[]; resultado?: (s: SuscripcionPush) => { ok: boolean; gone: boolean } }) {
  const borradas: string[] = []
  const enviadas: string[] = []
  const pedidasSubs: string[][] = []
  const d: DepsPushCliente = {
    identidadesDeCliente: async (c) => o.vinculos?.[c] ?? [],
    omitirPorPreferencia: async () => new Set(o.omitir ?? []),
    suscripciones: async (ids) => {
      pedidasSubs.push(ids)
      return (o.subs ?? []).filter((s) => ids.includes(s.identidadId))
    },
    enviar: async (s) => {
      enviadas.push(s.id)
      return o.resultado ? o.resultado(s) : { ok: true, gone: false }
    },
    borrarSuscripcion: async (s) => {
      borradas.push(s.id)
    },
  }
  return { d, borradas, enviadas, pedidasSubs }
}
const sub = (id: string, identidadId: string): SuscripcionPush => ({ id, identidadId, endpoint: `https://push/${id}`, p256dh: 'p', authKey: 'a' })

test('🪤 cliente sin vínculo → sinSuscripcion, sin leer suscripciones de nadie', async () => {
  const { d, enviadas, pedidasSubs } = deps({ vinculos: {}, subs: [sub('s1', 'idX')] })
  const r = await enviarPushACliente(leerPeticionPushCliente(ok)!, d)
  assert.deepEqual(r, { enviados: 0, fallidos: 0, sinSuscripcion: true, omitidasPorPreferencia: 0 })
  assert.deepEqual(enviadas, [])
  assert.deepEqual(pedidasSubs, [])
})

test('🪤 solo a las identidades vinculadas a ESE cliente; 410 se borra; preferencias se respetan', async () => {
  const { d, enviadas, borradas, pedidasSubs } = deps({
    vinculos: { [CLIENTE]: ['id1', 'id2', 'id3'] },
    subs: [sub('s1', 'id1'), sub('s2', 'id1'), sub('s3', 'id2'), sub('sOtro', 'idAjena')],
    omitir: ['id2'],
    resultado: (s) => (s.id === 's2' ? { ok: false, gone: true } : { ok: true, gone: false }),
  })
  const r = await enviarPushACliente(leerPeticionPushCliente(ok)!, d)
  assert.deepEqual(pedidasSubs, [['id1', 'id2', 'id3']])
  assert.deepEqual(enviadas, ['s1', 's2'])
  assert.deepEqual(borradas, ['s2'])
  assert.deepEqual(r, { enviados: 1, fallidos: 1, sinSuscripcion: false, omitidasPorPreferencia: 1 })
})

test('vinculado pero sin la app activada → sinSuscripcion', async () => {
  const { d } = deps({ vinculos: { [CLIENTE]: ['id1'] }, subs: [] })
  const r = await enviarPushACliente(leerPeticionPushCliente(ok)!, d)
  assert.equal(r.sinSuscripcion, true)
  assert.equal(r.enviados, 0)
})

test('un envío que lanza cuenta como fallido y no aborta los demás', async () => {
  const { d } = deps({ vinculos: { [CLIENTE]: ['id1'] }, subs: [sub('s1', 'id1'), sub('s2', 'id1')] })
  d.enviar = async (s) => {
    if (s.id === 's1') throw new Error('red')
    return { ok: true, gone: false }
  }
  const r = await enviarPushACliente(leerPeticionPushCliente(ok)!, d)
  assert.equal(r.enviados, 1)
  assert.equal(r.fallidos, 1)
})
