// Fase B del enlace de datos `/datos/<token>` (26/10/2026): póliza actual leída, borrador por token y aviso de abandono.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { HORAS_ABANDONO, TOPE_ABANDONO_PASADA, textoAvisoAbandono, tocaAvisoAbandono } from './aviso-abandono-solicitud.ts'

const sol = readFileSync(new URL('./solicitud-datos.ts', import.meta.url), 'utf8')
const tramo = (desde: string, hasta: string) => sol.slice(sol.indexOf(desde), sol.indexOf(hasta, sol.indexOf(desde) + desde.length))

// ─── 1. Póliza actual ────────────────────────────────────────────────────────

test('póliza actual: se lee con el LECTOR DE PÓLIZAS existente (no uno nuevo), con las mismas opciones a ciegas', () => {
  const f = tramo('export async function subirDocumentoSolicitud', 'export function textoAPreguntar')
  assert.match(sol, /import \{ leerPoliza \} from '\.\/documentos\/extraer-poliza'/)
  // Las contraseñas de la ficha SOLO si la política lo permite, y el mismo objeto para los dos lectores.
  assert.match(f, /const opcionesLector = politica\.probarContrasenasFicha \? \{ contrasenas: \(\) => contrasenasDeLaFicha\(/)
  assert.match(f, /leerPoliza\(fichero\.contenido, fichero\.mime, fichero\.nombre, opcionesLector\)/)
  assert.match(f, /leerDocSolicitud\(fichero\.contenido, fichero\.mime, fichero\.nombre, opcionesLector\)/)
  // Lo leído pasa por la validación pura del formulario.
  assert.match(f, /valoresDePolizaLeida\(polizaLeida, camposDeFila\(f\)\)/)
})

test('póliza actual en un enlace a ciegas: tampoco abre oportunidad (la lectura se reutiliza solo dentro de la política)', () => {
  const f = tramo('export async function subirDocumentoSolicitud', 'export function textoAPreguntar')
  const politica = f.indexOf('if (politica.abrirOportunidad')
  assert.ok(politica > 0)
  assert.ok(f.indexOf('oportunidadDesdeLectura(') > politica, 'la oportunidad desde la póliza leída va dentro de la rama de la política')
  assert.equal(f.split('oportunidadDesdeLectura(').length - 1, 1)
  // El motivo del lector (habla de la ficha y del DNI) no llega al cliente.
  assert.doesNotMatch(f, /aviso[^\n]*lectura\.motivo/)
})

// ─── 2. Borrador ─────────────────────────────────────────────────────────────

test('borrador: CIFRADO, solo en una pendiente viva y NUNCA completa (no toca estado, respuestas ni completada_at)', () => {
  const f = tramo('export async function guardarBorradorSolicitud', 'async function borrarBorrador')
  assert.match(f, /borrador = \$\{encryptField\(JSON\.stringify\(borrador\)\)\}/)
  assert.match(f, /where id = \$\{f\.id\}::uuid and estado = 'pendiente' and caduca_at > now\(\)/)
  const set = /update solicitud_datos set ([\s\S]*?)\bwhere\b/.exec(f)?.[1] ?? ''
  assert.match(set, /borrador =/)
  assert.doesNotMatch(set, /\b(estado|respuestas|completada_at)\s*=/)
  assert.match(f, /if \(f\.tercero && !consentimiento\) return/)
  assert.match(f, /if \(esColumnaAusente\(e\)\) return \{ ok: false, estado: 'sin_migracion' \}/)
})

test('borrador: sin la columna se lee como «nada» (el formulario se abre igual) y se borra al completar', () => {
  const leer = tramo('async function leerBorrador', 'export type ResultadoBorrador')
  assert.match(leer, /catch \(e\) \{[\s\S]*return null/)
  assert.match(leer, /limpiarBorrador\(camposDeFila\(f\)/)
  const responder = tramo('export async function responderSolicitud', 'if (hecho && ramoLeido === \'hogar\')')
  assert.match(responder, /if \(hecho\) await borrarBorrador\(f\.id\)/)
})

// ─── 3. Abandono ─────────────────────────────────────────────────────────────

test('aviso de abandono: ramo, último paso y enlace a la ficha; sin datos del cliente y todo escapado', () => {
  const t = textoAvisoAbandono([
    { id: 'a', ramo: 'hogar', tercero: false, ultimoPaso: 'Seguridad (pregunta 14 de 30)', enlaceFicha: 'https://p.x/correduria/cliente/1?tab=oportunidades' },
    { id: 'b', ramo: 'moto', tercero: true, ultimoPaso: null, enlaceFicha: 'https://p.x/c/<2>' },
  ])
  assert.match(t, /^⏳ <b>2 enlaces de datos sin completar a las 24 h<\/b>/)
  assert.match(t, /<b>Hogar<\/b> · llegó a: Seguridad \(pregunta 14 de 30\) · <a href="https:\/\/p\.x\/correduria\/cliente\/1\?tab=oportunidades">ficha<\/a>/)
  assert.match(t, /<b>Moto<\/b> \(datos de otra persona del riesgo\) · sin nada guardado/)
  assert.match(t, /&lt;2&gt;/)
  assert.match(t, /No se ha escrito al cliente/)
})

test('abandono: 24 h justas', () => {
  const ahora = new Date('2026-10-26T12:00:00Z')
  assert.equal(HORAS_ABANDONO, 24)
  assert.equal(tocaAvisoAbandono(new Date('2026-10-25T12:00:00Z'), ahora), true)
  assert.equal(tocaAvisoAbandono(new Date('2026-10-25T12:00:01Z'), ahora), false)
  assert.ok(TOPE_ABANDONO_PASADA > 0 && TOPE_ABANDONO_PASADA <= 20)
})

test('cron de abandono: sello UNA vez, tras el envío; sin envío no sella; solo Telegram a Alberto, nunca al cliente', () => {
  const src = readFileSync(new URL('./solicitudes-abandonadas.ts', import.meta.url), 'utf8')
  assert.match(src, /s\.aviso_abandono_at is null/)
  assert.match(src, /s\.estado = 'pendiente' and s\.caduca_at > now\(\)/)
  const envio = src.indexOf('await tgSend(')
  const nulo = src.indexOf("if (enviado === null) return")
  const sello = src.indexOf('set aviso_abandono_at = now()')
  assert.ok(envio > 0 && nulo > envio && sello > nulo, 'enviar → si no salió, no sellar → sellar')
  assert.match(src, /and aviso_abandono_at is null`\)/)
  // Modo cuenta por defecto.
  assert.match(src, /if \(opts\.forzarContar \|\| !avisoAbandonoActivo\(\)\) return \{ estado: 'ensayo'/)
  // Nada de correo, WhatsApp ni el contacto del cliente.
  assert.doesNotMatch(src, /core-email|whatsapp|email|telefono|enviarCorreo/i)
  const ruta = readFileSync(new URL('../app/api/cron/solicitudes-abandonadas/route.ts', import.meta.url), 'utf8')
  assert.match(ruta, /if \(!isCronAuthorized\(req\)\) return/)
  const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')) as { crons: { path: string }[] }
  assert.ok(vercel.crons.some((c) => c.path === '/api/cron/solicitudes-abandonadas'))
  assert.ok(vercel.crons.length <= 40, 'Vercel Pro: 40 crons por proyecto')
})

test('SQL de la fase B: columnas nuevas, idempotente, sin tocar el CHECK de completada', () => {
  const sql = readFileSync(new URL('../prisma/sql/2026-10-26_solicitud_datos_borrador.sql', import.meta.url), 'utf8')
  for (const c of ['borrador text', 'borrador_at timestamptz', 'ultimo_paso text', 'aviso_abandono_at timestamptz']) {
    assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${c}`))
  }
  assert.doesNotMatch(sql, /DROP CONSTRAINT|ALTER COLUMN|UPDATE /i)
})
