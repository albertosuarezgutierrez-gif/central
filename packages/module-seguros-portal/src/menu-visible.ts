// QUÉ ENTRADAS DEL MENÚ VE CADA PERSONA (26/10/2026, decisión de Alberto: «menú adaptado por tipo»).
//
// 🚨 Las entradas son VISIBILIDAD: los DATOS de cada pantalla los sigue aislando su CÓDIGO (`accesosPatrimonio`,
// `accesosFlota`, `carteraDeIdentidad`…); que se ofrezca un enlace no abre nada de nadie. La excepción, desde el
// 26/10/2026, es `puertaAbierta()` (al final): con la MISMA regla, el calendario y conceder accesos RECHAZAN en servidor a
// quien el menú no se los ofrece (autorizado puro que escribe la URL a mano). No es aislamiento entre clientes —ese ya lo
// da cada lectura—: es que la puerta y el enlace digan lo mismo.
//
// Lo que hay en el código (comprobado, no supuesto) y de lo que sale cada brazo:
//   - Los tres niveles que se conceden (`ver_economico` «Consulta», `gestion`, `total`; con `poliza_id` opcional)
//     solo gobiernan QUÉ SE VE DE LAS PÓLIZAS del otorgante (`carteraDeIdentidad` → «Seguros»). NINGUNO abre
//     Patrimonio (lo abren los alcances `patrimonio_gestion`/`patrimonio_total`, fuera de `ALCANCES`) ni Flota (lo abre
//     el alcance `flota`, fuera de `ALCANCES`), ni el calendario/resumen propios (`Mi resumen`, «Tus vencimientos» y
//     «Pendiente de ti» se calculan sobre las pólizas PROPIAS: «el recibo devuelto de una póliza que le dejan ver lo
//     paga su titular»). Y ceder a un tercero exige una ficha propia con vínculo que opera (`puedeAutorizar`).
//   - «Contactos» (`/autorizaciones`) no rechaza a nadie: es también donde el autorizado ACEPTA lo que le han dado.
//     Por eso se ofrece si puede conceder o si tiene algo por aceptar; si no, se ofrece desde «Cuenta»
//     (`contactosEnCuenta`), para que nadie se quede sin forma de ver ni dejar un acceso que le dieron.
//
// Tres estados, siempre (regla de la casa): cada hecho es `número` (se miró), `0` (se miró y no hay) o `null` (NO se ha
// podido comprobar). Un `null` NUNCA oculta una entrada: esconder un enlace porque una lectura falló sería decidir por
// la persona que no tiene eso.
import type { SeccionPortal } from './vista-portal.ts'

/** Lo que se sabe de la sesión. `null` = no se pudo comprobar (≠ 0). */
export type HechosMenu = {
  /** Fichas de la cartera vinculadas a esta identidad (incluida la vista de corredor, que ES la ficha del cliente). */
  fichasPropias: number | null
  /** Pólizas que la propia persona ha aportado (no eliminadas). */
  polizasAportadas: number | null
  /** Titulares cuyo patrimonio ve (`accesosPatrimonio().size`). */
  patrimonio: number | null
  /** Empresas cuya flota ve (`accesosFlota().size`). */
  flota: number | null
  /** ¿Alguna ficha suya deja conceder acceso a otros (`puedeAutorizar`)? */
  puedeConceder: boolean | null
  /** Autorizaciones recibidas que esperan que las acepte. */
  porAceptar: number | null
  /**
   * 27/10/2026: accesos de PATRIMONIO (`patrimonio_gestion`/`patrimonio_total`) que le han dado y siguen VIGENTES. Se ven y se
   * dejan («Renunciar») en «Contactos», así que con alguno la entrada se ofrece aunque no pueda conceder nada.
   */
  patrimonioRecibido: number | null
}

/** Hechos de «no sé nada»: todo se ofrece (el menú completo). */
export const HECHOS_DESCONOCIDOS: HechosMenu = {
  fichasPropias: null,
  polizasAportadas: null,
  patrimonio: null,
  flota: null,
  puedeConceder: null,
  porAceptar: null,
  patrimonioRecibido: null,
}

/** `true` si hay al menos uno > 0; `null` si ninguno es > 0 pero alguno no se pudo comprobar; `false` si todos son 0. */
function algunoPositivo(valores: ReadonlyArray<number | null>): boolean | null {
  if (valores.some((v) => v !== null && v > 0)) return true
  if (valores.some((v) => v === null)) return null
  return false
}

/** `true` solo si SE SABE que no (todos comprobados y a cero); lo dudoso se ofrece. */
function seOfrece(v: boolean | null): boolean {
  return v !== false
}

/**
 * ¿La persona es TITULAR de algo propio (ficha en la cartera o póliza que ella aportó)? Quien solo tiene accesos que
 * otros le han dado no lo es.
 */
export function esTitular(h: HechosMenu): boolean | null {
  return algunoPositivo([h.fichasPropias, h.polizasAportadas])
}

/** Las entradas del menú de cinco que se OFRECEN, en el orden de `pestanasPortal()`. */
export function entradasVisibles(h: HechosMenu): SeccionPortal[] {
  const herramientas = herramientasVisibles(h)
  const entradas: SeccionPortal[] = ['inicio', 'seguros']
  if (herramientas.alguna) entradas.push('herramientas')
  if (contactosVisibles(h)) entradas.push('contactos')
  entradas.push('cuenta')
  return entradas
}

/** Qué hay dentro de «Herramientas» para esta persona. */
export type HerramientasVisibles = {
  patrimonio: boolean
  flota: boolean
  /** El calendario único: de quien tiene algo propio, o patrimonio con fechas. */
  calendario: boolean
  /** «Mi resumen»: calculado sobre pólizas PROPIAS. */
  resumen: boolean
  /** El Portal del Empleado y el catálogo para pedir módulos: de quien es titular. */
  catalogo: boolean
  /** Hay al menos una: si no, la entrada «Herramientas» no se ofrece. */
  alguna: boolean
}

export function herramientasVisibles(h: HechosMenu): HerramientasVisibles {
  const titular = seOfrece(esTitular(h))
  const patrimonio = seOfrece(algunoPositivo([h.patrimonio]))
  const flota = seOfrece(algunoPositivo([h.flota]))
  // Si NO es titular pero ve patrimonio (alcance de patrimonio), sus fechas sí van en el calendario.
  const calendario = titular || patrimonio
  const resumen = titular
  const catalogo = titular
  return { patrimonio, flota, calendario, resumen, catalogo, alguna: patrimonio || flota || calendario || resumen || catalogo }
}

/**
 * ¿Se ofrece «Contactos» en el menú? Si puede conceder, si tiene algo por aceptar o si le han dado acceso a un patrimonio (ahí lo
 * ve y renuncia); lo dudoso se ofrece.
 */
export function contactosVisibles(h: HechosMenu): boolean {
  if (h.puedeConceder === true) return true
  if (h.porAceptar !== null && h.porAceptar > 0) return true
  if (h.patrimonioRecibido !== null && h.patrimonioRecibido > 0) return true
  // Se oculta solo con las tres lecturas hechas y negativas.
  return h.puedeConceder === null || h.porAceptar === null || h.patrimonioRecibido === null
}

/** ¿Hay que ofrecer el enlace a «Contactos» dentro de «Cuenta» porque el menú no lo trae? */
export function contactosEnCuenta(h: HechosMenu): boolean {
  return !contactosVisibles(h)
}

/**
 * Las puertas que CIERRAN en servidor lo que el menú no ofrece (26/10/2026). Las de «Herramientas» (`herramientas`
 * = `alguna`, `resumen`, `patrimonio`, `flota`, `catalogo` = pedir un módulo) son el MISMO campo de
 * `herramientasVisibles()`, sin regla propia. Y estas dos:
 *   - `calendario`: `/herramientas/calendario` y su escritura (`POST /api/recordatorios`). Misma regla que el menú
 *     (`herramientasVisibles().calendario`: titular o patrimonio a la vista).
 *   - `conceder`: dar o ampliar un acceso (`POST /api/autorizaciones`). Regla: ser titular (`esTitular`). Es más ancha
 *     que `puedeConceder` A PROPÓSITO: el dueño de una empresa concede desde ella aunque su vínculo propio no opere
 *     (`fichasOtorgablesDe`), y `conceder()` sigue decidiendo ficha a ficha; esta puerta solo echa a quien no tiene
 *     NINGUNA ficha ni póliza propia, que `conceder()` ya rechazaría.
 *
 * `/autorizaciones` (ver, aceptar, revocar/renunciar) NO tiene puerta: el menú no la oculta, la muda a «Cuenta»
 * (`contactosEnCuenta`) para que el autorizado pueda ver y DEJAR lo que le dieron.
 *
 * Tres estados → dos modos:
 *   - `lectura` (página y GET de su API): igual que el menú, lo dudoso ABRE. Enlace ofrecido ⇔ página que abre; la página solo enseña
 *     lo que esta identidad ya ve en otras pantallas, así que abrir con una lectura caída no expone nada.
 *   - `escritura` (POST/PUT/PATCH/DELETE): lo dudoso CIERRA. Se evalúa la MISMA regla con cada `null` tomado como «no» — no es afirmar que
 *     no hay (nada se pinta con ello), es no escribir sin haberlo comprobado.
 */
export type PuertaPortal = 'calendario' | 'conceder' | 'herramientas' | 'resumen' | 'patrimonio' | 'flota' | 'catalogo'
export type ModoPuerta = 'lectura' | 'escritura'

/** Los hechos con cada «no se pudo comprobar» tomado como «no». SOLO para decidir una escritura, nunca para pintar. */
function sinDudas(h: HechosMenu): HechosMenu {
  const n = (v: number | null): number => (v === null ? 0 : v)
  return {
    fichasPropias: n(h.fichasPropias),
    polizasAportadas: n(h.polizasAportadas),
    patrimonio: n(h.patrimonio),
    flota: n(h.flota),
    puedeConceder: h.puedeConceder === true,
    porAceptar: n(h.porAceptar),
    patrimonioRecibido: n(h.patrimonioRecibido),
  }
}

export function puertaAbierta(h: HechosMenu, puerta: PuertaPortal, modo: ModoPuerta): boolean {
  const hechos = modo === 'escritura' ? sinDudas(h) : h
  if (puerta === 'conceder') return seOfrece(esTitular(hechos))
  const ver = herramientasVisibles(hechos)
  return puerta === 'herramientas' ? ver.alguna : ver[puerta]
}
