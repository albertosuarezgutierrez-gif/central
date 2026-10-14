// Occident · HOGAR (14/10/2026): ruta de menú, página nueva con lista blanca, estrella de favorito y huecos. Portal
// SINTÉTICO (MUI de mentira) servido con `context.route` sobre hosts https ficticios: ni red ni datos personales.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { chromium, type Browser } from 'playwright'
import { EmisionBloqueadaError } from '@central/module-tarificacion'
import { ErrorTarificador } from '../src/errores.ts'
import { instalarGuardEmision, pulsar } from '../src/guard.ts'
import { HOSTS_PERMITIDOS } from '../src/adapters/occident/guarda.ts'
import {
  ErrorMapaIncompleto,
  FALTA_FORMULARIO_HOGAR,
  HOST_APLICACIONES,
  HOST_PORTAL,
  MENU_PADRE_HOGAR,
  RUTA_MENU_HOGAR,
  SEL,
  RAMO_GCO_HOGAR,
  RUTA_TARIFICACION_HOGAR,
  SEL_HIPOTESIS_SSO_CONTRASENA,
  comprobarDestinoHogar,
  comprobarSrcIframeHogar,
  esEstrellaFavorito,
  etiquetaExactaOccident,
} from '../src/adapters/occident/mapa.ts'
import {
  CAMPOS_OCCIDENT_HOGAR,
  HOGAR_ACTIVO,
  SECCIONES_DESCUENTO_PERMITIDAS,
  abrirTarificacionHogar,
  loginPaso1,
  elegirMaximoDescuento,
  esDescuentoAbc,
  motivoNoPulsarHogar,
  occidentHogar,
  ofertasDesdeTarjetas,
  planFormularioHogar,
  porcentajeDeOpcion,
  primaDeTexto,
  pulsarSeguro,
  rellenarDatosRiesgoHogar,
  rellenarYLeerPrimaHogar,
  seccionDescuentoPermitida,
  tarjetasDesdeTextos,
} from '../src/adapters/occident/hogar.ts'
import { adaptadores } from '../src/adapters/index.ts'

// ───────────── puros ─────────────

test('ruta de menú VISTA en captura: Productos › Análisis de necesidades › Hogar › Tarificación', () => {
  assert.deepEqual([...RUTA_MENU_HOGAR], ['Productos', 'Análisis de necesidades', 'Hogar', 'Tarificación'])
  assert.equal(MENU_PADRE_HOGAR, RUTA_MENU_HOGAR[1])
})

test('etiquetaExactaOccident: entera, sin mayúsculas ni espacios; nunca «contiene»', () => {
  assert.match(' análisis  DE necesidades ', etiquetaExactaOccident('Análisis de necesidades'))
  assert.doesNotMatch('Hogar Plus', etiquetaExactaOccident('Hogar'))
  assert.doesNotMatch('Tarificación de comunidades', etiquetaExactaOccident('Tarificación'))
})

test('estrella de favorito reconocida por aria-label/clase/testid; los ítems normales no', () => {
  assert.ok(esEstrellaFavorito(['', 'Añadir a favoritos']))
  assert.ok(esEstrellaFavorito(['', null, null, null, null, null, null, null, null, 'StarBorderIcon', null]))
  assert.ok(esEstrellaFavorito(['', null, null, null, null, null, null, null, null, null, 'MuiSvgIcon-root favorite-star']))
  assert.equal(esEstrellaFavorito(['Hogar', null, null, null, null, null, null, null, null, null, 'MuiMenuItem-root']), false)
})

test('destino de «Tarificación»: ruta de hogar del portal; otra ruta/host/SSO falla cerrado con error tipado', () => {
  assert.equal(RUTA_TARIFICACION_HOGAR, '/productos/multirriesgos/hogar/tarificacion')
  assert.equal(comprobarDestinoHogar(`https://${HOST_PORTAL}${RUTA_TARIFICACION_HOGAR}`).pathname, RUTA_TARIFICACION_HOGAR)
  assert.equal(comprobarDestinoHogar(`https://${HOST_PORTAL}${RUTA_TARIFICACION_HOGAR}/`).pathname, `${RUTA_TARIFICACION_HOGAR}/`)
  for (const url of ['https://hogar.catalanaoccidente.example/form', `https://${HOST_PORTAL}/productos/multirriesgos/comunidades/tarificacion`, `http://${HOST_PORTAL}${RUTA_TARIFICACION_HOGAR}`, 'about:blank', 'no es url']) {
    assert.throws(() => comprobarDestinoHogar(url), (e) => e instanceof ErrorTarificador && e.tipo === 'portal', url)
  }
  assert.throws(() => comprobarDestinoHogar('https://ssoaut.gco.global/'), (e) => e instanceof ErrorTarificador && /SSO/.test((e as Error).message))
  assert.throws(() => comprobarDestinoHogar(`https://${HOST_PORTAL}/emitir/poliza`), EmisionBloqueadaError)
})

test('src del iframe: host de la lista blanca pasa (relativo o absoluto); host desconocido falla cerrado', () => {
  assert.equal(comprobarSrcIframeHogar(`https://${HOST_APLICACIONES}/FE/x/?ramoGco=1`, `https://${HOST_PORTAL}/`).hostname, HOST_APLICACIONES)
  assert.equal(comprobarSrcIframeHogar('/dentro', `https://${HOST_PORTAL}/`).hostname, HOST_PORTAL)
  for (const src of ['https://hogar.catalanaoccidente.example/form', 'http://catalanaaplicaciones.gco.global/x', 'javascript:alert(1)']) {
    assert.throws(() => comprobarSrcIframeHogar(src, `https://${HOST_PORTAL}/`), (e) => e instanceof ErrorTarificador && e.tipo === 'portal', src)
  }
  assert.throws(() => comprobarSrcIframeHogar(`https://${HOST_APLICACIONES}/emitir`, `https://${HOST_PORTAL}/`), EmisionBloqueadaError)
  assert.equal(RAMO_GCO_HOGAR, null)
})

test('la lista blanca NO se ha ampliado a ciegas (sigue siendo la de comunidades)', () => {
  assert.deepEqual([...HOSTS_PERMITIDOS].sort(), ['catalanaaplicaciones.gco.global', 'portaloccident.gco.global', 'ssoaut.gco.global'])
})

test('apagado y SIN registrar: flag falso por defecto y ausente del registro', () => {
  assert.equal(HOGAR_ACTIVO, false)
  assert.equal(adaptadores.obtener('occident', 'hogar'), null)
  assert.ok(!adaptadores.claves().some((k) => /hogar/.test(k)))
  assert.equal(occidentHogar.credencial, 'OCCIDENT_PORTAL')
})

const RIESGO_SINTETICO = {
  tomador: { nif: 'X0000000T', fechaNacimiento: '01/01/1980' },
  inmueble: { codigoPostal: '00000', nombreVia: 'Calle de Prueba', numero: '1' },
  hogar: { tipoVivienda: 'Piso' },
}

test('huecos: el formulario lanza ErrorMapaIncompleto (prefijo occident/hogar), con riesgo válido y sin él', () => {
  assert.throws(() => rellenarYLeerPrimaHogar(), (e) => e instanceof ErrorMapaIncompleto && e.falta === FALTA_FORMULARIO_HOGAR && /occident\/hogar/.test(e.message))
  assert.throws(() => rellenarDatosRiesgoHogar(RIESGO_SINTETICO), (e) => e instanceof ErrorMapaIncompleto && e.falta.startsWith(FALTA_FORMULARIO_HOGAR))
  assert.equal(FALTA_FORMULARIO_HOGAR, 'formulario hogar: falta grabación')
  // Faltan datos: error de datos, no un hueco ni un valor inventado.
  assert.throws(() => planFormularioHogar({ tomador: {}, inmueble: {}, hogar: {} }), (e) => e instanceof ErrorTarificador && e.tipo === 'datos' && /tomador\.nif/.test((e as Error).message))
})

test('plan del paso 1: etiquetas VISTAS, sin tocar agente ni fecha de efecto; el SSO paso 2 es hipótesis solo de Hogar', () => {
  const plan = planFormularioHogar(RIESGO_SINTETICO)
  assert.ok(plan.some((o) => o.etiqueta === 'Nº documento tomador:' && o.tipo === 'texto'))
  assert.ok(plan.some((o) => o.etiqueta === 'Código postal:*' && o.tipo === 'modal-texto'))
  assert.ok(!plan.some((o) => /agente|efecto/i.test(o.etiqueta)))
  assert.equal(SEL.ssoContrasena, null, 'comunidades sigue con el hueco del paso 2')
  assert.equal(SEL_HIPOTESIS_SSO_CONTRASENA, 'input[type="password"]')
})

test('tarificar(): el login con SSO paso 2 ausente cae en hueco; sin portal real se queda en ese paso', async () => {
  const pasos: string[] = []
  const ctx = { credenciales: { usuario: 'u', contrasena: 'c' }, paso: async (n: string, fn: () => Promise<unknown>) => { pasos.push(n); return fn() }, log: () => undefined, pausa: async () => undefined, exigirSinCaptcha: async () => undefined }
  const page = { goto: async () => { throw new ErrorMapaIncompleto('prueba', 'occident/hogar') } }
  await assert.rejects(() => occidentHogar.tarificar(page as never, RIESGO_SINTETICO, ctx as never), ErrorMapaIncompleto)
  assert.deepEqual(pasos, ['login'])
})

// ─── paso 2: primas ───
const TARJETAS = [
  { nombre: 'HOGAR ESTÁNDAR', texto: 'HOGAR ESTÁNDAR\nPrima anual\n246,59 €\nSolicitud automática' },
  { nombre: 'HOGAR CONFORT', texto: 'HOGAR CONFORT\n291,93 €\nSolicitud automática' },
  { nombre: 'HOGAR ÓPTIMA', texto: 'HOGAR ÓPTIMA\n311,44 €\nSolicitud automática' },
  { nombre: 'PERSONALIZADA', texto: 'PERSONALIZADA\n1.291,93 €\nSolicitud automática' },
]

test('primas del paso 2: 4 tarjetas con importe español; sin importe legible falla cerrado', () => {
  assert.equal(primaDeTexto('Prima 246,59 € anual'), 246.59)
  assert.equal(primaDeTexto('Solicitud automática'), null)
  assert.equal(primaDeTexto('171.875,10 €'), 171875.1)
  const t = tarjetasDesdeTextos(TARJETAS)
  assert.deepEqual(t.map((x) => [x.producto, x.primaAnualEur]), [['HOGAR ESTÁNDAR', 246.59], ['HOGAR CONFORT', 291.93], ['HOGAR ÓPTIMA', 311.44], ['PERSONALIZADA', 1291.93]])
  assert.throws(() => tarjetasDesdeTextos([{ nombre: 'HOGAR CONFORT', texto: 'HOGAR CONFORT\nSolicitud automática' }]), ErrorTarificador)
  assert.throws(() => tarjetasDesdeTextos([]), ErrorTarificador)
  const o = ofertasDesdeTarjetas(t, { referencia: null, pdf: null, descuentos: [{ seccion: 'Descuentos cliente', nombre: 'Descuento Segmento A', texto: '-15,00%' }] })
  assert.equal(o.length, 4)
  assert.ok(o.every((x) => x.compania === 'occident' && x.fraccionamiento === 'anual' && /Segmento A -15,00%/.test(x.avisos?.[0] ?? '')))
})

// ─── descuentos: máximo, nunca ABC ───
test('elegirMaximoDescuento: la opción de mayor descuento (formato español); sin opciones válidas → null', () => {
  assert.deepEqual(elegirMaximoDescuento(['Seleccionar', '-10,00%', '-15,00%', '-12,50%']), { indice: 2, texto: '-15,00%', porcentaje: 15 })
  assert.equal(elegirMaximoDescuento(['Seleccionar', 'Sin descuento'])?.porcentaje ?? null, null)
  assert.equal(elegirMaximoDescuento([]), null)
  assert.equal(porcentajeDeOpcion('-12,50%'), 12.5)
  assert.equal(porcentajeDeOpcion('10 %'), 10)
  assert.equal(porcentajeDeOpcion('Seleccionar'), null)
})

test('CEPO ABC: «Descuentos ABC» / «Ajuste contra comisión» jamás se elige ni se pulsa', () => {
  assert.ok(esDescuentoAbc('Descuentos ABC'))
  assert.ok(esDescuentoAbc('Ajuste contra comisión'))
  assert.equal(esDescuentoAbc('Descuento Segmento A'), false)
  // Secciones: solo las dos permitidas por nombre exacto; ABC y las desconocidas se ignoran.
  assert.deepEqual([...SECCIONES_DESCUENTO_PERMITIDAS], ['Descuentos cliente', 'Descuentos por perfil/actividad'])
  assert.equal(seccionDescuentoPermitida('Descuentos cliente'), true)
  assert.equal(seccionDescuentoPermitida('Descuentos por perfil/actividad'), true)
  assert.equal(seccionDescuentoPermitida('Descuentos ABC'), false)
  assert.equal(seccionDescuentoPermitida('Descuentos cliente ABC'), false)
  assert.equal(seccionDescuentoPermitida('Otros descuentos'), false)
  // Una opción de ABC, aunque sea la mayor, nunca gana.
  assert.deepEqual(elegirMaximoDescuento(['-10,00%', 'Ajuste contra comisión -50,00%']), { indice: 0, texto: '-10,00%', porcentaje: 10 })
  assert.equal(elegirMaximoDescuento(['Ajuste contra comisión -50,00%']), null)
  // Pulsar: ABC, papelera y estrella bloqueadas.
  assert.ok(motivoNoPulsarHogar(['Ajuste contra comisión']))
  assert.ok(motivoNoPulsarHogar(['', 'Eliminar']))
  assert.ok(motivoNoPulsarHogar(['', null, null, null, null, null, null, null, null, 'DeleteIcon']))
  assert.equal(motivoNoPulsarHogar(['Editar']), null)
})

test('canónico de hogar: hipótesis marcada, ninguna etiqueta del portal conocida; uso y régimen explícitos', () => {
  assert.ok(CAMPOS_OCCIDENT_HOGAR.length > 0)
  assert.ok(CAMPOS_OCCIDENT_HOGAR.every((c) => c.etiquetaPortal === null))
  for (const k of ['hogar.uso', 'hogar.regimen']) assert.ok(CAMPOS_OCCIDENT_HOGAR.some((c) => c.canonico === k && c.uso === 'seguro'))
})

// ───────────── con navegador (portal sintético por context.route) ─────────────

const PORTAL = `<!doctype html><html><body>
<header class="MuiAppBar-root"><button id="top" onclick="abrir('m1')">Productos</button></header>
<script>
function abrir(id){document.getElementById(id).hidden=false}
function irHogar(){history.pushState(null,'','/productos/multirriesgos/hogar/tarificacion');var f=document.createElement('iframe');f.className='site-layout-content-iframe';f.src=window.IFRAME;document.body.appendChild(f)}
</script>
<div id="m1" role="menu" hidden>
  <div role="menuitem">Multirriesgos</div>
  <div role="menuitem" id="ana" onclick="abrir('m2')">Análisis de necesidades</div>
  <div role="menuitem" onclick="abrir('mx')">Salud</div>
</div>
<div id="mx" role="menu" hidden><div role="menuitem">Hogar</div><div role="menuitem">Tarificación</div></div>
<div id="m2" role="menu" hidden>
  <div role="menuitem"><span id="hogar" onclick="abrir('m3')">Hogar</span><button aria-label="Añadir a favoritos" onclick="window.estrella=(window.estrella||0)+1">★</button></div>
  <div role="menuitem"><span>Comunidades</span></div>
</div>
<div id="m3" role="menu" hidden>
  <div role="menuitem"><span id="tarif" onclick="irHogar()">Tarificación</span><button aria-label="Añadir a favoritos" onclick="window.estrella=(window.estrella||0)+1">★</button></div>
</div></body></html>`

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

async function abrir(destino: string, portal: string = PORTAL) {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route('https://**/*', (r) => {
    const u = new URL(r.request().url())
    const html = u.hostname === HOST_PORTAL ? portal.replace('window.IFRAME', JSON.stringify(destino).replace(/"/g, "'")) : '<!doctype html><html><body><h1>Formulario sintético</h1></body></html>'
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(2_000)
  await page.goto(`https://${HOST_PORTAL}/`)
  const pulsados: string[] = []
  const ctx = {
    pulsar: async (b: Parameters<typeof pulsar>[0]) => { pulsados.push(((await b.textContent()) ?? '').trim()); await pulsar(b, guard) },
    pausa: async () => undefined,
  }
  return { context, page, ctx, pulsados, guard }
}

test('menú → ruta de hogar en el MISMO portal → iframe del formulario (host permitido): solo se pulsan los 4 textos, ninguna estrella', async () => {
  const { context, page, ctx, pulsados } = await abrir(`https://${HOST_APLICACIONES}/FE/hogar/`)
  try {
    const marco = await abrirTarificacionHogar(page, ctx, { menuMs: 1_500, iframeMs: 3_000 })
    assert.equal(context.pages().length, 1, 'no se abre pestaña nueva')
    assert.equal(new URL(page.url()).pathname, RUTA_TARIFICACION_HOGAR)
    assert.equal(new URL(marco.url()).hostname, HOST_APLICACIONES)
    assert.deepEqual(pulsados, [...RUTA_MENU_HOGAR])
    assert.equal(await page.evaluate(() => (window as unknown as { estrella?: number }).estrella ?? 0), 0)
  } finally {
    await context.close()
  }
})

test('iframe con host FUERA de la lista blanca → error tipado y no se toca su contenido', async () => {
  const { context, page, ctx } = await abrir('https://formulario-desconocido.example.com/hogar')
  try {
    await assert.rejects(
      () => abrirTarificacionHogar(page, ctx, { menuMs: 1_500, iframeMs: 3_000 }),
      (e) => e instanceof ErrorTarificador && !(e instanceof ErrorMapaIncompleto) && e.tipo === 'portal' && /lista blanca/.test((e as Error).message),
    )
  } finally {
    await context.close()
  }
})

test('sin iframe del formulario → ErrorMapaIncompleto (no se adivina)', async () => {
  const { context, page, ctx } = await abrir(`https://${HOST_APLICACIONES}/FE/hogar/`, PORTAL.replace('f.className=', 'f.className=\'otro\';var x=').replace("document.body.appendChild(f)", ''))
  try {
    await assert.rejects(() => abrirTarificacionHogar(page, ctx, { menuMs: 1_500, iframeMs: 800 }), (e) => e instanceof ErrorMapaIncompleto && /iframe/.test((e as Error).message))
  } finally {
    await context.close()
  }
})

test('pulsarSeguro rechaza la estrella de favorito y la papelera aunque se le pasen', async () => {
  const { context, page, ctx, pulsados } = await abrir(`https://${HOST_APLICACIONES}/FE/hogar/`)
  try {
    await page.setContent('<button id="a" aria-label="Añadir a favoritos">★</button><button id="b" aria-label="Eliminar">x</button><button id="c">Editar</button>')
    await assert.rejects(() => pulsarSeguro(ctx, page.locator('#a')), ErrorTarificador)
    await assert.rejects(() => pulsarSeguro(ctx, page.locator('#b')), ErrorTarificador)
    await pulsarSeguro(ctx, page.locator('#c'))
    assert.deepEqual(pulsados, ['Editar'])
  } finally {
    await context.close()
  }
})

test('«Hogar» de otro submenú (Salud) no se pulsa: se acota al de Análisis de necesidades', async () => {
  const { context, page, ctx } = await abrir(`https://${HOST_APLICACIONES}/FE/hogar/`)
  try {
    // El submenú de «Salud» también está abierto y trae «Hogar» + «Tarificación» (más antiguo en el DOM que el de Análisis).
    await page.evaluate(() => { document.getElementById('mx')!.hidden = false })
    await page.evaluate(() => { document.body.appendChild(document.getElementById('m1')!); document.body.appendChild(document.getElementById('m2')!); document.body.appendChild(document.getElementById('m3')!) })
    const nueva = await abrirTarificacionHogar(page, ctx, { menuMs: 1_500, iframeMs: 3_000 })
    assert.equal(new URL(nueva.url()).hostname, HOST_APLICACIONES)
  } finally {
    await context.close()
  }
})

test('sin el ítem «Análisis de necesidades» → ErrorMapaIncompleto (no se adivina)', async () => {
  const { context, page, ctx } = await abrir(`https://${HOST_APLICACIONES}/FE/hogar/`, PORTAL.replace('Análisis de necesidades', 'Otra cosa'))
  try {
    await assert.rejects(() => abrirTarificacionHogar(page, ctx, { menuMs: 800 }), (e) => e instanceof ErrorMapaIncompleto && /Análisis de necesidades/.test((e as Error).message))
  } finally {
    await context.close()
  }
})

test('la contraseña de Occident solo se escribe en https://ssoaut.gco.global', async () => {
  const { puedeEscribirContrasena } = await import('../src/adapters/occident/mapa.ts')
  assert.equal(puedeEscribirContrasena('https://ssoaut.gco.global/my.policy'), true)
  assert.equal(puedeEscribirContrasena('http://ssoaut.gco.global/my.policy'), false)
  assert.equal(puedeEscribirContrasena('https://ssoaut.gco.global.evil.com/'), false)
  assert.equal(puedeEscribirContrasena('https://portaloccident.gco.global/'), false)
  assert.equal(puedeEscribirContrasena('no es url'), false)
})

// ───────────── loginPaso1: redirección tardía al SSO y variantes del SSO ─────────────

async function abrirLogin(portalHtml: string, ssoHtml: string) {
  const context = await browser.newContext()
  await context.route('https://**/*', (r) => {
    const u = new URL(r.request().url())
    const html = u.hostname === HOST_PORTAL ? portalHtml : ssoHtml
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(2_000)
  const pulsados: string[] = []
  const ctx = {
    credenciales: { usuario: 'usuario-prueba', contrasena: 'x' },
    pausa: async () => undefined,
    exigirSinCaptcha: async () => undefined,
    log: () => undefined,
    pulsar: async (b: Parameters<typeof pulsar>[0]) => { pulsados.push('pulsado'); void b },
  }
  return { context, page, ctx, pulsados }
}
const SSO_CON_USUARIO = '<!doctype html><html><body><input id="usernamegco"><button id="SubmitCreds">Iniciar sesión</button></body></html>'
const SSO_SIN_USUARIO = '<!doctype html><html><body><p>Usuario preseleccionado</p><input type="password"></body></html>'

test('loginPaso1: redirección TARDÍA al SSO (tras el goto) → true y rellena el usuario', async () => {
  const portal = `<!doctype html><html><body><script>setTimeout(function(){location.href='https://ssoaut.gco.global/my.policy?apm=5'},800)</script></body></html>`
  const { context, page, ctx, pulsados } = await abrirLogin(portal, SSO_CON_USUARIO)
  try {
    assert.equal(await loginPaso1(page, ctx as never, { carreraMs: 5_000, usuarioMs: 1_500 }), true)
    assert.equal(await page.locator(SEL.ssoUsuario).inputValue(), 'usuario-prueba')
    assert.equal(pulsados.length, 1)
  } finally {
    await context.close()
  }
})

test('loginPaso1: cabecera del portal visible (sesión abierta) → false', async () => {
  const { context, page, ctx } = await abrirLogin(PORTAL, SSO_CON_USUARIO)
  try {
    assert.equal(await loginPaso1(page, ctx as never, { carreraMs: 5_000, usuarioMs: 500 }), false)
  } finally {
    await context.close()
  }
})

test('loginPaso1: SSO sin campo de usuario (preseleccionado) → true sin rellenar ni pulsar', async () => {
  const portal = `<!doctype html><html><body><script>location.href='https://ssoaut.gco.global/my.policy?apm=5'</script></body></html>`
  const { context, page, ctx, pulsados } = await abrirLogin(portal, SSO_SIN_USUARIO)
  try {
    assert.equal(await loginPaso1(page, ctx as never, { carreraMs: 5_000, usuarioMs: 500 }), true)
    assert.equal(pulsados.length, 0)
    assert.equal(await page.locator('input[type="password"]').inputValue(), '', 'no se escribe nada')
  } finally {
    await context.close()
  }
})

test('loginPaso1: ni SSO ni cabecera → error de portal TRANSITORIO con mensaje claro', async () => {
  const { context, page, ctx } = await abrirLogin('<!doctype html><html><body>vacío</body></html>', SSO_CON_USUARIO)
  try {
    await assert.rejects(() => loginPaso1(page, ctx as never, { carreraMs: 700 }), (e) => e instanceof ErrorTarificador && e.tipo === 'portal' && e.transitorio === true && /ni al SSO ni a la cabecera/.test(e.message))
  } finally {
    await context.close()
  }
})
