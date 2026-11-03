// Cepo de «Invita a otro propietario» (27/10/2026, punto 9 del estudio de mercado).
//
// Lo que NO puede romperse (y por qué):
//   1. El portal NO ENVÍA nada a terceros: ni la API ni la pantalla tienen canal de salida; solo texto para copiar / wa.me SIN número.
//   2. Aislamiento: la BD parte de `accesosPatrimonio` y TODA consulta a `portalPatrimonioRecomendacion` lleva la identidad de la
//      cookie. La lista NO selecciona el hash del correo ni quién canjeó («la lista no puede decir a quién invitó»).
//   3. La recompensa viene del cupo de la IDENTIDAD de la sesión (no del titular de la URL) y NUNCA rebaja un tramo superior.
//   4. El canje exige patrimonio activo, correo verificado y que la regla pura lo permita (no a sí mismo, solo cuentas nuevas).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { CUPO_IA_ALTO_VALOR, CUPO_IA_AMPLIO, CUPO_IA_BASICO, cupoMensualIa } from '../packages/module-patrimonio/src/cupo-ia.ts'

const RAIZ = join(import.meta.dirname, '..')
const leer = (r: string) => readFileSync(join(RAIZ, r), 'utf8')
/** Quita comentarios para que el cepo mire CÓDIGO, no la prosa que lo explica. */
const codigo = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const BD = codigo(leer('apps/asegura-portal/lib/patrimonio/recomendacion-bd.ts'))
const API = codigo(leer('apps/asegura-portal/lib/patrimonio/recomendacion-api.ts'))
const UI = codigo(leer('apps/asegura-portal/app/(portal)/patrimonio/InvitaPropietario.tsx'))
const VALOR_BD = codigo(leer('apps/asegura-portal/lib/patrimonio/valor-cliente-bd.ts'))
const RUTAS = [
  'apps/asegura-portal/app/api/patrimonio/recomendaciones/route.ts',
  'apps/asegura-portal/app/api/patrimonio/recomendaciones/[id]/route.ts',
].map((r) => codigo(leer(r)))

test('🚨 no se envía NADA a terceros: ni API, ni BD, ni rutas importan un canal de salida', () => {
  for (const [n, src] of [['api', API], ['bd', BD], ['ruta1', RUTAS[0]], ['ruta2', RUTAS[1]]] as const) {
    assert.doesNotMatch(src, /core-email|core-telegram|core-push|resend|nodemailer|enviarCodigo|obtenerCanal|sendMail|twilio/i, `${n}: tiene un canal de salida`)
  }
})

test('🚨 la pantalla solo comparte texto: WhatsApp por wa.me SIN número, y el único fetch es a su propia API', () => {
  assert.match(UI, /https:\/\/wa\.me\/\?text=/)
  assert.doesNotMatch(UI, /wa\.me\/\d|wa\.me\/\$\{|api\.whatsapp|mailto:/i)
  const destinos = [...UI.matchAll(/fetch\(\s*([`'"][^`'"]+)/g)].map((m) => m[1].slice(1))
  assert.ok(destinos.length >= 3)
  for (const d of destinos) assert.match(d, /^\/api\/patrimonio\/recomendaciones/, `fetch a ${d}`)
})

test('🚨 la BD parte de accesosPatrimonio y TODA consulta a la tabla lleva la identidad de la cookie', () => {
  assert.match(BD, /\baccesosPatrimonio\(/)
  assert.match(BD, /getIdentidad\(\)/)
  const trozos = BD.split(/\b(?:prisma|tx)\.portalPatrimonioRecomendacion\./).slice(1)
  assert.ok(trozos.length >= 8, `se esperaban ≥ 8 consultas y hay ${trozos.length}`)
  const sueltos = trozos.filter((t) => !/(recomendadorIdentidadId|canjeadaPorIdentidadId)/.test(t.slice(0, 700)))
  assert.deepEqual(sueltos.map((t) => t.slice(0, 60)), [], 'consulta sin la identidad en su where/data')
})

test('🚨 la lista no selecciona el hash del correo ni quién canjeó; la API no los devuelve', () => {
  const listar = /async listar\(\)[\s\S]*?\n    \},/.exec(BD)![0]
  assert.doesNotMatch(listar, /correoHash|canjeadaPorIdentidadId|recomendadorIdentidadId: true/)
  assert.doesNotMatch(/const recomendaciones[\s\S]*?\}\)\)/.exec(API)![0], /correoHash|hash|identidad/i)
})

test('🚨 la recompensa se pregunta por la IDENTIDAD de la sesión, no por el titular que llegue', () => {
  assert.match(VALOR_BD, /recompensaVigenteDeIdentidad\(identidadId\)/)
  assert.doesNotMatch(VALOR_BD, /recompensaVigenteDeIdentidad\(clienteId\)/)
  // Un fallo de lectura es «sin recompensa», nunca cupo regalado.
  assert.match(BD, /catch \(e\) \{[\s\S]*?return false/)
})

test('🚨 el canje: patrimonio activo, correo VERIFICADO, regla pura y una sola recompensa por invitado', () => {
  const canje = /export async function canjearRecomendaciones[\s\S]*$/.exec(BD)![0]
  assert.match(canje, /accesosPatrimonio\(identidadId\)\)\.size === 0\) return 0/)
  assert.match(canje, /verificadoEn: \{ not: null \}/)
  assert.match(canje, /puedeCanjearRecomendacion\(/)
  assert.match(canje, /recomendadorIdentidadId: \{ not: identidadId \}/)
  assert.match(canje, /canjeadaEn: null, anuladoEn: null/, 'el UPDATE solo sella una pendiente')
  assert.match(canje, /catch \(e\)[\s\S]*return 0/, 'nunca lanza: la página de patrimonio sigue')
})

test('🎁 la recompensa sube el básico a amplio y NUNCA rebaja (ni toca el alto valor)', () => {
  const sin = { comisionAnualCent: null, polizasEnVigor: 0 }
  assert.equal(cupoMensualIa(sin).max, CUPO_IA_BASICO)
  assert.equal(cupoMensualIa({ ...sin, recompensaVigente: true }).max, CUPO_IA_AMPLIO)
  assert.equal(cupoMensualIa({ comisionAnualCent: null, polizasEnVigor: 2, recompensaVigente: true }).max, CUPO_IA_AMPLIO)
  assert.equal(cupoMensualIa({ comisionAnualCent: null, polizasEnVigor: 50, recompensaVigente: true }).max, CUPO_IA_ALTO_VALOR)
  for (const v of [0, 1, 5, 50, null]) {
    const base = cupoMensualIa({ comisionAnualCent: null, polizasEnVigor: v }).max
    assert.ok(cupoMensualIa({ comisionAnualCent: null, polizasEnVigor: v, recompensaVigente: true }).max >= base, `rebaja con ${v}`)
  }
})
