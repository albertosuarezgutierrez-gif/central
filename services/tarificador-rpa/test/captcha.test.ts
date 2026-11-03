// Captcha 0.3.10: solo un reto VISIBLE para; el badge invisible de reCAPTCHA v3 no. Páginas sintéticas.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser } from 'playwright'
import { exigirSinCaptcha, hayCaptcha, motivoCaptcha } from '../src/captcha.ts'

let browser: Browser
before(async () => {
  const opciones = { headless: true }
  try {
    browser = await chromium.launch(opciones)
  } catch (e) {
    const dir0 = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(dir0) ? readdirSync(dir0).filter((d) => /^chromium_headless_shell-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(dir0, dir, 'chrome-linux', 'headless_shell') : null
    if (!exe || !existsSync(exe)) throw e
    browser = await chromium.launch({ ...opciones, executablePath: exe })
  }
})
after(async () => { await browser?.close() })

async function con(html: string) {
  const page = await browser.newPage()
  await page.setContent(`<!doctype html><html><body><h1>Acceso</h1>${html}</body></html>`)
  return page
}

test('badge invisible v3 (oculto, o su iframe anchor): NO para', async () => {
  const page = await con(`<div class="grecaptcha-badge" style="visibility:hidden;width:256px;height:60px"><iframe src="https://www.google.com/recaptcha/api2/anchor?k=x" style="width:256px;height:60px"></iframe></div>
    <div id="captcha-oculto" style="display:none">x</div><div class="g-recaptcha" style="display:none"></div>`)
  assert.equal(await hayCaptcha(page), false)
  await exigirSinCaptcha(page)
  await page.close()
})

test('badge v3 VISIBLE (esquina) o iframe anchor visible suelto: NO para', async () => {
  const page = await con(`<div class="grecaptcha-badge" style="position:fixed;right:0;bottom:0;width:256px;height:60px"><iframe src="https://www.google.com/recaptcha/api2/anchor?k=x" style="width:200px;height:50px"></iframe></div>
    <iframe src="https://www.google.com/recaptcha/api2/anchor?k=y&size=invisible" style="width:200px;height:50px"></iframe>`)
  assert.equal(await hayCaptcha(page), false)
  await page.close()
})

test('iframe anchor VISIBLE (size=normal) en un div cualquiera: PARA', async () => {
  const page = await con(`<div id="rc"><iframe src="https://www.google.com/recaptcha/api2/anchor?k=y&size=normal" style="width:300px;height:78px"></iframe></div>`)
  assert.equal(await hayCaptcha(page), true)
  await page.close()
})

test('reto VISIBLE: bframe, .g-recaptcha, .cf-turnstile y texto → para, y el error nombra el selector', async () => {
  const casos: [string, RegExp][] = [
    ['<iframe src="https://www.google.com/recaptcha/api2/bframe?hl=es" style="width:300px;height:400px"></iframe>', /bframe/],
    ['<div class="g-recaptcha" style="width:300px;height:78px">reto</div>', /g-recaptcha/],
    ['<div class="cf-turnstile" style="width:300px;height:65px">reto</div>', /cf-turnstile|captcha/],
    ['<p>Marca: no soy un robot</p>', /texto/],
  ]
  for (const [html, re] of casos) {
    const page = await con(html)
    assert.equal(await hayCaptcha(page), true, html)
    assert.match((await motivoCaptcha(page)) ?? '', re)
    await assert.rejects(exigirSinCaptcha(page), (e: Error) => /coincide: /.test(e.message) && re.test(e.message))
    await page.close()
  }
})

test('elemento con clase captcha pero OCULTO: no para; VISIBLE: sí', async () => {
  const oculto = await con('<div class="mi-captcha-wrap" style="display:none">x</div>')
  assert.equal(await hayCaptcha(oculto), false)
  await oculto.close()
  const visible = await con('<div class="mi-captcha-wrap" style="width:100px;height:40px">x</div>')
  assert.equal(await hayCaptcha(visible), true)
  await visible.close()
})
