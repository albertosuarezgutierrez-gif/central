import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Guardián de la ficha de cliente de la correduría con pestañas (03/09/2026).
 *
 * 🚨 Lo que protege es UNA promesa: **lo que exige una llamada vive en la
 * cabecera, fuera de las pestañas.** El CRM anterior de Alberto necesita
 * chapitas rojas precisamente porque lo que no está en la pestaña abierta no
 * existe; un recibo devuelto escondido tras un clic es un recibo que no se
 * reclama. Si alguien "ordena" la pantalla metiendo los contadores dentro de la
 * pestaña «Resumen», la ficha vuelve a ese fallo sin que nada se rompa.
 */

const DIR = path.join(process.cwd(), 'apps/plataforma/app/(usuario)/correduria/cliente/[id]')
const leer = (f: string) => readFileSync(path.join(DIR, f), 'utf8')

test('la cabecera se monta FUERA de las pestañas y lleva los contadores de alarma', () => {
  const page = leer('page.tsx')
  // Montada sin condición de pestaña: se ve en las siete.
  assert.match(page, /<Cabecera ficha=\{ficha\} resumen=\{resumen\} \/>/)
  assert.doesNotMatch(page, /tab === '\w+' && \(?\s*<Cabecera/, 'la cabecera no puede colgar de una pestaña')

  const cab = leer('Cabecera.tsx')
  for (const titular of ['Recibos devueltos', 'Recibos al cobro', 'Siniestros abiertos', 'Pólizas vivas']) {
    assert.ok(cab.includes(titular), `«${titular}» tiene que estar en la cabecera`)
  }
})

test('los tres estados siguen vivos: «—» no es 0 y 0 no es «—»', () => {
  const cab = leer('Cabecera.tsx')
  // El «no se ha podido mirar» se pinta como «—», y sale de un `=== null`.
  assert.match(cab, /devueltos === null \? '—'/)
  assert.match(cab, /pendientes === null \? '—'/)
  assert.match(cab, /abiertos === null \? '—'/)
  // Y nunca se colapsa lo no informado a cero.
  assert.doesNotMatch(cab, /\?\?\s*0/, '?? 0 convierte «no se sabe» en «no hay»')
  assert.doesNotMatch(cab, /\|\|\s*0/)
})

test('la fecha grande del quinto tile es el LÍMITE DE AVISO, no el vencimiento', () => {
  // LCS art. 22: el tomador tiene que oponerse un mes antes. Enseñar el
  // vencimiento como fecha de acción deja creer que hay 30 días más de los que
  // hay — el plazo ya se pasó cuando el cliente mira el calendario.
  const cab = leer('Cabecera.tsx')
  assert.match(cab, /valor=\{fmt\(proximo\.limiteAviso\)\}/)
  assert.match(cab, /Hay que avisar antes del/)
  assert.ok(cab.includes('vence el ${fmt(proximo.vencimiento)}'), 'el vencimiento se dice, pero debajo')
})

test('un ?tab= desconocido cae en «Resumen» en vez de dejar la ficha en blanco', async () => {
  const { tabDeParametro } = await import('../apps/plataforma/app/(usuario)/correduria/cliente/[id]/tabs.ts')
  assert.equal(tabDeParametro(undefined), 'resumen')
  assert.equal(tabDeParametro('recibos'), 'recibos')
  assert.equal(tabDeParametro('inventada'), 'resumen')
  assert.equal(tabDeParametro(['polizas', 'recibos']), 'polizas')
})

test('un contador nulo NO se pinta (0 diría «se miró y no hay»)', () => {
  const tabs = leer('FichaTabs.tsx')
  assert.match(tabs, /c\.n !== null && c\.n > 0/)
})

test('las pestañas no se prefetchean: cada una repite la llamada al puerto', () => {
  // `fichaAsegura` trae la ficha entera de una vez; prefetchear las siete serían
  // siete consultas a la cartera por pasar el ratón por encima.
  assert.match(leer('FichaTabs.tsx'), /prefetch=\{false\}/)
})

test('la sección lleva el acento de Grupo Asegura por TOKENS, no por hex sueltos', () => {
  const layout = readFileSync(path.join(process.cwd(), 'apps/plataforma/app/(usuario)/correduria/layout.tsx'), 'utf8')
  assert.match(layout, /className="correduria"/)
  const css = readFileSync(path.join(process.cwd(), 'apps/plataforma/app/globals.css'), 'utf8')
  // #3364ee = oklch(0.555 0.215 265), el cobalto de app.grupoasegura.com.
  assert.match(css, /\.correduria\s*\{[^}]*--primary:\s*#3364ee/)
  assert.match(css, /\[data-theme="dark"\]\s*\.correduria/)
  for (const f of ['Cabecera.tsx', 'FichaTabs.tsx', 'TabResumen.tsx', 'TabRecibos.tsx']) {
    assert.doesNotMatch(leer(f), /#[0-9a-fA-F]{3,6}\b/, `${f}: solo tokens var(--…), sin hex`)
  }
})
