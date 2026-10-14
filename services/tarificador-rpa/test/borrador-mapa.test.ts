// Borrador de mapa desde el ariaSnapshot (14/10/2026, Fase 3). Datos INVENTADOS. `npm test`.
import assert from 'node:assert/strict'
import { describe, test, before, after } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser } from 'playwright'
import { borradorMapaDesdeAria, renderizarBorradorTs, claveCamel } from '../scripts/lib/borrador-mapa.ts'
import { redactarAriaSnapshot, MARCA_VALOR } from '../src/aria-snapshot.ts'

const SNAPSHOT = `- generic [active] [ref=e1]:
  - heading "ePAC · Cotizador Comunidades" [level=1] [ref=e2]
  - iframe "appArea" [ref=e3]:
    - generic [ref=f1e1]:
      - text: Nombre del tomador
      - textbox "Nombre del tomador" [ref=f1e3]: Pepa Pérez Gómez
      - textbox "NIF / CIF" [ref=f1e4] [required]: 12345678Z
      - textbox "Código postal" [ref=f1e5] [required]: "41003"
      - button "Buscar población" [ref=f1e6]
      - combobox "Provincia" [ref=f1e7]:
        - option "Sevilla" [selected]
        - option "Cádiz"
      - text: Teléfono de contacto
      - textbox [ref=f1e8]: 600 123 456
      - textbox "Observaciones" [ref=f1e9]
      - textbox "Observaciones" [ref=f1e10]
      - checkbox "Acepto las condiciones" [checked] [ref=f1e11]
      - radio "Anual" [ref=f1e12]
      - radio "Semestral" [checked] [ref=f1e13]
      - radiogroup "Forma de pago" [ref=f1e14]:
        - radio "Contado" [ref=f1e15]
        - radio "Fraccionado" [ref=f1e16]
      - spinbutton "Nº de viviendas" [ref=f1e17]: "24"
      - alert [ref=f1e18]:
        - text: El campo NIF es obligatorio
      - button "Calcular" [disabled] [ref=f1e19]
      - link "Ver ficha" [ref=f1e20]:
        - /url: /ficha
      - dialog "Poblaciones" [ref=f1e21]:
        - row "41003 SEVILLA" [ref=f1e22]
        - row "41004 SEVILLA NORTE" [ref=f1e23]
        - button "Cerrar" [ref=f1e24]
  - iframe [ref=e4]:
    - searchbox "Buscar" [ref=f2e1]: Sevilla`

const OPTS = { compania: 'allianz', ramo: 'comunidades', pantalla: 'datos-riesgo', fecha: new Date(2026, 9, 14) }
const b = borradorMapaDesdeAria(redactarAriaSnapshot(SNAPSHOT), OPTS)
const ts = renderizarBorradorTs(b)
const por = (clave: string) => b.controles.find((c) => c.clave === clave)!

describe('borradorMapaDesdeAria', () => {
  test('localizadores con rol, nombre exacto y frameLocator del marco', () => {
    assert.equal(por('nifCif').localizador, `page.frameLocator('iframe[name="appArea"]').getByRole('textbox', { name: 'NIF / CIF', exact: true })`)
    assert.equal(por('provincia').rol, 'combobox')
    assert.deepEqual(por('provincia').opciones, ['Sevilla', 'Cádiz'])
    assert.equal(por('nifCif').requerido, true)
    assert.equal(por('botonCalcular').deshabilitado, true)
    assert.equal(por('nDeViviendas').rol, 'spinbutton')
    assert.equal(por('enlaceVerFicha').rol, 'link')
  })
  test('iframe sin nombre: por posición; marco anidado por ruta', () => {
    const c = por('buscar')
    assert.equal(c.rol, 'searchbox')
    assert.equal(c.localizador, `page.frameLocator('iframe').nth(1).getByRole('searchbox', { name: 'Buscar', exact: true })`)
    const anid = borradorMapaDesdeAria('- iframe "a" [ref=e1]:\n  - iframe [ref=e2]:\n    - textbox "X" [ref=e3]', OPTS)
    assert.equal(anid.controles[0].localizador, `page.frameLocator('iframe[name="a"]').frameLocator('iframe').nth(0).getByRole('textbox', { name: 'X', exact: true })`)
  })
  test('diálogo de poblaciones: filas y controles con ámbito', () => {
    const d = por('dialogoPoblaciones')
    assert.equal(d.tipo, 'dialogo')
    assert.deepEqual(d.opciones, ['41003 SEVILLA', '41004 SEVILLA NORTE'])
    assert.match(por('botonCerrar').localizador!, /\.getByRole\('dialog', \{ name: 'Poblaciones', exact: true \}\)\.getByRole\('button', \{ name: 'Cerrar'/)
  })
  test('alert: texto del mensaje', () => {
    const m = b.controles.find((c) => c.tipo === 'mensaje')!
    assert.equal(m.texto, 'El campo NIF es obligatorio')
  })
  test('texto suelto con «obligatorio» también es mensaje', () => {
    const x = borradorMapaDesdeAria('- paragraph [ref=e1]: Campo obligatorio: Matrícula', OPTS)
    assert.equal(x.controles[0].tipo, 'mensaje')
  })
  test('nombres duplicados llevan nth y aviso', () => {
    const [a, c] = b.controles.filter((x) => x.nombre === 'Observaciones')
    assert.equal([a.nth, c.nth].join(), '0,1')
    assert.match(a.localizador!, /\.nth\(0\)$/)
    assert.ok(a.avisos.some((v) => v.includes('duplicado')))
    assert.notEqual(a.clave, c.clave)
  })
  test('control sin nombre: sin localizador, aviso y etiqueta cercana', () => {
    const s = b.controles.find((c) => !c.nombre && c.rol === 'textbox')!
    assert.equal(s.localizador, null)
    assert.ok(s.avisos.includes('sin nombre: necesita selector CSS manual'))
    assert.ok(s.avisos.some((v) => v.includes('Teléfono de contacto')))
  })
  test('radios: agrupados por radiogroup; los sueltos, aviso de «sin grupo»', () => {
    assert.equal(por('radioContado').grupo, 'Forma de pago')
    assert.ok(por('radioAnual').avisos.some((v) => v.includes('sin grupo')))
    assert.equal(por('radioAnual').grupo, por('radioSemestral').grupo)
  })
  test('claveCamel', () => {
    assert.equal(claveCamel('Código postal'), 'codigoPostal')
    assert.equal(claveCamel('NIF / CIF'), 'nifCif')
    assert.equal(claveCamel('1ª matrícula'), 'c1Matricula')
    assert.equal(claveCamel('Calcular', 'boton'), 'botonCalcular')
  })
  test('snapshot vacío o basura: sin controles y sin lanzar', () => {
    assert.deepEqual(borradorMapaDesdeAria('', OPTS).controles, [])
    assert.deepEqual(borradorMapaDesdeAria('basura\n\n  ???', OPTS).controles, [])
  })
})

describe('renderizarBorradorTs', () => {
  test('cabecera, constante y TODOs', () => {
    assert.match(ts, /^\/\/ BORRADOR generado desde evidencia — revisar a mano antes de usar; no está registrado\./)
    assert.match(ts, /Compañía: allianz · Ramo: comunidades · Pantalla: datos-riesgo · Fecha: 14\/10\/2026/)
    assert.match(ts, /export const CAMPOS_DATOS_RIESGO = \{/)
    assert.match(ts, /\} as const\n$/)
    assert.match(ts, /codigoPostal: \(page: Page\) => page\.frameLocator\('iframe\[name="appArea"\]'\)\.getByRole\('textbox', \{ name: 'Código postal', exact: true \}\),/)
    assert.match(ts, /TODO sin nombre: necesita selector CSS manual/)
    assert.match(ts, /TODO nombre duplicado/)
    assert.match(ts, /TODO radio sin grupo/)
    assert.match(ts, /obligatorio/)
    assert.match(ts, /deshabilitado/)
  })
  test('ningún valor (ni «valor», ni opción preseleccionada) en la salida', () => {
    for (const s of ['Pepa', 'Pérez', '12345678Z', '600 123 456', '"24"', MARCA_VALOR, 'valor', 'selected', 'checked']) {
      assert.ok(!ts.includes(s), `se coló «${s}»`)
    }
    assert.ok(!/\b24\b/.test(ts.replace(/Nº de viviendas/g, '')))
    assert.ok(!ts.includes('Sevilla [selected]'))
  })
  test('es determinista', () => assert.equal(renderizarBorradorTs(borradorMapaDesdeAria(redactarAriaSnapshot(SNAPSHOT), OPTS)), ts))
})

async function lanzar(): Promise<Browser> {
  try { return await chromium.launch({ headless: true }) } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(base) ? readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(base, dir, 'chrome-linux', 'chrome') : null
    if (!exe || !existsSync(exe)) throw e
    return chromium.launch({ headless: true, executablePath: exe })
  }
}

describe('integración con Chromium real', () => {
  let browser: Browser
  before(async () => { browser = await lanzar() })
  after(async () => browser?.close())
  test('ariaSnapshot real → redacción → borrador: localizadores y cero valores', async () => {
    const marco = `<!doctype html><meta charset="utf-8"><label for="n">NIF</label><input id="n" value="12345678Z" required>
<label for="p">Provincia</label><select id="p"><option>Sevilla</option><option selected>Cádiz</option></select><button disabled>Calcular</button>`
    const context = await browser.newContext()
    await context.route('**/*', (r) => r.abort())
    const page = await context.newPage()
    await page.setContent(`<!doctype html><meta charset="utf-8"><iframe name="appArea" srcdoc="${marco.replace(/"/g, '&quot;')}"></iframe>`)
    await page.frame({ name: 'appArea' })!.waitForSelector('button')
    const crudo = await page.ariaSnapshot({ mode: 'ai', timeout: 5000 })
    await context.close()
    const real = borradorMapaDesdeAria(redactarAriaSnapshot(crudo), OPTS)
    const salida = renderizarBorradorTs(real)
    assert.ok(real.controles.some((c) => c.rol === 'textbox' && c.nombre === 'NIF'), crudo)
    assert.ok(real.controles.some((c) => c.rol === 'button' && c.nombre === 'Calcular' && c.deshabilitado))
    assert.ok(!salida.includes('12345678Z') && !salida.includes(MARCA_VALOR))
    assert.ok(!/Cádiz\b.*seleccion/.test(salida))
  })
})
