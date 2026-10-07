// Bookmarklet «Grabar pantalla ASegura» (07/10/2026) en un Chromium DE VERDAD: un «portal» con marcos del
// mismo origen anidados y uno de otro origen, campos rellenos con datos personales y una contraseña. Se
// ejecuta el código EXACTO del marcador (`codigoBookmarklet()`), se recoge la descarga y se comprueba la
// serialización de marcos (mismo formato que evidencia.ts: `separarMarcos` la deshace), los `data-valor`, la
// redacción y que no sale ni una petición de red. Sin navegador disponible, el test se SALTA (lo dice).
//
// Chromium: el de Playwright; si su revisión no está instalada, `GRABADOR_CHROMIUM` o /opt/pw-browsers.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { chromium, type Browser } from 'playwright'
import { codigoBookmarklet, codigoBookmarkletManual } from '@central/module-tarificacion'
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
    // Marco no legible: la cabecera lista su URL SIN query ni #, y el alert lleva la URL completa (solo en pantalla).
    assert.match(s.principal, /marcos sin leer: 1 -->/)
    assert.match(s.principal, /<!-- grabador: marcos sin leer \(sin query ni tokens\): http:\/\/otro-origen\.test\/formulario\/hogar -->/)
    for (const crudo of ['TOK-URL-555', 'frag-secreto', 'id=77']) assert.ok(!html.includes(crudo), `la URL del marco filtra «${crudo}» en el fichero`)
    assert.equal(avisos.length, 1)
    assert.equal(avisos[0], 'Esta pantalla tiene el formulario en un marco que no se puede leer. Abre este enlace en una pestaña nueva y vuelve a pulsar el marcador: http://otro-origen.test/formulario/hogar?token=TOK-URL-555&id=77#frag-secreto')
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
    assert.match(s.marcos[0].html, /id="dni"[^>]*data-valor="\[DATO\]"/)

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

// Marco de otro origen como ÚNICO contenido relevante: igualmente se descarga el fichero y se avisa con el alert.
test('bookmarklet: marco ilegible único → descarga el fichero igualmente y avisa con la URL completa', async (t) => {
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
    // UN solo alert (varios marcos → un párrafo por marco, cada uno con su URL completa).
    assert.equal(avisos.length, 1)
    const parrafos = avisos[0].split('\n\n')
    assert.equal(parrafos.length, 2)
    assert.match(parrafos[0], /^Esta pantalla tiene el formulario en un marco que no se puede leer\. .*marcador: http:\/\/catalana\.test\/app\/form\?sessionid=SES-AJENA-9&a=1$/)
    assert.match(parrafos[1], /marcador: http:\/\/otra\.test\/x;jsessionid=JS-77\?q=1$/)
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
    assert.match(g.pantallas[1], /id="iban"[^>]*data-valor="\[DATO\]"|data-valor="\[DATO\]"[^>]*id="iban"/)
    // Separadores claros, uno por pantalla.
    assert.equal(texto.match(/^<!-- grabador:pantalla \d\/3 · /gm)?.length, 3)
    // Redacción en CADA pantalla (también en las capturadas solas) y el indicador no se cuela.
    for (const crudo of ['12345678Z', 'Clave.Secreta.77', 'ES91 2100', 'Marta Inventada', '612 345 678', 'ana1@correo.es', 'ana2@correo.es', 'TOK-AJENO-1', 'AJENO_NO_SE_VE', 'data-asegura-grabador', 'Guardar pantalla ahora', '<script'])
      assert.ok(!texto.includes(crudo), `se ha escapado «${crudo}»`)
    // Marco de otro origen: el alert sale UNA sola vez en toda la grabación aunque haya 3 capturas con él.
    assert.equal(avisos.length, 1)
    assert.match(avisos[0], /otro-origen\.test\/form\?token=TOK-AJENO-1$/)
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
