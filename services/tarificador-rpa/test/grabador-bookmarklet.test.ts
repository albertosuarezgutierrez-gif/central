// Bookmarklet «Grabar pantalla ASegura» (07/10/2026) en un Chromium DE VERDAD: un «portal» con marcos del
// mismo origen anidados y uno de otro origen, campos rellenos con datos personales y una contraseña. Se
// ejecuta el código EXACTO del marcador (`codigoBookmarklet()`), se recoge la descarga y se comprueba la
// serialización de marcos (mismo formato que evidencia.ts: `separarMarcos` la deshace), los `data-valor`, la
// redacción y que no sale ni una petición de red. Sin navegador disponible, el test se SALTA (lo dice).
//
// Chromium: el de Playwright; si su revisión no está instalada, `GRABADOR_CHROMIUM` o /opt/pw-browsers.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { chromium, type Browser, type BrowserContext } from 'playwright'
import { AVISO_MARCO_NO_LEGIBLE, archivosExtension, codigoBookmarklet, codigoBookmarkletManual } from '@central/module-tarificacion'
import { separarGrabacion } from '@central/module-tarificacion'
import { separarMarcos } from '../src/evidencia.ts'

const CANDIDATOS = [process.env.GRABADOR_CHROMIUM, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].filter((x): x is string => !!x && existsSync(x))

async function lanzar(): Promise<Browser | null> {
  try {
    return await chromium.launch()
  } catch {
    for (const ruta of CANDIDATOS) {
      try {
        return await chromium.launch({ executablePath: ruta })
      } catch {
        /* siguiente */
      }
    }
    return null
  }
}

const INTERNO = `<html><body><form><label for="matricula">Matrícula</label><input id="matricula" name="matricula">
<input type="text" name="tokenSesion" value="TOK-INTERNO-777"><button id="btnEmitir" type="button">Emitir</button></form></body></html>`
const COTIZADOR = `<html><head><script>window.secretoJs = "SECRETO_DEL_JS"</script></head><body><form id="fCot">
<label for="dni">DNI tomador</label><input id="dni" name="dni">
<label for="correo">Correo</label><input id="correo" name="correo" type="email">
<label for="iban">IBAN</label><input id="iban" name="iban">
<label for="tipo">Tipo de vivienda</label><select id="tipo" name="tipo"><option value="piso">Piso</option><option value="chalet">Chalet</option></select>
<label><input type="checkbox" id="alarma" name="alarma"> Alarma</label>
<input type="hidden" name="__VIEWSTATE" value="VIEWSTATE-SECRETO">
<p>Teléfono de contacto: 612 345 678</p>
<div id="app-header">209-C/12/0000 - Marta Mediadora Inventada</div>
<input name="nombre1" id="nombre1"><input name="apellido1" id="apellido1"><input name="razonSocial" id="razonSocial">
<input name="fNaci" id="fNaci"><input name="tom_fullDate" id="tom_fullDate"><input name="tom_address_street" id="tom_address_street">
<input name="tom_address_pc" id="tom_address_pc"><input name="mail1" id="mail1"><input name="codAgente" id="codAgente">
<input name="importeCapital" id="importeCapital"><input name="fechaEfecto" id="fechaEfecto">
<iframe name="interno" srcdoc="${INTERNO.replace(/"/g, '&quot;')}"></iframe>
</form></body></html>`
const PORTAL = `<!doctype html><html><head><title>Cotizador de Hogar</title><style>body{}</style></head><body>
<form id="login"><input id="usuario" name="usuario"><input id="pass" name="clave" type="password"></form>
<a href="/siguiente?paso=2&sessionid=SES-12345">Siguiente</a>
<div id="cabecera"><span id="nombreUsuario">Fulano Inventado</span><div class="cuenta-activa"><b>COD-INVENTADO-9911</b></div><span aria-label="Perfil del agente">Perfil-Inventado-X</span></div>
<button id="btnCalcular" type="button" session="3f2b8c1e-4d5a-4b6c-9d7e-1a2b3c4d5e6f" data-token="TKN-INVENTADO-1" csrf="CSRF-INVENTADO-2" data-ref="aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee">Calcular</button>
<iframe name="cotizador" src="/cotizador"></iframe>
<iframe name="externo" src="http://otro-origen.test/formulario/hogar?token=TOK-URL-555&id=77#frag-secreto"></iframe>
</body></html>`

test('bookmarklet: serializa marcos del mismo origen, anota valores, redacta y descarga sin red', async (t) => {
  const browser = await lanzar()
  if (!browser) return t.skip('sin Chromium disponible (instala el de Playwright o define GRABADOR_CHROMIUM)')
  try {
    const ctx = await browser.newContext({ acceptDownloads: true })
    await ctx.addCookies([{ name: 'sesion', value: 'COOKIE_SECRETA_42', url: 'http://portal.test/' }])
    const page = await ctx.newPage()
    await page.route('http://portal.test/', (r) => r.fulfill({ contentType: 'text/html', body: PORTAL }))
    await page.route('http://portal.test/cotizador', (r) => r.fulfill({ contentType: 'text/html', body: COTIZADOR }))
    await page.route('http://otro-origen.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<html><body><input id="ajeno" value="NO_SE_VE"></body></html>' }))
    await page.goto('http://portal.test/')
    await page.waitForFunction(() => {
      const f = document.querySelector('iframe[name=cotizador]') as HTMLIFrameElement | null
      const interno = f?.contentDocument?.querySelector('iframe[name=interno]') as HTMLIFrameElement | null
      return !!interno?.contentDocument?.querySelector('#matricula')
    })

    // Alberto rellena a mano (esto es el test, no el bookmarklet).
    await page.fill('#usuario', 'usuario-prueba')
    await page.fill('#pass', 'Contrasena.Secreta.99')
    const cot = page.frame({ name: 'cotizador' })!
    await cot.fill('#dni', '12345678Z')
    await cot.fill('#correo', 'ana.perez@correo.es')
    await cot.fill('#iban', 'ES91 2100 0418 4502 0005 1332')
    await cot.selectOption('#tipo', 'chalet')
    await cot.check('#alarma')
    for (const [id, v] of [['nombre1', 'Marta'], ['apellido1', 'Inventadez'], ['razonSocial', 'Razon Inventada SL'], ['fNaci', '01/02/1980'], ['tom_fullDate', '1980-02-01'],
      ['tom_address_street', 'Calle Falsa'], ['tom_address_pc', '41999'], ['mail1', 'inventado'], ['codAgente', 'AG7731'], ['importeCapital', '150000'], ['fechaEfecto', '15/11/2026']]) await cot.fill('#' + id, v)
    await page.frame({ name: 'interno' })!.fill('#matricula', '1234 BCD')

    const avisos: string[] = []
    page.on('dialog', (dl) => { avisos.push(dl.message()); void dl.dismiss() })
    const peticiones: string[] = []
    page.on('request', (r) => { if (/^https?:/.test(r.url())) peticiones.push(r.url()) })
    const descarga = page.waitForEvent('download')
    await page.evaluate(codigoBookmarkletManual())
    const d = await descarga
    const ruta = await d.path()
    const html = readFileSync(ruta!, 'utf8')

    assert.match(d.suggestedFilename(), /^pantalla-portal\.test-\d{8}-\d{6}\.html$/)
    assert.deepEqual(peticiones, [], 'el bookmarklet no hace peticiones de red')

    // Marcos: mismo formato que evidencia.ts.
    const s = separarMarcos(html)
    assert.deepEqual(s.marcos.map((m) => m.ruta.join('/')), ['cotizador', 'cotizador/interno', 'externo'])
    assert.match(s.marcos[0].html, /id="fCot"/)
    assert.match(s.marcos[1].html, /id="matricula"/)
    assert.match(s.marcos[2].html, /otro origen/)
    assert.ok(!html.includes('NO_SE_VE'), 'un marco de otro origen no se lee')
    // Marco no legible: la cabecera lista su URL SIN query ni #, y UN aviso NO bloqueante (sin alert) la nombra, también sin query.
    assert.match(s.principal, /marcos sin leer: 1 -->/)
    assert.match(s.principal, /<!-- grabador: marcos sin leer \(sin query ni tokens\): http:\/\/otro-origen\.test\/formulario\/hogar -->/)
    for (const crudo of ['TOK-URL-555', 'frag-secreto', 'id=77']) assert.ok(!html.includes(crudo), `la URL del marco filtra «${crudo}» en el fichero`)
    assert.deepEqual(avisos, [], 'nada de alert(): el aviso no bloquea')
    const toast = (await page.locator('[data-asegura-grabador-aviso] [role=status]').textContent()) ?? ''
    assert.ok(toast.startsWith(AVISO_MARCO_NO_LEGIBLE), toast)
    assert.match(toast, /· http:\/\/otro-origen\.test\/formulario\/hogar\n?Cerrar$/)
    assert.ok(!/TOK-URL-555|frag-secreto/.test(toast), 'el aviso no enseña la query')
    assert.match(s.principal, /^<!-- grabador ASegura v3 /)
    assert.match(s.principal, /data-grabador-marco="cotizador"/)

    // Valores anotados (sin datos personales) y opciones del select.
    assert.match(s.marcos[0].html, /<select[^>]*id="tipo"[^>]*data-valor="chalet"/)
    assert.match(s.marcos[0].html, /<option value="chalet" selected/)
    assert.match(s.marcos[0].html, /<option value="piso">Piso<\/option>/)
    assert.match(s.marcos[0].html, /id="alarma"[^>]*data-valor="marcado"|data-valor="marcado"[^>]*id="alarma"/)
    // Pantalla de login (hay un password): marcada en la cabecera y con el usuario tapado también.
    assert.match(s.principal, /PANTALLA DE LOGIN/)
    assert.match(s.principal, /id="usuario"[^>]*value="\[REDACTADO\]"|value="\[REDACTADO\]"[^>]*id="usuario"/)
    assert.match(s.principal, /id="usuario"[^>]*data-valor="\[REDACTADO\]"|data-valor="\[REDACTADO\]"[^>]*id="usuario"/)
    // Lo que el bot necesita para mapear sigue ahí (el marco del cotizador no tiene password).
    assert.match(s.marcos[0].html, /id="importeCapital"[^>]*data-valor="150000"/)
    assert.match(s.marcos[0].html, /id="fechaEfecto"[^>]*data-valor="15\/11\/2026"/)
    assert.match(s.marcos[0].html, /id="dni"[^>]*data-valor="\[(?:DATO|REDACTADO)\]"/)

    // Redacción: nada personal, ni contraseñas, ni ocultos, ni tokens, ni scripts, ni cookies.
    for (const crudo of [
      'Contrasena.Secreta.99', 'usuario-prueba', 'Marta', 'Inventadez', 'Razon Inventada', '01/02/1980', '1980-02-01', 'Calle Falsa', '41999', 'AG7731', 'Mediadora Inventada', '12345678Z', 'ana.perez@correo.es', 'ES91 2100', '612 345 678', '1234 BCD',
      'Fulano Inventado', 'COD-INVENTADO-9911', 'Perfil-Inventado-X', '3f2b8c1e-4d5a', 'TKN-INVENTADO-1', 'CSRF-INVENTADO-2', 'aaaaaaaa-bbbb',
      'VIEWSTATE-SECRETO', 'TOK-INTERNO-777', 'SES-12345', 'SECRETO_DEL_JS', 'COOKIE_SECRETA_42', '<script',
    ]) assert.ok(!html.includes(crudo), `se ha escapado «${crudo}»`)
    assert.match(s.principal, /id="pass"[^>]*value="\[REDACTADO\]"|value="\[REDACTADO\]"[^>]*id="pass"/)
    assert.match(s.marcos[1].html, /id="btnEmitir"/)
    // Atributos de sesión y UUID → [DATO]; texto del usuario/cuenta de la cabecera → [DATO]; el resto de la cabecera sigue.
    assert.match(s.principal, /id="btnCalcular"[^>]*session="\[DATO\]"/)
    assert.match(s.principal, /data-token="\[DATO\]"/)
    assert.match(s.principal, /data-ref="\[DATO\]"/)
    assert.match(s.principal, /<span id="nombreUsuario">\[DATO\]<\/span>/)
    assert.match(s.principal, /<b>\[DATO\]<\/b>/)
    assert.match(s.principal, />Calcular<\/button>/)
  } finally {
    await browser.close()
  }
})

// Marco de otro origen como ÚNICO contenido relevante: igualmente se descarga el fichero y se avisa UNA vez, sin bloquear.
test('bookmarklet: marcos ilegibles → descarga el fichero igualmente y UN aviso agregado no bloqueante', async (t) => {
  const browser = await lanzar()
  if (!browser) return t.skip('sin Chromium disponible (instala el de Playwright o define GRABADOR_CHROMIUM)')
  try {
    const ctx = await browser.newContext({ acceptDownloads: true })
    const page = await ctx.newPage()
    await page.route('http://portal.test/', (r) => r.fulfill({ contentType: 'text/html', body: '<html><head><title>Portal</title></head><body><iframe id="f1" src="http://catalana.test/app/form?sessionid=SES-AJENA-9&a=1"></iframe><iframe src="http://otra.test/x;jsessionid=JS-77?q=1"></iframe></body></html>' }))
    await page.route(/http:\/\/(catalana|otra)\.test\/.*/, (r) => r.fulfill({ contentType: 'text/html', body: '<html><body>ajeno</body></html>' }))
    await page.goto('http://portal.test/')
    await page.waitForLoadState('load')
    const avisos: string[] = []
    page.on('dialog', (dl) => { avisos.push(dl.message()); void dl.dismiss() })
    const descarga = page.waitForEvent('download')
    await page.evaluate(codigoBookmarkletManual())
    const html = readFileSync((await (await descarga).path())!, 'utf8')
    assert.match(html, /marcos sin leer: 2 -->/)
    assert.match(html, /marcos sin leer \(sin query ni tokens\): http:\/\/catalana\.test\/app\/form \| http:\/\/otra\.test\/x -->/)
    for (const crudo of ['SES-AJENA-9', 'JS-77', 'a=1', 'q=1']) assert.ok(!html.includes(crudo), `el fichero filtra «${crudo}»`)
    // Ni un alert; UN aviso con una línea por marco (sin query ni sesión).
    assert.deepEqual(avisos, [])
    assert.equal(await page.locator('[data-asegura-grabador-aviso]').count(), 1)
    const toast = (await page.locator('[data-asegura-grabador-aviso] [role=status]').textContent()) ?? ''
    assert.match(toast, /· http:\/\/catalana\.test\/app\/form\n· http:\/\/otra\.test\/x/)
    for (const crudo of ['SES-AJENA-9', 'JS-77']) assert.ok(!toast.includes(crudo), `el aviso enseña «${crudo}»`)
    // Volver a pulsar el marcador NO apila avisos.
    const otra = page.waitForEvent('download')
    await page.evaluate(codigoBookmarkletManual())
    await otra
    assert.equal(await page.locator('[data-asegura-grabador-aviso]').count(), 1)
    assert.deepEqual(avisos, [])
  } finally {
    await browser.close()
  }
})

test('bookmarklet: sin marcos ilegibles no hay alert ni línea de marcos', async (t) => {
  const browser = await lanzar()
  if (!browser) return t.skip('sin Chromium disponible (instala el de Playwright o define GRABADOR_CHROMIUM)')
  try {
    const ctx = await browser.newContext({ acceptDownloads: true })
    const page = await ctx.newPage()
    await page.route('http://portal.test/', (r) => r.fulfill({ contentType: 'text/html', body: '<html><body><p>hola</p></body></html>' }))
    await page.goto('http://portal.test/')
    const avisos: string[] = []
    page.on('dialog', (dl) => { avisos.push(dl.message()); void dl.dismiss() })
    const descarga = page.waitForEvent('download')
    await page.evaluate(codigoBookmarkletManual())
    const html = readFileSync((await (await descarga).path())!, 'utf8')
    assert.deepEqual(avisos, [])
    assert.ok(!html.includes('sin query ni tokens'))
  } finally {
    await browser.close()
  }
})

// ─── MODO AUTOMÁTICO (v3): una pulsación, una captura por cada pantalla nueva, UN fichero al terminar ───────────────────
const PORTAL_AUTO = `<!doctype html><html><head><title>Portal vivo</title></head><body>
<div id="app"><h1>PANTALLA-UNO</h1><form><input id="dni" name="dni"><input id="matricula" name="matricula"><input name="clave" type="password" id="clave"></form></div>
<iframe name="marco" src="/marco1"></iframe>
<iframe name="ajeno" src="http://otro-origen.test/form?token=TOK-AJENO-1"></iframe>
</body></html>`
const marcoHtml = (n: number) => `<html><body><h2>MARCO-${n}</h2><input id="mail${n}" name="mail${n}" value="ana${n}@correo.es"><input id="importe${n}" value="${n}00"></body></html>`

test('bookmarklet automático: 3 pantallas por navegación simulada, dedupe, redacción en cada una y UN fichero', async (t) => {
  const browser = await lanzar()
  if (!browser) return t.skip('sin Chromium disponible (instala el de Playwright o define GRABADOR_CHROMIUM)')
  try {
    const ctx = await browser.newContext({ acceptDownloads: true })
    const page = await ctx.newPage()
    await page.route('http://portal.test/', (r) => r.fulfill({ contentType: 'text/html', body: PORTAL_AUTO }))
    await page.route(/http:\/\/portal\.test\/marco(\d)/, (r) => r.fulfill({ contentType: 'text/html', body: marcoHtml(Number(/marco(\d)/.exec(r.request().url())![1])) }))
    await page.route('http://otro-origen.test/**', (r) => r.fulfill({ contentType: 'text/html', body: '<html><body>AJENO_NO_SE_VE</body></html>' }))
    await page.goto('http://portal.test/')
    await page.waitForFunction(() => !!(document.querySelector('iframe[name=marco]') as HTMLIFrameElement | null)?.contentDocument?.querySelector('#mail1'))
    await page.fill('#dni', '12345678Z')
    await page.fill('#clave', 'Clave.Secreta.77')
    const avisos: string[] = []
    page.on('dialog', (dl) => { avisos.push(dl.message()); void dl.dismiss() })
    const peticiones: string[] = []
    page.on('request', (r) => { if (/^https?:/.test(r.url())) peticiones.push(r.url()) })
    const n = (k: number) => page.locator(`text=/Grabando.*${k} pantalla/`).waitFor({ timeout: 8000 })

    await page.evaluate(codigoBookmarklet())
    await n(1) // pantalla 1: al pulsar
    const cuadro = (await page.locator('[data-asegura-grabador] div').allTextContents()).join('\n')
    assert.ok(cuadro.includes(AVISO_MARCO_NO_LEGIBLE) && cuadro.includes('· http://otro-origen.test/form'), cuadro)
    assert.ok(!cuadro.includes('TOK-AJENO-1'), 'el aviso del cuadro no enseña la query')
    // Pulsar otra vez el marcador no duplica el indicador ni la pantalla (solo «guarda ahora»: mismo HTML → dedupe).
    await page.evaluate(codigoBookmarklet())
    assert.equal(await page.locator('[data-asegura-grabador]').count(), 1)

    // Cambio de URL SIN cambio de pantalla: misma huella → no se duplica.
    await page.evaluate(() => { location.hash = '#paso1b' })
    await page.waitForTimeout(2600)
    await n(1)

    // Pantalla 2: cambia el hash y se rehace el DOM (mutación grande con debounce).
    await page.evaluate(() => {
      location.hash = '#paso2'
      const app = document.getElementById('app')!
      let h = '<h1>PANTALLA-DOS</h1><form><input id="iban" name="iban" value="ES91 2100 0418 4502 0005 1332"><input id="nombre1" name="nombre1" value="Marta Inventada"><p>Tel 612 345 678</p>'
      for (let i = 0; i < 30; i++) h += `<div><span>fila ${i}</span></div>`
      app.innerHTML = h + '</form>'
    })
    await n(2)
    // Pantalla 3: navega un marco del mismo origen.
    await page.evaluate(() => { (document.querySelector('iframe[name=marco]') as HTMLIFrameElement).src = '/marco2' })
    await n(3)
    // «Guardar pantalla ahora» sin cambios: dedupe, sigue en 3.
    await page.locator('text=Guardar pantalla ahora').click()
    await page.waitForTimeout(300)
    await n(3)

    const descarga = page.waitForEvent('download')
    await page.locator('text=Terminar y descargar').click()
    const d = await descarga
    const texto = readFileSync((await d.path())!, 'utf8')

    assert.match(d.suggestedFilename(), /^grabacion-portal\.test-\d{8}-\d{6}\.html$/)
    assert.deepEqual(peticiones.filter((u) => !/portal\.test\/marco|otro-origen/.test(u)), [], 'sin red propia')
    assert.equal(await page.locator('[data-asegura-grabador]').count(), 0, 'el indicador desaparece al terminar')
    assert.match(texto, /^<!-- grabacion ASegura v3 · multipantalla · portal\.test · .* · pantallas: 3 -->/)
    const g = separarGrabacion(texto)
    assert.equal(g.multipantalla, true)
    assert.equal(g.pantallas.length, 3)
    for (const p of g.pantallas) assert.match(p, /^<!-- grabador ASegura v3 /, 'cada pantalla lleva su cabecera v3')
    assert.match(g.pantallas[0], /PANTALLA-UNO/)
    assert.match(g.pantallas[1], /PANTALLA-DOS/)
    assert.match(g.pantallas[2], /MARCO-2/)
    assert.ok(!g.pantallas[1].includes('PANTALLA-UNO') && !g.pantallas[0].includes('PANTALLA-DOS'))
    // La pantalla 1 es de LOGIN (hay password): marcada y con todo tapado.
    assert.match(g.pantallas[0], /PANTALLA DE LOGIN/)
    assert.ok(!g.pantallas[1].includes('PANTALLA DE LOGIN'), 'el login de una pantalla no se hereda a las demás')
    assert.match(g.pantallas[1], /id="iban"[^>]*data-valor="\[(?:DATO|REDACTADO)\]"|data-valor="\[(?:DATO|REDACTADO)\]"[^>]*id="iban"/)
    // Separadores claros, uno por pantalla.
    assert.equal(texto.match(/^<!-- grabador:pantalla \d\/3 · /gm)?.length, 3)
    // Redacción en CADA pantalla (también en las capturadas solas) y el indicador no se cuela.
    for (const crudo of ['12345678Z', 'Clave.Secreta.77', 'ES91 2100', 'Marta Inventada', '612 345 678', 'ana1@correo.es', 'ana2@correo.es', 'TOK-AJENO-1', 'AJENO_NO_SE_VE', 'data-asegura-grabador', 'Guardar pantalla ahora', '<script'])
      assert.ok(!texto.includes(crudo), `se ha escapado «${crudo}»`)
    // Marco de otro origen: ni un alert en toda la grabación; el aviso va (una vez) dentro del cuadro, sin query.
    assert.deepEqual(avisos, [])
    assert.match(g.pantallas[2], /marcos sin leer: 1 -->/)
  } finally {
    await browser.close()
  }
})

// Fugas de una grabación real de ePAC (07/10/2026): titular, código de mediador, id de usuario de portal, firmas,
// atributos data-*, imagen base64 y «Último acceso». Página SINTÉTICA con valores inventados; mismo resultado que en servidor.
const EPAC = `<!doctype html><html><head><title>Portal inventado</title></head><body>
<span class="dd">999-Z/77/0000 - Zulema Inventada Prueba</span><div id="cdk-describedby-message-1">Zulema Inventada Prueba</div><span>999-Z/77/0001</span>
<form action="http://portal.test/srv?action=start&pfestate-uid=ZZ987654&customerId=C-INV-1&paso=2">
<input hidden name="uid" value="ZZ987654"><input hidden name="otro" value="OCULTO-INV-1">
<input type="text" name="checksum" value="CHK-INV-2"><input type="text" name="firma" value="FIRMA-INV-3"><input name="signature" value="SIGN-INV-4"><input id="hash" value="HASH-INV-5">
<input name="importe" value="150000"></form>
<a href="/p?user=USR-INV-6&sid=SID-INV-7&paso=3" data-uid="UID-INV-9" data-userref="REF-INV-10">ir</a>
<div data-extra="ref ZZ111222 fin">Portal ZZ333444 abierto</div>
<img class="broker-logo" src="data:image/jpg;base64,/9j/4Qo1RXhpZgAATU0AKgAAAAgABwEAAAQAAAABAAAAAA==">
<div style="background:url(data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==)">x</div>
<div>Tiempo sesión: 29:51<br>Último acceso: <br>3/4/2098 7:05</div>
</body></html>`

test('bookmarklet: tapa titular, código de mediador, ids de portal, firmas, data-* , imágenes base64 y último acceso', async (t) => {
  const browser = await lanzar()
  if (!browser) return t.skip('sin Chromium disponible (instala el de Playwright o define GRABADOR_CHROMIUM)')
  try {
    const ctx = await browser.newContext({ acceptDownloads: true })
    const page = await ctx.newPage()
    await page.route('http://portal.test/', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: EPAC }))
    await page.goto('http://portal.test/')
    const descarga = page.waitForEvent('download')
    await page.evaluate(codigoBookmarkletManual())
    const d = await descarga
    const html = readFileSync((await d.path())!, 'utf8')
    for (const crudo of ['Zulema', 'Inventada Prueba', '999-Z', 'ZZ987654', 'ZZ111222', 'ZZ333444', 'C-INV-1', 'OCULTO-INV-1', 'CHK-INV-2', 'FIRMA-INV-3', 'SIGN-INV-4', 'HASH-INV-5', 'USR-INV-6', 'SID-INV-7', 'UID-INV-9', 'REF-INV-10', 'base64,', '3/4/2098', '7:05'])
      assert.ok(!html.includes(crudo), `se ha escapado «${crudo}»`)
    assert.ok(html.includes('<div id="cdk-describedby-message-1">[DATO]</div>'), 'el nombre aprendido también se tapa en la descripción oculta')
    assert.ok(html.includes('src="data:image/omitida"'))
    assert.match(html, /id="hash"[^>]*value="\[REDACTADO\]"|value="\[REDACTADO\]"[^>]*id="hash"/)
    for (const ok of ['paso=2', 'paso=3', 'Tiempo sesión: 29:51', 'data-valor="150000"']) assert.ok(html.includes(ok), `falta «${ok}» en ${html.slice(html.indexOf('<body'), html.indexOf('<body') + 1600)}`)
  } finally {
    await browser.close()
  }
})

// Formulario de alta (ePAC «Negocio», paso Datos, 07/10/2026): nombre, apellidos, nacimiento, teléfono, documento y
// dirección del tomador/propietario con sufijos Tom/Prop. Valores INVENTADOS que no casan con ningún patrón de dato
// (solo el NOMBRE del campo los delata) + parámetro pfestate-uid en la URL.
const ALTA = `<!doctype html><html><head><title>Alta inventada</title></head><body>
<form action="http://portal.test/srv?pfestate-uid=ESTADO-INV-77&paso=2">
<input id="nombreTom" name="nombreTom" type="text"><input id="apellido1Tom" name="apellido1Tom" type="text">
<input id="fNaciTom" name="fNaciTom" type="text"><input id="telefono1Tom" name="telefono1Tom" type="tel">
<input id="idNumberTom_doc" name="idNumberTom_doc" type="text"><input id="Prop_address_pc" name="Prop_address_pc" type="text">
<input id="Prop_address_street" name="Prop_address_street" type="text"><input id="codAgenteTom" name="codAgenteTom" type="text">
<input id="specsTeLlamamos" name="specsTeLlamamos" type="text"><input id="importeCapital" name="importeCapital" type="text">
</form><a href="/x#pfestate-uid=ESTADO-INV-88">ir</a></body></html>`

test('bookmarklet: tapa los datos del tomador por el NOMBRE del campo (sufijos Tom/Prop) y pfestate-uid', async (t) => {
  const browser = await lanzar()
  if (!browser) return t.skip('sin Chromium disponible (instala el de Playwright o define GRABADOR_CHROMIUM)')
  try {
    const ctx = await browser.newContext({ acceptDownloads: true })
    const page = await ctx.newPage()
    await page.route('http://portal.test/', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: ALTA }))
    await page.goto('http://portal.test/')
    await page.evaluate(() => {
      const ids = ['nombreTom', 'apellido1Tom', 'fNaciTom', 'telefono1Tom', 'idNumberTom_doc', 'Prop_address_pc', 'Prop_address_street', 'codAgenteTom']
      for (const id of ids) (document.getElementById(id) as HTMLInputElement).value = 'valor-inventado-xyz'
      ;(document.getElementById('specsTeLlamamos') as HTMLInputElement).value = 'valor-ok-abc'
      ;(document.getElementById('importeCapital') as HTMLInputElement).value = 'valor-ok-def'
    })
    const descarga = page.waitForEvent('download')
    await page.evaluate(codigoBookmarkletManual())
    const html = readFileSync((await (await descarga).path())!, 'utf8')
    for (const crudo of ['valor-inventado-xyz', 'ESTADO-INV']) assert.ok(!html.includes(crudo), `se ha escapado «${crudo}»`)
    for (const ok of ['valor-ok-abc', 'valor-ok-def', 'paso=2']) assert.ok(html.includes(ok), `falta «${ok}»`)
  } finally {
    await browser.close()
  }
})

// ─── Generali (30/10/2026): iframes de VÍDEO y similares NO son el formulario: ni alert, ni aviso, ni «sin leer» ─────────────
test('bookmarklet: vídeos (Vimeo/YouTube), mapas, ocultos y diminutos de otro origen se ignoran sin avisar; lo legible se graba', async (t) => {
  const browser = await lanzar()
  if (!browser) return t.skip('sin Chromium disponible (instala el de Playwright o define GRABADOR_CHROMIUM)')
  try {
    const ctx = await browser.newContext({ acceptDownloads: true })
    const page = await ctx.newPage()
    const PAGINA = `<html><body><h1>Genernet</h1>
<iframe name="v1" width="640" height="360" src="https://player.vimeo.com/video/111?h=TOKV1"></iframe>
<iframe name="v2" width="640" height="360" src="https://player.vimeo.com/video/222"></iframe>
<iframe name="yt" width="640" height="360" src="https://www.youtube.com/embed/abc"></iframe>
<iframe name="mapa" width="400" height="300" src="https://www.google.com/maps/embed?pb=1"></iframe>
<iframe name="oculto" style="display:none" src="http://ajeno.test/oculto"></iframe>
<iframe name="pixel" width="1" height="1" src="http://ajeno.test/pixel"></iframe>
<iframe name="mismo" src="/form"></iframe></body></html>`
    await page.route('http://portal.test/', (r) => r.fulfill({ contentType: 'text/html', body: PAGINA }))
    await page.route('http://portal.test/form', (r) => r.fulfill({ contentType: 'text/html', body: '<html><body><form><input id="capital" value="150000"></form></body></html>' }))
    await page.route(/^https?:\/\/(player\.vimeo\.com|www\.youtube\.com|www\.google\.com|ajeno\.test)\//, (r) => r.fulfill({ contentType: 'text/html', body: '<html><body>AJENO_NO_SE_VE</body></html>' }))
    await page.goto('http://portal.test/')
    await page.waitForFunction(() => !!(document.querySelector('iframe[name=mismo]') as HTMLIFrameElement | null)?.contentDocument?.querySelector('#capital'))
    const avisos: string[] = []
    page.on('dialog', (dl) => { avisos.push(dl.message()); void dl.dismiss() })
    for (let i = 0; i < 3; i++) {
      const descarga = page.waitForEvent('download')
      await page.evaluate(codigoBookmarkletManual())
      const html = readFileSync((await (await descarga).path())!, 'utf8')
      assert.match(html, /marcos sin leer: 0 -->/)
      assert.match(html, /marcos ignorados \(vídeo, mapa, publicidad, ocultos o diminutos\): 6 -->/)
      assert.ok(!html.includes('sin query ni tokens'), 'no lista marcos irrelevantes como «sin leer»')
      assert.match(html, /id="capital"[^>]*data-valor="150000"/, 'lo del mismo origen se graba')
      for (const m of ['video', 'mapa', 'oculto', 'pequeno']) assert.match(html, new RegExp(`marco ignorado \\(${m}\\)`))
      assert.ok(!html.includes('AJENO_NO_SE_VE') && !html.includes('TOKV1'))
    }
    assert.deepEqual(avisos, [], 'ni un alert')
    assert.equal(await page.locator('[data-asegura-grabador-aviso]').count(), 0, 'ni aviso: no hay marco relevante sin leer')
  } finally {
    await browser.close()
  }
})

// ─── Extensión MV3 (Mapfre, 30/10/2026): el formulario en un iframe de OTRO origen se graba desde dentro del marco ──────────
async function lanzarConExtension(dir: string, perfil: string): Promise<BrowserContext | null> {
  const args = [`--disable-extensions-except=${dir}`, `--load-extension=${dir}`]
  for (const executablePath of [undefined, ...CANDIDATOS]) {
    try {
      return await chromium.launchPersistentContext(perfil, { channel: 'chromium', headless: true, args, acceptDownloads: true, ...(executablePath ? { executablePath } : {}) })
    } catch {
      /* siguiente */
    }
  }
  return null
}

test('extensión: graba el formulario de un iframe de otro origen (redactado dentro), ignora el vídeo y descarga UN fichero', async (t) => {
  const base = mkdtempSync(join(tmpdir(), 'grabador-ext-'))
  const dir = join(base, 'grabador-asegura')
  for (const a of archivosExtension()) {
    mkdirSync(dirname(join(dir, a.ruta)), { recursive: true })
    writeFileSync(join(dir, a.ruta), a.contenido)
  }
  const ctx = await lanzarConExtension(dir, join(base, 'perfil'))
  if (!ctx) return t.skip('sin Chromium con soporte de extensiones')
  try {
    const sw = ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent('serviceworker', { timeout: 10_000 }).catch(() => null))
    if (!sw) return t.skip('la extensión no ha arrancado su service worker en este Chromium')
    const TOP = `<!doctype html><html><head><title>Mapfre inventado</title></head><body><h1>CABECERA-TOP</h1>
<iframe name="appArea" width="900" height="600" src="https://formularios.mapfre.com/hogar/paso1?sid=SES-AJENA-9#f"></iframe>
<iframe name="video" width="640" height="360" src="https://player.vimeo.com/video/123"></iframe>
<iframe name="pixel" width="1" height="1" src="https://pixel.mapfre.com/p"></iframe></body></html>`
    const FORM = `<!doctype html><html><body><h2>PASO-UNO</h2><form id="fHogar"><label for="dni">DNI</label><input id="dni" name="dni">
<input id="capital" name="capital"><input type="hidden" name="__VIEWSTATE" value="VS-SECRETO"><select id="tipo"><option value="piso">Piso</option><option value="chalet">Chalet</option></select>
<button id="btnEmitir" type="button" onclick="document.title='PULSADO'">Emitir</button></form></body></html>`
    await ctx.route('https://wmediadores.mapfre.com/**', (r) => r.fulfill({ contentType: 'text/html', body: TOP }))
    await ctx.route('https://formularios.mapfre.com/**', (r) => r.fulfill({ contentType: 'text/html', body: FORM }))
    // Marco diminuto en un dominio PERMITIDO: la extensión también se inyecta ahí, y su propio filtro lo descarta.
    await ctx.route('https://pixel.mapfre.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<html><body><p>PIXEL-NO-SE-GRABA</p>' + '<i>x</i>'.repeat(40) + '</body></html>' }))
    await ctx.route('https://player.vimeo.com/**', (r) => r.fulfill({ contentType: 'text/html', body: '<html><body>VIDEO</body></html>' }))
    const page = ctx.pages()[0] ?? (await ctx.newPage())
    const avisos: string[] = []
    page.on('dialog', (dl) => { avisos.push(dl.message()); void dl.dismiss() })
    await page.goto('https://wmediadores.mapfre.com/inicio')
    const form = page.frame({ name: 'appArea' })!
    await form.waitForSelector('#dni')
    await form.fill('#dni', '12345678Z')
    await form.fill('#capital', '150000')
    await form.selectOption('#tipo', 'chalet')
    await page.waitForTimeout(800) // document_idle de los content scripts
    const peticiones: string[] = []
    page.on('request', (r) => peticiones.push(r.url()))

    // Lo que hace el botón de la extensión (chrome.action.onClicked → tabs.sendMessage 'activar').
    await sw.evaluate(async () => {
      const c = (globalThis as any).chrome
      for (const tab of await c.tabs.query({})) c.tabs.sendMessage(tab.id, { tipo: 'activar' }, () => void c.runtime.lastError)
    })
    const n = (k: number) => page.locator(`text=/Grabando.*${k} pantalla/`).waitFor({ timeout: 10_000 })
    await n(1)
    // Pantalla 2: el portal rehace el formulario DENTRO del marco ajeno.
    await form.evaluate(() => {
      let h = '<h2>PASO-DOS</h2><form><input id="nombre1" name="nombre1" value="Marta Inventada"><input id="importe2" value="321">'
      for (let i = 0; i < 30; i++) h += `<div>fila ${i}</div>`
      document.body.innerHTML = h + '</form>'
    })
    await n(2)
    const descarga = page.waitForEvent('download')
    await page.locator('text=Terminar y descargar').click()
    const d = await descarga
    const texto = readFileSync((await d.path())!, 'utf8')

    assert.match(d.suggestedFilename(), /^grabacion-wmediadores\.mapfre\.com-\d{8}-\d{6}\.html$/)
    assert.deepEqual(avisos, [], 'ni un alert')
    assert.deepEqual(peticiones, [], 'la extensión no hace peticiones de red')
    assert.equal(await form.evaluate(() => document.title), '', 'no ha pulsado nada del portal')
    const g = separarGrabacion(texto)
    assert.equal(g.pantallas.length, 2)
    const p1 = separarMarcos(g.pantallas[0])
    assert.match(p1.principal, /CABECERA-TOP/)
    assert.match(p1.principal, /marcos de otro origen leídos por la extensión: 1 -->/)
    assert.match(p1.principal, /marcos ignorados [^:]*: 2 -->/)
    const app = p1.marcos.find((m) => m.ruta.join('/') === 'appArea')!
    assert.ok(app, 'el marco ajeno va con la MISMA ruta que su hueco')
    assert.match(app.html, /^<!-- grabador: marco leído por la extensión · origen: https:\/\/formularios\.mapfre\.com\/hogar\/paso1 -->/)
    assert.match(app.html, /PASO-UNO/)
    assert.match(app.html, /id="capital"[^>]*data-valor="150000"/)
    assert.match(app.html, /<select id="tipo"[^>]*data-valor="chalet"/)
    assert.match(app.html, /id="dni"[^>]*data-valor="\[(?:DATO|REDACTADO)\]"/)
    assert.match(app.html, /id="btnEmitir"/)
    assert.ok(!app.html.includes('no se ha podido leer'))
    const p2 = separarMarcos(g.pantallas[1]).marcos.find((m) => m.ruta.join('/') === 'appArea')!
    assert.match(p2.html, /PASO-DOS/)
    assert.match(p2.html, /id="importe2"[^>]*data-valor="321"/)
    for (const crudo of ['12345678Z', 'VS-SECRETO', 'SES-AJENA-9', 'Marta Inventada', 'VIDEO', 'PIXEL-NO-SE-GRABA', '<script']) assert.ok(!texto.includes(crudo), `se ha escapado «${crudo}»`)
  } finally {
    await ctx.close()
    rmSync(base, { recursive: true, force: true })
  }
})
