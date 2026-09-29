// La matrícula de un lead vive en `oportunidades.info_riesgo`, no en una póliza.
// Buscando solo en `polizas.datos_especificos`, «5655DSM» decía «nadie coincide»
// con su oportunidad abierta y 1.735 matrículas de leads eran invisibles
// (29/09/2026). La búsqueda y su cobertura tienen que mirar las dos fuentes.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const fuente = readFileSync(new URL('../apps/asegura/lib/cartera-busqueda.ts', import.meta.url), 'utf8')

function cuerpoDe(nombre: string): string {
  const inicio = fuente.indexOf(`async function ${nombre}`)
  assert.ok(inicio >= 0, `no se encuentra ${nombre}`)
  const fin = fuente.indexOf('\nasync function ', inicio + 1)
  return fuente.slice(inicio, fin === -1 ? undefined : fin)
}

test('porMatricula busca también en la matrícula de las oportunidades', () => {
  const cuerpo = cuerpoDe('porMatricula')
  assert.match(cuerpo, /p\.datos_especificos->>'matricula'/)
  assert.match(cuerpo, /from oportunidades o/)
  assert.match(cuerpo, /upper\(regexp_replace\(o\.info_riesgo->>'matricula'[^)]*\)\) like/)
})

test('la cobertura de la matrícula cuenta las oportunidades', () => {
  assert.match(cuerpoDe('coberturaMatricula'), /info_riesgo->>'matricula'[\s\S]*from oportunidades/)
})
