// Guardián (12/10/2026): los TRES niveles de acceso compartido (Consulta ·
// Gestión · Total) sobre las pólizas AÑADIDAS por un titular.
//
// Caso real: Alberto tiene acceso total de su mujer y no podía abrir ni editar
// la póliza que ella añadió en su portal. La decisión pura (quién es la dueña de
// la fila para cada acción, por nivel) vive en
// `packages/module-seguros-portal/src/capacidades.ts` con su test; esto vigila el
// CABLEADO, que es donde se fuga una bóveda sin que nada falle:
//   - sin concesión → 404 en ficha, PATCH y DELETE;
//   - con Consulta/Gestión → el PATCH/DELETE piden 'editar'/'quitar' (→ 404);
//   - con Total → escriben con la identidad del TITULAR dentro del `where`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const APP = 'apps/asegura-portal'
const leer = (f: string) =>
  readFileSync(join(ROOT, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const AJENA = leer(`${APP}/lib/declarada-ajena.ts`)
const RUTA_ID = leer(`${APP}/app/api/polizas/[id]/route.ts`)
const ALTA = leer(`${APP}/app/api/polizas/route.ts`)
const FICHA = leer(`${APP}/app/(portal)/boveda/anadida/[id]/page.tsx`)
const PARTE = leer(`${APP}/app/api/siniestros/route.ts`)
const LECTURA = leer(`${APP}/lib/cartera-lectura.ts`)

test('🔒 la decisión es la pura (duenaDeDeclarada) y el acceso parte de la cartera de la SESIÓN', () => {
  assert.match(AJENA, /duenaDeDeclarada\(\{/, 'la regla por nivel es la del módulo, con test')
  assert.match(AJENA, /capacidadesDeAlcances\(ficha\.alcances, t\.tipoPersona\)/, 'capacidades de la concesión de ficha ENTERA')
  assert.match(AJENA, /carteraDeIdentidad\(identidadId\)/, 'se busca DENTRO de lo que ya se le sirve')
  assert.match(AJENA, /via === 'dueno'\) continue/, 'la empresa del dueño no sirve declaradas')
  assert.match(AJENA, /titularesDeFichasEnteras\(\[t\.clienteId\], identidadId\)/, 'la titular se recalcula con la regla pura')
})

test('🔒 la fila ajena se relee con identidadId IN titulares y solo «propio»', () => {
  const i = AJENA.indexOf('prisma.portalPolizaDeclarada.findFirst', AJENA.indexOf('async function declaradaAjena'))
  assert.ok(i > 0)
  const consulta = AJENA.slice(i, AJENA.indexOf('})', i))
  assert.match(consulta, /identidadId:\s*\{\s*in:\s*ids\s*\}/)
  assert.match(consulta, /titularTipo:\s*TITULAR_TIPO_VISIBLE_A_TERCERO/)
})

test('🔒 la propia se mira con la identidad de quien mira DENTRO del where', () => {
  const i = AJENA.indexOf('export async function accesoADeclarada')
  const cuerpo = AJENA.slice(i)
  assert.match(cuerpo, /findFirst\(\{\s*where:\s*\{\s*id:\s*declaradaId,\s*identidadId\s*\}/)
})

test('🔒 las capacidades salen SOLO de la concesión de ficha entera (no de las sueltas)', () => {
  assert.match(LECTURA, /deLaFicha === null \? \{\} : \{ ficha: \{ ids: \[\.\.\.deLaFicha\.ids\], alcances: \[\.\.\.new Set\(deLaFicha\.alcances\)\] \} \}/)
})

test('🔒 cada ruta pide la acción que le toca y responde 404 sin acceso', () => {
  const patch = RUTA_ID.slice(RUTA_ID.indexOf('export async function PATCH'), RUTA_ID.indexOf('export async function DELETE'))
  const del = RUTA_ID.slice(RUTA_ID.indexOf('export async function DELETE'))
  for (const [nombre, src, accion] of [
    ['PATCH', patch, 'editar'],
    ['DELETE', del, 'quitar'],
  ] as const) {
    assert.match(src, new RegExp(`accesoADeclarada\\(identidad\\.id, id, '${accion}'\\)`), `${nombre} pide '${accion}'`)
    assert.match(
      src,
      /if \(acceso === null\) return NextResponse\.json\(\{ error: 'no_encontrada' \}, \{ status: 404 \}\)/,
      `${nombre}: sin acceso 404, nunca 403`,
    )
    // Ninguna escritura con la identidad de la COOKIE a secas ni sin identidad.
    assert.doesNotMatch(src, /portalPolizaDeclarada\.(updateMany|deleteMany)\(\{\s*where:\s*\{\s*id\s*\}/, `${nombre} escribe por id a secas`)
    assert.match(src, /identidadId:\s*duenaId/, `${nombre} escribe con la dueña resuelta`)
  }
  assert.match(FICHA, /accesoADeclarada\(identidad\.id, id, 'ver'\)/)
  assert.match(PARTE, /accesoADeclarada\(identidad\.id, valor\.polizaDeclaradaId, 'parte'\)/)
})

test('🔒 la ficha ajena es de solo lectura salvo con Total', () => {
  assert.match(FICHA, /const puedeEditar = acceso\.propia \|\| acceso\.capacidades\?\.editarDeclaradas === true/)
  assert.match(FICHA, /const puedeQuitar = acceso\.propia \|\| acceso\.capacidades\?\.quitarDeclaradas === true/)
  assert.match(FICHA, /\{puedeEditar && \(\s*<section/, 'el formulario de corregir solo con permiso')
  assert.match(FICHA, /\{puedeQuitar && \(\s*<section/, 'quitar solo con permiso')
})

test('🔒 añadir EN NOMBRE del titular solo con Total y escribiendo en SU identidad', () => {
  assert.match(ALTA, /titularParaAnadir\(identidadSesion, enNombreDe\)/)
  assert.match(ALTA, /if \(titular === null\) return NextResponse\.json\(\{ error: 'no_encontrada' \}, \{ status: 404 \}\)/)
  const i = AJENA.indexOf('export async function titularParaAnadir')
  const cuerpo = AJENA.slice(i)
  assert.match(cuerpo, /\.anadirDeclaradas\) return null/, 'sin «Total» no se añade en su nombre')
  assert.match(cuerpo, /ids\.length !== 1/, 'con dos identidades titulares no se sabe en qué bóveda escribir')
})

test('el DELETE congela TODOS los partes de la póliza (también los de quien tiene acceso)', () => {
  const del = RUTA_ID.slice(RUTA_ID.indexOf('export async function DELETE'))
  assert.match(del, /portalParteSiniestro\.findMany\(\{\s*where:\s*\{\s*polizaDeclaradaId:\s*suya\.id\s*\}/)
  assert.match(del, /portalParteSiniestro\.updateMany\(\{\s*where:\s*\{\s*polizaDeclaradaId:\s*suya\.id\s*\}/)
})

test('la vía del corredor NO concede Gestión (no tiene texto para ella)', () => {
  const src = leer('apps/asegura/lib/cartera-relaciones.ts')
  assert.match(src, /const alcance = concedible === 'gestion' \? null : concedible/)
})

test('la migración de Gestión añade el alcance sin perder flota', () => {
  const sql = readFileSync(join(ROOT, `${APP}/prisma/sql/2026-10-12_portal_autorizacion_gestion.sql`), 'utf8')
  assert.match(sql, /CHECK \(alcance IN \('ver', 'ver_economico', 'partes', 'documentos', 'gestion', 'total', 'flota'\)\)/)
})
