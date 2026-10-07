// Cepo del aviso de una PROPUESTA (lote de escenarios). Lee el FUENTE, como `envio-presupuesto.test.ts`: lo que
// vigila es el ORDEN (validar todo → rotar), y el módulo importa Prisma, que `node --test` no carga.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('./propuesta-escenarios.ts', import.meta.url), 'utf8')
const avisar = src.slice(src.indexOf('export async function avisarPropuesta'), src.indexOf('class RotacionPerdida'))

test('🪤 ningún escenario rota su llave antes de que TODOS hayan pasado sus guardas', () => {
  const validar = avisar.indexOf('await prepararAviso(')
  const corte = avisar.indexOf('if (hayFallo) {')
  const corteVuelve = avisar.indexOf("return { estado: 'error', grupos, items }", corte)
  const primeraEscritura = Math.min(
    ...['avisarGrupoPorCorreo(', 'rotarWhatsappLote(', 'ejecutarAviso(', 'avisarPresupuesto('].map((s) => avisar.indexOf(s)).filter((i) => i >= 0),
  )
  assert.ok(validar > 0, 'valida cada escenario con prepararAviso')
  assert.ok(corte > validar && corteVuelve > corte, 'el corte por fallo va detrás de validar y vuelve sin escribir')
  assert.ok(primeraEscritura > corteVuelve, 'la primera escritura va detrás del corte')
  // La validación no escribe: no hay rotación ni sello dentro del bucle de preparación.
  assert.doesNotMatch(avisar.slice(validar, corte), /ejecutarAviso\(|updateMany\(|\$executeRaw/)
})

test('🪤 el WhatsApp del lote rota en UNA transacción y lleva el código de cada escenario', () => {
  const rotar = src.slice(src.indexOf('async function rotarWhatsappLote'), src.indexOf('async function avisarGrupoPorCorreo'))
  assert.match(rotar, /\$transaction\(async \(tx\) =>/)
  assert.match(rotar, /ejecutarAviso\(prep, null, tx\)/)
  assert.match(avisar, /enlaces: enl\.map\(\(x\) => \(\{ numero: x\.numero, enlace: x\.enlace, codigo: x\.codigo \}\)\)/)
})
