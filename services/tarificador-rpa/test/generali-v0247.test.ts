// Generali Turismos v0.2.47 (28/10/2026, prueba real con 0.2.46, trabajo ec49068b): tras teclear el NIF en «Datos personas», su `onchange`
// (`TratarDependiente(… '/refreshSelPersonas.do')`) BLOQUEA todo el formulario (`disabled` + `controlbloqueo="1"`) hasta que vuelve el refresco;
// el bot leía a los 1,5 s y paraba con nombre/apellidos «deshabilitado». Ahora espera a que se libere y rellena desde el riesgo. Fixtures SINTÉTICAS.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Frame, type Page } from 'playwright'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, altaDatosPersonasGenerali } from '../src/adapters/generali/auto.ts'
import { bloqueadosDatosPersonasGenerali, motivoFaltaDatoPersonaGenerali } from '../src/adapters/generali/reglas.ts'
import type { ContextoPortal } from '../src/adaptador.ts'

test('v0.2.47 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.58'))

test('v0.2.47 · puro: bloqueado = deshabilitado Y controlbloqueo="1"', () => {
  assert.deepEqual(bloqueadosDatosPersonasGenerali([
    { id: 'nombre', deshabilitado: true, bloqueo: '1' },
    { id: 'ynidcl', deshabilitado: true, bloqueo: '0' },
    { id: 'papell', deshabilitado: false, bloqueo: '1' },
    { id: 'sapell', deshabilitado: true, bloqueo: null },
  ]), ['nombre'])
  assert.deepEqual(bloqueadosDatosPersonasGenerali([]), [])
})

test('v0.2.47 · puro: el motivo distingue «el riesgo no lo trae» de «no se pudo escribir»', () => {
  assert.match(motivoFaltaDatoPersonaGenerali('nombre', 'nombre', false, []), /el riesgo no lo trae .*no se inventa/)
  assert.match(motivoFaltaDatoPersonaGenerali('nombre', 'nombre', true, ['ynidcl:con_valor', 'nombre:deshabilitado']), /el riesgo lo trae .*: deshabilitado\)$/)
  assert.match(motivoFaltaDatoPersonaGenerali('primer apellido', 'papell', true, []), /sin motivo leído/)
})

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

const I = 'personas_intere_'
const NIF = '00000000T'
const FORM = {
  documentoTomador: NIF,
  datosTomador: { tipo: 'fisica' as const, nombre: 'Ana', apellido1: 'Perez', apellido2: 'Gil', fechaNacimiento: '1980-05-17' },
  tomadorEsConductor: true,
  clasePermiso: 'b',
  conductor: { fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01', sexo: 'mujer' },
}
const B028 = 'https://www.generali.es/emi_genAutosFormWeb/emiAutosGenB028.do'
const op = (v: string, t: string) => `<option value="${v}">${t}</option>`

/** «Datos personas» con el bloqueo de Genernet: el onchange del NIF deshabilita TODO con controlbloqueo="1" y lo libera a los `liberaMs` (si ≥ 0). */
const datos = (liberaMs: number) => `<form>
  <select id="${I}ynidcl">${op('', 'Seleccione')}${op('0', 'NIF')}${op('2', 'NIE')}</select>
  <input id="${I}nifcif" type="text" onchange="bloquear()">
  <input id="${I}nombre" type="text"><input id="${I}papell" type="text"><input id="${I}sapell" type="text">
  <select id="${I}ysexo">${op('', '')}${op('H', 'Hombre')}${op('M', 'Mujer')}</select>
  <input id="${I}ffnain" type="text"><input id="${I}ffcain" type="text">
  <select id="${I}ycarnc">${op('', '')}${op('B', 'B')}</select>
  <select id="${I}pnacld">${op('', '')}${op('724', 'España')}</select>
  <input id="${I}yemail" type="text"><input id="${I}movtom" type="text">
  </form><iframe name="ocultoIF" src="about:blank" style="display:none"></iframe>
  <script>
  function bloquear() {
    document.querySelectorAll('[id^="${I}"]').forEach((e) => { e.disabled = true; e.setAttribute('controlbloqueo', '1') });
    if (${liberaMs} >= 0) setTimeout(() => document.querySelectorAll('[controlbloqueo="1"]').forEach((e) => { e.disabled = false; e.setAttribute('controlbloqueo', '0') }), ${liberaMs});
  }
  </script>`

async function conDatos(liberaMs: number, fn: (page: Page, m: Frame, ctx: ContextoPortal, enviado: () => Record<string, string>) => Promise<void>): Promise<void> {
  const context = await browser.newContext()
  try {
    await context.route('https://www.generali.es/**', (r) => r.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><body>${datos(liberaMs)}</body>` }))
    const page = await context.newPage()
    page.setDefaultTimeout(2_000)
    await page.setContent(`<input id="reg1063A_personas_interesado_nifcif" type="text"><input id="reg1063A_personas_interesado_nombre" type="text"><iframe name="mainFrame" src="${B028}" style="width:900px;height:600px"></iframe>`)
    let m: Frame | undefined
    for (let i = 0; i < 40 && !m; i++) {
      m = page.frames().find((f) => f.name() === 'mainFrame' && f.url().startsWith(B028))
      if (m && (await m.locator(`[id="${I}nifcif"]`).count()) === 0) m = undefined
      if (!m) await new Promise((x) => setTimeout(x, 100))
    }
    assert.ok(m)
    let enviado: Record<string, string> = {}
    const ctx = {
      pausaAccion: async () => {},
      confirmarDatosPersonasGenerali: async () => {
        enviado = await m!.evaluate((p) => Object.fromEntries(Array.from(document.querySelectorAll(`[id^="${p}"]`)).map((e) => [e.id.slice(p.length), (e as HTMLInputElement).value])), I)
        // El portal vuelve con el interesado relleno.
        await page.evaluate(() => { for (const c of ['nifcif', 'nombre']) (document.getElementById(`reg1063A_personas_interesado_${c}`) as HTMLInputElement).value = 'X' })
        return { dialogo: null }
      },
      log: () => {},
    } as unknown as ContextoPortal
    await fn(page, m!, ctx, () => enviado)
  } finally {
    await context.close()
  }
}

test('v0.2.47 · caso ec49068b: el NIF bloquea el formulario 1,2 s; se espera a que Genernet lo libere y se rellena DESDE EL RIESGO', async () => {
  await conDatos(1_200, async (page, m, ctx, enviado) => {
    const r = await altaDatosPersonasGenerali(page, m, FORM, ctx, { autocompletarMs: 100, desbloqueoMs: 6_000, trasConfirmarMs: 2_000 })
    assert.match(r.diag, /confirmado, verificado/)
    const e = enviado()
    assert.deepEqual({ nif: e.nifcif, nombre: e.nombre, a1: e.papell, a2: e.sapell, sexo: e.ysexo, nac: e.ffnain }, { nif: NIF, nombre: 'Ana', a1: 'Perez', a2: 'Gil', sexo: 'M', nac: '17/05/1980' })
    for (const dato of [NIF, 'Ana', 'Perez', '1980']) assert.ok(!r.diag.includes(dato), dato)
  })
})

test('v0.2.47 · cepo: el formulario NUNCA se libera → para con «BLOQUEADO», los controles y sin «Confirmar» ni valores', async () => {
  await conDatos(-1, async (page, m, ctx, enviado) => {
    await assert.rejects(altaDatosPersonasGenerali(page, m, FORM, ctx, { autocompletarMs: 100, desbloqueoMs: 800, trasConfirmarMs: 500 }), (err: unknown) => {
      assert.ok(err instanceof ErrorMapaIncompletoGenerali)
      const msg = (err as Error).message
      assert.match(msg, /tras teclear el NIF Genernet tiene el formulario BLOQUEADO/)
      assert.match(msg, /controlbloqueo=1: .*nombre, papell/)
      assert.match(msg, /No se pulsa «Confirmar»/)
      assert.match(msg, /rama=datos_personas, bloqueo_nif/)
      assert.match(msg, /Marco oculto del refresco: about:blank\./)
      for (const dato of [NIF, 'Ana', 'Perez', '1980']) assert.ok(!msg.includes(dato), dato)
      return true
    })
    assert.deepEqual(enviado(), {}, '«Confirmar» no se pulsó')
  })
})

test('v0.2.47 · el riesgo sin nombre: para diciendo que el riesgo no lo trae (no se inventa)', async () => {
  await conDatos(200, async (page, m, ctx) => {
    const sinNombre = { ...FORM, datosTomador: { ...FORM.datosTomador, nombre: undefined } }
    await assert.rejects(altaDatosPersonasGenerali(page, m, sinNombre, ctx, { autocompletarMs: 100, desbloqueoMs: 3_000, trasConfirmarMs: 500 }), /falta nombre \(el riesgo no lo trae y el portal no lo puso; no se inventa\)/)
  })
})
