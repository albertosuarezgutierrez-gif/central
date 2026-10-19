// v0.6.16: las preguntas de «Antecedentes» y los 5 dígitos de la póliza se pintan DESPUÉS de elegir la compañía actual: se espera a que
// aparezcan (solo lectura) en vez de contestar antes y dar `sin_grupo` en silencio (trabajo real 02fd821b, «SIGUIENTE» deshabilitado).
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from 'playwright'
import { antecedentesPendientesDeAparecer, esperarPreguntasAntecedentesTurismos } from '../src/adapters/allianz/auto.ts'
import { contarOpcionesMarcablesTurismos } from '../src/guard.ts'

test('regla pura: se sigue esperando solo si la compañía se ELIGIÓ y las opciones del DOM no han subido', () => {
  assert.equal(antecedentesPendientesDeAparecer(true, 4, 4), true)
  assert.equal(antecedentesPendientesDeAparecer(true, 4, 3), true)
  assert.equal(antecedentesPendientesDeAparecer(true, 4, 10), false, 'ya aparecieron')
  assert.equal(antecedentesPendientesDeAparecer(false, 4, 4), false, 'sin compañía elegida no hay nada que esperar')
})

let browser: Browser
before(async () => {
  const opciones = { headless: true, args: ['--proxy-server=http://127.0.0.1:9'] }
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

async function pagina(retrasoMs: number | null): Promise<{ page: Page; cerrar: () => Promise<void> }> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.setContent(`<body><input type="radio" name="uso"><input type="radio" name="uso"><script>
    if (${retrasoMs}) setTimeout(() => { for (const n of ['a', 'b', 'c']) for (let i = 0; i < 3; i++) { const r = document.createElement('input'); r.type = 'radio'; r.name = n; document.body.append(r) } }, ${retrasoMs ?? 0})
  </script></body>`)
  return { page, cerrar: () => context.close() }
}

test('las preguntas que Angular pinta TARDE se esperan; si no aparecen, se agota el tope y se sigue (sin tocar nada)', async () => {
  const tarde = await pagina(900)
  try {
    const antes = await contarOpcionesMarcablesTurismos(tarde.page)
    assert.equal(antes, 2)
    assert.equal(await esperarPreguntasAntecedentesTurismos(tarde.page, tarde.page, antes, 5_000), true)
    assert.equal(await contarOpcionesMarcablesTurismos(tarde.page), 11)
  } finally {
    await tarde.cerrar()
  }
  const nunca = await pagina(null)
  try {
    const t0 = Date.now()
    assert.equal(await esperarPreguntasAntecedentesTurismos(nunca.page, nunca.page, 2, 700), false)
    assert.ok(Date.now() - t0 >= 600, 'espera hasta el tope')
  } finally {
    await nunca.cerrar()
  }
})
