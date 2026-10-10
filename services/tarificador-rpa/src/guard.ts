// Barrera de EMISIÓN en el navegador (05/10/2026). TARIFICAR ≠ EMITIR.
//   1. Toda navegación (y toda petición que no sea GET) a una URL que casa con el patrón se ABORTA
//      antes de salir, y el trabajo queda marcado → `error_definitivo`. También si la ACCIÓN viaja en los
//      parámetros: la query de la URL o, en las que no son GET, el CUERPO (`action=store` del framework
//      legado de ePAC: la URL es siempre la misma y la acción va en el POST).
//   2. Los adaptadores NO hacen `.click()`: usan `pulsar()`, que mira el texto, aria-label, title,
//      value, id, name y href del elemento y se niega a pulsar si casa con el patrón. (Lo vigila
//      `test/regression-tarificador-rpa.test.ts` en la raíz.)

import type { BrowserContext, Frame, Locator, Page, Request } from 'playwright'
import {
  EmisionBloqueadaError,
  MaquinaFases,
  comprobarBoton,
  esBotonDeListaBlanca,
  parametrosParecenEmision,
  pareceEmision,
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

export type GuardEmision = { violacion(): EmisionBloqueadaError | null; comprobar(): void; fases: MaquinaFases; ventana: VentanaRed }

export async function instalarGuardEmision(context: BrowserContext): Promise<GuardEmision> {
  let violacion: EmisionBloqueadaError | null = null
  const fases = new MaquinaFases()
  let ventanaHasta = 0
  await context.route('**/*', async (route) => {
    const req = route.request()
    const url = req.url()
    const noGet = req.method() !== 'GET'
    if (req.isNavigationRequest() || noGet) {
      const op = { permitirAceptar: fases.aceptarEnVuelo() }
      const porUrl = pareceEmision(url, op) || parametrosParecenEmision(url, op)
      const porCuerpo = !porUrl && noGet && parametrosParecenEmision(cuerpoDe(req), op)
      if ((porUrl || porCuerpo) && Date.now() < ventanaHasta) {
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
    }
    await route.continue()
  })
  const g: GuardEmision = {
    fases,
    ventana: {
      abierta: () => Date.now() < ventanaHasta,
      cerrar: () => { ventanaHasta = 0 },
    },
    violacion: () => violacion,
    comprobar() {
      if (violacion) throw violacion
    },
  }
  ABRIR_VENTANA.set(g, (ms) => { ventanaHasta = Date.now() + Math.min(ms, VENTANA_RED_EMISION_MS) })
  return g
}

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
