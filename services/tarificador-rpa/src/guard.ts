// Barrera de EMISIÓN en el navegador (05/10/2026). TARIFICAR ≠ EMITIR.
//   1. Toda navegación (y toda petición que no sea GET) a una URL que casa con el patrón se ABORTA
//      antes de salir, y el trabajo queda marcado → `error_definitivo`. También si la ACCIÓN viaja en los
//      parámetros: la query de la URL o, en las que no son GET, el CUERPO (`action=store` del framework
//      legado de ePAC: la URL es siempre la misma y la acción va en el POST).
//   2. Los adaptadores NO hacen `.click()`: usan `pulsar()`, que mira el texto, aria-label, title,
//      value, id, name y href del elemento y se niega a pulsar si casa con el patrón. (Lo vigila
//      `test/regression-tarificador-rpa.test.ts` en la raíz.)

import type { BrowserContext, Dialog, Frame, Locator, Page, Request } from 'playwright'
import { ErrorTarificador } from './errores.ts'
import {
  EmisionBloqueadaError,
  MaquinaFases,
  comprobarBoton,
  esBotonDeListaBlanca,
  parametrosParecenEmision,
  pareceEmision,
  redactarDatosPersonales,
  usarPermisoEmision,
  type ModalidadPortal,
  type PermisoEmision,
  type PestanaActiva,
} from '@central/module-tarificacion'

/**
 * Ventana de RED de la emisión autorizada (10/10/2026): se abre SOLO dentro de `pulsarEmisionAutorizada`, después de
 * gastar el permiso de un solo uso y justo antes de su único clic, para que las peticiones que ESE clic provoca (que casan
 * con el patrón de emisión) no se aborten. Dura como mucho `VENTANA_RED_EMISION_MS` y el runner la cierra en cuanto lee
 * el resultado. Mientras está abierta el robot no pulsa nada más (`pulsar()` sigue cerrado: comprueba el patrón igual).
 */
export const VENTANA_RED_EMISION_MS = 90_000
export type VentanaRed = { abierta(): boolean; cerrar(): void }

export type GuardEmision = {
  violacion(): EmisionBloqueadaError | null
  comprobar(): void
  fases: MaquinaFases
  ventana: VentanaRed
  /** Ventana de red del AVANCE DE PESTAÑA autorizado (Moto, 13/10/2026). Solo la abre `pulsarAvancePestanaAutorizado`. */
  avance: VentanaRed
}

/**
 * AVANCE DE PESTAÑA AUTORIZADO — Allianz ePAC Moto («Motos-online»). Autorización EXPRESA de Alberto (13/10/2026, «no hay
 * problema con aceptar»): el robot puede pasar de «Riesgo municipio» a «Datos básicos» (`td#datosBasicos`) y de «Datos
 * básicos» a «Tarificar» (`td#rate`) aunque esas pestañas ejecuten el manejador «Aceptar» del portal. Riesgo ACEPTADO: puede
 * quedar un PROYECTO guardado en Allianz (no una póliza). En Tarificar solo se abre la pestaña y se leen primas.
 *
 * LISTA BLANCA CERRADA (cualquier otro selector → `EmisionBloqueadaError` sin pulsar). Por cada selector, del DOM de la
 * grabación del 13/10: id, texto y `onclick` EXACTOS del `td`; el `action` del `form#formulari` de la pantalla de ORIGEN (es
 * lo que el clic envía) y el de la de DESTINO (así se confirma la llegada); y los ÚNICOS destinos (origen + ruta, sin query)
 * a los que puede ir una petición que no sea GET mientras la ventana está abierta. La grabación NO registra la red: los
 * destinos son el `action` del formulario que envía `aceptar_onclick()`; si en real el portal manda otro POST, el trabajo
 * muere (fail-closed) y se añade aquí tras verlo. Lo vigila `test/regression-tarificador-rpa.test.ts` (romperla → rojo).
 */
export const AVANCES_PESTANA_AUTORIZADOS = Object.freeze({
  'td#datosBasicos': Object.freeze({
    id: 'datosBasicos',
    texto: 'Datos básicos',
    formOrigen: '/drpc18/riesgoMunicipio/control.do',
    formDestino: '/drpc18/datosBasicos/control.do',
    endpoints: Object.freeze(['https://www.e-pacallianz.com/drpc18/riesgoMunicipio/control.do']),
  }),
  'td#rate': Object.freeze({
    id: 'rate',
    texto: 'Tarificar',
    formOrigen: '/drpc18/datosBasicos/control.do',
    formDestino: '/drpc18/tarifa/control.do',
    endpoints: Object.freeze(['https://www.e-pacallianz.com/drpc18/datosBasicos/control.do']),
  }),
})
export type SelectorAvancePestana = keyof typeof AVANCES_PESTANA_AUTORIZADOS
/** Tope de la ventana de red del avance: el clic + la carga de la pestaña destino. Se cierra antes en cuanto se llega (finally). */
export const VENTANA_RED_AVANCE_MS = 20_000

/**
 * ¿Puede ir a `url` una petición que no es GET durante la ventana del avance? Solo si su origen + ruta es EXACTAMENTE uno de
 * `endpoints`, sin query, fragmento ni credenciales (un `;jsessionid=` en la ruta tampoco casa: fail-closed). Pura.
 */
export function destinoAvancePermitido(url: string, endpoints: readonly string[]): boolean {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return false
  }
  if (u.username || u.password || u.search || u.hash) return false
  return endpoints.includes(`${u.origin}${u.pathname}`)
}

export async function instalarGuardEmision(context: BrowserContext): Promise<GuardEmision> {
  let violacion: EmisionBloqueadaError | null = null
  const fases = new MaquinaFases()
  let ventanaHasta = 0
  // Ventana del avance de pestaña autorizado: hasta cuándo y a qué destinos (no GET) se puede ir. `null` = cerrada.
  let avance: { hasta: number; endpoints: readonly string[] } | null = null
  const avanceVigente = () => (avance && Date.now() < avance.hasta ? avance : null)
  await context.route('**/*', async (route) => {
    const req = route.request()
    const url = req.url()
    const noGet = req.method() !== 'GET'
    if (req.isNavigationRequest() || noGet) {
      const av = avanceVigente()
      // Capa (a) del avance: el manejador «Aceptar» está autorizado SOLO para las peticiones a un destino de la lista blanca
      // del avance vigente (origen + ruta exactos, sin query). Cualquier otra (GET incluida) se mira como siempre: con
      // «aceptar» bloqueado. store/contract/validar_aceptar/emitir/contratar… abortan siempre, también en la lista.
      const enLista = av !== null && destinoAvancePermitido(url, av.endpoints)
      const op = { permitirAceptar: fases.aceptarEnVuelo() || enLista }
      const porUrl = pareceEmision(url, op) || parametrosParecenEmision(url, op)
      const porCuerpo = !porUrl && noGet && parametrosParecenEmision(cuerpoDe(req), op)
      if ((porUrl || porCuerpo) && Date.now() < ventanaHasta && av === null) {
        // Consecuencia del ÚNICO clic autorizado (ventana abierta por pulsarEmisionAutorizada): pasa.
        await route.continue()
        return
      }
      if (porUrl || porCuerpo) {
        // El cuerpo NO va al mensaje (lleva datos del formulario): solo la URL y que fue por el cuerpo.
        violacion ??= new EmisionBloqueadaError('url', porCuerpo ? `${url} [acción en el cuerpo de la petición]` : url)
        await route.abort('blockedbyclient')
        return
      }
      if (av && noGet && !enLista) {
        // Capa (b) del avance: lista blanca de destinos. Un POST/PUT/… a cualquier otro sitio se aborta y el trabajo cae.
        // Al mensaje solo va origen + ruta (la query de ePAC lleva identificadores de la sesión y del agente).
        let destino = '(url ilegible)'
        try {
          const u = new URL(url)
          destino = `${u.origin}${u.pathname}`
        } catch {}
        violacion ??= new EmisionBloqueadaError('fase', `avance de pestaña: ${req.method()} a un destino fuera de la lista blanca: ${destino}`)
        await route.abort('blockedbyclient')
        return
      }
    }
    await route.continue()
  })
  const g: GuardEmision = {
    fases,
    ventana: {
      abierta: () => Date.now() < ventanaHasta,
      cerrar: () => { ventanaHasta = 0 },
    },
    avance: {
      abierta: () => avanceVigente() !== null,
      cerrar: () => { avance = null },
    },
    violacion: () => violacion,
    comprobar() {
      if (violacion) throw violacion
    },
  }
  ABRIR_VENTANA.set(g, (ms) => { ventanaHasta = Date.now() + Math.min(ms, VENTANA_RED_EMISION_MS) })
  ABRIR_AVANCE.set(g, (hasta, endpoints) => { avance = { hasta: Math.min(hasta, Date.now() + VENTANA_RED_AVANCE_MS), endpoints } })
  return g
}

/** Solo `pulsarAvancePestanaAutorizado` (este fichero) puede abrir la ventana del avance. */
const ABRIR_AVANCE = new WeakMap<GuardEmision, (hasta: number, endpoints: readonly string[]) => void>()
/** Cada avance autorizado, UNA vez por trabajo (contexto): no hay segundo «Aceptar» de la misma pestaña. */
const AVANCES_USADOS = new WeakMap<GuardEmision, Set<string>>()

/** Solo `pulsarEmisionAutorizada` (este fichero) puede abrir la ventana: no hay `abrir` en el objeto público. */
const ABRIR_VENTANA = new WeakMap<GuardEmision, (ms: number) => void>()

/** Cuerpo de la petición como texto (`null` si no tiene). Si no se puede leer como texto, sus bytes en UTF-8. */
function cuerpoDe(req: Request): string | null {
  try {
    return req.postData()
  } catch {
    return req.postDataBuffer()?.toString('utf8') ?? null
  }
}

/** El ÚNICO modo de pulsar algo en un portal. Lanza `EmisionBloqueadaError` antes de pulsar. */
export async function pulsar(boton: Locator, guard: GuardEmision): Promise<void> {
  guard.comprobar()
  const desc = await boton.evaluate((el) => {
    const h = el as HTMLElement & { value?: unknown; href?: unknown; name?: unknown }
    return [
      h.innerText ?? h.textContent ?? '',
      h.getAttribute('aria-label'),
      h.getAttribute('title'),
      typeof h.value === 'string' ? h.value : null,
      h.id || null,
      typeof h.name === 'string' ? h.name : null,
      typeof h.href === 'string' ? h.href : h.getAttribute('href'),
      h.getAttribute('onclick'),
      h.getAttribute('formaction'),
    ]
  })
  comprobarBoton(desc)
  await boton.click()
  guard.comprobar()
}

// ─────────── Controles CONTEXTUALES de ePAC «Comunidades 2020» (guardados por fase) ───────────
// «Aceptar» y el radio de opción solo existen aquí: el adaptador no los nombra (lo vigila el test de la raíz).

/**
 * Pestaña activa según el DOM, por CONTENIDO (no por clases CSS): «Idioma Proyecto PDF» solo existe
 * en Tarificar; «COSTE ANUAL DEL SEG.» solo en Datos Básicos (la fila está ya ANTES de calcular, vacía).
 * Cualquier otra cosa → `null` (y la máquina de fases bloquea). DOM real de Datos Básicos (06/10/2026): las
 * pestañas son `td#DATOSBASICOS`/`td#TARIFICAR` sin `aria-selected`; la seleccionada lleva una clase
 * `…Selected` que el `onmouseover` también pone, así que NO sirve. TODO(capturas): el DOM de Tarificar.
 */
export async function pestanaActiva(page: Page): Promise<PestanaActiva> {
  // El formulario vive en un iframe (`appArea`, 06/10/2026): se mira en TODOS los marcos de la página.
  const visible = async (t: string) => {
    for (const f of marcosVivos(page)) {
      if (await f.getByText(t, { exact: false }).first().isVisible().catch(() => false)) return true
    }
    return false
  }
  const tarificar = await visible('Idioma Proyecto PDF')
  const datos = await visible('COSTE ANUAL DEL SEG.')
  if (tarificar && !datos) return 'tarificar'
  if (datos && !tarificar) return 'datos_basicos'
  return null
}

/** Marcos no desconectados de la página (la carcasa de ePAC + el iframe de la aplicación y sus hijos). */
function marcosVivos(page: Page): Frame[] {
  return page.frames().filter((f) => !f.isDetached())
}

/**
 * Cuenta lo que casa con `buscar` en TODOS los marcos: `total` (suma), `marcos` (cuántos tienen
 * alguno) y el locator del primero que lo tiene. Quien llama exige el `total` exacto que espera.
 */
async function enMarcos(page: Page, buscar: (f: Frame) => Locator): Promise<{ total: number; locator: Locator | null; marcos: number }> {
  let total = 0
  let marcos = 0
  let locator: Locator | null = null
  for (const f of marcosVivos(page)) {
    const l = buscar(f)
    const n = await l.count().catch(() => 0)
    if (n > 0) {
      total += n
      marcos++
      locator ??= l
    }
  }
  return { total, locator, marcos }
}

async function descripcion(boton: Locator): Promise<(string | null)[]> {
  return boton.evaluate((el) => {
    const h = el as HTMLElement & { value?: unknown; href?: unknown; name?: unknown }
    return [
      h.innerText ?? h.textContent ?? '',
      h.getAttribute('aria-label'),
      h.getAttribute('title'),
      typeof h.value === 'string' ? h.value : null,
      h.id || null,
      typeof h.name === 'string' ? h.name : null,
      typeof h.href === 'string' ? h.href : h.getAttribute('href'),
      h.getAttribute('onclick'),
      h.getAttribute('formaction'),
    ]
  })
}

/** Elige la modalidad (radio bajo la fila de opción): Datos Básicos, una vez, pestaña verificada. */
export async function elegirOpcion(page: Page, guard: GuardEmision, modalidad: ModalidadPortal): Promise<void> {
  guard.comprobar()
  guard.fases.autorizarOpcion(await pestanaActiva(page))
  const r = await enMarcos(page, (f) => f.locator('xpath=//tr[td[contains(translate(normalize-space(.),"elijaunopcó","ELIJAUNOPCÓ"),"ELIJA UNA OPCI")]]//input[@type="radio"]'))
  if (r.total !== 2 || r.marcos !== 1 || !r.locator) throw new Error('allianz/comunidades: se esperaban exactamente 2 radios de modalidad, en un solo marco')
  const radios = r.locator
  await radios.nth(modalidad === 'personalizado' ? 1 : 0).check()
  guard.comprobar()
}

/**
 * El «Aceptar» de Datos Básicos (SOLO avanza a «Tarificar»). Pasa por la máquina de fases: una vez,
 * tras elegir opción, con la pestaña verificada. Debe haber EXACTAMENTE un candidato visible. Tras el
 * clic exige que la pestaña activa sea «Tarificar»; si no, aborta.
 */
export async function pulsarAvance(page: Page, guard: GuardEmision): Promise<void> {
  guard.comprobar()
  guard.fases.autorizarAceptar(await pestanaActiva(page))
  // DOM real (06/10/2026): es un «footer button» del servlet, `<div id="aceptar" onclick="btnAceptar();">`, no un
  // a/button/input. Por id Y texto exacto. (La pestaña `td#TARIFICAR` dispara lo mismo y NO se usa.)
  const c = await enMarcos(page, (f) =>
    f
      .locator('#aceptar')
      .filter({ hasText: /^\s*Aceptar\s*$/i })
      .locator('visible=true'),
  )
  if (c.total !== 1 || !c.locator) throw new Error('allianz/comunidades: no hay exactamente un control visible de avance en Datos Básicos')
  const boton = c.locator.first()
  comprobarBoton(await descripcion(boton), { permitirAceptar: true })
  await boton.click()
  for (let i = 0; i < 60; i++) {
    guard.comprobar()
    const p = await pestanaActiva(page)
    if (p === 'tarificar') {
      guard.fases.confirmarTarificar(p)
      return
    }
    await page.waitForTimeout(500)
  }
  throw new Error('allianz/comunidades: tras el avance no apareció la pestaña Tarificar')
}

/**
 * Pestaña «Proyecto» (genera el PDF sin grabar nada, confirmado por Alberto): solo desde Tarificar.
 * El control lo da el adaptador; se pulsa con las comprobaciones de siempre (nada de emitir/archivar).
 */
export async function pulsarProyecto(page: Page, boton: Locator, guard: GuardEmision): Promise<void> {
  guard.comprobar()
  guard.fases.autorizarProyecto(await pestanaActiva(page))
  const desc = await descripcion(boton)
  comprobarBoton(desc)
  await boton.click()
  guard.comprobar()
}

/**
 * EMISIÓN AUTORIZADA (10/10/2026): el ÚNICO camino del worker para pulsar un botón de emisión, y una sola vez. Exige, en
 * este orden y sin atajos:
 *   1. el guard de siempre limpio (`guard.comprobar()`);
 *   2. la máquina de fases: solo desde Tarificar, con la pestaña verificada en el DOM, una vez (`autorizarEmision`);
 *   3. EXACTAMENTE un control visible con el id y el texto del permiso, en un solo marco;
 *   4. `usarPermisoEmision`: un permiso creado tras canjear el token de Alberto, de ESTE trabajo y ESTE hash, sin usar,
 *      y que ese control sea su botón (nada de RGPD, SMS/OTP, contraseñas, pago fraccionado ni anulaciones).
 * Solo entonces abre la ventana de red y pulsa. Cualquier fallo lanza `EmisionBloqueadaError` (o un error) SIN pulsar.
 */
export async function pulsarEmisionAutorizada(page: Page, guard: GuardEmision, permiso: PermisoEmision, vinculo: { trabajoId: string; hashDatos: string }): Promise<void> {
  guard.comprobar()
  if (!permiso || typeof permiso !== 'object' || !esBotonDeListaBlanca(permiso.boton)) throw new EmisionBloqueadaError('fase', 'emisión sin permiso válido')
  guard.fases.autorizarEmision(await pestanaActiva(page))
  const { id, texto } = permiso.boton
  if (!/^[A-Za-z][\w-]{0,63}$/.test(id)) throw new EmisionBloqueadaError('boton', `id de botón no válido en el permiso: ${id.slice(0, 40)}`)
  const c = await enMarcos(page, (f) =>
    f
      .locator(`#${id}`)
      .filter({ hasText: new RegExp(`^\\s*${texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) })
      .locator('visible=true'),
  )
  if (c.total !== 1 || c.marcos !== 1 || !c.locator) throw new EmisionBloqueadaError('boton', `no hay exactamente un control visible «${texto}» (#${id})`)
  const boton = c.locator.first()
  usarPermisoEmision(permiso, vinculo, await descripcion(boton))
  const abrir = ABRIR_VENTANA.get(guard)
  if (!abrir) throw new EmisionBloqueadaError('fase', 'guard sin ventana de emisión')
  abrir(VENTANA_RED_EMISION_MS)
  try {
    await boton.click()
  } catch (e) {
    // El clic falló (o no se sabe si salió): la ventana de red se cierra YA, antes de que el runner haga nada más.
    guard.ventana.cerrar()
    throw e
  }
}

/**
 * AVANCE DE PESTAÑA AUTORIZADO (Moto, Alberto 13/10/2026; ver `AVANCES_PESTANA_AUTORIZADOS`). El ÚNICO camino para pulsar
 * `td#datosBasicos` / `td#rate`, que ejecutan el manejador «Aceptar» del portal. Exige, en este orden y sin atajos:
 *   1. el guard de siempre limpio y la ventana de EMISIÓN cerrada;
 *   2. selector en la lista blanca EXACTA (cualquier otro → rechazo sin pulsar) y no usado antes en este trabajo;
 *   3. EXACTAMENTE un control visible, en un solo marco, con id, texto y `onclick` exactos, y que pase `comprobarBoton`
 *      (con «Aceptar» permitido: «Emitir», `validar_aceptar`, `store`, `contract`… siguen bloqueados);
 *   4. que ese marco sea la pantalla de ORIGEN (`form#formulari` con el `action` esperado).
 * Solo entonces abre la ventana de red (capa a: `parametrosParecenEmision` en query y cuerpo; capa b: destinos no GET en lista
 * blanca), pulsa UNA vez y espera la pantalla de DESTINO. La ventana se cierra SIEMPRE (finally), también en error.
 */
export async function pulsarAvancePestanaAutorizado(page: Page, guard: GuardEmision, selector: SelectorAvancePestana): Promise<Frame> {
  guard.comprobar()
  if (guard.ventana.abierta()) throw new EmisionBloqueadaError('fase', 'avance de pestaña con la ventana de emisión abierta')
  if (typeof selector !== 'string' || !Object.hasOwn(AVANCES_PESTANA_AUTORIZADOS, selector)) {
    throw new EmisionBloqueadaError('boton', `avance de pestaña no autorizado: ${String(selector).slice(0, 60)}`)
  }
  const regla = AVANCES_PESTANA_AUTORIZADOS[selector]
  const usados = AVANCES_USADOS.get(guard) ?? new Set<string>()
  if (usados.has(selector)) throw new EmisionBloqueadaError('fase', `avance de pestaña ${selector} ya usado en este trabajo`)
  const onclickEsperado = new RegExp(`^\\s*goSelected\\('${regla.id}'\\);\\s*aceptar_onclick\\(\\);?\\s*$`)
  // Un solo control visible con ese id y texto exacto, en un solo marco; ese marco tiene que ser la pantalla de origen.
  let marco: Frame | null = null
  let total = 0
  for (const f of marcosVivos(page)) {
    const n = await f.locator(selector).filter({ hasText: new RegExp(`^\\s*${regla.texto}\\s*$`) }).locator('visible=true').count().catch(() => 0)
    if (n > 0) {
      total += n
      if (marco) throw new EmisionBloqueadaError('boton', `avance de pestaña ${selector}: el control aparece en más de un marco`)
      marco = f
    }
  }
  if (total !== 1 || !marco) throw new EmisionBloqueadaError('boton', `avance de pestaña ${selector}: no hay exactamente un control visible «${regla.texto}»`)
  const boton = marco.locator(selector).filter({ hasText: new RegExp(`^\\s*${regla.texto}\\s*$`) }).locator('visible=true').first()
  const desc = await descripcion(boton)
  const [texto, , , , id, , , onclick] = desc
  const tag = await boton.evaluate((el) => el.tagName)
  if (tag !== 'TD' || id !== regla.id || (texto ?? '').trim() !== regla.texto || !onclickEsperado.test(onclick ?? '')) {
    throw new EmisionBloqueadaError('boton', `avance de pestaña ${selector}: el control no es la pestaña grabada`)
  }
  comprobarBoton(desc, { permitirAceptar: true })
  const origen = await accionFormulario(marco)
  if (origen !== regla.formOrigen) throw new EmisionBloqueadaError('fase', `avance de pestaña ${selector}: la pantalla actual no es la de origen`)
  const abrir = ABRIR_AVANCE.get(guard)
  if (!abrir) throw new EmisionBloqueadaError('fase', 'guard sin ventana de avance')
  usados.add(selector)
  AVANCES_USADOS.set(guard, usados)
  // UN plazo para todo: la ventana de red y la espera de la pantalla de destino vencen en el MISMO instante (`hasta`), y la
  // ventana se cierra antes en cuanto se llega (finally).
  const hasta = Date.now() + VENTANA_RED_AVANCE_MS
  // Un diálogo del portal (confirm/alert) durante el avance NO se acepta: se descarta y el trabajo cae con motivo claro.
  let dialogo: { tipo: string; mensaje: string } | null = null
  const alDialogo = (d: Dialog) => {
    dialogo ??= { tipo: d.type(), mensaje: redactarDatosPersonales(d.message().replace(/\s+/g, ' ').trim()).slice(0, 200) }
    d.dismiss().catch(() => {})
  }
  page.on('dialog', alDialogo)
  abrir(hasta, regla.endpoints)
  try {
    await boton.click()
    for (;;) {
      guard.comprobar()
      const dlg = dialogo as { tipo: string; mensaje: string } | null // lo escribe el manejador del diálogo (TS no lo ve)
      if (dlg) {
        if (dlg.tipo === 'alert') throw new ErrorTarificador('datos', `allianz: el portal avisó al avanzar a ${regla.texto}: ${dlg.mensaje}`)
        throw new EmisionBloqueadaError('fase', `avance de pestaña ${selector}: el portal pidió confirmación («${dlg.tipo}») y el robot no confirma`)
      }
      for (const f of marcosVivos(page)) if ((await accionFormulario(f)) === regla.formDestino) {
        guard.comprobar()
        return f
      }
      // ¿El portal rechazó el avance? (filas de error de su «INFORME DE AVISO E INCIDENCIAS»): no se espera al tope.
      const conError = []
      for (const f of marcosVivos(page)) if ((await f.locator(SEL_ERROR_EPAC).count().catch(() => 0)) > 0) conError.push(f)
      if (conError.length > 0) throw new ErrorAvanceSinLlegar(selector, [...new Set([marco, ...conError].filter((f) => !f.isDetached()))], true)
      if (Date.now() >= hasta) throw new ErrorAvanceSinLlegar(selector, marco.isDetached() ? marcosVivos(page) : [marco], false)
      await page.waitForTimeout(250)
    }
  } finally {
    page.off('dialog', alDialogo)
    guard.avance.cerrar()
  }
}

/** Filas de ERROR del informe de incidencias del framework legado de ePAC (las de aviso no paran). */
export const SEL_ERROR_EPAC = '#dataErrorSection tr.rowAppErrorTextBlock'

/**
 * El avance no llegó a la pantalla de destino. `marcos`: dónde leer las incidencias del portal (el de ORIGEN y los que
 * tengan filas de error). El adaptador las lee y, si las hay, lanza `datos` con el mensaje del portal; si no, este error
 * (`portal`, no transitorio) se propaga tal cual.
 */
export class ErrorAvanceSinLlegar extends ErrorTarificador {
  readonly marcos: Frame[]
  constructor(selector: string, marcos: Frame[], conIncidencias: boolean) {
    super('portal', `avance de pestaña ${selector}: ${conIncidencias ? 'el portal lo rechazó (informe de incidencias)' : 'no apareció la pantalla de destino'}`)
    this.name = 'ErrorAvanceSinLlegar'
    this.marcos = marcos
  }
}

/** `action` (atributo literal) del `form#formulari` del marco, o `null`. Solo lectura. */
async function accionFormulario(f: Frame): Promise<string | null> {
  const form = f.locator('form#formulari')
  if ((await form.count().catch(() => 0)) !== 1) return null
  return form.getAttribute('action').catch(() => null)
}
