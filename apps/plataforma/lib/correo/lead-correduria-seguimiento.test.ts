import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  RACHA_PARA_OFRECER, TIPOS_AUTOMATIZABLES, botonesCerrar, botonesOfertaAuto, botonesRecordatorio, botonesVolverManual, debeOfrecerAuto,
  decidirEnvioAuto, esTipoAutomatizable, interpretarPendientes, interpretarRecordar, leerDatosRecordatorio, lineaTrasCerrar, rachaTras,
  textoAvisoSeguimiento, textoRecordatorioCliente, topeAutoDiario,
} from './lead-correduria-seguimiento.ts'
import { decidirBotonClp } from './lead-correduria-peticion.ts'

const leer = (f: string) => readFileSync(join(import.meta.dirname, f), 'utf8')
const proceso = leer('lead-correduria-seguimiento-proceso.ts')
const pendiente = leer('lead-correduria-pendiente.ts')
const triaje = leer('triaje.ts')
const sql = readFileSync(join(import.meta.dirname, '..', '..', 'prisma', 'sql', '2026-10-19g_correduria_f5_auto.sql'), 'utf8')

const CHAT = '111'
const cb = { from: { id: 111 } }
const AUTO_OK = { tipo: 'repregunta', auto: true, enVentana: true, usadosHoy: 0, tope: 10 }

// ─── 🚨 La propuesta JAMÁS pasa a automático (cuatro llaves) ──────────────────

test('propuesta jamás automática: ni es automatizable, ni se envía sola, ni se ofrece', () => {
  assert.equal(esTipoAutomatizable('propuesta'), false)
  assert.equal(esTipoAutomatizable('tarificar'), false)
  assert.deepEqual([...TIPOS_AUTOMATIZABLES].sort(), ['peticion_datos', 'recordatorio_cliente', 'repregunta'])
  assert.deepEqual(decidirEnvioAuto({ ...AUTO_OK, tipo: 'propuesta' }), { modo: 'manual', motivo: 'no_automatizable' })
  assert.equal(debeOfrecerAuto({ tipo: 'propuesta', racha: 500, auto: false, ofertaAbierta: false }), false)
})

test('propuesta jamás automática: el botón 🔓 clp_aut:propuesta se rechaza antes de tocar la BD', () => {
  const d = decidirBotonClp(cb, 'aut', ['propuesta'], CHAT)
  assert.equal(d.ok, false)
  assert.equal(decidirBotonClp(cb, 'aut', ['repregunta'], CHAT).ok, true)
})

test('propuesta jamás automática: ni la BD lo admite (CHECK) ni el proceso lo intenta', () => {
  for (const m of sql.matchAll(/tipo IN \(([^)]*)\)/g)) assert.doesNotMatch(m[1], /propuesta/)
  assert.match(sql, /tipo\s+text PRIMARY KEY CHECK \(tipo IN \('peticion_datos', 'repregunta', 'recordatorio_cliente'\)\)/)
  // enviarSoloSiToca: lo primero es la guarda del tipo.
  const i = proceso.indexOf('export async function enviarSoloSiToca')
  const cuerpo = proceso.slice(i, proceso.indexOf('export async function registrarDecisionAuto'))
  assert.ok(cuerpo.indexOf('if (!esTipoAutomatizable(a.tipo)) return false') > 0)
  assert.ok(cuerpo.indexOf('if (!esTipoAutomatizable(a.tipo)) return false') < cuerpo.indexOf('UPDATE correduria_pendiente_tg'))
  // Activar exige además la lista explícita en el SQL.
  assert.match(proceso, /AND tipo IN \('peticion_datos', 'repregunta', 'recordatorio_cliente'\)/)
})

// ─── 🚨 Fuera de ventana no se avisa ni se envía ──────────────────────────────

test('fuera de ventana: nada sale solo', () => {
  assert.deepEqual(decidirEnvioAuto({ ...AUTO_OK, enVentana: false }), { modo: 'manual', motivo: 'fuera_de_ventana' })
})

test('fuera de ventana: la pasada del cron se va ANTES de preguntar a asegura o avisar', () => {
  const i = proceso.indexOf('export async function pasadaSeguimientoLeads')
  const cuerpo = proceso.slice(i, proceso.indexOf('// ─── Envío del recordatorio'))
  const ventana = cuerpo.indexOf("if (!enVentanaSeguimiento(ahora)) return { ...out, omitido: 'fuera_de_ventana' }")
  assert.ok(ventana > 0)
  assert.ok(ventana < cuerpo.indexOf('seguimientoLeadAsegura('))
  assert.ok(ventana < cuerpo.indexOf('tgAvisoBotones('))
  // Y el envío solo también mira la ventana.
  assert.match(proceso, /const enVentana = enVentanaSeguimiento\(ahora\)/)
})

// ─── Modo automático: solo con la pulsación, tope, racha ──────────────────────

test('el modo arranca apagado: lo que no se puede leer = manual', () => {
  assert.deepEqual(decidirEnvioAuto({ ...AUTO_OK, auto: false }), { modo: 'manual', motivo: 'apagado' })
  assert.match(proceso, /return f\?\.\[0\]\?\.auto === true/)
  assert.match(sql, /auto\s+boolean NOT NULL DEFAULT false/)
})

test('solo se enciende con 🔓 sobre una oferta abierta y con la racha intacta', () => {
  assert.match(proceso, /SET auto = true[\s\S]{0,200}WHERE tipo = \$\{d\.tipo\} AND oferta_abierta AND NOT auto AND racha >= \$\{RACHA_PARA_OFRECER\}/)
  // Ningún otro sitio pone auto = true.
  assert.equal((proceso.match(/auto = true/g) ?? []).length, 1)
  assert.doesNotMatch(pendiente, /auto = true/)
})

test('tope diario por tipo: al llegar, manual; el env inválido no lo abre', () => {
  assert.deepEqual(decidirEnvioAuto({ ...AUTO_OK, usadosHoy: 10 }), { modo: 'manual', motivo: 'tope' })
  assert.deepEqual(decidirEnvioAuto({ ...AUTO_OK, usadosHoy: 9 }), { modo: 'auto' })
  assert.equal(topeAutoDiario(undefined), 10)
  assert.equal(topeAutoDiario('abc'), 10)
  assert.equal(topeAutoDiario('0'), 10)
  assert.equal(topeAutoDiario('7'), 7)
  assert.equal(topeAutoDiario('9999'), 50)
})

test('racha: ✅ sin editar suma; editar o rechazar la reinicia; se ofrece a los 20', () => {
  assert.equal(rachaTras(19, 'aprobado'), 20)
  assert.equal(rachaTras(19, 'editado'), 0)
  assert.equal(rachaTras(19, 'rechazado'), 0)
  assert.equal(debeOfrecerAuto({ tipo: 'repregunta', racha: RACHA_PARA_OFRECER - 1, auto: false, ofertaAbierta: false }), false)
  assert.equal(debeOfrecerAuto({ tipo: 'repregunta', racha: RACHA_PARA_OFRECER, auto: false, ofertaAbierta: false }), true)
  assert.equal(debeOfrecerAuto({ tipo: 'repregunta', racha: 30, auto: true, ofertaAbierta: false }), false)
  assert.equal(debeOfrecerAuto({ tipo: 'repregunta', racha: 30, auto: false, ofertaAbierta: true }), false)
})

test('racha cableada: el ✅ editado reinicia, el ❌ reinicia y la edición reinicia', () => {
  assert.match(pendiente, /if \(r\.enviado\) await registrarDecision\(fila\.tipo, fila\.editado \? 'editado' : 'aprobado'\)/)
  assert.match(pendiente, /await registrarDecision\(filas\[0\]\.tipo, 'rechazado'\)/)
  assert.match(pendiente, /await registrarDecision\(filas\[0\]\.tipo, 'editado'\)/)
  assert.match(proceso, /SET racha = \$\{suma \? Prisma\.sql`racha \+ 1` : Prisma\.sql`0`\}/)
})

// ─── Botones: un solo uso, solo Alberto, sin datos personales ─────────────────

test('botones: ≤ 64 bytes, solo ids o tipos', () => {
  const todos = [...botonesRecordatorio(123456789012345), ...botonesCerrar(9), ...botonesOfertaAuto('recordatorio_cliente'), ...botonesVolverManual('peticion_datos')].flat()
  for (const b of todos) {
    const c = b.callback ?? ''
    assert.ok(Buffer.byteLength(c) <= 64, c)
    assert.match(c, /^clp_(env|edt|per|no|aut|man):[a-z_0-9]+$/)
  }
})

test('solo la persona autorizada; per con id numérico', () => {
  assert.equal(decidirBotonClp({ from: { id: 222 } }, 'per', ['5'], CHAT).ok, false)
  assert.equal(decidirBotonClp({ from: { id: 222 } }, 'aut', ['repregunta'], CHAT).ok, false)
  assert.equal(decidirBotonClp(cb, 'per', ['x'], CHAT).ok, false)
  assert.deepEqual(decidirBotonClp(cb, 'per', ['5'], CHAT), { ok: true, accion: 'per', id: 5, quien: '111' })
  assert.equal(decidirBotonClp(cb, 'man', ['propuesta'], CHAT).ok, false)
})

test('un solo uso: 🗑 y el envío solo reclaman con WHERE estado = pendiente', () => {
  assert.match(proceso, /WHERE id = \$\{d\.id\} AND tipo = 'recordatorio_cliente' AND estado = 'pendiente' AND caduca_at > now\(\)/)
  assert.match(proceso, /WHERE id = \$\{a\.id\} AND tipo = \$\{tipo\} AND estado = 'pendiente' AND caduca_at > now\(\)/)
})

// ─── Recordatorios ────────────────────────────────────────────────────────────

test('idempotente por hito: un INSERT con ON CONFLICT DO NOTHING y la clave del hito, nada si ya existía', () => {
  const i = proceso.indexOf('export async function pasadaSeguimientoLeads')
  const cuerpo = proceso.slice(i, proceso.indexOf('// ─── Envío del recordatorio'))
  assert.match(cuerpo, /claveHitoSeguimiento\(h\.hiloId, hito\)/)
  assert.match(cuerpo, /ON CONFLICT \(gmail_message_id, tipo\) DO NOTHING/)
  assert.match(cuerpo, /if \(!filas\.length\) continue/)
})

test('el cron solo recuerda con el buzón leído entero y sin errores, y nunca en modo sombra', () => {
  assert.match(triaje, /buzonAlDia = !quedanMas && uidDiferido === null && stats\.errores === 0/)
  assert.match(triaje, /if \(!DRY_RUN\(\) && buzonAlDia && Date\.now\(\) - t0 < SEGUIMIENTO_HASTA_MS\)/)
})

test('asegura caído = «no se sabe», nunca «no hay nada que recordar»', () => {
  assert.equal(interpretarPendientes(503, { estado: 'sin_migracion' }).estado, 'no_se_sabe')
  assert.equal(interpretarPendientes(502, null).estado, 'no_se_sabe')
  const ok = interpretarPendientes(200, { estado: 'ok', hilos: [{ hiloId: '1', clienteId: '0e1b6b6e-1111-4222-8333-444455556666', raiz: '<a@b>', pila: 'Juan', ramos: ['auto'], oportunidadIds: [], seguimiento: { estadoDatos: 'pedida', recordatoriosEnviados: 0 } }] })
  assert.equal(ok.estado, 'ok')
  // recordatoriosEnviados ausente → null (no se sabe).
  const sin = interpretarPendientes(200, { estado: 'ok', hilos: [{ hiloId: '1', clienteId: '0e1b6b6e-1111-4222-8333-444455556666', seguimiento: {} }] })
  assert.equal(sin.estado === 'ok' && sin.hilos[0].seguimiento.recordatoriosEnviados, null)
})

test('lo desconocido al enviar es «incierto», nunca «no salió»; ya_no_toca no sale', () => {
  assert.equal(interpretarRecordar(500, null).estado, 'incierto')
  assert.equal(interpretarRecordar(409, { estado: 'ya_no_toca' }).estado, 'no_enviado')
  assert.equal(interpretarRecordar(200, { estado: 'enviado', historial: true }).estado, 'enviado')
  assert.match(lineaTrasCerrar(500, null), /No sé si se ha cerrado/)
})

test('Telegram sin datos personales: nombre de pila, ramos y porqué; nada de email', () => {
  const t = textoAvisoSeguimiento({ id: 7, datos: { pila: 'Juan', ramos: ['auto'], etapa: 'datos_1', asunto: 'Seguro coche' }, borrador: 'Hola Juan:' })
  assert.match(t, /48 h/)
  assert.doesNotMatch(t, /@(?!grupoasegura)/)
  assert.match(textoAvisoSeguimiento({ id: 7, datos: { pila: null, ramos: [], etapa: 'datos_cerrar', asunto: '' }, borrador: null }), /PERDIDA/)
})

test('el recordatorio lleva el pie legal del mediador y no pide datos sensibles', () => {
  const t = textoRecordatorioCliente({ pila: 'Juan Pérez', etapa: 'datos_1', ramos: ['auto'] })
  assert.match(t, /^Hola Juan:/)
  assert.match(t, /DGSFP|CS-F/)
  assert.doesNotMatch(t, /DNI|IBAN/)
})

test('datos del pendiente: sin email, y legibles aun purgados', () => {
  const d = { hiloId: '12', clienteId: '0e1b6b6e-1111-4222-8333-444455556666', etapa: 'datos_2', ancla: '2026-10-19T10:00:00.000Z', ramos: ['hogar'] }
  assert.equal(leerDatosRecordatorio(d)?.etapa, 'datos_2')
  assert.equal(leerDatosRecordatorio({ ...d, etapa: 'propuesta' }), null)
  assert.equal(leerDatosRecordatorio({ ...d, hiloId: 'x' }), null)
})

// ─── 🚨 El cliente que CONTESTA sin que el triaje lo case con su hilo no recibe recordatorio ─────────────────────────

test('silencio: «callado» SOLO con huellas, referencia, buzón leído y cero correos suyos; lo demás no envía', async () => {
  const { decidirSilencioCliente } = await import('./lead-correduria-seguimiento.ts')
  const ahora = new Date('2026-10-19T10:00:00Z')
  const base = { huellas: ['a'.repeat(64)], referencia: '2026-10-17T09:00:00Z', entrantes: 0, cursorAt: '2026-10-19T09:55:00Z', ahora }
  assert.deepEqual(decidirSilencioCliente(base), { estado: 'callado' })
  assert.deepEqual(decidirSilencioCliente({ ...base, entrantes: 1 }), { estado: 'ha_escrito', n: 1 })
  // Ha escrito manda aunque el buzón vaya atrasado.
  assert.equal(decidirSilencioCliente({ ...base, entrantes: 2, cursorAt: null }).estado, 'ha_escrito')
  for (const [k, v, motivo] of [
    ['huellas', null, 'sin_remitente'], ['huellas', [], 'sin_remitente'], ['referencia', null, 'sin_referencia'],
    ['entrantes', null, 'sin_leer'], ['cursorAt', null, 'buzon_atrasado'], ['cursorAt', '2026-10-19T09:30:00Z', 'buzon_atrasado'],
  ] as const) {
    assert.deepEqual(decidirSilencioCliente({ ...base, [k]: v }), { estado: 'no_se_sabe', motivo }, `${k}=${String(v)}`)
  }
})

test('silencio: la huella de asegura es la MISMA que calcula el SQL de plataforma sobre correo_triaje', async () => {
  const { huellaRemitente } = await import('@central/module-seguros/huella-remitente')
  const { createHash } = await import('node:crypto')
  // encode(sha256(convert_to(lower(btrim(x)), 'UTF8')), 'hex')
  assert.equal(huellaRemitente('  Ana.Perez@Gmail.com '), createHash('sha256').update('ana.perez@gmail.com').digest('hex'))
  assert.equal(huellaRemitente('no es un email'), null)
  assert.match(proceso, /encode\(sha256\(convert_to\(lower\(btrim\(c\.remitente\)\), 'UTF8'\)\), 'hex'\) = ANY\(\$\{huellas\}::text\[\]\)/)
  // Mira TODO lo que entró (no solo lo casado con el hilo) y por llegada o por fecha.
  assert.match(proceso, /FROM correo_triaje c\s+WHERE r\.t IS NOT NULL\s+AND \(c\.created_at > r\.t OR c\.fecha > r\.t\)/)
})

test('silencio cableado: recordatorio (✅ y automático) comprueba ANTES de llamar a asegura; ha escrito = no sale', () => {
  const i = proceso.indexOf('export async function enviarRecordatorioReclamado')
  const cuerpo = proceso.slice(i, proceso.indexOf('/** ✏️ guardado de un recordatorio'))
  const chequeo = cuerpo.indexOf('await silencioCliente({ huellas: datos.remitentes, desde: datos.ancla })')
  assert.ok(chequeo > 0, 'falta la comprobación justo antes de mandar')
  assert.ok(chequeo < cuerpo.indexOf("accion: 'recordar'"), 'la comprobación va ANTES del envío')
  assert.match(cuerpo, /if \(s\.estado === 'ha_escrito'\) \{[\s\S]{0,400}return \{ enviado: false/)
  assert.match(cuerpo, /if \(s\.estado === 'no_se_sabe'\) \{[\s\S]{0,700}return \{ enviado: false/)
})

test('silencio cableado: en automático es OBLIGATORIO y va antes de reclamar; la pasada no avisa a quien escribió', () => {
  const i = proceso.indexOf('export async function enviarSoloSiToca')
  const cuerpo = proceso.slice(i, proceso.indexOf('export async function registrarDecisionAuto'))
  assert.match(cuerpo, /silencio: \(\) => Promise<Silencio>/, 'el parámetro no es opcional')
  const chequeo = cuerpo.indexOf("(await a.silencio().catch((): Silencio => ({ estado: 'no_se_sabe', motivo: 'sin_leer' }))).estado !== 'callado') return false")
  assert.ok(chequeo > 0 && chequeo < cuerpo.indexOf("SET estado = 'enviando'"), 'sin «callado» no se reclama ni se envía solo')
  assert.match(cuerpo, /if \(r\.sinEnviar === 'no_se_sabe'\) return false/)
  // La petición/repregunta automática compara con el correo suyo al que contesta.
  assert.match(pendiente, /silencio: \(\) => silencioCliente\(\{ huellas: huella \? \[huella\] : null, trasMensaje: a\.datos\.messageId \}\)/)
  const p = proceso.indexOf('export async function pasadaSeguimientoLeads')
  const pasada = proceso.slice(p, proceso.indexOf('// ─── Envío del recordatorio'))
  const s = pasada.indexOf('await silencioCliente({ huellas: h.remitentes, desde: hito.ancla }, ahora)')
  assert.ok(s > 0 && s < pasada.indexOf("VALUES ('recordatorio_cliente', ${claveHitoSeguimiento(h.hiloId, hito)}, ${JSON.stringify(datos)}"), 'se mira antes de crear el aviso con ✅')
  assert.match(pasada, /if \(silencio\.estado === 'no_se_sabe'\) \{ out\.sinComprobar = \(out\.sinComprobar \?\? 0\) \+ 1; continue \}/)
})

test('huellas del pendiente: solo hex de 64, y sin ninguna = null (no se sabe), nunca []', async () => {
  const { leerHuellas } = await import('./lead-correduria-seguimiento.ts')
  assert.equal(leerHuellas(undefined), null)
  assert.equal(leerHuellas([]), null)
  assert.equal(leerHuellas(['x', 'ana@x.es']), null)
  assert.deepEqual(leerHuellas(['b'.repeat(64), 'b'.repeat(64)]), ['b'.repeat(64)])
})
