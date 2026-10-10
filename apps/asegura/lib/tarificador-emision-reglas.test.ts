// Cepos de la emisión asistida, lado asegura (10/10/2026). `node --test`. Sin datos personales.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { firmarAutorizacionEmision, generarTokenEmision, hashCortoEmision } from '@central/module-tarificacion'
import {
  MENSAJE_EMISION_INCIERTA,
  autorizacionSinResolver,
  autorizadorEmision,
  comprobarFirmaAutorizar,
  estadoTrasResultado,
  iniciales,
  leerCanje,
  leerResultadoEmision,
  mensajeEmisionTardia,
  mensajePrimaDistinta,
} from './tarificador-emision-reglas.ts'

const T = '11111111-1111-4111-8111-111111111111'
const DIR = import.meta.dirname
const fuente = (rel: string) => readFileSync(join(DIR, rel), 'utf8')

test('autorizador: solo un id numérico configurado; sin env, nadie', () => {
  assert.equal(autorizadorEmision({ TARIFICADOR_EMISION_TELEGRAM_ID: '123456789' }), '123456789')
  assert.equal(autorizadorEmision({}), null)
  assert.equal(autorizadorEmision({ TARIFICADOR_EMISION_TELEGRAM_ID: '' }), null)
  assert.equal(autorizadorEmision({ TARIFICADOR_EMISION_TELEGRAM_ID: 'alberto' }), null)
})

test('cuerpos del worker: pre_emision exige prima en céntimos enteros', () => {
  assert.equal(leerResultadoEmision({ trabajoId: T, resultado: 'pre_emision', primaCents: 34755 }).ok, true)
  for (const primaCents of [0, -1, 347.55, '34755', null]) assert.equal(leerResultadoEmision({ trabajoId: T, resultado: 'pre_emision', primaCents }).ok, false, String(primaCents))
  assert.equal(leerResultadoEmision({ trabajoId: 'x', resultado: 'pre_emision', primaCents: 1 }).ok, false)
  assert.equal(leerResultadoEmision({ trabajoId: T, resultado: 'ok' }).ok, false)
})

test('canje: token con forma, en el CUERPO; sin token → 400', () => {
  const token = generarTokenEmision()
  assert.equal(leerCanje({ trabajoId: T, token, primaCents: 100 }).ok, true)
  assert.equal(leerCanje({ trabajoId: T, primaCents: 100 }).ok, false)
  assert.equal(leerCanje({ trabajoId: T, token: 'corto', primaCents: 100 }).ok, false)
})

test('tras el clic: solo «emitida» CON nº de póliza es emitido; el resto, requiere_humano y nunca reintento', () => {
  assert.equal(estadoTrasResultado({ trabajoId: T, resultado: 'emitida', numeroPoliza: 'ABC123456', captura: null }).estado, 'emitido')
  const sinNumero = estadoTrasResultado({ trabajoId: T, resultado: 'emitida', numeroPoliza: null, captura: null })
  assert.equal(sinNumero.estado, 'requiere_humano')
  assert.equal(sinNumero.resultadoAutorizacion, 'incierto')
  assert.equal(sinNumero.error?.tipo, 'emision')
  assert.equal(estadoTrasResultado({ trabajoId: T, resultado: 'incierto', motivo: 'x', captura: null }).estado, 'requiere_humano')
  assert.equal(estadoTrasResultado({ trabajoId: T, resultado: 'no_emitida', motivo: 'x', captura: null }).resultadoAutorizacion, 'fallo')
})

test('un nº de póliza raro no se guarda (null = no se pudo leer)', () => {
  const r = leerResultadoEmision({ trabajoId: T, resultado: 'emitida', numeroPoliza: 'Póliza emitida correctamente' })
  assert.ok(r.ok && r.r.resultado === 'emitida' && r.r.numeroPoliza === null)
})

test('textos: iniciales y prima distinta en formato español', () => {
  assert.equal(iniciales('Comunidad', 'de Propietarios Ejemplo'), 'C.D.P.')
  assert.equal(iniciales(null, null), '—')
  assert.match(mensajePrimaDistinta(34756, 34755), /347,56€.*347,55€/)
})

test('el SQL del canje exige lo mismo que decidirCanje (token, trabajo, sin consumir, sin caducar, mismo hash)', () => {
  const src = fuente('tarificador-emision.ts')
  const canje = src.slice(src.indexOf('export async function canjearEmision'), src.indexOf('// ─── 4.'))
  const update = canje.match(/update seguros\.tarificacion_emision_autorizacion set consumido_at = now\(\)\s*\n\s*where ([^`]+)`/)
  assert.ok(update, 'falta el UPDATE atómico del canje')
  for (const c of ['token_hash = ${tokenHash}', 'trabajo_id = ${t.id}::uuid', 'consumido_at is null', 'expira_at > now()', 'hash_datos = ${hashDatos}']) {
    assert.ok(update![1].includes(c), `el canje no exige ${c}`)
  }
  assert.match(canje, /if \(ok === 1\) return \{ ok: true/, 'solo 1 fila actualizada autoriza')
  // La entrega del token es UNA: token_hash IS NULL en el UPDATE.
  assert.match(src, /set token_hash = \$\{hashTokenEmision\(token\)\}, entregado_at = now\(\)\s*\n\s*where a\.id = \$\{a\.id\}::uuid and a\.token_hash is null/)
})

test('el token nunca va a un log ni a un mensaje', () => {
  for (const rel of ['tarificador-emision.ts', '../app/api/tarificador/emision/canje/route.ts', '../app/api/tarificador/trabajo/[id]/route.ts']) {
    const src = fuente(rel)
    for (const l of src.split('\n').filter((x) => /console\.|registrarErrorCartera\(|JSON\.stringify\(\{ tipo/.test(x))) {
      assert.ok(!/token|body|\bl\b\)/.test(l.replace(/l\.trabajoId/g, '')), `${rel}: una línea de log/mensaje nombra el token o el cuerpo: ${l.trim()}`)
    }
  }
})

test('la autorización comprueba from.id contra la env, la caducidad y re-comprueba el presupuesto', () => {
  const src = fuente('tarificador-emision.ts')
  const aut = src.slice(src.indexOf('export async function autorizarEmision'), src.indexOf('// ─── 6.'))
  assert.match(aut, /autorizadorEmision\(env\)/)
  assert.match(aut, /String\(e\.autorizadoPor\)\.trim\(\) !== autorizador/)
  assert.match(aut, /decidirAutorizacion\(/)
  assert.match(aut, /precondicionesEmision\(/)
  assert.match(aut, /on conflict \(trabajo_id\) do nothing/, 'doble pulsación = una sola autorización')
})

test('emitir no toca presupuesto.emitido_at (la anulación de la póliza vieja es MANUAL)', () => {
  const src = fuente('tarificador-emision.ts').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')
  assert.ok(!/set[^`]*emitido_at/i.test(src), 'tarificador-emision.ts escribe emitido_at')
})

// ─── Revisión de seguridad (10/10/2026) ──────────────────────────────────────

const SECRETO = 'w'.repeat(40)
const AHORA = 1_760_000_000_000
const H = 'd'.repeat(64)
const camposOk = { trabajoId: T, decision: 'ok' as const, hashCorto: hashCortoEmision(H), autorizadoPor: '123456789', ts: Math.floor(AHORA / 1000) }

test('autorizar: con el Bearer de operador y SIN firma, o con firma mala/vieja → 403; sin secreto → 503; firmado → pasa', () => {
  // Lo que mandaría quien solo tiene ASEGURA_OPERADOR_SECRET: el cuerpo de antes, sin firma.
  assert.deepEqual(comprobarFirmaAutorizar(camposOk, SECRETO, AHORA), { ok: false, status: 403, motivo: 'firma no válida (sin_firma)' })
  assert.equal(comprobarFirmaAutorizar({ ...camposOk, firma: 'f'.repeat(64) }, SECRETO, AHORA).ok, false)
  assert.equal((comprobarFirmaAutorizar({ ...camposOk, firma: 'f'.repeat(64) }, SECRETO, AHORA) as { status: number }).status, 403)
  const firmado = { ...camposOk, firma: firmarAutorizacionEmision(SECRETO, camposOk) }
  assert.equal((comprobarFirmaAutorizar({ ...firmado, autorizadoPor: '987654321' }, SECRETO, AHORA) as { status: number }).status, 403, 'from.id cambiado')
  assert.equal((comprobarFirmaAutorizar({ ...firmado, decision: 'no' }, SECRETO, AHORA) as { status: number }).status, 403, 'decisión cambiada')
  assert.equal((comprobarFirmaAutorizar(firmado, SECRETO, AHORA + 5 * 60_000) as { status: number }).status, 403, 'firma vieja')
  assert.equal((comprobarFirmaAutorizar(firmado, null, AHORA) as { status: number }).status, 503)
  assert.equal((comprobarFirmaAutorizar({ trabajoId: 'x' }, SECRETO, AHORA) as { status: number }).status, 400)
  assert.deepEqual(comprobarFirmaAutorizar(firmado, SECRETO, AHORA), { ok: true, campos: camposOk })
})

test('ruta autorizar: Bearer Y firma (requireSecret sin fallback) ANTES de tocar la BD; los campos salen de la firma', () => {
  const src = fuente('../app/api/operador/tarificador/emision/autorizar/route.ts')
  const i = (x: string) => src.indexOf(x)
  assert.ok(i('operadorAutorizado(req)') > -1 && i('operadorAutorizado(req)') < i('comprobarFirmaAutorizar('))
  assert.match(src, /requireSecret\(ENV_FIRMA_AUTORIZACION\)/)
  assert.ok(!/requireSecret\(ENV_FIRMA_AUTORIZACION,/.test(src), 'sin fallback')
  assert.match(src, /if \(!f\.ok\) return NextResponse\.json\(\{ estado: 'rechazado', motivo: f\.motivo \}, \{ status: f\.status \}\)/)
  for (const x of ['correduriaUnica(', 'autorizarEmision(']) assert.ok(i('if (!f.ok)') < i(x), `${x} antes de comprobar la firma`)
  assert.match(src, /= f\.campos/, 'trabajo/decisión/hash/from.id salen de lo FIRMADO, no del cuerpo suelto')
  assert.ok(!/body\?\.(trabajoId|decision|autorizadoPor)/.test(src), 'la ruta no lee campos sin firmar')
  const aut = fuente('tarificador-emision.ts')
  const fn = aut.slice(aut.indexOf('export async function autorizarEmision'), aut.indexOf('// ─── 6.'))
  assert.match(fn, /hashCortoEmision\(t\.emision_hash_datos\) !== String\(e\.hashCorto\)/, 'el botón va atado a la pantalla previa enseñada')
})

test('lease vencido tras canjear → INCIERTO; emitida tardía se guarda; no se pide otra con una autorización consumida sin resolver', () => {
  assert.equal(autorizacionSinResolver({ consumidoAt: new Date(), resultado: null }), true)
  assert.equal(autorizacionSinResolver({ consumidoAt: new Date(), resultado: 'incierto' }), true)
  for (const r of ['emitida', 'hash_distinto', 'caducada', 'rechazado_canje', 'fallo']) assert.equal(autorizacionSinResolver({ consumidoAt: new Date(), resultado: r }), false, r)
  assert.equal(autorizacionSinResolver({ consumidoAt: null, resultado: null }), false, 'token entregado sin canjear: no hubo clic')
  assert.equal(autorizacionSinResolver(null), false)
  assert.match(MENSAJE_EMISION_INCIERTA, /^INCIERTO: la póliza puede estar emitida, revisar ePAC antes de cualquier acción/)
  assert.match(mensajeEmisionTardia('041234567'), /póliza 041234567/)
  assert.match(mensajeEmisionTardia(null), /^INCIERTO/)

  const barrido = fuente('tarificador.ts')
  const mf = barrido.slice(barrido.indexOf('async function marcarFallo'), barrido.indexOf('// ─── Barrido'))
  assert.match(mf, /incierta = autorizacionSinResolver\(/)
  assert.match(mf, /incierta \? `\$\{MENSAJE_EMISION_INCIERTA\}/)
  assert.match(mf, /set resultado = 'incierto' where id = \$\{a!\.id\}::uuid and resultado is null/)

  const src = fuente('tarificador-emision.ts')
  const reg = src.slice(src.indexOf('export async function registrarResultadoEmision'), src.indexOf('// ─── 5.'))
  const tardia = reg.search(/\n {4}if \(t\.estado === 'requiere_humano' && r\.resultado === 'emitida' && a && autorizacionSinResolver\(\{ consumidoAt: a\.consumido_at, resultado: a\.resultado \}\)\) \{/)
  assert.ok(tardia > -1 && tardia < reg.indexOf("if (t.estado !== 'en_curso')"), 'la emitida tardía se mira ANTES del 409 por estado')
  assert.match(reg.slice(tardia), /set emision_numero_poliza = coalesce\(\$\{r\.numeroPoliza\}/)

  const sol = src.slice(src.indexOf('export async function solicitarEmision'), src.indexOf('// ─── 2.'))
  assert.match(sol, /where not exists \([\s\S]*a\.consumido_at is not null and \(a\.resultado is null or a\.resultado = 'incierto'\)\)/)
  assert.match(sol, /if \(!filas\[0\]\) return rechazo\(409, 'emision_incierta_sin_resolver/)
})

test('worker: la autorización se busca solo por trabajo_id; el estado vivo se exige al ENTREGAR el token', () => {
  const src = fuente('tarificador-emision.ts')
  const fn = src.slice(src.indexOf('export async function emisionParaWorker'), src.indexOf('// ─── 3.'))
  const sel = fn.match(/select a\.id::text as id[\s\S]*?`/)![0]
  assert.match(sel, /where a\.trabajo_id = \$\{trabajoId\}::uuid`$/)
  assert.ok(!/en_curso|lease_hasta/.test(sel), 'la consulta de la autorización no filtra por en_curso/lease')
  assert.match(fn, /and exists \(select 1 from seguros\.tarificacion_trabajos t\s*\n\s*where t\.id = a\.trabajo_id and t\.estado = 'en_curso' and t\.lease_hasta > now\(\)\)/)
})

test('canje: re-comprueba el presupuesto (aceptado, no retirado/caducado/emitido, misma prima) en la MISMA transacción antes de consumir', () => {
  const src = fuente('tarificador-emision.ts')
  const canje = src.slice(src.indexOf('export async function canjearEmision'), src.indexOf('// ─── 4.'))
  const tx = canje.indexOf('prisma.$transaction(')
  const pre = canje.indexOf('precondicionesEmision(')
  const consumo = canje.indexOf('set consumido_at = now()')
  assert.ok(tx > -1 && tx < pre && pre < consumo, 'precondiciones dentro de la transacción y antes del consumo OK')
  assert.match(canje, /for share/)
  assert.match(canje, /if \(d\.ok && !motivoPresupuesto\) \{/)
  assert.match(canje, /primaCoincide\(e\.primaCents, pre\.primaCents\)/)
})

test('SQL: trigger que impide des-consumir una autorización o cambiar su token_hash (idempotente)', () => {
  const sql = fuente('../prisma/sql/2026-10-10_tarificador_emision.sql')
  assert.match(sql, /CREATE OR REPLACE FUNCTION seguros\.tarificacion_emision_autorizacion_inmutable\(\)/)
  assert.match(sql, /IF OLD\.consumido_at IS NOT NULL AND NEW\.consumido_at IS DISTINCT FROM OLD\.consumido_at THEN/)
  assert.match(sql, /IF OLD\.token_hash IS NOT NULL AND NEW\.token_hash IS DISTINCT FROM OLD\.token_hash THEN/)
  assert.match(sql, /DROP TRIGGER IF EXISTS tarificacion_emision_autorizacion_inmutable ON seguros\.tarificacion_emision_autorizacion;/)
  assert.match(sql, /BEFORE UPDATE ON seguros\.tarificacion_emision_autorizacion/)
})
