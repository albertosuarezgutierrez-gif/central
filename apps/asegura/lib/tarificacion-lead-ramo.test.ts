// Cepo (19/10/2026): `companiasConBot` no cuenta compañías que no tarifican el ramo por RPA. Un lead de hogar con SOLO
// mapfre/hogar activa (esa fila habilita solo EXPLORAR) es `sin_bot`, no `sin_formulario`. `node --test`. Sin datos personales.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { companiaAdmiteRamoRpa } from './tarificador-reglas.ts'

const src = readFileSync(join(import.meta.dirname, 'tarificacion-lead.ts'), 'utf8')
const fnCias = src.slice(src.indexOf('async function companiasConBot'), src.indexOf('async function descifrarContrato'))
const fnRev = src.slice(src.indexOf('async function revisarInterno'), src.indexOf('const publico ='))

test('hogar con solo mapfre activa: la regla pura la excluye y companiasConBot la salta', () => {
  assert.equal(companiaAdmiteRamoRpa('mapfre', 'hogar'), false)
  assert.equal(companiaAdmiteRamoRpa('allianz', 'hogar'), true)
  assert.match(fnCias, /if \(!companiaAdmiteRamoRpa\(f\.compania, ramo\)\) continue/)
})

test('sin compañías válidas el lead es `sin_bot` (antes que `sin_formulario`)', () => {
  const iCias = fnRev.indexOf('companiasConBot(')
  const iSinBot = fnRev.indexOf("if (!cias.length) { ops.push({ ...base, estado: 'sin_bot' }); continue }")
  const iSinForm = fnRev.indexOf("estado: 'sin_formulario'")
  assert.ok(iCias > 0 && iSinBot > iCias && iSinForm > iSinBot)
})
