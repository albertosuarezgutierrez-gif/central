// Guardián de las direcciones del portfolio. `node --test` (gate en `pnpm test:guardia`).
//
// Los cuatro pisos turísticos son fáciles de cruzar entre sí y el error no se ve: sale una
// dirección plausible. Ya pasó una vez —la skill de SEO le dio a House Sevillana la dirección de
// Bustos Tavera 22 durante meses, ver `regression-house-sevillana-direccion.test.ts`—, y el par
// Luxury Busto / Busto Reform es todavía peor, porque comparten portal y sólo los separa el LADO:
// bajo derecha vs bajo izquierda. Cruzar ese lado manda la factura de la luz, el parte de
// viajeros o al huésped al piso del vecino.
//
// Mapa (confirmado por Alberto el 26/08/2026, y coincidente con los CUPS de Endesa y los
// contratos de EMASESA que están en la skill `facturas-correo`):
//
//   prop_house_sevillana  Calle Socorro 24                        41003 Sevilla (San Julián)
//   prop_luxury_busto     Calle Bustos Tavera 22, bajo DERECHA    41003 Sevilla
//   prop_busto_reform     Calle Bustos Tavera 22, bajo IZQUIERDA  41003 Sevilla
//   prop_duplex_center    Pasaje Villasís 1, Es:2 Pl:01 Pt:C      41003 Sevilla
//                         (mismo piso que «Pasaje Francisco Molina 4»: tiene dos accesos)
//   act_monte_carmelo     Calle Monte Carmelo 68                  41011 Sevilla (vivienda habitual)
//
// Monte Carmelo es el único que NO es 41003 ni es turístico: por eso lleva su propio CP y no entra
// en la comprobación de calles del casco antiguo.
//
// El CP se comprueba por piso y a propósito: hasta el 26/08/2026 sólo lo llevaba House Sevillana,
// y una dirección sin CP es la que acaba copiada en un contrato o en un schema.org. Se compara el
// CP EXACTO, no «que haya alguno», porque dar 41003 a Monte Carmelo sería el mismo tipo de mentira
// plausible que dar Bustos Tavera a House Sevillana.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const SEED = 'apps/plataforma/prisma/sql/2026-08-22_patrimonio.sql'

type Piso = { clave: string; alias: string; calle: string; cp: string; lado?: string }

const PISOS: Piso[] = [
  { clave: 'prop_house_sevillana', alias: 'House Sevillana', calle: 'Calle Socorro 24', cp: '41003' },
  { clave: 'prop_luxury_busto', alias: 'Luxury Busto', calle: 'Calle Bustos Tavera 22', cp: '41003', lado: 'bajo derecha' },
  { clave: 'prop_busto_reform', alias: 'Busto Reform', calle: 'Calle Bustos Tavera 22', cp: '41003', lado: 'bajo izquierda' },
  { clave: 'prop_duplex_center', alias: 'Dúplex Center', calle: 'Pasaje Villasís 1', cp: '41003' },
  // La vivienda habitual no tiene `property_id` (no es turística): se localiza por su id de activo.
  { clave: 'act_monte_carmelo', alias: 'Monte Carmelo', calle: 'Calle Monte Carmelo 68', cp: '41011' },
]

/**
 * Dirección que el seed inserta para un activo. El seed es un `INSERT … SELECT` por bloques
 * `UNION ALL`, y en cada bloque la dirección es el literal de la línea siguiente a la que lleva
 * la clave (el `property_id`, o el id del activo cuando el piso no es turístico y no tiene uno).
 */
function direccionEnSeed(clave: string): string {
  const lineas = readFileSync(join(ROOT, SEED), 'utf8').split('\n')
  const i = lineas.findIndex((l) => l.includes(`'${clave}'`))
  assert.notEqual(i, -1, `El seed ${SEED} ya no inserta ${clave}`)
  // Los turísticos llevan su `property_id` en la misma línea que `'inmueble'`; Monte Carmelo no
  // tiene `property_id` (ahí va NULL) y se localiza por el id del activo, dos líneas antes. Por
  // eso se ancla en `'inmueble'` y no en un desplazamiento fijo.
  const j = lineas.findIndex((l, k) => k >= i && l.includes("'inmueble'"))
  assert.notEqual(j, -1, `${clave} ya no es un inmueble en ${SEED}`)
  const m = lineas[j + 1].match(/'([^']*)'/)
  assert.ok(m, `No encuentro el literal de dirección tras ${clave} en ${SEED}:${j + 2}`)
  return m[1]
}

for (const piso of PISOS) {
  test(`${piso.alias}: el seed le da su calle y su código postal`, () => {
    const dir = direccionEnSeed(piso.clave)
    assert.ok(dir.startsWith(piso.calle), `${piso.alias} debería empezar por "${piso.calle}", y dice "${dir}"`)
    assert.ok(dir.includes(piso.cp), `${piso.alias} es ${piso.cp}, y su dirección dice "${dir}"`)
  })
}

test('Luxury Busto y Busto Reform no se cruzan de lado', () => {
  const luxury = direccionEnSeed('prop_luxury_busto')
  const reform = direccionEnSeed('prop_busto_reform')
  assert.ok(luxury.includes('bajo derecha'), `Luxury Busto es el bajo DERECHA, y el seed dice "${luxury}"`)
  assert.ok(reform.includes('bajo izquierda'), `Busto Reform es el bajo IZQUIERDA, y el seed dice "${reform}"`)
  assert.notEqual(luxury, reform, 'Comparten portal, pero no son el mismo piso')
})

test('ningún otro piso se lleva la calle de House Sevillana ni la de los Busto', () => {
  const porCalle = new Map<string, string[]>()
  for (const piso of PISOS) {
    const calle = piso.calle
    porCalle.set(calle, [...(porCalle.get(calle) ?? []), piso.alias])
  }
  assert.deepEqual(porCalle.get('Calle Monte Carmelo 68'), ['Monte Carmelo'])
  // Socorro 24 y Villasís 1 son de un solo piso; Bustos Tavera 22, exactamente de dos.
  assert.deepEqual(porCalle.get('Calle Socorro 24'), ['House Sevillana'])
  assert.deepEqual(porCalle.get('Pasaje Villasís 1'), ['Dúplex Center'])
  assert.deepEqual(porCalle.get('Calle Bustos Tavera 22'), ['Luxury Busto', 'Busto Reform'])
})

test('el mapeo de recibos de alquiler respeta el mismo lado', () => {
  // `mapeaPropiedadAlquiler` (probado en `agente-facturas.test.ts`) reparte los recibos de
  // Gutiérrez Alcalá por el lado que dice el concepto. Aquí sólo se ancla que la fuente de
  // verdad de ese lado sigue siendo la misma que la del seed.
  const skill = readFileSync(join(ROOT, '.claude/skills/perfil-fiscal/references/entidades-y-propiedades.md'), 'utf8')
  // Por FILA de la tabla, no por formato exacto: lo que se ancla es el lado, no la negrita.
  const fila = (alias: string) => {
    const l = skill.split('\n').find((x) => x.startsWith(`| **${alias}**`))
    assert.ok(l, `La skill perfil-fiscal ya no tiene fila para ${alias}`)
    return l
  }
  assert.match(fila('Busto Reform'), /izquierda/)
  assert.doesNotMatch(fila('Busto Reform'), /derecha/)
  assert.match(fila('Luxury Busto'), /derecha/)
  assert.doesNotMatch(fila('Luxury Busto'), /izquierda/)
})
