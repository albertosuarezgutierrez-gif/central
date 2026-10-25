import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { actorPortal, idsDeEscritura, leerActor } from './actor.ts'

const U1 = '0b6c1f7e-3a52-4d7e-9f0a-1c2d3e4f5a6b'
const U2 = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d'

test('leerActor: los tres tipos válidos', () => {
  assert.deepEqual(leerActor('humano:' + U1), { tipo: 'humano', id: U1 })
  assert.deepEqual(leerActor('agente:comercial'), { tipo: 'agente', id: 'comercial' })
  assert.deepEqual(leerActor('sistema:cron:correduria-renovaciones'), { tipo: 'sistema', id: 'cron:correduria-renovaciones' })
})

test('leerActor: sin cabecera o mal formada es «desconocido», nunca «sistema»', () => {
  assert.deepEqual(leerActor(null), { tipo: 'desconocido', motivo: 'sin_cabecera' })
  assert.deepEqual(leerActor('  '), { tipo: 'desconocido', motivo: 'sin_cabecera' })
  assert.deepEqual(leerActor('admin:yo'), { tipo: 'desconocido', motivo: 'mal_formada' })
  assert.deepEqual(leerActor('humano:'), { tipo: 'desconocido', motivo: 'mal_formada' })
  assert.deepEqual(leerActor('humano:a b'), { tipo: 'desconocido', motivo: 'mal_formada' })
  assert.deepEqual(leerActor('humano:' + 'x'.repeat(121)), { tipo: 'desconocido', motivo: 'mal_formada' })
  // un humano solo por su cuentaId: un correo no puede acabar en una tabla que no se borra
  assert.deepEqual(leerActor('humano:alberto@grupoasegura.es'), { tipo: 'desconocido', motivo: 'mal_formada' })
})

test('idsDeEscritura: solo claves con forma de id y valores UUID, de query y cuerpo', () => {
  const ids = idsDeEscritura(`https://a/api/operador/cliente?id=${U1}&q=juan`, {
    clienteId: U2, dni: '12345678Z', email: 'a@b.es', telefono: '600000000', polizaId: 'no-es-uuid', nota: U1,
  })
  assert.deepEqual(ids, { id: U1, clienteId: U2 })
})

test('idsDeEscritura: cuerpo que no es objeto o url rota no revienta', () => {
  assert.deepEqual(idsDeEscritura('no-es-url', [U1]), {})
  assert.deepEqual(idsDeEscritura('https://a/x', null), {})
})

test('toda ruta de escritura del puerto de operador va envuelta en auditado()', () => {
  const raiz = new URL('../app/api/operador', import.meta.url).pathname
  const rutas: string[] = []
  const recorrer = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n)
      if (statSync(p).isDirectory()) recorrer(p)
      else if (n === 'route.ts') rutas.push(p)
    }
  }
  recorrer(raiz)
  assert.ok(rutas.length > 40, `se esperaban >40 rutas del puerto y salen ${rutas.length}: el recorrido mira donde no es`)
  const sinAuditar: string[] = []
  let escrituras = 0
  for (const p of rutas) {
    const src = readFileSync(p, 'utf8')
    for (const m of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      const desnuda = new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`).test(src)
        || new RegExp(`export\\s+const\\s+${m}\\s*=\\s*(?!\\s|auditado\\()`).test(src)
        || new RegExp(`export\\s*\\{[^}]*\\b${m}\\b`).test(src)
      const envuelta = new RegExp(`export\\s+const\\s+${m}\\s*=\\s*auditado\\(`).test(src)
      if (desnuda) sinAuditar.push(`${p.slice(raiz.length)} ${m}`)
      if (envuelta) escrituras++
    }
  }
  assert.deepEqual(sinAuditar, [], 'rutas de escritura sin auditado(): envuélvelas (export const POST = auditado(async (req) => …))')
  assert.ok(escrituras > 40, `solo ${escrituras} escrituras auditadas: el patrón de búsqueda no casa`)
})

test('actorPortal: sistema con id portal:<identidadId> (UUID) o «portal»; sin PII', () => {
  assert.deepEqual(actorPortal({ identidadId: U1 }), { tipo: 'sistema', id: `portal:${U1}` })
  assert.deepEqual(actorPortal({}), { tipo: 'sistema', id: 'portal' })
  // el actor sale de ids ya filtrados por idsDeEscritura: un correo en identidadId no llega
  assert.deepEqual(actorPortal(idsDeEscritura('https://a/api/portal/contacto', { identidadId: 'a@b.es' })), { tipo: 'sistema', id: 'portal' })
})

test('auditado() deja traza también de las peticiones autorizadas por el puente del portal', () => {
  const src = readFileSync(new URL('./auditoria.ts', import.meta.url), 'utf8')
  assert.match(src, /puentePortalAutorizado\(req\)/, 'auditado debe reconocer el Bearer del puente del portal')
  assert.match(src, /canal === 'portal' \? actorPortal\(/, 'el actor del puente sale de actorPortal, no de x-actor')
  assert.match(src, /operadorAutorizado\(req\) \? 'operador'/, 'el canal de operador sigue registrándose')
})

test('toda ruta de escritura del puerto del portal va envuelta en auditado()', () => {
  const raiz = new URL('../app/api/portal', import.meta.url).pathname
  const rutas: string[] = []
  const recorrer = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n)
      if (statSync(p).isDirectory()) recorrer(p)
      else if (n === 'route.ts') rutas.push(p)
    }
  }
  recorrer(raiz)
  assert.ok(rutas.length > 10, `se esperaban >10 rutas del portal y salen ${rutas.length}`)
  const sinAuditar: string[] = []
  let escrituras = 0
  for (const p of rutas) {
    const src = readFileSync(p, 'utf8')
    for (const m of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      const desnuda = new RegExp(`export\\s+(async\\s+)?function\\s+${m}\\b`).test(src)
        || new RegExp(`export\\s+const\\s+${m}\\s*=\\s*(?!\\s|auditado\\()`).test(src)
        || new RegExp(`export\\s*\\{[^}]*\\b${m}\\b`).test(src)
      if (desnuda) sinAuditar.push(`${p.slice(raiz.length)} ${m}`)
      if (new RegExp(`export\\s+const\\s+${m}\\s*=\\s*auditado\\(`).test(src)) escrituras++
    }
  }
  assert.deepEqual(sinAuditar, [], 'escrituras del portal sin auditado()')
  assert.ok(escrituras > 15, `solo ${escrituras} escrituras auditadas en el portal`)
})
