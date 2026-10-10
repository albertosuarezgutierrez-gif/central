import test from 'node:test'
import assert from 'node:assert/strict'
import { canjearTicket, firmarTicket, identidadInicio, urlVueltaPlataforma, verificarTicket, VIGENCIA_TICKET_MS, type DatosTicket } from './google-oauth-ticket.ts'
import { firmarEstado } from './google-oauth-estado.ts'

const S = 'secreto-de-prueba-0123456789'
const base = { correduriaId: 'cor-1', cuentaId: '11111111-1111-4111-8111-111111111111' }

/** Almacén de jti consumidos en memoria: el mismo contrato que el INSERT por clave primaria (P2002 = usado). */
function almacen() {
  const usados = new Set<string>()
  return async (d: DatosTicket) => {
    if (usados.has(d.jti)) return false
    usados.add(d.jti)
    return true
  }
}

test('un ticket recién firmado vale y trae correduría, cuenta y jti', () => {
  const { ticket, datos } = firmarTicket(base, S)
  const r = verificarTicket(ticket, { secreto: S })
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual(r.datos, datos)
  assert.ok(datos.jti.length >= 20)
})

test('🪤 el ticket no lleva el secreto ni nada más que ids, jti y caducidad', () => {
  const { ticket } = firmarTicket(base, S)
  const cuerpo = JSON.parse(Buffer.from(ticket.split('.')[0], 'base64url').toString('utf8'))
  assert.deepEqual(Object.keys(cuerpo).sort(), ['c', 'e', 'j', 'u'])
  assert.ok(!ticket.includes(S))
})

test('🪤 caduca a los 2 minutos', () => {
  const { ticket } = firmarTicket(base, S, 1_000)
  assert.equal(verificarTicket(ticket, { secreto: S, ahora: 1_000 + VIGENCIA_TICKET_MS - 1 }).ok, true)
  assert.deepEqual(verificarTicket(ticket, { secreto: S, ahora: 1_000 + VIGENCIA_TICKET_MS + 1 }), { ok: false, motivo: 'caducado' })
})

test('🪤 firma mala (otro secreto o sello cambiado) no vale', () => {
  assert.deepEqual(verificarTicket(firmarTicket(base, 'otro-secreto').ticket, { secreto: S }), { ok: false, motivo: 'firma' })
  const [cuerpo] = firmarTicket(base, S).ticket.split('.')
  assert.deepEqual(verificarTicket(`${cuerpo}.AAAA`, { secreto: S }), { ok: false, motivo: 'firma' })
})

test('🪤 un cuerpo cambiado (otra correduría) con el sello viejo no vale', () => {
  const { ticket } = firmarTicket(base, S)
  const [cuerpo, sello] = ticket.split('.')
  const d = JSON.parse(Buffer.from(cuerpo, 'base64url').toString('utf8'))
  const otro = Buffer.from(JSON.stringify({ ...d, c: 'cor-2' })).toString('base64url')
  assert.deepEqual(verificarTicket(`${otro}.${sello}`, { secreto: S }), { ok: false, motivo: 'firma' })
})

test('🪤 un `state` del OAuth (mismo secreto) NO vale como ticket: dominios de firma distintos', () => {
  const state = firmarEstado({ correduriaId: 'cor-1', cuentaId: base.cuentaId, nonce: 'n' }, S)
  assert.deepEqual(verificarTicket(state, { secreto: S }), { ok: false, motivo: 'firma' })
})

test('basura, vacío o sin secreto → mal formado', () => {
  for (const t of ['', 'a', 'a.b.c', '.x', null, undefined]) assert.deepEqual(verificarTicket(t, { secreto: S }), { ok: false, motivo: 'mal_formado' })
  assert.deepEqual(verificarTicket(firmarTicket(base, S).ticket, { secreto: '' }), { ok: false, motivo: 'mal_formado' })
  assert.throws(() => firmarTicket(base, ''))
})

test('🪤 UN SOLO USO: el segundo canje del mismo ticket es «usado»', async () => {
  const consumir = almacen()
  const { ticket } = firmarTicket(base, S)
  assert.equal((await canjearTicket(ticket, { secreto: S, consumir })).ok, true)
  assert.deepEqual(await canjearTicket(ticket, { secreto: S, consumir }), { ok: false, motivo: 'usado' })
  // Otro ticket de la misma cuenta sí vale (jti distinto).
  assert.equal((await canjearTicket(firmarTicket(base, S).ticket, { secreto: S, consumir })).ok, true)
})

test('🪤 un ticket caducado o con firma mala NO consume su jti; un fallo de BD → `bd` (fail-closed)', async () => {
  let llamadas = 0
  const consumir = async () => { llamadas++; return true }
  const { ticket } = firmarTicket(base, S, 1_000)
  assert.deepEqual(await canjearTicket(ticket, { secreto: S, consumir, ahora: 1_000 + VIGENCIA_TICKET_MS + 1 }), { ok: false, motivo: 'caducado' })
  assert.deepEqual(await canjearTicket(firmarTicket(base, 'otro').ticket, { secreto: S, consumir }), { ok: false, motivo: 'firma' })
  assert.equal(llamadas, 0)
  assert.deepEqual(await canjearTicket(firmarTicket(base, S).ticket, { secreto: S, consumir: async () => { throw new Error('sin tabla') } }), { ok: false, motivo: 'bd' })
})

// ─── conectar: ticket vs sesión ────────────────────────────────────────────────

const sinSesion = async () => ({ ok: false as const, status: 401 })
const conSesion = async () => ({ ok: true as const, correduriaId: 'cor-s', cuentaId: 'cta-s' })

test('conectar CON ticket válido y SIN sesión de asegura → arranca con la identidad del ticket', async () => {
  const consumir = almacen()
  let preguntoSesion = false
  const r = await identidadInicio({
    ticket: firmarTicket(base, S).ticket,
    canjear: (t) => canjearTicket(t, { secreto: S, consumir }),
    sesion: async () => { preguntoSesion = true; return sinSesion() },
  })
  assert.deepEqual(r, { ok: true, via: 'ticket', correduriaId: 'cor-1', cuentaId: base.cuentaId })
  assert.equal(preguntoSesion, false)
})

test('🪤 conectar SIN ticket y SIN sesión → 401 sin_sesion (como antes)', async () => {
  const r = await identidadInicio({ ticket: null, canjear: async () => { throw new Error('no debe canjear') }, sesion: sinSesion })
  assert.deepEqual(r, { ok: false, motivo: 'sin_sesion', status: 401 })
})

test('conectar SIN ticket y CON sesión → la sesión de siempre', async () => {
  const r = await identidadInicio({ ticket: null, canjear: async () => { throw new Error('no debe canjear') }, sesion: conSesion })
  assert.deepEqual(r, { ok: true, via: 'sesion', correduriaId: 'cor-s', cuentaId: 'cta-s' })
})

test('🪤 un ticket malo NO cae a la sesión aunque la haya; reusado → ticket_usado', async () => {
  const consumir = almacen()
  const canjear = (t: string) => canjearTicket(t, { secreto: S, consumir })
  assert.deepEqual(await identidadInicio({ ticket: 'basura', canjear, sesion: conSesion }), { ok: false, motivo: 'ticket_mal_formado', status: 401 })
  const { ticket } = firmarTicket(base, S)
  assert.equal((await identidadInicio({ ticket, canjear, sesion: sinSesion })).ok, true)
  assert.deepEqual(await identidadInicio({ ticket, canjear, sesion: conSesion }), { ok: false, motivo: 'ticket_usado', status: 401 })
})

// ─── vuelta a plataforma (sin open redirect) ───────────────────────────────────

test('la vuelta va al ORIGEN de la base, a la vista de Google Contactos, con el resultado', () => {
  assert.equal(urlVueltaPlataforma('https://plataforma.ejemplo.es', 'ok'), 'https://plataforma.ejemplo.es/correduria/google-contactos?google=ok')
  assert.equal(urlVueltaPlataforma('https://plataforma.ejemplo.es/', 'error', 'cancelado'), 'https://plataforma.ejemplo.es/correduria/google-contactos?google=error&motivo=cancelado')
})

test('🪤 de la base solo cuenta el origen: su ruta, query o fragmento no se arrastran', () => {
  assert.equal(urlVueltaPlataforma('https://plataforma.ejemplo.es/otra/ruta?next=https://malo.example#x', 'ok'), 'https://plataforma.ejemplo.es/correduria/google-contactos?google=ok')
})

test('🪤 base no https, con credenciales o rota → null (se pinta la página, no se redirige)', () => {
  for (const b of ['http://plataforma.ejemplo.es', 'javascript:alert(1)', '//malo.example', 'https://u:p@plataforma.ejemplo.es', '', null, undefined, 'no es url']) {
    assert.equal(urlVueltaPlataforma(b, 'ok'), null, String(b))
  }
  assert.equal(urlVueltaPlataforma('http://localhost:3000', 'ok'), 'http://localhost:3000/correduria/google-contactos?google=ok')
})

test('🪤 el motivo es un código cerrado: nada de texto libre ni URLs en la query', () => {
  const u = new URL(urlVueltaPlataforma('https://p.ejemplo.es', 'error', 'https://malo.example/<script>')!)
  assert.equal(u.searchParams.get('motivo'), 'desconocido')
  assert.equal(new URL(urlVueltaPlataforma('https://p.ejemplo.es', 'error')!).searchParams.get('motivo'), 'desconocido')
  assert.equal(new URL(urlVueltaPlataforma('https://p.ejemplo.es', 'error', 'ticket_usado')!).searchParams.get('motivo'), 'ticket_usado')
})
