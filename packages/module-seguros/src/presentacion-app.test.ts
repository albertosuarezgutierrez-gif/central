import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  cabecerasBaja, correoPresentacionApp, embudoCampana, embudoPorGrupo, enlacePresentacion, esRefValido, etapaPersona,
  refDeCabeceraCookie, varianteDeTurno, variantesActivas,
  COOKIE_REF_CAMPANA, type FilaEmbudo,
} from './presentacion-app.ts'
import { generarRef, hashRef } from './presentacion-app-ref.ts'
import { MEDIADOR } from './mediador.ts'

const CLIENTE_ID = '3f2b8c1e-1111-4222-8333-444455556666'

test('ref: 22 caracteres base64url, aleatorio, y el hash es estable y no lo contiene', () => {
  const a = generarRef()
  const b = generarRef()
  assert.ok(esRefValido(a))
  assert.notEqual(a, b)
  assert.equal(hashRef(a), hashRef(a))
  assert.match(hashRef(a)!, /^[0-9a-f]{64}$/)
  assert.ok(!hashRef(a)!.includes(a))
})

test('ref: basura, un uuid (el cliente_id) o nada no son ref', () => {
  for (const malo of [CLIENTE_ID, '', 'abc', null, undefined, 42, 'a'.repeat(21), 'a'.repeat(23), 'aaaaaaaaaaaaaaaaaaaa/=']) {
    assert.equal(esRefValido(malo), false, String(malo))
    assert.equal(hashRef(malo), null)
  }
})

test('enlace: va al portal con ?r= y NUNCA lleva el cliente_id ni el correo', () => {
  const r = generarRef()
  const e = enlacePresentacion(r)
  assert.equal(e, `${MEDIADOR.identidad.portal}/?r=${r}`)
  assert.ok(!e.includes(CLIENTE_ID))
  assert.ok(!e.includes('@'))
})

test('cookie: se lee entre otras y se ignora si no tiene forma de ref', () => {
  const r = generarRef()
  assert.equal(refDeCabeceraCookie(`a=1; ${COOKIE_REF_CAMPANA}=${r}; b=2`), r)
  assert.equal(refDeCabeceraCookie(`${COOKIE_REF_CAMPANA}=${CLIENTE_ID}`), null)
  assert.equal(refDeCabeceraCookie('otra=x'), null)
  assert.equal(refDeCabeceraCookie(null), null)
})

test('correo: firma de Alberto, enlace personal, pie LSSI/RGPD con baja de un clic, datos del MEDIADOR', () => {
  const enlace = enlacePresentacion(generarRef())
  const bajaUrl = 'https://api.example/api/publico/campana/baja?t=00000000-0000-4000-8000-000000000000'
  const c = correoPresentacionApp({ nombre: 'MARIA JOSE GARCIA LOPEZ', enlace, bajaUrl })
  for (const cuerpo of [c.texto, c.html]) {
    assert.ok(cuerpo.includes('Grupo ASegura'))
    assert.ok(cuerpo.includes(enlace))
    assert.ok(cuerpo.includes(bajaUrl))
    assert.ok(cuerpo.includes(MEDIADOR.identidad.claveDgsfp))
    assert.ok(cuerpo.includes(MEDIADOR.identidad.nombre))
    assert.ok(cuerpo.includes(MEDIADOR.identidad.email))
    assert.ok(/GRATUITA|gratuita/.test(cuerpo))
  }
  assert.ok(c.html.includes('#3364ee'))
  assert.ok(c.html.includes('logotipo-asegura-correo.png'))
  assert.ok(!/Hola (null|undefined)/.test(c.texto))
})

test('correo: sin nombre legible saluda sin nombre', () => {
  const c = correoPresentacionApp({ nombre: null, enlace: 'https://x/?r=1', bajaUrl: 'https://x/b' })
  assert.ok(c.texto.startsWith('Hola:'))
})

test('cabeceras de baja: List-Unsubscribe con https y One-Click (RFC 8058)', () => {
  const h = cabecerasBaja('https://x/baja?t=1')
  assert.match(h['List-Unsubscribe'], /^<https:\/\/x\/baja\?t=1>/)
  assert.equal(h['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')
})

const fila = (p: Partial<FilaEmbudo>): FilaEmbudo => ({ enviado: true, eventos: [], visita: false, registrado: false, baja: false, ...p })

test('embudo: cada etapa implica las anteriores y nunca crece hacia abajo', () => {
  const e = embudoCampana([
    fila({ eventos: ['email.sent', 'email.delivered'] }),
    fila({ eventos: ['email.delivered', 'email.opened'] }),
    fila({ eventos: ['email.delivered', 'email.clicked'] }), // clic sin píxel de apertura
    fila({ eventos: ['email.delivered'], visita: true }), // visita sin clic visto por Resend
    fila({ eventos: [], visita: true, registrado: true }),
    fila({ eventos: ['email.bounced'] }),
    fila({ enviado: false, eventos: null }),
  ])
  assert.deepEqual(e, {
    enviados: 6, fallidos: 1, entregados: 5, abiertos: 4, clics: 3, visitas: 2, registrados: 1, rebotados: 1, bajas: 0,
  })
})

test('embudo: un enviado con eventos ilegibles deja las etapas de Resend en null, nunca 0', () => {
  const e = embudoCampana([fila({ eventos: null }), fila({ eventos: ['email.delivered'] })])
  assert.equal(e.entregados, null)
  assert.equal(e.abiertos, null)
  assert.equal(e.clics, null)
  assert.equal(e.rebotados, null)
  assert.equal(e.enviados, 2)
})

test('embudo: sin envíos todo es 0 (se miró y no hay)', () => {
  assert.deepEqual(embudoCampana([]), {
    enviados: 0, fallidos: 0, entregados: 0, abiertos: 0, clics: 0, visitas: 0, registrados: 0, rebotados: 0, bajas: 0,
  })
})

test('variantes: cada una cambia el asunto y la entrada, el resto (enlace, baja, firma) es igual', () => {
  const base = { nombre: 'Ana', enlace: 'https://p/?r=x', bajaUrl: 'https://b/?t=1' }
  const a = correoPresentacionApp({ ...base, variante: 'A' })
  const b = correoPresentacionApp({ ...base, variante: 'B' })
  assert.equal(a.variante, 'A')
  assert.equal(b.variante, 'B')
  assert.notEqual(a.asunto, b.asunto)
  for (const c of [a, b]) {
    assert.ok(c.texto.includes('sigo aquí para lo que necesites'))
    assert.ok(c.texto.includes('Sin darte de alta'))
    assert.ok(c.texto.includes(base.bajaUrl))
  }
  assert.equal(correoPresentacionApp(base).variante, 'A')
})

test('variante C: asunto, botón arriba, 3 viñetas, y mismo ?r=, baja, List-Unsubscribe y pie legal que A/B', () => {
  const enlace = enlacePresentacion(generarRef())
  const bajaUrl = 'https://b/baja?t=1'
  const base = { nombre: 'Ana', enlace, bajaUrl }
  const c = correoPresentacionApp({ ...base, variante: 'C' })
  assert.equal(c.variante, 'C')
  assert.equal(c.asunto, 'Te aviso antes de que caduque tu seguro o tu ITV (gratis)')
  for (const cuerpo of [c.texto, c.html]) {
    assert.ok(cuerpo.includes(enlace), 'lleva el ?r=')
    assert.ok(cuerpo.includes('?r='))
    assert.ok(cuerpo.includes(bajaUrl), 'lleva la baja')
    assert.ok(cuerpo.includes('Activar mis avisos gratis'))
  }
  // El botón va antes de cualquier viñeta.
  assert.ok(c.texto.indexOf('Activar mis avisos gratis') < c.texto.indexOf('Todos tus seguros en un sitio'))
  assert.ok(c.html.indexOf('Activar mis avisos gratis') < c.html.indexOf('<ul'))
  assert.equal(c.texto.split('\n').filter((l) => l.startsWith('· ')).length, 3)
  // Pie legal idéntico al de A/B (misma función, mismo texto).
  const a = correoPresentacionApp({ ...base, variante: 'A' })
  const pie = (t: string) => t.slice(t.indexOf('—'))
  assert.equal(pie(c.texto), pie(a.texto))
  assert.ok(c.html.includes('#3364ee'))
  // Las cabeceras de baja no dependen de la variante y siguen siendo One-Click.
  const h = cabecerasBaja(bajaUrl)
  assert.ok(h['List-Unsubscribe'].includes(`<${bajaUrl}>`))
  assert.equal(h['List-Unsubscribe-Post'], 'List-Unsubscribe=One-Click')
})

test('variantes activas: env vacía o basura = todas; reparto por turno equilibrado', () => {
  assert.deepEqual(variantesActivas(''), ['A', 'B'])
  assert.deepEqual(variantesActivas('zz, 9'), ['A', 'B'])
  assert.deepEqual(variantesActivas('c'), ['C'])
  assert.deepEqual(variantesActivas('A,B,C'), ['A', 'B', 'C'])
  assert.deepEqual(variantesActivas(' b ,B'), ['B'])
  const turnos = [0, 1, 2, 3].map((i) => varianteDeTurno(i, ['A', 'B']))
  assert.deepEqual(turnos, ['A', 'B', 'A', 'B'])
})

test('embudo por grupo y etapa por persona', () => {
  const filas = [
    { ...fila({ eventos: ['email.delivered', 'email.opened'] }), lote: '2', variante: 'A' },
    { ...fila({ eventos: ['email.delivered'] }), lote: '1', variante: 'B' },
    { ...fila({ eventos: [], visita: true, registrado: true }), lote: '1', variante: 'A' },
  ]
  const porLote = embudoPorGrupo(filas, (f) => f.lote)
  assert.deepEqual(porLote.map((g) => [g.grupo, g.embudo.enviados, g.embudo.registrados]), [['1', 2, 1], ['2', 1, 0]])
  const porVariante = embudoPorGrupo(filas, (f) => f.variante)
  assert.deepEqual(porVariante.map((g) => [g.grupo, g.embudo.abiertos]), [['A', 2], ['B', 0]])
  assert.equal(etapaPersona(filas[0]!), 'abierto')
  assert.equal(etapaPersona(filas[2]!), 'registrado')
  assert.equal(etapaPersona(fila({ eventos: null })), 'sin_datos')
  assert.equal(etapaPersona(fila({ enviado: false, eventos: null })), 'fallido')
})
