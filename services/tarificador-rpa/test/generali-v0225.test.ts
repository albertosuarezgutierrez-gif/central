// Generali Turismos v0.2.25 (26/10/2026, autorizado por Alberto): «Personas» lleva a «Interesado / Tomador › Datos personas» (`emiAutosGenB028.do`,
// sin buscador). El bot rellena SOLO los vacíos con los datos del riesgo (respetando lo que autocompleta el portal al salir del NIF) y pulsa
// «Confirmar» SOLO por la puerta acotada del guard (marco emiAutosGenB028.do, pestaña «Datos personas», #confirmar, una vez). Cualquier otro
// «Confirmar» de Generali sigue prohibido. Nunca casillas (#campofocus). Fixtures SINTÉTICAS (ningún dato real).
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, type Browser, type Frame, type Page } from 'playwright'
import {
  MEDIADOR_GENERALI,
  opcionEspanaGenerali,
  opcionSexoGenerali,
  opcionTipoCarneGenerali,
  opcionTipoDocumentoGenerali,
  pestanaDatosPersonasActivaGenerali,
  planDatosPersonasGenerali,
  tipoDocumentoGenerali,
  urlDatosPersonasGenerali,
} from '../src/adapters/generali/reglas.ts'
import { ErrorMapaIncompletoGenerali, VERSION_GENERALI_AUTO, elegirPersonaTomadorGenerali } from '../src/adapters/generali/auto.ts'
import { confirmarDeGenerali, instalarGuardEmision, pulsar, pulsarConfirmarDatosPersonasGenerali, type GuardEmision } from '../src/guard.ts'
import { EmisionBloqueadaError } from '@central/module-tarificacion'
import type { ContextoPortal } from '../src/adaptador.ts'

const P = 'reg1063A_personas_'
const I = 'personas_intere_'
const NIF = '00000000T'
const NIE = 'X0000000T'
const FORM = {
  documentoTomador: NIF,
  datosTomador: { tipo: 'fisica' as const, nombre: 'Ana', apellido1: 'Perez', apellido2: 'Gil', fechaNacimiento: '1980-05-17' },
  tomadorEsConductor: true,
  clasePermiso: 'b',
  conductor: { fechaNacimiento: '1980-05-17', fechaCarne: '2000-06-01', sexo: 'mujer' },
}
const BASE = 'https://www.generali.es/emi_genAutosFormWeb/'
const B028 = `${BASE}emiAutosGenB028.do`
const PORTAL = 'https://www.generali.es/arq_genernetPortalFormWeb/CorredorPortal.po?mediatorCode=' + MEDIADOR_GENERALI
const ESPERAS = { abrirMs: 3_000, autocompletarMs: 300, trasConfirmarMs: 2_500 }

test('v0.2.25 · versión', () => assert.equal(VERSION_GENERALI_AUTO, '0.2.27'))

test('v0.2.25 · puras: URL del marco, tipo de documento, opciones (NIF/NIE, sexo, carné, España) y pestaña activa', () => {
  assert.ok(urlDatosPersonasGenerali(B028))
  assert.ok(urlDatosPersonasGenerali(`${B028};jsessionid=ABC?x=1`))
  for (const u of [`${BASE}Datos.do`, 'https://otro.es/x/emiAutosGenB028.do', `${BASE}emiAutosGenB028.doX`, `${BASE}selVehiculo`]) assert.ok(!urlDatosPersonasGenerali(u), u)
  assert.equal(tipoDocumentoGenerali(NIF), 'nif')
  assert.equal(tipoDocumentoGenerali(NIE), 'nie')
  assert.equal(tipoDocumentoGenerali('B00000000'), null)
  const docs = [{ valor: '', texto: 'Seleccione' }, { valor: '1', texto: 'NIF' }, { valor: '2', texto: 'NIE' }, { valor: '3', texto: 'CIF' }]
  assert.equal(opcionTipoDocumentoGenerali(docs, 'nif'), 1)
  assert.equal(opcionTipoDocumentoGenerali(docs, 'nie'), 2)
  assert.equal(opcionTipoDocumentoGenerali([{ valor: '1', texto: 'Persona física con NIF/NIE/Pasaporte' }], 'nif'), 0)
  assert.equal(opcionTipoDocumentoGenerali([{ valor: '1', texto: 'NIF persona física' }, { valor: '2', texto: 'NIF extranjero' }], 'nif'), null, 'ambiguo: no se adivina')
  const sexos = [{ valor: '', texto: '' }, { valor: 'H', texto: 'Hombre' }, { valor: 'M', texto: 'Mujer' }]
  assert.equal(opcionSexoGenerali(sexos, 'hombre'), 1)
  assert.equal(opcionSexoGenerali(sexos, 'mujer'), 2)
  assert.equal(opcionSexoGenerali([{ valor: 'M', texto: 'M' }, { valor: 'F', texto: 'F' }], 'mujer'), null, 'M/F por valor es ambiguo')
  assert.equal(opcionTipoCarneGenerali([{ valor: '', texto: '' }, { valor: 'A2', texto: 'A2' }, { valor: 'B', texto: 'B' }], 'b'), 2)
  assert.equal(opcionTipoCarneGenerali([{ valor: '07', texto: 'B - Turismos' }, { valor: '08', texto: 'BTP' }], 'b'), 0)
  assert.equal(opcionEspanaGenerali([{ valor: '', texto: '' }, { valor: '724', texto: 'España' }, { valor: '250', texto: 'Francia' }]), 1)
  assert.deepEqual(pestanaDatosPersonasActivaGenerali([{ tipo: 'seleccion', activa: false }, { tipo: 'datos', activa: true }], true), { ok: true, por: 'marca' })
  assert.equal(pestanaDatosPersonasActivaGenerali([{ tipo: 'seleccion', activa: true }, { tipo: 'datos', activa: false }], true).ok, false)
  assert.deepEqual(pestanaDatosPersonasActivaGenerali([{ tipo: 'seleccion', activa: true }, { tipo: 'datos', activa: false }, { tipo: 'datos', activa: true }], true), { ok: true, por: 'marca' }, 'v0.2.26: dos «Datos personas», una marcada; la marca de «Selección» es de otro nivel')
  assert.equal(pestanaDatosPersonasActivaGenerali([{ tipo: 'seleccion', activa: true }, { tipo: 'datos', activa: false }, { tipo: 'datos', activa: false }], true).ok, false, 'v0.2.26: ningún «Datos personas» marcado')
  assert.deepEqual(pestanaDatosPersonasActivaGenerali([{ tipo: 'seleccion', activa: false }, { tipo: 'datos', activa: false }], true), { ok: true, por: 'contenido' })
  assert.equal(pestanaDatosPersonasActivaGenerali([{ tipo: 'seleccion', activa: false }], true).ok, false, 'sin pestaña «Datos personas»')
})

test('v0.2.25 · plan: del conductor SOLO si el tomador es el conductor; España solo con DNI; contacto solo si viene; empresa/CIF → error', () => {
  const p = planDatosPersonasGenerali(FORM)
  assert.ok(!('error' in p))
  assert.deepEqual(p, { documento: NIF, tipoDocumento: 'nif', nombre: 'Ana', apellido1: 'Perez', apellido2: 'Gil', fechaNacimiento: '17/05/1980', fechaCarne: '01/06/2000', tipoCarne: 'b', sexo: 'mujer', espana: true, email: null, movil: null })
  const sinRol = planDatosPersonasGenerali({ ...FORM, tomadorEsConductor: null, datosTomador: { ...FORM.datosTomador, fechaNacimiento: undefined as unknown as string } })
  assert.ok(!('error' in sinRol) && sinRol.sexo === null && sinRol.fechaCarne === null && sinRol.tipoCarne === null && sinRol.fechaNacimiento === null, 'sin rol, nada del conductor')
  const nie = planDatosPersonasGenerali({ ...FORM, documentoTomador: NIE })
  assert.ok(!('error' in nie) && nie.tipoDocumento === 'nie' && nie.espana === false)
  const contacto = planDatosPersonasGenerali({ ...FORM, datosTomador: null, tomador: { tipo: 'fisica', nombre: 'Ana', apellido1: 'Perez', documentoIdentidad: NIF, email: 'a@ejemplo.test', telefono: '600000000' } })
  assert.ok(!('error' in contacto) && contacto.email === 'a@ejemplo.test' && contacto.movil === '600000000')
  assert.ok('error' in planDatosPersonasGenerali({ ...FORM, datosTomador: { tipo: 'juridica', razonSocial: 'X SL' } as never }))
  assert.ok('error' in planDatosPersonasGenerali({ ...FORM, documentoTomador: 'B00000000' }))
  assert.ok('error' in planDatosPersonasGenerali({ ...FORM, documentoTomador: null }))
})

test('v0.2.25 · `pulsar` genérico NO deja pulsar un «Confirmar» de www.generali.es (solo por las puertas del guard)', () => {
  assert.ok(confirmarDeGenerali(['Confirmar', null, null, null], B028))
  assert.ok(confirmarDeGenerali(['', null, null, 'CONFIRMAR'], `${BASE}otra.do`))
  assert.ok(!confirmarDeGenerali(['Confirmar', null, null, null], 'https://www.mapfre.es/x'))
  assert.ok(!confirmarDeGenerali(['Volver', null, null, null], B028))
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
after(async () => {
  await browser?.close()
})

type Opciones = {
  /** Marca de activa en la pestaña: 'datos' (por defecto), 'seleccion' o ninguna. */
  activa?: 'datos' | 'seleccion' | 'ninguna' | 'real' | 'real-sin-datos'
  /** Al salir del NIF el portal pone este nombre (autocompletado). */
  autoNombre?: string
  /** NIF que ya trae la pantalla. */
  nifPrevio?: string
  /** Tras «Confirmar» el portal vuelve a la pantalla con este mensaje de validación (en vez de volver a Datos de Valoración). */
  validacion?: string
  /** URL a la que lleva «Personas» (por defecto emiAutosGenB028.do). */
  destino?: string
}
type Estado = { elegido: boolean; confirmar: number; volver: number; enviado: Record<string, string> }

const vehiculo = (e: Estado, destino: string) => `<input id="${P}roles_lnkPers" type="button" value="Personas" onclick="location.href='${destino}'">
  <input id="${P}interesado_nifcif" type="text" readonly value="${e.elegido ? NIF : ''}"><input id="${P}interesado_nombre" type="text" readonly value="${e.elegido ? 'ANA PEREZ GIL' : ''}">`

const opcion = (v: string, t: string) => `<option value="${v}">${t}</option>`
const datos = (o: Opciones, mensaje = '') => {
  const cls = (t: 'datos' | 'seleccion') => ((o.activa ?? 'datos') === t ? ' class="pestanaActiva"' : ' class="pestana"')
  // v0.2.26: DOM real (diagnóstico 0.2.24): DOS enlaces «Datos personas», `current` en el CONTENEDOR del segundo y «Selección…» con `current` en el propio enlace.
  const real = o.activa === 'real' || o.activa === 'real-sin-datos'
  const menu = real
    ? `<ul><li class="opc"><a class="current" href="#">Selección personas que intervienen</a></li><li><a href="#">Datos personas</a></li><li class="mclick"><a class="NOLINK" href="#">&nbsp;</a></li><li class="${o.activa === 'real' ? 'current' : 'otra'}"><a href="#">Datos personas</a></li></ul>`
    : `<ul><li${cls('seleccion')}><a href="#">Selección personas que intervienen</a></li><li${cls('datos')}><a href="#">Datos personas</a></li></ul>`
  return `${menu}<a href="#">Selección personas que intervienen</a></li><li${cls('datos')}>
  ${mensaje ? `<div class="mensajeError">${mensaje}</div>` : ''}
  <form id="f" action="${BASE}Confirmado.do" method="get">
  <select id="${I}ynidcl" name="ynidcl">${opcion('', 'Seleccione')}${opcion('1', 'NIF')}${opcion('2', 'NIE')}${opcion('3', 'CIF')}</select>
  <input id="${I}nifcif" name="nifcif" type="text" value="${o.nifPrevio ?? ''}" ${o.autoNombre ? `onblur="if(this.value){document.getElementById('${I}nombre').value='${o.autoNombre}'}"` : ''}>
  <input id="${I}nombre" name="nombre" type="text"><input id="${I}papell" name="papell" type="text"><input id="${I}sapell" name="sapell" type="text">
  <select id="${I}ysexo" name="ysexo">${opcion('', '')}${opcion('H', 'Hombre')}${opcion('M', 'Mujer')}</select>
  <input id="${I}ffnain" name="ffnain" type="text"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="8" height="8">
  <input id="${I}ffcain" name="ffcain" type="text"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" width="8" height="8">
  <select id="${I}ycarnc" name="ycarnc">${opcion('', '')}${opcion('A2', 'A2')}${opcion('B', 'B')}</select>
  <select id="${I}pnacld" name="pnacld">${opcion('', '')}${opcion('724', 'España')}${opcion('250', 'Francia')}</select>
  <input id="${I}yemail" name="yemail" type="text"><input id="${I}movtom" name="movtom" type="text">
  <input id="campofocus" name="campofocus" type="checkbox">
  <input id="cancelar" type="button" value="Volver" onclick="location.href='${BASE}Volver.do'">
  <input id="confirmar" type="button" value="Confirmar" onclick="document.getElementById('f').submit()">
  </form>`
}

async function abrir(o: Opciones = {}): Promise<{ marco: Frame; page: Page; guard: GuardEmision; estado: Estado; ctx: ContextoPortal; cerrar: () => Promise<void> }> {
  const estado: Estado = { elegido: false, confirmar: 0, volver: 0, enviado: {} }
  const destino = o.destino ?? B028
  const context = await browser.newContext()
  const guard = await instalarGuardEmision(context)
  await context.route('https://www.generali.es/**', async (r) => {
    const u = r.request().url()
    let cuerpo = 'otra'
    if (u.startsWith(PORTAL.split('?')[0]!)) cuerpo = `<iframe name="mainFrame" src="${BASE}Vehiculo.do" style="width:900px;height:600px"></iframe>`
    else if (u.startsWith(`${BASE}Vehiculo.do`)) cuerpo = vehiculo(estado, destino)
    else if (u.startsWith(`${B028}?v=1`)) cuerpo = datos({ ...o, nifPrevio: NIF }, o.validacion)
    else if (u.startsWith(destino)) cuerpo = datos(o)
    else if (u.startsWith(`${BASE}Confirmado.do`)) {
      estado.confirmar++
      estado.enviado = Object.fromEntries(new URL(u).searchParams.entries())
      if (o.validacion) cuerpo = `<script>location.replace('${B028}?v=1')</script>`
      else {
        estado.elegido = true
        cuerpo = vehiculo(estado, destino)
      }
    } else if (u.startsWith(`${BASE}Volver.do`)) estado.volver++
    await r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><body>${cuerpo}</body>` })
  })
  const page = await context.newPage()
  page.setDefaultTimeout(2_000)
  await page.goto(PORTAL)
  let marco: Frame | undefined
  for (let i = 0; i < 40 && !marco; i++) {
    marco = page.frames().find((f) => f.name() === 'mainFrame')
    if (marco && (await marco.locator(`[id="${P}roles_lnkPers"]`).count()) === 0) marco = undefined
    if (!marco) await new Promise((x) => setTimeout(x, 100))
  }
  assert.ok(marco)
  const ctx = {
    pausaAccion: async () => {},
    pulsar: (b: Parameters<ContextoPortal['pulsar']>[0]) => pulsar(b, guard),
    confirmarDatosPersonasGenerali: () => pulsarConfirmarDatosPersonasGenerali(page, guard, 300),
    log: () => {},
  } as unknown as ContextoPortal
  return { marco: marco!, page, guard, estado, ctx, cerrar: () => context.close() }
}

/** Lleva el marco a la pantalla «Datos personas» pulsando «Personas» (para las pruebas del guard). */
async function irADatos(marco: Frame, guard: GuardEmision): Promise<void> {
  await pulsar(marco.locator(`[id="${P}roles_lnkPers"]`), guard)
  for (let i = 0; i < 40; i++) {
    if ((await marco.locator(`[id="${I}nifcif"]`).count().catch(() => 0)) === 1) return
    await new Promise((x) => setTimeout(x, 100))
  }
  assert.fail('no llegó a «Datos personas»')
}

test('v0.2.25 · alta: rellena SOLO los vacíos (respeta el autocompletado del portal), pulsa «Confirmar» UNA vez por el guard y verifica la vuelta; sin valores en el diagnóstico', async () => {
  const { marco, estado, ctx, guard, cerrar } = await abrir({ autoNombre: 'NOMBREPORTAL' })
  try {
    const r = await elegirPersonaTomadorGenerali(marco, FORM, ctx, ESPERAS)
    assert.ok(r)
    assert.match(r!.diag, /rama=datos_personas, confirmado, verificado/)
    assert.equal(estado.confirmar, 1)
    assert.equal(estado.volver, 0, '«Volver» nunca')
    const e = estado.enviado
    assert.deepEqual(
      { doc: e.ynidcl, nif: e.nifcif, nombre: e.nombre, a1: e.papell, a2: e.sapell, sexo: e.ysexo, nac: e.ffnain, carne: e.ffcain, tipoCarne: e.ycarnc, pais: e.pnacld, email: e.yemail, movil: e.movtom },
      { doc: '1', nif: NIF, nombre: 'NOMBREPORTAL', a1: 'Perez', a2: 'Gil', sexo: 'M', nac: '17/05/1980', carne: '01/06/2000', tipoCarne: 'B', pais: '724', email: '', movil: '' },
    )
    assert.ok(!('campofocus' in e), 'la casilla #campofocus no se marca')
    assert.ok(r!.hechos.includes('datos_personas.confirmar') && !r!.hechos.includes('datos_personas.nombre'), 'el nombre del portal no se sobrescribe')
    for (const dato of [NIF, 'Ana', 'Perez', 'NOMBREPORTAL', '1980']) assert.ok(!r!.diag.includes(dato), dato)
    // Una segunda pulsación del mismo «Confirmar» en el mismo trabajo: bloqueada.
    await assert.rejects(() => pulsarConfirmarDatosPersonasGenerali(marco.page(), guard, 100), EmisionBloqueadaError)
  } finally {
    await cerrar()
  }
})

test('v0.2.25 · NIE y sin rol de conductor: tipo NIE, sin nacionalidad por defecto y nada del conductor (sexo, carné)', async () => {
  const { marco, estado, ctx, cerrar } = await abrir()
  try {
    await elegirPersonaTomadorGenerali(marco, { ...FORM, documentoTomador: NIE, tomadorEsConductor: null }, ctx, ESPERAS)
    const e = estado.enviado
    assert.deepEqual({ doc: e.ynidcl, nif: e.nifcif, sexo: e.ysexo, carne: e.ffcain, tipoCarne: e.ycarnc, pais: e.pnacld, nac: e.ffnain }, { doc: '2', nif: NIE, sexo: '', carne: '', tipoCarne: '', pais: '', nac: '17/05/1980' })
  } finally {
    await cerrar()
  }
})

test('v0.2.25 · NIF ya puesto que NO es el del tomador: no se sobrescribe ni se confirma otra persona', async () => {
  const { marco, estado, ctx, cerrar } = await abrir({ nifPrevio: '11111111H' })
  try {
    await assert.rejects(
      () => elegirPersonaTomadorGenerali(marco, FORM, ctx, ESPERAS),
      (e: unknown) => {
        assert.ok(e instanceof ErrorMapaIncompletoGenerali)
        assert.match((e as Error).message, /nif_distinto/)
        assert.match((e as Error).message, /No se pulsa «Confirmar»/)
        assert.ok(!(e as Error).message.includes(NIF) && !(e as Error).message.includes('11111111H'))
        return true
      },
    )
    assert.equal(estado.confirmar, 0)
  } finally {
    await cerrar()
  }
})

test('v0.2.25 · validación del portal tras «Confirmar»: atasco con el mensaje SANEADO (sin valores) y sin repetir «Confirmar»', async () => {
  const { marco, estado, ctx, cerrar } = await abrir({ validacion: `Es obligatorio informar la fecha de carné del 00000000T (17/05/1980)` })
  try {
    await assert.rejects(
      () => elegirPersonaTomadorGenerali(marco, FORM, ctx, ESPERAS),
      (e: unknown) => {
        const m = (e as Error).message
        assert.ok(e instanceof ErrorMapaIncompletoGenerali)
        assert.match(m, /el portal no aceptó los datos: «Es obligatorio informar la fecha de carné del \[doc\] \(\[fecha\]\)»/)
        assert.match(m, /Se pulsó «Confirmar» una vez; no se repite/)
        assert.ok(!m.includes(NIF) && !m.includes('1980'), m)
        return true
      },
    )
    assert.equal(estado.confirmar, 1)
  } finally {
    await cerrar()
  }
})

test('v0.2.25 · cepo del guard: «Confirmar» fuera de emiAutosGenB028.do (misma pantalla en otra URL) → no se pulsa; el bot para', async () => {
  const { marco, page, guard, estado, ctx, cerrar } = await abrir({ destino: `${BASE}Datos.do` })
  try {
    // El adaptador no reconoce la pantalla (no es B028): para sin pulsar nada.
    await assert.rejects(() => elegirPersonaTomadorGenerali(marco, FORM, ctx, { ...ESPERAS, abrirMs: 1_200 }), ErrorMapaIncompletoGenerali)
    // Y el guard, llamado a pelo, tampoco pulsa (no hay marco emiAutosGenB028.do).
    await assert.rejects(() => pulsarConfirmarDatosPersonasGenerali(page, guard, 100), (e: unknown) => e instanceof EmisionBloqueadaError && /fuera de «Interesado \/ Tomador»/.test((e as Error).message))
    // Ni por la vía genérica.
    await assert.rejects(() => pulsar(marco.locator('#confirmar'), guard), (e: unknown) => e instanceof EmisionBloqueadaError && /solo por su puerta/.test((e as Error).message))
    assert.equal(estado.confirmar, 0)
  } finally {
    await cerrar()
  }
})

test('v0.2.25 · cepo del guard: pestaña activa «Selección personas…» → no se pulsa «Confirmar»', async () => {
  const { marco, page, guard, estado, cerrar } = await abrir({ activa: 'seleccion' })
  try {
    await irADatos(marco, guard)
    await marco.locator(`[id="${I}nifcif"]`).fill(NIF)
    await assert.rejects(() => pulsarConfirmarDatosPersonasGenerali(page, guard, 100), (e: unknown) => e instanceof EmisionBloqueadaError && /fuera de la pestaña «Datos personas»/.test((e as Error).message))
    assert.equal(estado.confirmar, 0)
  } finally {
    await cerrar()
  }
})

test('v0.2.25 · cepo del guard: NIF vacío → no se pulsa; sin marca de pestaña vale el contenido (NIF visible)', async () => {
  const { marco, page, guard, estado, cerrar } = await abrir({ activa: 'ninguna' })
  try {
    await irADatos(marco, guard)
    await assert.rejects(() => pulsarConfirmarDatosPersonasGenerali(page, guard, 100), (e: unknown) => e instanceof EmisionBloqueadaError && /NIF vacío/.test((e as Error).message))
    assert.equal(estado.confirmar, 0)
    await marco.locator(`[id="${I}nifcif"]`).fill(NIF)
    const r = await pulsarConfirmarDatosPersonasGenerali(page, guard, 100)
    assert.equal(r.dialogo, null)
    for (let i = 0; i < 30 && estado.confirmar === 0; i++) await new Promise((x) => setTimeout(x, 100))
    assert.equal(estado.confirmar, 1)
  } finally {
    await cerrar()
  }
})

test('v0.2.26 · DOM real: dos «Datos personas», `current` en el contenedor del segundo y «Selección…» con `current` en el enlace → SE pulsa «Confirmar» una vez', async () => {
  const { marco, page, guard, estado, cerrar } = await abrir({ activa: 'real' })
  try {
    await irADatos(marco, guard)
    await marco.locator(`[id="${I}nifcif"]`).fill(NIF)
    const r = await pulsarConfirmarDatosPersonasGenerali(page, guard, 100)
    assert.equal(r.dialogo, null)
    for (let i = 0; i < 30 && estado.confirmar === 0; i++) await new Promise((x) => setTimeout(x, 100))
    assert.equal(estado.confirmar, 1)
    await assert.rejects(() => pulsarConfirmarDatosPersonasGenerali(page, guard, 100), EmisionBloqueadaError, 'una vez por trabajo')
  } finally {
    await cerrar()
  }
})

test('v0.2.26 · cepo: mismo DOM real pero «Datos personas» SIN `current` en ninguna parte (solo «Selección…») → sigue bloqueando', async () => {
  const { marco, page, guard, estado, cerrar } = await abrir({ activa: 'real-sin-datos' })
  try {
    await irADatos(marco, guard)
    await marco.locator(`[id="${I}nifcif"]`).fill(NIF)
    await assert.rejects(() => pulsarConfirmarDatosPersonasGenerali(page, guard, 100), (e: unknown) => e instanceof EmisionBloqueadaError && /fuera de la pestaña «Datos personas»/.test((e as Error).message))
    assert.equal(estado.confirmar, 0)
  } finally {
    await cerrar()
  }
})
