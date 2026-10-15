// Mapfre NSEI · paso 1 · DIÁLOGOS de la búsqueda del tomador (bot 0.7.2, 14/10/2026). Regresión del trabajo que se atascó con
// «mapa incompleto: faltan el diálogo que abre la búsqueda del tomador»: el inventario del marco, tomado DESPUÉS, no traía
// NINGÚN diálogo abierto (ni filas ni botones de diálogo) → el diálogo que vio el robot era el «espere» TRANSITORIO de Mapfre
// (contenedor de diálogo sin filas ni botones, que se cierra solo), no una selección de persona. Fixtures SINTÉTICAS: la
// estructura (mat-dialog-container, tabla con radio por fila, aviso con un botón) es la esperable de Angular Material; los
// valores son placeholders. La estructura exacta de la lista y del aviso NO está grabada: el robot solo actúa por regla fija.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import type { FormularioAuto } from '@central/module-tarificacion'
import { clasificarDialogoTomador, ErrorMapaIncompleto, pasoDatosBasicos, SEL_TOMADOR } from '../src/adapters/mapfre/auto.ts'
import { AVISOS_TOMADOR_MAPFRE, cerrarAvisoTomadorMapfre, elegirTomadorMapfre, instalarGuardEmision, type GuardEmision } from '../src/guard.ts'
import { ErrorTarificador } from '../src/errores.ts'
import { EmisionBloqueadaError } from '@central/module-tarificacion'
import type { ContextoFormador } from '../src/formador.ts'

const NIF = '00000000T'
const OTRO_NIF = '11111111H'
const AVISO = 'NO EXISTE NINGUN REGISTRO PARA ESA CONDICION DE BUSQUEDA'

const form = {
  ramo: 'auto', matricula: '0000BBB', codigoPostal: '00001',
  conductor: { fechaNacimiento: '1980-02-03', fechaCarne: '2005-06-07', sexo: null },
  tomadorEsConductor: null, tomadorEsPropietario: null, aniosAseguradoAnterior: 3, siniestrosUltimos5Anios: 0, garajeNoche: null,
  tomador: { tipo: 'fisica', nombre: 'NOMBRE PRUEBA', apellido1: 'APELLIDO1 PRUEBA', apellido2: 'APELLIDO2 PRUEBA', documentoIdentidad: NIF, fechaNacimiento: '1985-03-07', razonSocial: null, codigoPostal: null, poblacion: null, direccion: null, telefono: null, email: null },
  eleccionVersion: null, seleccionVehiculo: null, documentoTomador: NIF,
} as unknown as FormularioAuto

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
after(async () => {
  await browser?.close()
})

const AUTORRELLENO = "for(const [n,v] of [['nombre','NOMBRE AUTO'],['primerApellido','APELLIDO AUTO'],['fechaNacimiento','01/01/1990']])document.querySelector('[name='+n+']').value=v"
/** Fixture: al salir del NIF se ejecuta `alAbandonar` (inserta el diálogo, rellena, etc.). Marcas en `window.__*`. */
const HTML = (alAbandonar: string) => `<body>${ESTILO}<app-datos-basicos>
  <input name="codigoDocumento" onblur="alAbandonar()">
  <input name="nombre"><input name="primerApellido"><input name="segundoApellido"><input name="fechaNacimiento">
  <mat-error id="err"></mat-error>
</app-datos-basicos>
<script>function alAbandonar(){${alAbandonar}}</script>
<button onclick="window.__emitir=1">Emitir póliza</button></body>`

/** Diálogo de lista: una fila por NIF, con radio. «Aceptar» cierra, rellena el tomador y deja la fila elegida en `__fila`. */
const LISTA = (nifs: string[], extra = '') => `<mat-dialog-container id="dlg"><table><thead><tr><th></th><th>NIF</th><th>Nombre</th></tr></thead><tbody>${nifs.map((n, i) => `<tr><td><input type="radio" name="p" onchange="document.getElementById('ok').disabled=false"></td><td>${n}</td><td>PERSONA ${i}</td></tr>`).join('')}</tbody></table>
<button onclick="window.__cancelar=1">Cancelar</button>${extra}<button id="ok" disabled onclick="window.__fila=Array.from(document.querySelectorAll('input[type=radio]')).findIndex(r=>r.checked);document.getElementById('dlg').remove();${AUTORRELLENO}">Aceptar</button></mat-dialog-container>`
const AVISO_DLG = (texto = AVISO, boton = 'Aceptar', extra = '') => `<mat-dialog-container id="dlg"><p>${texto}</p>${extra}<button onclick="window.__cerrado=1;document.getElementById('dlg').remove()">${boton}</button></mat-dialog-container>`
const ESTILO = '<style>mat-dialog-container,mat-spinner{display:block;min-height:20px;min-width:20px}</style>'
const insertar = (html: string) => `document.body.insertAdjacentHTML('beforeend',${JSON.stringify(html)})`

async function preparar(html: string): Promise<{ context: BrowserContext; page: Page; guard: GuardEmision; registro: string[]; formador: ContextoFormador; ctx: Parameters<typeof pasoDatosBasicos>[2] }> {
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  const page = await context.newPage()
  page.setDefaultTimeout(3_000)
  await page.setContent(html)
  const registro: string[] = []
  const formador: ContextoFormador = {
    trabajoId: 't', compania: 'mapfre', ramo: 'auto', apiUrl: 'http://127.0.0.1:9', secreto: 'x', activo: true, acompanado: false,
    conocimiento: [], resueltos: new Map(), redactar: (t) => t, log: () => {}, fetchImpl: (async () => new Response(null, { status: 503 })) as typeof fetch,
  }
  const ctx = {
    formador,
    continuarMapfre: async (_p: Page, paso: string) => { registro.push(`continuar:${paso}`) },
    elegirTomadorMapfre: (p: Page, nif: string) => elegirTomadorMapfre(p, guard, nif),
    cerrarAvisoTomadorMapfre: (p: Page) => cerrarAvisoTomadorMapfre(p, guard),
  } as unknown as Parameters<typeof pasoDatosBasicos>[2]
  return { context, page, guard, registro, formador, ctx }
}
const marca = (page: Page, k: string) => page.evaluate((x) => (window as unknown as Record<string, unknown>)[x] ?? null, k)
const valor = (page: Page, n: string) => page.locator(`app-datos-basicos input[name="${n}"]`).inputValue()

test('REGRESIÓN trabajo atascado: diálogo transitorio «espere» (sin filas ni botones) que se cierra solo → se sigue esperando y se continúa con el autorrelleno', async () => {
  const espere = '<mat-dialog-container id="espere"><mat-spinner></mat-spinner><p>Espere un momento</p></mat-dialog-container>'
  const { context, page, registro, ctx } = await preparar(HTML(`${insertar(espere)};setTimeout(()=>{document.getElementById('espere').remove();${AUTORRELLENO}},1200)`))
  assert.equal(await clasificarDialogoTomador(page), 'ninguno')
  await pasoDatosBasicos(page, form, ctx, 5_000)
  assert.equal(await valor(page, 'nombre'), 'NOMBRE AUTO', 'lo autorrellenado no se toca')
  assert.equal(await marca(page, '__emitir'), null)
  assert.deepEqual(registro, ['continuar:datosBasicos'])
  await context.close()
})

test('un «espere» que NO se cierra en toda la espera → atasco (nunca se supone nada), sin pulsar', async () => {
  const espere = '<mat-dialog-container><mat-spinner></mat-spinner></mat-dialog-container>'
  const { context, page, registro, ctx, formador } = await preparar(HTML(insertar(espere)))
  await assert.rejects(() => pasoDatosBasicos(page, form, ctx, 800), (e) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom && /diálogo/.test(e.message))
  assert.ok(formador.atasco, 'checkpoint de atasco')
  assert.deepEqual(registro, [])
  await context.close()
})

test('clasificarDialogoTomador: cargando / lista / aviso / otro', async () => {
  const { context, page } = await preparar('<body></body>')
  const caso = async (html: string) => { await page.setContent(`<body>${ESTILO}${html}</body>`); return clasificarDialogoTomador(page) }
  assert.equal(await caso('<mat-dialog-container><mat-spinner></mat-spinner></mat-dialog-container>'), 'cargando')
  assert.equal(await caso(LISTA([NIF])), 'lista')
  assert.equal(await caso(AVISO_DLG()), 'aviso')
  assert.equal(await caso('<mat-dialog-container><p>Otra cosa</p><button>Aceptar</button></mat-dialog-container>'), 'otro')
  assert.equal(await caso('<mat-dialog-container></mat-dialog-container><div role="dialog">x</div>'), 'otro')
  await context.close()
})

test('LISTA de personas: se elige SOLO la fila cuyo NIF coincide (aunque no sea la primera) y se sigue con el autorrelleno', async () => {
  const { context, page, registro, ctx } = await preparar(HTML(insertar(LISTA([OTRO_NIF, '00000000-t', '22222222J']))))
  await pasoDatosBasicos(page, form, ctx, 4_000)
  assert.equal(await marca(page, '__fila'), 1, 'la fila del NIF del riesgo (normalizado)')
  assert.equal(await marca(page, '__cancelar'), null)
  assert.equal(await marca(page, '__emitir'), null)
  assert.equal(await valor(page, 'nombre'), 'NOMBRE AUTO')
  assert.deepEqual(registro, ['continuar:datosBasicos'])
  await context.close()
})

test('LISTA sin ninguna fila con el NIF → atasco, no se marca ni se pulsa nada', async () => {
  const { context, page, registro, ctx, formador } = await preparar(HTML(insertar(LISTA([OTRO_NIF, '22222222J']))))
  await assert.rejects(() => pasoDatosBasicos(page, form, ctx, 3_000), (e) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom && /ninguna fila/.test(e.message) && !e.message.includes(NIF))
  assert.equal(await marca(page, '__fila'), null)
  assert.equal(await page.locator('input[type=radio]:checked').count(), 0)
  assert.ok(formador.atasco)
  assert.ok(!JSON.stringify(formador.atasco).includes(NIF))
  assert.deepEqual(registro, [])
  await context.close()
})

test('LISTA con el NIF en DOS filas → atasco (nunca se escoge una), nada marcado', async () => {
  const { context, page, registro, ctx } = await preparar(HTML(insertar(LISTA([NIF, OTRO_NIF, NIF]))))
  await assert.rejects(() => pasoDatosBasicos(page, form, ctx, 3_000), (e) => e instanceof ErrorMapaIncompleto && /varias filas/.test(e.message))
  assert.equal(await page.locator('input[type=radio]:checked').count(), 0)
  assert.deepEqual(registro, [])
  await context.close()
})

test('elegirTomadorMapfre: una sola vez por trabajo; un control con manejador de emisión se bloquea', async () => {
  const a = await preparar(`<body>${ESTILO}${LISTA([NIF])}</body>`)
  assert.equal(await elegirTomadorMapfre(a.page, a.guard, NIF), 'elegido')
  await a.page.setContent(`<body>${ESTILO}${LISTA([NIF])}</body>`)
  await assert.rejects(() => elegirTomadorMapfre(a.page, a.guard, NIF), /ya se usó/)
  await a.context.close()
  const b = await preparar(ESTILO + '<body><mat-dialog-container><table><tbody><tr><td><input type="radio" onclick="emitirPoliza()"></td><td>' + NIF + '</td></tr></tbody></table></mat-dialog-container></body>')
  await assert.rejects(() => elegirTomadorMapfre(b.page, b.guard, NIF))
  assert.equal(await b.page.locator('input[type=radio]:checked').count(), 0)
  await b.context.close()
})

test('AVISO «no existe ningún registro» con Aceptar → se cierra (texto validado) y se sigue por el ALTA del tomador nuevo', async () => {
  const { context, page, registro, ctx } = await preparar(HTML(insertar(AVISO_DLG())))
  await pasoDatosBasicos(page, form, ctx, 4_000)
  assert.equal(await marca(page, '__cerrado'), 1)
  assert.equal(await valor(page, 'nombre'), 'NOMBRE PRUEBA')
  assert.equal(await valor(page, 'fechaNacimiento'), '07/03/1985')
  assert.equal(await marca(page, '__emitir'), null)
  assert.deepEqual(registro, ['continuar:datosBasicos'])
  await context.close()
})

test('AVISO con botón «Cerrar» también vale; con punto final y tildes distintas, igual', async () => {
  const { context, page, guard } = await preparar(`<body>${ESTILO}${AVISO_DLG('No existe ningún registro para esa condición de búsqueda.', 'Cerrar')}</body>`)
  assert.equal(await cerrarAvisoTomadorMapfre(page, guard), 'sin_registro')
  assert.equal(await marca(page, '__cerrado'), 1)
  await context.close()
})

test('guard: un aviso con OTRO texto, con dos botones de cierre, con filas, o con un botón que no es Aceptar/Cerrar → NO se pulsa nada', async () => {
  const casos: string[] = [
    AVISO_DLG('Se ha producido un error al contratar'),
    `<mat-dialog-container><p>${AVISO}</p><button onclick="window.__cerrado=2">Aceptar</button><button onclick="window.__cerrado=3">Cerrar</button></mat-dialog-container>`,
    LISTA([NIF]).replace('<p>', '<p>'),
    AVISO_DLG(AVISO, 'Emitir'),
    `<mat-dialog-container><p>${AVISO}</p><p>Quiere contratar</p><button onclick="window.__cerrado=4">Aceptar</button></mat-dialog-container>`,
  ]
  for (const html of casos) {
    const { context, page, guard } = await preparar(`<body>${ESTILO}${html}</body>`)
    await assert.rejects(() => cerrarAvisoTomadorMapfre(page, guard), (e) => e instanceof ErrorTarificador && e.tipo === 'portal')
    assert.equal(await marca(page, '__cerrado'), null)
    await context.close()
  }
})

test('guard: el aviso solo se cierra una vez por trabajo, y los textos validados son una lista cerrada', async () => {
  assert.deepEqual([...AVISOS_TOMADOR_MAPFRE], [AVISO, 'NO SE HA ENCONTRADO', 'NO SE HAN ENCONTRADO', 'SIN RESULTADOS'], 'el guard acepta los mismos textos que clasifica el adaptador')
  const { context, page, guard } = await preparar(`<body>${ESTILO}${AVISO_DLG()}</body>`)
  await cerrarAvisoTomadorMapfre(page, guard)
  await page.setContent(`<body>${ESTILO}${AVISO_DLG()}</body>`)
  await assert.rejects(() => cerrarAvisoTomadorMapfre(page, guard), /ya se cerró/)
  await context.close()
})

test('otro diálogo (texto desconocido con botón) → atasco; el botón NO se pulsa', async () => {
  const otro = '<mat-dialog-container><p>Mensaje desconocido</p><button onclick="window.__p=1">Aceptar</button></mat-dialog-container>'
  const { context, page, registro, ctx, formador } = await preparar(HTML(insertar(otro)))
  await assert.rejects(() => pasoDatosBasicos(page, form, ctx, 3_000), (e) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom && /diálogo/.test(e.message))
  assert.equal(await marca(page, '__p'), null)
  assert.ok(formador.atasco)
  assert.deepEqual(registro, [])
  assert.ok(SEL_TOMADOR.documento)
  await context.close()
})

test('los tres textos de aviso que clasifica el adaptador, el guard los cierra y se sigue por el alta', async () => {
  for (const t of ['No se ha encontrado', 'No se han encontrado', 'Sin resultados']) {
    const { context, page, registro, ctx } = await preparar(HTML(insertar(AVISO_DLG(t))))
    await pasoDatosBasicos(page, form, ctx, 4_000)
    assert.equal(await marca(page, '__cerrado'), 1, t)
    assert.deepEqual(registro, ['continuar:datosBasicos'])
    await context.close()
  }
})

test('si la función guardada de elegir/cerrar LANZA (texto distinto, diálogo cerrado) → atasco por huecoTomador, no error «portal» seco; EmisionBloqueadaError se re-lanza', async () => {
  const lanza = (x: unknown) => async () => { throw x }
  for (const dlg of [LISTA([NIF]), AVISO_DLG()]) {
    const { context, page, ctx, formador } = await preparar(HTML(insertar(dlg)))
    const c = { ...ctx, elegirTomadorMapfre: lanza(new ErrorTarificador('portal', 'x')), cerrarAvisoTomadorMapfre: lanza(new ErrorTarificador('portal', 'x')) } as unknown as typeof ctx
    await assert.rejects(() => pasoDatosBasicos(page, form, c, 3_000), (e) => e instanceof ErrorMapaIncompleto && e.pideInventarioDom)
    assert.ok(formador.atasco, 'checkpoint de atasco')
    await context.close()
  }
  const { context, page, ctx } = await preparar(HTML(insertar(AVISO_DLG())))
  const c = { ...ctx, cerrarAvisoTomadorMapfre: lanza(new EmisionBloqueadaError('boton', 'x')) } as unknown as typeof ctx
  await assert.rejects(() => pasoDatosBasicos(page, form, c, 3_000), (e) => e instanceof EmisionBloqueadaError)
  await context.close()
})

test('elegirTomadorMapfre: el aria-label/texto del control (puede llevar un nombre) no entra en la descripción; su manejador de emisión sigue bloqueando', async () => {
  const fila = (attrs: string) => `<body>${ESTILO}<mat-dialog-container id="d"><table><tbody><tr><td><input type="radio" ${attrs}></td><td>${NIF}</td></tr></tbody></table><button onclick="document.getElementById('d').remove()">Aceptar</button></mat-dialog-container></body>`
  const a = await preparar(fila('aria-label="Emitir a JUAN PEREZ GARCIA"'))
  assert.equal(await elegirTomadorMapfre(a.page, a.guard, NIF), 'elegido')
  await a.context.close()
  const b = await preparar(fila('aria-label="JUAN PEREZ GARCIA" onclick="emitirPoliza()"'))
  await assert.rejects(() => elegirTomadorMapfre(b.page, b.guard, NIF), (e) => e instanceof EmisionBloqueadaError && !/JUAN|PEREZ/.test(e.message))
  await b.context.close()
})
