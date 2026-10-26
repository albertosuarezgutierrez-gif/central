// QUÉ ENTRADAS DEL MENÚ VE CADA PERSONA (26/10/2026, decisión de Alberto: «menú adaptado por tipo»).
//
// 🚨 Es SOLO VISIBILIDAD. Ninguna pantalla se fía de este fichero para negar nada: cada una sigue resolviendo su
// acceso por CÓDIGO (`accesosPatrimonio`, `accesosFlota`, `carteraDeIdentidad`…). Aquí se decide únicamente si se
// OFRECE el enlace; que no se ofrezca no cierra la ruta (y que se ofrezca no la abre).
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
}

/** Hechos de «no sé nada»: todo se ofrece (el menú completo). */
export const HECHOS_DESCONOCIDOS: HechosMenu = {
  fichasPropias: null,
  polizasAportadas: null,
  patrimonio: null,
  flota: null,
  puedeConceder: null,
  porAceptar: null,
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

/** ¿Se ofrece «Contactos» en el menú? Si puede conceder, o si tiene algo por aceptar; lo dudoso se ofrece. */
export function contactosVisibles(h: HechosMenu): boolean {
  if (h.puedeConceder === true) return true
  if (h.porAceptar !== null && h.porAceptar > 0) return true
  // Se oculta solo con las dos lecturas hechas y negativas.
  return h.puedeConceder === null || h.porAceptar === null
}

/** ¿Hay que ofrecer el enlace a «Contactos» dentro de «Cuenta» porque el menú no lo trae? */
export function contactosEnCuenta(h: HechosMenu): boolean {
  return !contactosVisibles(h)
}
