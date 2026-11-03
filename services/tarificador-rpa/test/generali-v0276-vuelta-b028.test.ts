// Generali auto v0.2.76 (trabajo real 03/11/2026 con 0.2.75, 5973929e): tras completar la pantalla del historial y salir por «Volver», el marco enseñaba los
// bloques de «Garantías y Resultados» («Garantías y Capitales opcionales», «Bonus-Malus»…) pero su URL era `histSiniestral.do` (el «Volver» es un submit a esa
// acción). La vuelta se daba por buena (bloques en el DOM) y la puerta de «Recalcular» —exactamente UN marco `emiAutosGenB028.do`, sin relajar— dio «0 marcos».
// Ahora la vuelta exige un único marco B028 con la pestaña cargada; si no, se vuelve por la barra de pasos; si tampoco, atasco con dónde está (saneado).
// Fixtures SINTÉTICAS con la forma del recorrido (sin valores reales).
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser, type Page } from 'playwright'
import { completarHistorialObtenidoGenerali, VERSION_GENERALI_AUTO } from '../src/adapters/generali/auto.ts'
import { ubicacionTrasHistorialGenerali } from '../src/adapters/generali/reglas.ts'
import {
  instalarGuardEmision, pulsarHistorialObtenidoGenerali, pulsarPestanaHistorialObtenidoGenerali, pulsarRecalcularGenerali, pulsarSalidaHistorialObtenidoGenerali,
  type GuardEmision,
} from '../src/guard.ts'
import type { ContextoPortal } from '../src/adaptador.ts'

let browser: Browser
before(async () => {
  try {
    browser = await chromium.launch({ headless: true })
  } catch (e) {
    const base = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers'
    const dir = existsSync(base) ? readdirSync(base).filter((d) => /^chromium-\d+$/.test(d)).sort().pop() : undefined
    const exe = dir ? join(base, dir, 'chrome-linux', 'chrome') : null
    if (!exe || !existsSync(exe)) throw e
    browser = await chromium.launch({ headless: true, executablePath: exe })
  }
})
after(async () => { await browser?.close() })

const PORTAL_G = 'https://www.generali.es/arq_genernetPortalFormWeb/CorredorPortal.po'
const B028_G = 'https://www.generali.es/emi_genAutosFormWeb/emiAutosGenB028.do'
const HS_G = 'https://www.generali.es/emi_genAutosFormWeb/histSiniestral.do'

const req = '<div class="trueInline required"><span> * </span></div>'
const GARANTIAS = `<div id="reg1063EIdentification">
  <h2>Garantías y Capitales opcionales</h2>
  <div id="reg1063E_opcEnvioIdentification"><h2>Envío Documentación Precontractual</h2></div>
  <h2>Bonus-Malus</h2>
  <div class="falseInline simple" id="reg1063E_bonusMalus_zhsdetIdentification"><div class="falseInline column1"><span> Historial siniestral obtenido </span>${req}</div>
  <div class="falseInline column2"><input type="button" name="reg1063E.bonusMalus.zhsdet" value="Historial Siniestral" onclick="link('histsin');" id="reg1063E_bonusMalus_zhsdet"></div></div>
</div>
<div class="botonera"><ul class="dropdown"><li><a href="#" onclick="link('calcular');return false;">Recalcular</a></li></ul></div>`

const HISTSIN = `<div id="pestanyas"><ul id="secundario"><li onclick="pedirPaso('0','0');return false;" class="current"><a><span>Historial Siniestral</span></a></li></ul></div>
<div id="cuerpo"><div id="areaNegocio"><form id="profile" name="profile" onsubmit="return false;" action="/emi_genAutosFormWeb/histSiniestral.do" method="post">
  <h2>Lista de Accesos</h2><h2>Lista de Resultados</h2></form></div></div>
<div id="navegacion"><div class="izq"><ul><li><input type="button" name="cancelar" id="cancelar" value="Volver" onclick="eventAndSubmit('CANCEL');" class="falseHidden"></li></ul></div></div>`

/** Marco B028: `link('histsin')` pinta el historial en el MISMO documento; «Volver» NAVEGA el marco a `histSiniestral.do` (como en 5973929e). */
const CUERPO_B028 = `<script>
  const H = ${JSON.stringify(HISTSIN)};
  function link(x) { if (x === 'histsin') setTimeout(() => { document.getElementById('cont').innerHTML = H; }, 100); if (x === 'calcular') parent.__calc = (parent.__calc || 0) + 1; }
  function pedirPaso(a, b) { parent.__paso = (parent.__paso || 0) + 1; }
  function eventAndSubmit(ev) { parent.__cancel = (parent.__cancel || 0) + 1; setTimeout(() => { location.href = ${JSON.stringify(HS_G)}; }, 100); }
</script><div id="cont">${GARANTIAS}</div>`

/** Lo que devuelve `histSiniestral.do` tras «Volver»: los bloques de «Garantías y Resultados» con la barra de pasos. `barraVuelve` = el paso navega a B028. */
const cuerpoHs = (barraVuelve: boolean) => `<script>
  function pedirPaso(a, b) { parent.__barra = (parent.__barra || 0) + 1; ${barraVuelve ? `setTimeout(() => { location.href = ${JSON.stringify(B028_G)}; }, 100);` : ''} }
  function link(x) { if (x === 'calcular') parent.__calc = (parent.__calc || 0) + 1; }
</script>
<ul id="secundario"><li onclick="pedirPaso('1','0');return false;"><a><span>Datos de Valoración</span></a></li><li onclick="pedirPaso('2','0');return false;" class="current"><a><span>Garantías y Resultados</span></a></li></ul>
${GARANTIAS}`

async function abrir(barraVuelve: boolean): Promise<{ page: Page; guard: GuardEmision; cerrar: () => Promise<void> }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route('https://www.generali.es/**', async (rr) => {
    const u = rr.request().url()
    const cuerpo = u.startsWith(PORTAL_G) ? `<iframe name="mainFrame" src="${B028_G}" style="width:1000px;height:700px"></iframe>` : u.startsWith(HS_G) ? cuerpoHs(barraVuelve) : CUERPO_B028
    await rr.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><title>Genernet</title><body>${cuerpo}</body>` })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(2_000)
  await page.goto(PORTAL_G)
  for (let i = 0; i < 40 && !page.frames().some((f) => f.url().startsWith(B028_G)); i++) await new Promise((x) => setTimeout(x, 100))
  await page.frames().find((f) => f.name() === 'mainFrame')!.locator('input[name="reg1063E.bonusMalus.zhsdet"]').waitFor()
  return { page, guard, cerrar: () => context.close() }
}
const contador = (page: Page, k: string) => page.evaluate((c) => (window as unknown as Record<string, number>)[c] ?? 0, k)
const ctxDe = (page: Page, guard: GuardEmision) => ({
  pausaAccion: async () => undefined,
  pulsar: async (l: { click: () => Promise<void> }) => { await l.click() },
  obtenerHistorialSiniestralGenerali: () => pulsarHistorialObtenidoGenerali(page, guard),
  pestanaHistorialSiniestralGenerali: () => pulsarPestanaHistorialObtenidoGenerali(page, guard),
  salirHistorialSiniestralGenerali: () => pulsarSalidaHistorialObtenidoGenerali(page, guard),
}) as unknown as ContextoPortal
const datos = { aniosAseguradoAnterior: 5, siniestrosUltimos5Anios: 0 }

test('v0.2.76 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.76'))

test('pura: ubicación tras el historial sin query/hash/jsessionid, sin vídeos, con nº de marcos B028, título y paso', () => {
  const t = ubicacionTrasHistorialGenerali({
    urls: [`${PORTAL_G}?mediatorCode=65792#`, `${HS_G};jsessionid=ABC123?x=1`, 'https://player.vimeo.com/video/1', 'about:blank'],
    titulo: 'Genernet', pasoActual: 'Garantías y Resultados',
  })
  assert.match(t, /arq_genernetPortalFormWeb\/CorredorPortal\.po · emi_genAutosFormWeb\/histSiniestral\.do;/)
  assert.match(t, /0 marco\(s\) emiAutosGenB028\.do; título: Genernet; paso actual: Garantías y Resultados$/)
  for (const x of ['65792', 'jsessionid', 'ABC123', 'vimeo', 'x=1']) assert.ok(!t.includes(x), x)
  assert.match(ubicacionTrasHistorialGenerali({ urls: [B028_G], titulo: null, pasoActual: null }), /1 marco\(s\) emiAutosGenB028\.do; título: \(sin título\); paso actual: \(sin barra de pasos\)/)
})

test('5973929e: «Volver» deja el marco en histSiniestral.do con «Garantías y Resultados» → vuelta por la barra a emiAutosGenB028.do y «Recalcular» pasa la puerta', async () => {
  const { page, guard, cerrar } = await abrir(true)
  try {
    const res = await completarHistorialObtenidoGenerali(page, ctxDe(page, guard), datos, [], 2_000)
    assert.ok(res)
    assert.equal(await contador(page, '__cancel'), 1)
    assert.equal(await contador(page, '__barra'), 1, 'un paso de la barra')
    assert.equal(page.frames().filter((f) => f.url().startsWith(B028_G)).length, 1, 'de vuelta en emiAutosGenB028.do')
    assert.match(res.nota, /de vuelta en «Garantías y Resultados» por la barra de pasos/)
    assert.ok(res.avisos.some((a) => /fuera de emiAutosGenB028\.do; vuelta a «Garantías y Resultados» por la barra de pasos/.test(a)))
    // La puerta de «Recalcular» sigue exigiendo exactamente un marco B028 (no se relaja) y ahora pasa.
    await pulsarRecalcularGenerali(page, guard)
    assert.equal(await contador(page, '__calc'), 1)
  } finally { await cerrar() }
})

test('5973929e: si la barra tampoco devuelve a emiAutosGenB028.do → atasco con la ubicación saneada, sin «Recalcular»; la puerta sigue con «0 marcos»', async () => {
  const { page, guard, cerrar } = await abrir(false)
  try {
    await assert.rejects(
      () => completarHistorialObtenidoGenerali(page, ctxDe(page, guard), datos, [], 1_000),
      (e: unknown) => {
        const m = (e as Error).message
        assert.match(m, /«Garantías y Resultados» en emiAutosGenB028\.do tras salir de «Historial Siniestral» por «Volver» \(no se volvió; probado: espera de 1 s y barra de pasos\); no se pulsa «Recalcular»/)
        assert.match(m, /Ubicación: marcos: .*emi_genAutosFormWeb\/histSiniestral\.do; 0 marco\(s\) emiAutosGenB028\.do; título: Genernet; paso actual: Garantías y Resultados/)
        return true
      },
    )
    assert.equal(await contador(page, '__barra'), 1)
    await assert.rejects(() => pulsarRecalcularGenerali(page, guard), /fuera de emiAutosGenB028\.do \(0 marcos; hace falta exactamente uno\)/)
    assert.equal(await contador(page, '__calc'), 0)
  } finally { await cerrar() }
})
