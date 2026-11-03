// Cepo: informe anual para el gestor (P7, 27/10/2026). El informe de UN titular no puede salir con datos de otro, y el CSV/
// página no inventan ceros ni asesoran. `node --test` (gate en CI vía `pnpm test:guardia`). Sin comentarios al mirar el código.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const leer = (f: string) => sinComentarios(readFileSync(join(ROOT, f), 'utf8'))
const P = 'apps/asegura-portal/'

test('🚨 informe-gestor-bd: parte de la cookie y de accesosPatrimonio; el titular de la URL se busca DENTRO (404)', () => {
  const s = leer(`${P}lib/patrimonio/informe-gestor-bd.ts`)
  assert.match(s, /\(await getIdentidad\(\)\)\?\.id !== identidadId/)
  assert.match(s, /const accesos = await accesosPatrimonio\(identidadId\)/)
  assert.match(s, /titularPermitido\(titular, accesos\)/)
  assert.match(s, /if \(pedido === null\) return \{ kind: 'no_encontrado' \}/)
  assert.match(s, /clienteId: \{ in: \[\.\.\.accesos\.keys\(\)\] \}/, 'el titular de cada inmueble se acota a los accesos')
  assert.doesNotMatch(s, /prisma\.portalPatrimonio\w+\.(create|update|delete|upsert)/, 'leer no escribe')
})

test('🚨 ruta CSV: identidad de la cookie, 404 nunca 403 para el titular ajeno, 500 si la lectura falla', () => {
  const r = leer(`${P}app/api/patrimonio/informe-gestor/route.ts`)
  assert.match(r, /requireIdentidad\(\)/)
  assert.match(r, /informeGestorDeIdentidad\(identidad\.id, q\.get\('anio'\), q\.get\('titular'\)\)/)
  assert.match(r, /if \(r\.kind !== 'ok'\) return NextResponse\.json\(\{ error: 'no_encontrado' \}, \{ status: 404 \}\)/)
  assert.match(r, /status: 500/)
  assert.match(r, /'cache-control': 'private, no-store'/)
  assert.doesNotMatch(r, /prisma/)
  assert.doesNotMatch(r, /identidad\w*\s*=\s*(?:q|searchParams|body)/)
})

test('🚨 página: sin prisma, 404 para el titular ajeno, texto legal visible, sin 0 inventado', () => {
  const p = leer(`${P}app/(portal)/patrimonio/informe-gestor/page.tsx`)
  assert.doesNotMatch(p, /prisma/)
  assert.match(p, /informeGestorDeIdentidad\(identidad\.id/)
  assert.match(p, /if \(r\?\.kind === 'no_encontrado'\) notFound\(\)/)
  assert.match(p, /inf\.textoLegal/)
  assert.match(p, /c === null \? 'sin dato'/)
  assert.doesNotMatch(p, /\?\?\s*0\b/)
})

test('🚨 informe-gestor.ts (puro): sin prisma/sesión, sin ?? 0, texto legal exacto y agrupa por id', () => {
  const s = leer(`${P}lib/patrimonio/informe-gestor.ts`)
  assert.doesNotMatch(s, /prisma|\/session|\/db['"]/)
  assert.doesNotMatch(s, /\?\?\s*0\b/)
  assert.match(s, /export const TEXTO_LEGAL_GESTOR = 'Exportación de tus datos para tu gestor; no es asesoramiento fiscal'/)
  assert.match(s, /grupos\.get\(id\)/)
  assert.match(s, /every\(\(f\) => f\.rendimientoNetoCent !== null\)/, 'el neto del titular es null si falta una amortización')
})
