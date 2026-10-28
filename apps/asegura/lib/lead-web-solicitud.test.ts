// Cepo (lee el FUENTE): «oportunidad + solicitud» del lead web es ATÓMICO. Si la solicitud falla, la
// oportunidad recién creada no puede quedar viva ni contar para el tope; una `duplicada` no se toca.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const lead = readFileSync(new URL('./lead-web-solicitud.ts', import.meta.url), 'utf8')
const op = readFileSync(new URL('./oportunidad-seguimiento.ts', import.meta.url), 'utf8')
const crear = op.slice(op.indexOf('export async function crearOportunidad'), op.indexOf('export async function editarOportunidad'))

test('crearOportunidad ejecuta `trasCrear` DENTRO de su transacción, tras el tope y antes de confirmar', () => {
  const tx = crear.indexOf('$transaction(')
  const tope = crear.indexOf('opciones.topeDiario !== undefined')
  const insert = crear.indexOf('insert into oportunidades')
  const hook = crear.indexOf('await opciones.trasCrear(tx, o.id)')
  const ok = crear.indexOf("return { tipo: 'ok' as const, id: o.id }")
  assert.ok(tx > 0 && tope > tx && insert > tope && hook > insert && ok > hook, 'orden: transacción → tope → insert → trasCrear → ok')
  // La rama `duplicada` vuelve antes del insert: nunca llega al hook.
  const dup = crear.indexOf("return { tipo: 'duplicada' as const, id: ya.id, completada: false }")
  assert.ok(dup > 0 && dup < insert)
})

test('el lead web escribe la solicitud con `insertarSolicitud` dentro de `trasCrear`, no después', () => {
  const hook = lead.indexOf('trasCrear: async (tx, oportunidadId) =>')
  assert.ok(hook > 0)
  assert.ok(lead.indexOf('insertarSolicitud(tx,', hook) > hook)
  // `crearSolicitud` (transacción aparte) solo en la rama de una oportunidad que YA estaba.
  const dup = lead.indexOf("if (o.estado !== 'duplicada')")
  const cs = lead.indexOf('await crearSolicitud(')
  assert.ok(dup > 0 && cs > dup, 'crearSolicitud solo tras descartar todo lo que no sea duplicada')
  assert.equal(lead.split('await crearSolicitud(').length - 1, 1)
})

// ─── 25/10/2026: todos los ramos y fichas que ya existían (a CIEGAS) ─────────
const sol = readFileSync(new URL('./solicitud-datos.ts', import.meta.url), 'utf8')
// El ÚLTIMO SQL que redefine el CHECK (28/10/2026: + patinete). Un ramo nuevo exige un SQL nuevo y apuntar aquí.
const sqlRamos = readFileSync(new URL('../prisma/sql/2026-10-28_ramo_patinete.sql', import.meta.url), 'utf8')

test('un enlace del formulario web (actor `web`) NUNCA trae el DNI ni el nacimiento de la ficha', () => {
  const f = sol.slice(sol.indexOf('export async function solicitudPorToken'), sol.indexOf('export type ResultadoDocSolicitud'))
  const ciego = f.indexOf('if (enlaceACiegas(f.creadaPor)) return')
  const relleno = f.indexOf('await identidadFicha(f)')
  assert.ok(ciego > 0 && relleno > ciego, 'la salida a ciegas va ANTES de leer la identidad de la ficha')
  assert.match(sol, /creada_por as "creadaPor"/)
  assert.match(sol, /export \{ ACTOR_ENLACE_WEB \} from '\.\/enlace-ciego'/)
})

test('ficha que ya existía: campos a ciegas (NADA_CONOCIDO) en las dos ramas, y solo con el actor web', () => {
  assert.match(lead, /const campos = existente \? camposSolicitud\(ramo, NADA_CONOCIDO\)/)
  assert.match(lead, /await crearSolicitud\(correduriaId, oportunidadId, actor, null, \{ fichaCiega: existente \}\)/)
  assert.match(lead, /if \(actor !== ACTOR_ENLACE_WEB\) return/)
})

test('el SQL del CHECK de ramo admite exactamente RAMOS_OPORTUNIDAD', async () => {
  const { RAMOS_SOLICITUD } = await import('@central/module-seguros')
  const lista = /CHECK \(ramo IN \(([\s\S]*?)\)\)/.exec(sqlRamos)?.[1] ?? ''
  const enSql = [...lista.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort()
  assert.deepEqual(enSql, [...RAMOS_SOLICITUD].sort())
})

test('28/10/2026 patinete: el SQL añade el valor al enum (idempotente, fuera de la transacción) antes de usarlo', () => {
  const add = sqlRamos.search(/ALTER TYPE [a-z_]+\.tipo_seguro ADD VALUE IF NOT EXISTS 'patinete' BEFORE 'otros';/)
  const begin = sqlRamos.indexOf('BEGIN;')
  assert.ok(add >= 0, 'falta el ADD VALUE del enum')
  assert.ok(begin > add, 'el ADD VALUE va solo, ANTES del BEGIN')
})

test('código antes que SQL: el 22P02 del enum de ramo se degrada a 503 sin_migracion (lead web y alta a mano)', async () => {
  const { esEnumRamoSinMigrar } = await import('./ramo-sin-migrar.ts')
  assert.equal(esEnumRamoSinMigrar(new Error('Raw query failed. Code: `22P02`. Message: `invalid input value for enum tipo_seguro: "patinete"`')), true)
  assert.equal(esEnumRamoSinMigrar(new Error('Code: `22P02`. Message: `invalid input syntax for type uuid: "x"`')), false, 'otro 22P02 sigue siendo error')
  assert.equal(esEnumRamoSinMigrar(new Error('invalid input value for enum fuente_origen: "x"')), false)
  assert.match(lead, /esEnumRamoSinMigrar\(e\)/)
  const ruta = readFileSync(new URL('../app/api/operador/oportunidad/route.ts', import.meta.url), 'utf8')
  assert.match(ruta, /if \(esEnumRamoSinMigrar\(e\)\) return NextResponse\.json\(\{ estado: 'sin_migracion'/)
})
