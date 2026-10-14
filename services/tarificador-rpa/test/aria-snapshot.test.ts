// Árbol de accesibilidad del fallo (14/10/2026): redacción PURA sobre un snapshot realista de Allianz (con iframe) y
// prueba de integración con Chromium real (datos inventados). `npm test`.

import assert from 'node:assert/strict'
import { describe, test, before, after } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser } from 'playwright'
import { capturarAriaRedactado, MARCA_RECORTE, MARCA_VALOR, MAX_BYTES_ARIA, recortarBytes, redactarAriaSnapshot, separarAria, seccionAria } from '../src/aria-snapshot.ts'
import { capturarEvidencia, separarMarcos } from '../src/evidencia.ts'
import { redactarHtml } from '@central/module-tarificacion'

// Datos INVENTADOS.
const SNAPSHOT = `- generic [active] [ref=e1]:
  - heading "ePAC · Cotizador Comunidades" [level=1] [ref=e2]
  - iframe [ref=e3]:
    - generic [ref=f1e1]:
      - text: Nombre del tomador
      - textbox "Nombre del tomador" [ref=f1e3]: Pepa Pérez Gómez
      - textbox "NIF / CIF" [ref=f1e4] [required]: 12345678Z
      - textbox "Fecha de nacimiento" [ref=f1e5]: 17/05/1980
      - textbox "Móvil" [ref=f1e6]: 600 123 456
      - textbox "Email" [ref=f1e7]: pepa@ejemplo.es
      - textbox "IBAN" [ref=f1e8]: ES9121000418450200051332
      - textbox "Matrícula" [ref=f1e9]: 1234 BCD
      - textbox "Dirección" [ref=f1e10]: Calle Inventada 3, 2º B
      - textbox "Código postal" [ref=f1e11]: "41003"
      - combobox "Provincia" [ref=f1e12]:
        - option "Sevilla" [selected]
        - option "Cádiz"
      - spinbutton "Nº de viviendas" [ref=f1e13]: "24"
      - searchbox "Buscar: población" [ref=f1e14]: Sevilla
      - textbox "Observaciones: texto \\"libre\\"" [ref=f1e15]
      - checkbox "Acepto" [checked] [ref=f1e16]
      - button "Calcular" [ref=f1e17]
      - link "Ver ficha" [ref=f1e18] [cursor=pointer]:
        - /url: /ficha?dni=87654321X&tel=611222333#top
      - dialog "Poblaciones" [ref=f1e19]:
        - row "41003 SEVILLA" [ref=f1e20]
      - paragraph [ref=f1e21]: Tomador 12345678Z, contacto pepa@ejemplo.es, nacida el 17-05-1980, nif B12345674, NIE X1234567L`

const SENSIBLES = ['Pepa', 'Pérez', '12345678Z', '17/05/1980', '17-05-1980', '600 123 456', '600123456', 'pepa@ejemplo.es', 'ES9121000418450200051332', '1234 BCD', 'Inventada', '87654321X', '611222333', 'B12345674', 'X1234567L', '"41003"', '"24"']

describe('redactarAriaSnapshot', () => {
  const r = redactarAriaSnapshot(SNAPSHOT)
  test('ningún dato sensible sobrevive', () => {
    for (const s of SENSIBLES) assert.ok(!r.includes(s), `se ha colado «${s}»:\n${r}`)
  })
  test('los valores de los campos pasan a «valor»', () => {
    assert.match(r, /- textbox "NIF \/ CIF" \[ref=f1e4\] \[required\]: «valor»/)
    assert.match(r, /- combobox "Provincia" \[ref=f1e12\]:\n/) // sin valor en línea: no se inventa
    assert.match(r, /- spinbutton "Nº de viviendas" \[ref=f1e13\]: «valor»/)
    assert.match(r, /- searchbox "Buscar: población" \[ref=f1e14\]: «valor»/)
  })
  test('conserva roles, nombres, refs, atributos y estructura', () => {
    for (const t of ['- heading "ePAC · Cotizador Comunidades" [level=1] [ref=e2]', '- iframe [ref=e3]:', '- text: Nombre del tomador',
      '- button "Calcular" [ref=f1e17]', '- checkbox "Acepto" [checked] [ref=f1e16]', '- dialog "Poblaciones" [ref=f1e19]:', '- row "41003 SEVILLA" [ref=f1e20]',
      '- option «valor» [selected]', '- option "Cádiz"', '- link "Ver ficha" [ref=f1e18] [cursor=pointer]:', '- /url: /ficha']) assert.ok(r.includes(t), `falta «${t}»`)
    assert.equal(r.split('\n').length, SNAPSHOT.split('\n').length)
  })
  test('un campo sin valor sigue sin valor (vacío ≠ tapado)', () => {
    assert.match(r, /- textbox "Observaciones: texto \\"libre\\"" \[ref=f1e15\]$/m)
  })
  test('nombre con «: » dentro de comillas no desplaza el valor', () => {
    assert.equal(redactarAriaSnapshot('- textbox "A: B" [ref=e1]: secreto'), `- textbox "A: B" [ref=e1]: ${MARCA_VALOR}`)
  })
  test('valor en bloque (| o >) se descarta con sus líneas de continuación', () => {
    const t = redactarAriaSnapshot('- textbox "Obs" [ref=e1]: |\n    linea uno privada\n    linea dos privada\n- button "Ok" [ref=e2]')
    assert.ok(!t.includes('privada'))
    assert.ok(t.includes('- button "Ok" [ref=e2]'))
  })
  test('línea de campo no interpretable: fail-closed', () => {
    const t = redactarAriaSnapshot('- textbox raro sin comillas Pepa Pérez')
    assert.ok(!t.includes('Pepa'))
  })
  test('idempotente', () => assert.equal(redactarAriaSnapshot(r), r))
  test('los refs no se confunden con cifras sensibles', () => {
    assert.ok(redactarAriaSnapshot('- button "X" [ref=f12e345]').includes('[ref=f12e345]'))
  })
})

describe('opciones elegidas y recorte previo (privacidad)', () => {
  test('option/radio/treeitem/listitem elegidos pierden el NOMBRE; los no elegidos y el checkbox conservan el suyo', () => {
    const t = redactarAriaSnapshot('- option "Sevilla" [selected] [ref=e1]\n- option "Cádiz" [ref=e2]\n- radio "Mujer" [checked]\n- radio "Hombre"\n- treeitem "Tomador Pepa" [selected]\n- listitem "Pepa Pérez" [selected]: texto privado\n- checkbox "Acepto" [checked]')
    for (const x of ['Sevilla', 'Mujer', 'Pepa', 'privado']) assert.ok(!t.includes(x), `se ha colado «${x}»:\n${t}`)
    for (const x of ['- option «valor» [selected] [ref=e1]', '- option "Cádiz" [ref=e2]', '- radio «valor» [checked]', '- radio "Hombre"', '- checkbox "Acepto" [checked]']) assert.ok(t.includes(x), `falta «${x}»`)
    assert.equal(redactarAriaSnapshot(t), t)
  })
  test('capturarAriaRedactado: el recorte final va en límite de línea y no deja trozos de dato', async () => {
    const page = { ariaSnapshot: async () => '- text: Titular 12345678Z fin\n'.repeat(200) } as never
    const t = (await capturarAriaRedactado(page, { maxBytes: 305 }))!
    // 305 − 14 (marca) = 291 = 9 líneas de 30 + 21: el tope CAE EN MITAD DEL DNI. Recortando antes de redactar quedaba «12345».
    assert.ok(Buffer.byteLength(t) <= 305)
    assert.ok(!t.includes('12345'), t)
    assert.ok(t.endsWith(MARCA_RECORTE))
    assert.ok(t.split('\n').slice(0, -1).every((l) => l.startsWith('- text:') && l.endsWith('fin')))
  })
})

describe('recorte y sección', () => {
  test('recorta a bytes con marca y sin partir UTF-8', () => {
    const t = recortarBytes('ñ'.repeat(5000), 1000)
    assert.ok(Buffer.byteLength(t) <= 1000)
    assert.ok(t.endsWith(MARCA_RECORTE))
    assert.ok(!t.includes('�'))
    assert.equal(recortarBytes('corto', 1000), 'corto')
  })
  test('seccionAria/separarAria ida y vuelta; «-->» no cierra el comentario', () => {
    const s = seccionAria('- a "x --> y"')
    assert.equal(s.match(/-->/g)!.length, 1)
    const { html, aria } = separarAria(`<html></html>${s}`)
    assert.equal(html, '<html></html>')
    assert.ok(aria!.startsWith('- a "x'))
    assert.deepEqual(separarAria('<p>sin sección</p>'), { html: '<p>sin sección</p>', aria: null })
  })
  test('separarMarcos ignora la sección (no ensucia el último marco)', () => {
    const base = 'P<!-- tarificador:marco ruta="appArea" -->\nM'
    const a = separarMarcos(base)
    const b = separarMarcos(base + seccionAria('- x'))
    assert.deepEqual(b, a)
  })
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

const MARCO = `<!doctype html><meta charset="utf-8"><form><label for="n">Nombre del tomador</label><input id="n" value="Pepa Pérez Gómez">
<label for="d">NIF</label><input id="d" value="12345678Z"><label for="m">Matrícula</label><input id="m" value="1234 BCD">
<button type="button">Continuar</button></form>`

describe('integración con Chromium real', () => {
  let browser: Browser
  before(async () => { browser = await lanzar() })
  after(async () => browser?.close())

  async function pagina() {
    const context = await browser.newContext()
    await context.route('**/*', (r) => r.abort())
    const page = await context.newPage()
    page.setDefaultTimeout(3_000)
    await page.setContent(`<!doctype html><meta charset="utf-8"><h1>Cotizador</h1><iframe name="appArea" srcdoc="${MARCO.replace(/"/g, '&quot;')}"></iframe>`)
    await page.frame({ name: 'appArea' })!.waitForSelector('button')
    return { page, context }
  }

  test('el snapshot sale con el iframe y SIN el DNI/nombre/matrícula', async () => {
    const { page, context } = await pagina()
    const a = await capturarAriaRedactado(page)
    assert.ok(a, 'hay snapshot')
    assert.match(a!, /heading "Cotizador"/)
    assert.match(a!, /textbox "NIF" \[ref=\w+\]: «valor»/)
    assert.match(a!, /button "Continuar"/)
    for (const s of ['12345678Z', 'Pepa', 'Pérez', '1234 BCD']) assert.ok(!a!.includes(s), `se coló ${s}`)
    await context.close()
  })

  test('capturarEvidencia lo mete como sección del HTML y redactarHtml lo respeta', async () => {
    const { page, context } = await pagina()
    const ev = await capturarEvidencia(page)
    assert.ok(ev.html)
    const { aria } = separarAria(ev.html!)
    assert.ok(aria && /textbox "NIF"/.test(aria))
    assert.ok(ev.html!.includes('tarificador:aria'))
    const salida = redactarHtml(ev.html!, [])
    assert.ok(separarAria(salida).aria?.includes('«valor»'))
    await context.close()
  })

  test('página cerrada: devuelve null y nunca lanza; la evidencia sigue', async () => {
    const { page, context } = await pagina()
    await context.close()
    assert.equal(await capturarAriaRedactado(page), null)
    const ev = await capturarEvidencia(page)
    assert.equal(ev.html, null)
  })

  test('timeout corto: no se espera más de lo pedido', async () => {
    const { page, context } = await pagina()
    const t0 = Date.now()
    const a = await capturarAriaRedactado(page, { timeoutMs: 1 })
    assert.ok(Date.now() - t0 < 2_000)
    assert.ok(a === null || typeof a === 'string')
    await context.close()
  })

  test('tope de tamaño', async () => {
    const { page, context } = await pagina()
    await page.setContent(`<!doctype html>${'<p>fila de texto largo para llenar el árbol</p>'.repeat(20_000)}`)
    const a = await capturarAriaRedactado(page, { maxBytes: 10_000 })
    assert.ok(a && Buffer.byteLength(a) <= 10_000 && a.endsWith(MARCA_RECORTE))
    assert.ok(MAX_BYTES_ARIA === 200 * 1024)
    await context.close()
  })
})

describe('capturarEvidencia: pantallazo y árbol aria en paralelo', () => {
  test('ambos arrancan antes de que acabe ninguno', async () => {
    const orden: string[] = []
    let suelta!: () => void
    const puerta = new Promise<void>((r) => { suelta = r })
    const page = {
      url: () => 'https://x.test/',
      screenshot: async () => { orden.push('shot-ini'); await puerta; orden.push('shot-fin'); return Buffer.from('png') },
      ariaSnapshot: async () => { orden.push('aria-ini'); await puerta; orden.push('aria-fin'); return '- button "Ok" [ref=e1]' },
      frames: () => [], mainFrame: () => ({ url: () => '' }), content: async () => '<p>x</p>',
    } as never
    const p = capturarEvidencia(page)
    await new Promise((r) => setTimeout(r, 20))
    assert.deepEqual(orden.slice(0, 2).sort(), ['aria-ini', 'shot-ini']) // en serie, aria no habría arrancado
    suelta()
    const ev = await p
    assert.ok(ev.captura)
  })
})
