// Guardián: la regla de CARTERA VIVA no se reimplementa a mano.
//
// El filtro histórico era `polizas.import_ref IS NULL`, y tenía un agujero
// medido el 03/09/2026: cuando la ingesta de CIMA trae una póliza que YA existía
// en el volcado, actualiza la fila vieja y le deja su `import_ref` de 2017. Esa
// póliza —que CIMA mantiene al día— contaba como lead, y con ella se caía un
// cliente entero de la cartera (79→80 clientes, 109→110 pólizas).
//
// La regla correcta vive en `@central/module-seguros` (`cartera-viva.ts`):
//   viva = `import_ref IS NULL` **o** `eiac_xml_hash IS NOT NULL`
//
// Este test existe para que no vuelva a colarse la versión de un solo brazo.
// Si necesitas de verdad preguntar solo por `import_ref` (p. ej. al CREAR una
// póliza propia), añádelo a la lista de excepciones con un comentario que diga
// por qué — no relajes la comprobación.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(import.meta.dirname, '..')
const AMBITOS = ['apps/asegura/lib', 'apps/asegura/app', 'apps/asegura-portal/lib', 'apps/plataforma/lib']

/** Sitios donde preguntar solo por `import_ref` SÍ es correcto, y por qué. */
const EXCEPCIONES = new Map<string, string>([
  ['apps/asegura/lib/emision.ts', 'al CREAR una póliza que emitimos nosotros, `import_ref` nace a null a propósito'],
])

function ficheros(dir: string): string[] {
  let out: string[] = []
  let entradas: string[]
  try {
    entradas = readdirSync(dir)
  } catch {
    return []
  }
  for (const e of entradas) {
    if (e === 'node_modules' || e === '.next' || e === 'generated') continue
    const p = join(dir, e)
    if (statSync(p).isDirectory()) out = out.concat(ficheros(p))
    else if (/\.(ts|tsx)$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p)
  }
  return out
}

const TODOS = AMBITOS.flatMap((a) => ficheros(join(RAIZ, a))).map((p) => ({
  rel: p.slice(RAIZ.length + 1),
  texto: readFileSync(p, 'utf8'),
}))

test('el guardián encuentra código que revisar (si no, el test no vale nada)', () => {
  assert.ok(TODOS.length > 50, `solo ${TODOS.length} archivos escaneados`)
})

test('ningún SQL crudo filtra por `import_ref is null` a secas', () => {
  const malos: string[] = []
  for (const { rel, texto } of TODOS) {
    if (EXCEPCIONES.has(rel)) continue
    for (const linea of texto.split('\n')) {
      if (!/import_ref\s+is\s+null/i.test(linea)) continue
      // Vale si en la MISMA línea se nombra también el hash de EIAC.
      if (/eiac_xml_hash/i.test(linea)) continue
      // Vale si es un comentario que explica la regla, no un filtro.
      if (/^\s*(\/\/|\*|--)/.test(linea)) continue
      malos.push(`${rel}: ${linea.trim()}`)
    }
  }
  assert.deepEqual(malos, [], `SQL con la regla vieja:\n${malos.join('\n')}`)
})

test('ningún filtro de Prisma usa `importRef` como única señal de cartera viva', () => {
  const malos: string[] = []
  for (const { rel, texto } of TODOS) {
    if (EXCEPCIONES.has(rel)) continue
    for (const linea of texto.split('\n')) {
      if (/^\s*(\/\/|\*)/.test(linea)) continue
      const comparaNull = /importRef\s*(===|!==)\s*null/.test(linea)
      const filtraNull = /importRef:\s*null/.test(linea) || /importRef:\s*\{\s*not:\s*null\s*\}/.test(linea)
      if (!comparaNull && !filtraNull) continue
      if (/eiacXmlHash/.test(linea)) continue
      malos.push(`${rel}: ${linea.trim()}`)
    }
  }
  assert.deepEqual(malos, [], `filtros con la regla vieja:\n${malos.join('\n')}`)
})

test('la regla vive en @central/module-seguros y se importa, no se copia', () => {
  const usan = TODOS.filter(({ texto }) => /esCarteraViva|WHERE_CARTERA_VIVA|esVolcadoHistorico|WHERE_VOLCADO_HISTORICO/.test(texto))
  assert.ok(usan.length >= 3, `solo ${usan.length} archivos usan el helper compartido`)
  for (const { rel, texto } of usan) {
    assert.match(texto, /from '@central\/module-seguros'/, `${rel} usa la regla sin importarla del paquete`)
  }
})
