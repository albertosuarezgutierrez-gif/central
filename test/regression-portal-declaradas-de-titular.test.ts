// Guardián (08/10/2026): las pólizas que AÑADIÓ quien te dio acceso aparecen en
// SU tarjeta «Te ha dado acceso» y cuentan en «N seguros» — sin fugar nada.
//
// Caso fundacional: Pilar abrió su ficha ENTERA a Alberto; su póliza subida vive
// en `portal_poliza_declarada` de SU identidad y la tarjeta decía «sin seguros».
// La regla de quién es titular está pura en `lib/declaradas-de-titular.ts` (con
// su test); esto vigila el CABLEADO: la consulta, la cuenta y la fila.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const leer = (f: string) =>
  readFileSync(join(ROOT, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const LECTURA = leer('apps/asegura-portal/lib/cartera-lectura.ts')
const PAGINA = leer('apps/asegura-portal/app/(portal)/boveda/page.tsx')
const FILA = leer('apps/asegura-portal/app/(portal)/boveda/FilaDeclarada.tsx')

test('🔒 las declaradas ajenas se leen SOLO de identidades titulares y solo las «propio»', () => {
  const i = LECTURA.indexOf('prisma.portalPolizaDeclarada.findMany')
  assert.notEqual(i, -1, 'cartera-lectura tiene que leer las declaradas del titular')
  const consulta = LECTURA.slice(i, LECTURA.indexOf('})', i))
  assert.match(consulta, /identidadId:\s*\{\s*in:\s*\[\.\.\.titulares\.keys\(\)\]\s*\}/, 'solo identidades que `identidadesTitulares` da por titulares')
  assert.match(consulta, /titularTipo:\s*TITULAR_TIPO_VISIBLE_A_TERCERO/, '`empresa` y `null` no se enseñan a un tercero')
  assert.doesNotMatch(consulta, /primaAnual|matricula|bastidor|referenciaCatastral|coberturas|extraccionBruta|datosRamo/, 'a un tercero solo lo que pinta la fila')
})

test('🔒 solo fichas abiertas ENTERAS (porOtorgante), nunca una concesión suelta', () => {
  assert.match(LECTURA, /const fichasEnteras = autorizadas\.map\(\(t\) => t\.clienteId\)\.filter\(\(id\) => porOtorgante\.has\(id\)\)/)
  assert.match(LECTURA, /identidadesTitulares\(\{/, 'la regla de titular es la pura, con test')
})

test('la tarjeta «Te ha dado acceso» cuenta cartera + declaradas', () => {
  const i = PAGINA.indexOf("'Te ha dado acceso'")
  assert.notEqual(i, -1)
  const tramo = PAGINA.slice(i, i + 900)
  assert.match(tramo, /cuenta=\{cuentaDeTitular\(t\)\}/, 'contar solo `t.polizas` vuelve a decir «sin seguros»')
  assert.match(tramo, /<FilaDeclarada[^>]*deOtro/, 'la fila ajena va marcada como de otro')
})

test('🔒 una declarada de OTRO enlaza a su ficha (que decide el acceso) pero no ofrece «Quitar» en la lista', () => {
  // Desde el 12/10/2026 la ficha se abre: Consulta/Gestión en solo lectura, Total
  // corrige y quita. Quien decide es `accesoADeclarada` en la ficha, no la fila.
  assert.match(FILA, /<Link href=\{`\/boveda\/anadida\/\$\{p\.id\}`\} className="poliza-enlace">/)
  const ficha = leer('apps/asegura-portal/app/(portal)/boveda/anadida/[id]/page.tsx')
  assert.match(ficha, /accesoADeclarada\(identidad\.id, id, 'ver'\)/, 'la ficha resuelve el acceso antes de pintar')
  assert.match(FILA, /\{!deOtro && \(\s*<div className="poliza-acciones">/, 'quien mira no puede quitar la póliza de otro')
  assert.match(FILA, /'Añadida por su titular'/, 'distinguible de las tuyas y de las de cartera')
})
