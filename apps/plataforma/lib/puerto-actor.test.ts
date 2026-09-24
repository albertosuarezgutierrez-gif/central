import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { ACTOR_SISTEMA, actorDeSesion, cabecerasPuerto, registrarResolutorActor } from './puerto-actor.ts'

const CUENTA = '0b6c1f7e-3a52-4d7e-9f0a-1c2d3e4f5a6b'

test('actorDeSesion: con cuenta es humano, sin ella sistema', () => {
  assert.equal(actorDeSesion(CUENTA), `humano:${CUENTA}`)
  assert.equal(actorDeSesion(null), ACTOR_SISTEMA)
  assert.equal(actorDeSesion(''), ACTOR_SISTEMA)
})

test('cabecerasPuerto: Bearer + actor de la sesión; sin sesión o si el resolutor falla, sistema', async () => {
  registrarResolutorActor(async () => CUENTA)
  assert.deepEqual(await cabecerasPuerto('s3'), { Authorization: 'Bearer s3', 'x-actor': `humano:${CUENTA}` })
  registrarResolutorActor(async () => null)
  assert.equal((await cabecerasPuerto('s3'))['x-actor'], ACTOR_SISTEMA)
  registrarResolutorActor(async () => { throw new Error('fuera de una petición') })
  assert.equal((await cabecerasPuerto('s3'))['x-actor'], ACTOR_SISTEMA)
})

test('cabecerasPuerto: el actor explícito manda sobre la sesión', async () => {
  registrarResolutorActor(async () => CUENTA)
  assert.equal((await cabecerasPuerto('s3', 'agente:comercial'))['x-actor'], 'agente:comercial')
})

test('puerto-actor.ts no importa nada (lo cargan componentes de cliente)', () => {
  const src = readFileSync(new URL('./puerto-actor.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(src, /^\s*import\s/m)
  assert.doesNotMatch(src, /import\(/)
})

test('toda llamada al puerto de asegura lleva x-actor (usa cabecerasPuerto, no un Bearer a mano)', () => {
  const raiz = new URL('..', import.meta.url).pathname
  const infractores: string[] = []
  let clientes = 0
  const recorrer = (dir: string) => {
    for (const n of readdirSync(dir)) {
      if (n === 'node_modules' || n.startsWith('.')) continue
      const p = join(dir, n)
      if (statSync(p).isDirectory()) { recorrer(p); continue }
      if (!/\.(ts|tsx)$/.test(n) || n.endsWith('.test.ts') || n === 'puerto-actor.ts') continue
      const src = readFileSync(p, 'utf8')
      if (!/process\.env\.ASEGURA_OPERADOR_SECRET/.test(src)) continue
      if (/cabecerasPuerto\(/.test(src)) clientes++
      if (/Bearer \$\{/.test(src)) infractores.push(p.slice(raiz.length))
    }
  }
  recorrer(join(raiz, 'lib'))
  recorrer(join(raiz, 'app'))
  assert.deepEqual(infractores, [], 'estos ficheros montan el Bearer de asegura a mano: usa cabecerasPuerto(secret)')
  assert.ok(clientes > 30, `solo ${clientes} clientes del puerto usan cabecerasPuerto: el recorrido mira donde no es`)
})
