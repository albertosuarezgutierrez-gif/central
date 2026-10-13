// Guardián del BORRADO LÓGICO de las pólizas aportadas, lado `apps/asegura` (10/10/2026).
// `node --test` (gate en CI vía `pnpm test:guardia`). Espejo de
// `regression-portal-declaradas-eliminadas.test.ts` (que vigila el portal).
//
// El cliente quita una póliza que aportó → `portal_poliza_declarada.eliminada_en` con fecha. Un
// lector de ESTA app que olvide el filtro mandaría al corredor leads, revisiones anuales y avisos
// de una póliza que la persona quitó, y nada falla. Por eso se mira CADA llamada, no cada fichero.
//
// Brazos:
//   1. Toda llamada a `portalPolizaDeclarada` (Prisma) lleva `DECLARADA_VIVA` dentro de sí. `create`
//      queda fuera (nace viva). `findUnique`/`update`/`upsert`/`delete`/`deleteMany` prohibidos.
//   2. Todo SQL crudo sobre `portal_poliza_declarada` filtra su alias con `sqlDeclaradaViva('<alias>')`.
//   3. Solo el export RGPD lee las eliminadas (`DECLARADA_CON_ELIMINADAS`), las marca y trae el historial.
//   4. El schema espejo declara la columna y el historial; la categoría del historial existe.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const APP = 'apps/asegura'
const EXPORT = `${APP}/lib/export-rgpd.ts`

const sinComentarios = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/^\s*--.*$/gm, '')

const leer = (f: string) => readFileSync(join(ROOT, f), 'utf8')

function ficheros(): string[] {
  return execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', `${APP}/app`, `${APP}/lib`], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => /\.(ts|tsx|mjs)$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.includes('/generated/'))
}

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
const FILTRO = /DECLARADA_VIVA|DECLARADA_CON_ELIMINADAS/
const SIN_FILTRO_POSIBLE = new Set(['create', 'createMany'])
const PROHIBIDOS = new Set(['findUnique', 'findUniqueOrThrow', 'update', 'upsert', 'delete', 'deleteMany', 'updateMany'])

type Llamada = { fichero: string; metodo: string; args: string }

function llamadas(): Llamada[] {
  const out: Llamada[] = []
  for (const f of ficheros()) {
    const src = sinComentarios(leer(f))
    for (const m of src.matchAll(LLAMADA)) {
      out.push({ fichero: f, metodo: m[1], args: argumentos(src, (m.index ?? 0) + m[0].length - 1) })
    }
  }
  return out
}

function infractores(ls: Llamada[]): string[] {
  return ls
    .filter((l) => PROHIBIDOS.has(l.metodo) || (!SIN_FILTRO_POSIBLE.has(l.metodo) && !FILTRO.test(l.args)))
    .map((l) => `${l.fichero}: portalPolizaDeclarada.${l.metodo}(…)`)
}

/** SQL crudo: cada `from|join portal_poliza_declarada <alias>` debe tener `sqlDeclaradaViva('<alias>')` en el fichero. */
function sqlSinFiltro(fichero: string, src: string): string[] {
  const malos: string[] = []
  for (const m of src.matchAll(/\b(?:from|join)\s+(?:seguros\.)?portal_poliza_declarada(?:\s+(?:as\s+)?([a-z_]\w*))?/gi)) {
    const alias = m[1] && !/^(on|where|join|left|inner|group|order)$/i.test(m[1]) ? m[1] : 'portal_poliza_declarada'
    if (!new RegExp(`sqlDeclaradaViva\\(\\s*['"]${alias}['"]\\s*\\)`).test(src)) malos.push(`${fichero}: SQL sobre portal_poliza_declarada ${alias}`)
  }
  return malos
}

test('el cepo ve de verdad los lectores (si no encuentra ninguno, no vigila nada)', () => {
  const ls = llamadas().filter((l) => !SIN_FILTRO_POSIBLE.has(l.metodo))
  assert.ok(ls.length >= 5, `solo ${ls.length} llamadas Prisma vistas (hoy: leads, cartera-declaradas, cartera-ficha, revision-anual, export)`)
  const sql = ficheros().flatMap((f) => [...sinComentarios(leer(f)).matchAll(/\b(?:from|join)\s+portal_poliza_declarada\b/gi)].map(() => f))
  assert.ok(sql.length >= 2, `solo ${sql.length} SQL crudos vistos (hoy: actividad-cartera, acciones-listado)`)
})

test('🚨 toda consulta Prisma de portalPolizaDeclarada filtra las ELIMINADAS dentro de su llamada', () => {
  const malos = infractores(llamadas())
  assert.deepEqual(
    malos,
    [],
    'Estas lecturas no filtran las pólizas que el cliente QUITÓ: el corredor recibiría leads y revisiones ' +
      'de ellas. Añade `...DECLARADA_VIVA` (lib/declaradas-eliminadas.ts) al `where`:\n  - ' + malos.join('\n  - '),
  )
})

test('🚨 todo SQL crudo sobre portal_poliza_declarada filtra eliminada_en con sqlDeclaradaViva', () => {
  const malos = ficheros().flatMap((f) => sqlSinFiltro(f, sinComentarios(leer(f))))
  assert.deepEqual(malos, [], `SQL sin filtrar eliminadas (usa \`\${sqlDeclaradaViva('alias')}\` en el where):\n  - ${malos.join('\n  - ')}`)
})

test('solo el export RGPD puede leer las eliminadas, y las marca; el historial va en el paquete', () => {
  const usan = ficheros().filter((f) => f !== `${APP}/lib/declaradas-eliminadas.ts` && /DECLARADA_CON_ELIMINADAS/.test(sinComentarios(leer(f))))
  assert.deepEqual(usan, [EXPORT], 'DECLARADA_CON_ELIMINADAS solo es legítima en el export RGPD (derecho de acceso)')
  const src = sinComentarios(leer(EXPORT))
  assert.match(src, /estado:\s*f\.eliminadaEn === null \? 'vigente' : 'eliminada'/, 'el export no marca cuáles están eliminadas')
  assert.match(src, /portalPolizaDeclaradaHistorial\.findMany\([\s\S]{0,200}where: \{ identidadId \}/, 'el export no incluye el historial de la persona')
  assert.match(src, /bloque\('polizas_declaradas_historial'/)
  assert.match(leer('packages/module-seguros/src/export-rgpd.ts'), /'polizas_declaradas_historial'/)
})

test('el schema espejo declara la columna y el historial (sin relaciones ni FK)', () => {
  const s = leer(`${APP}/prisma/asegura.prisma`)
  const modelo = s.match(/model PortalPolizaDeclarada \{[\s\S]*?\n\}/)?.[0] ?? ''
  assert.match(modelo, /eliminadaEn\s+DateTime\?\s+@map\("eliminada_en"\) @db\.Timestamptz\(6\)/)
  const h = s.match(/model PortalPolizaDeclaradaHistorial \{[\s\S]*?\n\}/)?.[0] ?? ''
  assert.match(h, /@@map\("portal_poliza_declarada_historial"\)/)
  assert.ok(!/@relation/.test(h), 'el historial no lleva relación en este schema (sobrevive a la póliza)')
})

test('el cepo FALLA contra lectores que olvidan el filtro (visto en rojo)', () => {
  const sinFiltro: Llamada = { fichero: 'x.ts', metodo: 'findMany', args: '{ where: { identidadId } }' }
  assert.equal(infractores([sinFiltro]).length, 1)
  assert.equal(infractores([{ ...sinFiltro, args: '{ where: { identidadId, ...DECLARADA_VIVA } }' }]).length, 0)
  assert.equal(infractores([{ ...sinFiltro, metodo: 'delete', args: '{ where: { ...DECLARADA_VIVA } }' }]).length, 1)
  assert.equal(sqlSinFiltro('x.ts', 'from portal_poliza_declarada d join y').length, 1)
  assert.equal(sqlSinFiltro('x.ts', "from portal_poliza_declarada d where ${sqlDeclaradaViva('d')}").length, 0)
})
