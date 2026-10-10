// Guardián del BORRADO LÓGICO de las pólizas aportadas en `apps/asegura-portal` (10/10/2026).
// `node --test` (gate en CI vía `pnpm test:guardia`).
//
// ─── Por qué existe ──────────────────────────────────────────────────────────
// Alberto: «lo que el cliente sube puede modificarlo y eliminarlo, pero NADA se pierde: todo queda
// registrado para poder restaurar si se equivoca». Desde hoy «quitar» pone `eliminada_en` en vez de
// borrar la fila. El modo de fallo de un borrado lógico es siempre el mismo y es silencioso: UN
// lector que olvida el filtro vuelve a enseñar la póliza que la persona quitó —en la bóveda, en la
// hoja QR que lee cualquiera con el papel, en el selector del parte— o vuelve a avisar de ella, y
// nada falla. Por eso este cepo mira CADA llamada a `portalPolizaDeclarada`, no cada fichero.
//
// Brazos:
//   1. Toda lectura/escritura condicionada de `portalPolizaDeclarada` lleva el filtro de eliminadas
//      (`DECLARADA_NO_ELIMINADA`, `DECLARADA_ELIMINADA` o `eliminadaEn` escrito) DENTRO de su
//      llamada. `create` queda fuera (nace viva). `findUnique`/`update`/`upsert`/`delete`/
//      `deleteMany` están prohibidos: no admiten el filtro o borran de verdad.
//   2. Ninguna lectura de una RELACIÓN `polizas` (desde identidad o bien) se salta el filtro.
//   3. El DELETE marca (no borra), aparta las obligaciones y escribe el historial; el PATCH escribe
//      el historial en la misma transacción; el restaurar va por identidad y por eliminada.
//   4. La migración y el schema dicen lo mismo, y el historial es append-only y sobrevive a la póliza.
//   5. La bóveda monta «Eliminadas» con su botón.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const APP = 'apps/asegura-portal'

/** Sin comentarios: un `eliminadaEn` en un comentario no filtra nada. */
const sinComentarios = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const leer = (f: string) => readFileSync(join(ROOT, f), 'utf8')

/** Código de la app (también lo NO commiteado: el fichero nuevo es el que hay que cazar). */
function ficheros(): string[] {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', `${APP}/app`, `${APP}/lib`], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
}

/** El texto de los argumentos de la llamada que abre en `abre` (índice del `(`), con paréntesis equilibrados. */
function argumentos(src: string, abre: number): string {
  let prof = 0
  for (let i = abre; i < src.length; i++) {
    if (src[i] === '(') prof++
    else if (src[i] === ')') {
      prof--
      if (prof === 0) return src.slice(abre + 1, i)
    }
  }
  return src.slice(abre + 1)
}

const LLAMADA = /portalPolizaDeclarada\s*\.\s*(\w+)\s*\(/g
const FILTRO = /DECLARADA_NO_ELIMINADA|DECLARADA_ELIMINADA|eliminadaEn/
const SIN_FILTRO_POSIBLE = new Set(['create', 'createMany'])
const PROHIBIDOS = new Set(['findUnique', 'findUniqueOrThrow', 'update', 'upsert', 'delete', 'deleteMany'])

type Llamada = { fichero: string; metodo: string; args: string }

function llamadas(): Llamada[] {
  const out: Llamada[] = []
  for (const f of ficheros()) {
    const src = sinComentarios(leer(f))
    for (const m of src.matchAll(LLAMADA)) {
      const abre = (m.index ?? 0) + m[0].length - 1
      out.push({ fichero: f, metodo: m[1], args: argumentos(src, abre) })
    }
  }
  return out
}

/** Separado para poder verlo FALLAR contra llamadas trucadas (último test). */
function infractores(ls: Llamada[]): string[] {
  return ls
    .filter((l) => PROHIBIDOS.has(l.metodo) || (!SIN_FILTRO_POSIBLE.has(l.metodo) && !FILTRO.test(l.args)))
    .map((l) => `${l.fichero}: portalPolizaDeclarada.${l.metodo}(…)`)
}

test('el cepo ve de verdad las consultas (si no encuentra ninguna, no vigila nada)', () => {
  const ls = llamadas()
  // Hoy hay más de 20 entre la bóveda, la hoja, los partes, el calendario y las rutas. Si de golpe
  // salen pocas, la regex se ha quedado ciega (un renombrado del modelo, un cambio de forma).
  assert.ok(ls.filter((l) => !SIN_FILTRO_POSIBLE.has(l.metodo)).length >= 20, `solo ${ls.length} llamadas vistas`)
})

test('🚨 toda consulta de portalPolizaDeclarada filtra las ELIMINADAS dentro de su llamada', () => {
  const malos = infractores(llamadas())
  assert.deepEqual(
    malos,
    [],
    'Estas llamadas no filtran las pólizas que la persona QUITÓ (o usan un método que no admite el ' +
      'filtro). Volverían a enseñarlas o a avisar de ellas sin que nada falle. Añade ' +
      '`...DECLARADA_NO_ELIMINADA` (lib/declaradas-eliminadas.ts) al `where`:\n  - ' +
      malos.join('\n  - '),
  )
})

test('ninguna lectura de la relación `polizas` (identidad o bien) se salta el filtro', () => {
  const malos: string[] = []
  for (const f of ficheros()) {
    const src = sinComentarios(leer(f))
    for (const m of src.matchAll(/portal(Identidad|Bien)\s*\.\s*\w+\s*\(/g)) {
      const args = argumentos(src, (m.index ?? 0) + m[0].length - 1)
      if (/\bpolizas\s*:/.test(args) && !FILTRO.test(args)) malos.push(`${f}: portal${m[1]}`)
    }
  }
  assert.deepEqual(malos, [], `Relación \`polizas\` leída sin filtrar eliminadas:\n  - ${malos.join('\n  - ')}`)
})

test('el DELETE NO borra: marca eliminadaEn por identidad, aparta las obligaciones y escribe historial', () => {
  const src = sinComentarios(leer(`${APP}/app/api/polizas/[id]/route.ts`))
  const del = src.slice(src.indexOf('export async function DELETE'))
  assert.doesNotMatch(del, /portalPolizaDeclarada\s*\.\s*deleteMany/, 'el DELETE vuelve a borrar de verdad')
  assert.match(
    del,
    /portalPolizaDeclarada\.updateMany\(\{\s*where:\s*\{\s*id,\s*identidadId:\s*identidad\.id,\s*\.\.\.DECLARADA_NO_ELIMINADA\s*\},\s*data:\s*\{\s*eliminadaEn:/,
    'la marca va por updateMany con la identidad DENTRO del where y solo sobre una no eliminada',
  )
  // Las obligaciones se LEEN (para guardarlas) antes de quitarlas, y se guardan en el historial.
  const lee = del.indexOf('portalObligacion.findMany')
  const quita = del.indexOf('portalObligacion.deleteMany')
  assert.ok(lee !== -1 && quita !== -1 && lee < quita, 'las obligaciones se guardan ANTES de apartarlas')
  assert.match(del, /obligaciones:\s*guardarObligaciones\(/)
  assert.match(del, /accion:\s*'eliminada'/)
  // La marca y el historial, después de congelar los partes y en la misma transacción.
  assert.ok(del.indexOf('polizaDesligadaAt') < del.indexOf('eliminadaEn: ahora'), 'congelar antes de marcar')
  assert.match(del, /\$transaction/)
})

test('el PATCH escribe el historial de lo que cambió, en la misma transacción que la escritura', () => {
  const src = sinComentarios(leer(`${APP}/app/api/polizas/[id]/route.ts`))
  const patch = src.slice(src.indexOf('export async function PATCH'), src.indexOf('export async function DELETE'))
  const tx = patch.indexOf('$transaction')
  assert.notEqual(tx, -1, 'el PATCH tiene que ir en transacción')
  assert.ok(patch.indexOf('tx.portalPolizaDeclarada.updateMany') > tx)
  assert.match(patch, /cambiosDeEdicion\(/, 'el diff es el puro, con test (solo campos cambiados, lista blanca)')
  assert.match(patch, /tx\.portalPolizaDeclaradaHistorial\.create\([\s\S]*accion:\s*'editada'/)
})

test('el alta deja su línea «creada» en el historial', () => {
  const src = sinComentarios(leer(`${APP}/app/api/polizas/route.ts`))
  assert.equal((src.match(/accion:\s*'creada'/g) ?? []).length, 2, 'las dos altas (documento y a mano) registran')
})

test('restaurar: solo el titular, por identidad DENTRO del where, solo una eliminada, y lo registra', () => {
  const src = sinComentarios(leer(`${APP}/app/api/polizas/[id]/restaurar/route.ts`))
  assert.match(src, /export async function POST/)
  assert.match(src, /requireIdentidad\(\)/)
  assert.match(
    src,
    /portalPolizaDeclarada\.updateMany\(\{\s*where:\s*\{\s*id,\s*identidadId:\s*identidad\.id,\s*\.\.\.DECLARADA_ELIMINADA\s*\},\s*data:\s*\{\s*eliminadaEn:\s*null/,
  )
  assert.match(src, /accion:\s*'restaurada'/)
  // Las obligaciones vuelven con la identidad de la SESIÓN, no la del JSON guardado.
  assert.match(src, /obligacionesParaRestaurar\([^)]*identidadId:\s*identidad\.id/s)
  // Los bienes que se reenganchan se comprueban con la identidad dentro del where.
  assert.match(src, /portalBien\.findMany\(\{\s*where:\s*\{\s*id:\s*\{\s*in:\s*bienes\s*\},\s*identidadId:\s*identidad\.id\s*\}/)
})

test('la migración: aditiva, historial append-only, poliza_id SIN FK y REVOKE al CRM', () => {
  const sqlCrudo = leer(`${APP}/prisma/sql/2026-10-10_declaradas_borrado_logico.sql`)
  const sql = sqlCrudo.replace(/--.*$/gm, '')
  assert.match(sql, /ADD COLUMN IF NOT EXISTS eliminada_en timestamptz/)
  assert.match(sql, /CREATE TABLE IF NOT EXISTS seguros\.portal_poliza_declarada_historial/)
  const tabla = sql.slice(sql.indexOf('portal_poliza_declarada_historial ('), sql.indexOf(');', sql.indexOf('portal_poliza_declarada_historial (')))
  assert.match(tabla, /poliza_id\s+uuid NOT NULL,/, 'poliza_id sin REFERENCES: el rastro sobrevive al borrado físico')
  assert.doesNotMatch(tabla, /poliza_id[^,]*REFERENCES/)
  assert.match(tabla, /identidad_id\s+uuid NOT NULL REFERENCES seguros\.portal_identidad\(id\) ON DELETE CASCADE/)
  assert.match(tabla, /accion IN \('creada', 'editada', 'eliminada', 'restaurada'\)/)
  assert.match(sql, /GRANT SELECT, INSERT ON seguros\.portal_poliza_declarada_historial TO prisma_asegura_portal;/)
  assert.doesNotMatch(sql, /GRANT[^;]*(UPDATE|DELETE)[^;]*portal_poliza_declarada_historial[^;]*prisma_asegura_portal/, 'append-only')
  assert.match(sql, /REVOKE ALL ON seguros\.portal_poliza_declarada_historial FROM crm_seguros/)
  // Nada destructivo fuera de los comentarios de marcha atrás.
  assert.doesNotMatch(sql, /\bDROP\s+(TABLE|COLUMN)\b/i)
  assert.match(sqlCrudo, /Marcha atrás/)
})

test('el schema declara la columna y el historial, sin relación en polizaId', () => {
  const schema = leer(`${APP}/prisma/schema.prisma`)
  assert.match(schema, /eliminadaEn\s+DateTime\?\s+@map\("eliminada_en"\)/)
  const i = schema.indexOf('model PortalPolizaDeclaradaHistorial')
  assert.notEqual(i, -1)
  const modelo = schema.slice(i, schema.indexOf('\n}', i))
  assert.match(modelo, /@@map\("portal_poliza_declarada_historial"\)/)
  assert.doesNotMatch(modelo, /PortalPolizaDeclarada\s+@relation/, 'polizaId sin relación (sobrevive a la póliza)')
})

test('la bóveda monta «Eliminadas» con su botón Restaurar (44 px) contra la ruta de restaurar', () => {
  const pagina = sinComentarios(leer(`${APP}/app/(portal)/boveda/page.tsx`))
  assert.match(pagina, /<DeclaradasEliminadas\b/)
  assert.match(pagina, /\.\.\.DECLARADA_ELIMINADA/)
  const lista = leer(`${APP}/app/(portal)/boveda/DeclaradasEliminadas.tsx`)
  assert.match(lista, /<details className="plegable-cartera">/, 'nace plegado (sin `open`)')
  assert.match(lista, /LIMITE_ELIMINADAS/, 'no monta cientos de filas')
  const boton = leer(`${APP}/app/(portal)/boveda/RestaurarPoliza.tsx`)
  assert.match(boton, /\/restaurar`/)
  assert.match(boton, /className="boton-tenue"/, '`.boton-tenue` es el de 44 px')
})

test('el cepo del filtro FALLA contra un lector que lo olvida (visto en rojo)', () => {
  // Un brazo que nunca puede fallar no vigila nada: se le da una llamada sin filtro y otra prohibida.
  const trucadas: Llamada[] = [
    { fichero: 'x.ts', metodo: 'findMany', args: '{ where: { identidadId } }' },
    { fichero: 'y.ts', metodo: 'deleteMany', args: '{ where: { id, identidadId, ...DECLARADA_NO_ELIMINADA } }' },
    { fichero: 'z.ts', metodo: 'findFirst', args: '{ where: { id, identidadId, ...DECLARADA_NO_ELIMINADA } }' },
    { fichero: 'w.ts', metodo: 'create', args: '{ data: { identidadId } }' },
  ]
  assert.deepEqual(infractores(trucadas), ['x.ts: portalPolizaDeclarada.findMany(…)', 'y.ts: portalPolizaDeclarada.deleteMany(…)'])
})
