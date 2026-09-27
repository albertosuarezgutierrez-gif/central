// Cepo de las pólizas AJENAS donde la identidad FIGURA como interviniente
// (`apps/asegura-portal`, 27/09/2026). `node --test` (gate en `pnpm test:guardia`).
//
// Decisión de Alberto: quien figura en `seguros.poliza_intervinientes` de una
// póliza (propietario, conductor, asegurado…) la ve como su tomador y puede dar
// parte. Caso fundacional: Nieves, propietaria del Toyota cuya póliza es de Víctor.
//
// 🚨 El modo de fallo que esto vigila NO es «Nieves no ve su póliza» —eso se
// nota—, sino «cualquier identidad ve las pólizas de cualquier interviniente».
// No hay RLS: el rol del portal lee `poliza_intervinientes` entera, así que un
// `where` sin `propiosIds` (o con un id que venga de fuera) devuelve 200 con las
// pólizas de todo el mundo, y nada falla. La regla pura (qué abre y con qué
// campos) tiene su test en `apps/asegura-portal/lib/intervinientes.test.ts`;
// aquí se vigila la LECTURA, que es donde está la frontera.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const leer = (f: string) => readFileSync(join(ROOT, f), 'utf8')

const LECTURA = 'apps/asegura-portal/lib/cartera-lectura.ts'

/** El bloque de la consulta que empieza en `desde`, hasta su `})` de cierre. */
function bloque(src: string, desde: string): string {
  const i = src.indexOf(desde)
  assert.ok(i >= 0, `no encuentro «${desde}» en ${LECTURA}: el cepo no está viendo la consulta`)
  const fin = src.indexOf('\n        })', i)
  assert.ok(fin > i, 'no encuentro el cierre de la consulta')
  return src.slice(i, fin)
}

test('la lectura de intervinientes filtra por las fichas PROPIAS de la identidad (portal_vinculo)', () => {
  const src = leer(LECTURA)
  // `propiosIds` sale de `portal_vinculo` filtrado por la identidad de la sesión, y de nada más.
  assert.match(
    src,
    /const vinculos = await prisma\.portalVinculo\.findMany\(\{\s*where: \{ identidadId \}/,
    'los vínculos tienen que salir de `portalVinculo` filtrado por `identidadId`',
  )
  assert.match(src, /const propiosIds = vinculos\.map\(\(v\) => v\.clienteId\)/)

  const b = bloque(src, 'prisma.polizaInterviniente.findMany(')
  assert.match(
    b,
    /where:\s*\{\s*clienteId:\s*\{\s*in:\s*propiosIds\s*\}\s*\}/,
    'la consulta de `polizaInterviniente` tiene que filtrar EXACTAMENTE por `clienteId in propiosIds`: ' +
      'sin eso devuelve los intervinientes de toda la cartera',
  )
  // Y sin propios no se consulta: un `in: []` es inocuo, pero el corte explícito
  // deja claro que un invitado sin ficha no abre nada por aquí.
  assert.match(src, /propiosIds\.length === 0\s*\?\s*\[\]\s*:\s*await prisma\.polizaInterviniente/)
  // Solo el papel: nada de nombre, NIF, teléfono ni email del interviniente.
  assert.match(b, /select:\s*\{\s*polizaId:\s*true,\s*clienteId:\s*true,\s*rol:\s*true\s*\}/)
})

test('las pólizas donde figura se leen POR ID, vivas, sin fusionar y de tomador ajeno', () => {
  const src = leer(LECTURA)
  const b = bloque(src, 'await prisma.poliza.findMany({\n          where: {\n            AND: [\n              {\n                id: { in: [...new Set(filasInterviniente')
  assert.match(b, /id:\s*\{\s*in:\s*\[\.\.\.new Set\(filasInterviniente\.map\(\(f\) => f\.polizaId\)\)\]\s*\}/)
  assert.match(b, /clienteId:\s*\{\s*notIn:\s*propiosIds\s*\}/)
  assert.match(b, /mergedIntoPolizaId:\s*null/)
  assert.match(b, /WHERE_CARTERA_VIVA/)
  // 🚨 Las del tomador NO entran por su ficha: en la consulta principal van por id.
  assert.match(
    src,
    /OR:\s*\[\{\s*clienteId:\s*\{\s*in:\s*todosIds\s*\}\s*\},\s*\{\s*id:\s*\{\s*in:\s*idsDondeFigura\s*\}\s*\}\]/,
    'las pólizas de un tomador ajeno entran por ID; meter su `clienteId` en `todosIds` serviría TODA su cartera',
  )
  assert.doesNotMatch(src, /todosIds\s*=\s*\[[^\]]*tomadoresIds/, '`tomadoresIds` no puede entrar en `todosIds`')
  assert.doesNotMatch(src, /polizaInterviniente\.findUnique/)
})

test('cada póliza del tomador pasa por la regla: la que no es «donde figura» se queda fuera', () => {
  const src = leer(LECTURA)
  assert.match(
    src,
    /titular\(tomadorId, 'tarjeta', \(polizaId\) => \{\s*const f = figuras\.get\(polizaId\)\s*return f !== undefined && f\.tomadorId === tomadorId \? camposDeInterviniente\(f\.nivel\) : null/,
    'el `ve` de un interviniente tiene que devolver `null` para cualquier póliza sin figura, y usar `camposDeInterviniente`',
  )
})

test('la ficha y el parte aceptan las pólizas donde figura, y solo desde la cartera ya leída', () => {
  const ficha = leer('apps/asegura-portal/app/(portal)/boveda/poliza/[id]/page.tsx')
  assert.match(ficha, /for \(const t of cartera\.intervinientes\)/)
  assert.match(ficha, /Ves esta póliza porque figuras/)
  // Los documentos siguen siendo solo del tomador: `deOtro` los apaga.
  assert.match(ficha, /const documentos = deOtro \? null/)

  const lectura = leer(LECTURA)
  assert.match(lectura, /\.\.\.c\.intervinientes\.flatMap\(\(t\) => t\.polizas\.map\(\(p\) => p\.id\)\)/)
  const ruta = leer('apps/asegura-portal/app/api/siniestros/route.ts')
  assert.match(ruta, /polizasParaParte\(cartera\)\.has\(valor\.polizaId\)/)
})
