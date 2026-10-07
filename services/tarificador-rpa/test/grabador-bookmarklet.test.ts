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
import { codigoBookmarklet } from '@central/module-tarificacion'
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
<iframe name="cotizador" src="/cotizador"></iframe>
<iframe name="externo" src="http://otro-origen.test/"></iframe>
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
    await page.route('http://otro-origen.test/', (r) => r.fulfill({ contentType: 'text/html', body: '<html><body><input id="ajeno" value="NO_SE_VE"></body></html>' }))
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

    const peticiones: string[] = []
    page.on('request', (r) => { if (/^https?:/.test(r.url())) peticiones.push(r.url()) })
    const descarga = page.waitForEvent('download')
    await page.evaluate(codigoBookmarklet())
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
    assert.match(s.principal, /^<!-- grabador ASegura v1 /)
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
      'VIEWSTATE-SECRETO', 'TOK-INTERNO-777', 'SES-12345', 'SECRETO_DEL_JS', 'COOKIE_SECRETA_42', '<script',
    ]) assert.ok(!html.includes(crudo), `se ha escapado «${crudo}»`)
    assert.match(s.principal, /id="pass"[^>]*value="\[REDACTADO\]"|value="\[REDACTADO\]"[^>]*id="pass"/)
    assert.match(s.marcos[1].html, /id="btnEmitir"/)
  } finally {
    await browser.close()
  }
})
