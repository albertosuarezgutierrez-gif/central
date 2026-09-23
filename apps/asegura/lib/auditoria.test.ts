import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { idsDeEscritura, leerActor } from './actor.ts'

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
