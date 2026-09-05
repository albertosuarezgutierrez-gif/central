// Qué pantalla del portal está mirando el cliente.
//
// 🚨 Por qué la vista vive en la URL y no en el estado de un componente:
//
// 1. **Para poder NO montar lo que no se ve.** Hasta el 05/09/2026 `/boveda`
//    apilaba siete bloques en una sola página: unas 3.800 líneas de interfaz,
//    con el formulario de parte, el editor de pólizas y el lector de PDF
//    montándose SIEMPRE, incluso para quien solo entraba a mirar cuándo le
//    vence el coche. Con pestañas de cliente eso no cambiaría —el JSX de todas
//    seguiría renderizándose para poder ocultarlo—; con la vista en la URL, el
//    servidor manda solo la que se pide. Es la regla de rendimiento de la casa.
// 2. **Para que funcione sin JavaScript** y para que el botón «atrás» del
//    móvil haga lo que la gente espera: volver a la pestaña anterior.
// 3. **Para poder enlazar una pestaña concreta** desde un correo o un aviso
//    («abre tu parte») sin inventar un segundo mecanismo.

/**
 * Las vistas del portal. `datos` no es un panel: es otra ruta.
 *
 * 🚨 **`polizas` desapareció el 05/09/2026**, y quien la mató fue Alberto
 * mirando su propio portal: *«mis seguros y mis pólizas es lo mismo»*. Tenía
 * razón en el síntoma y el fallo era del nombre, no suyo: en castellano
 * «seguros» y «pólizas» son sinónimos, así que dos pestañas con esos dos
 * nombres se leen como la misma. Y encima el argumento en contra ya estaba
 * escrito aquí abajo —una pestaña que casi siempre dice cero parece un producto
 * a medio hacer— cuando `portal_poliza_declarada` tenía **1 fila en toda la
 * BD**.
 *
 * Lo que había detrás no se ha perdido: las pólizas que aporta el cliente van
 * en la MISMA lista que su cartera, con la etiqueta «Añadida por ti» en cada
 * fila. Ese cartel no es decoración: una póliza que se añadió él es una que la
 * correduría NO gestiona, así que si llama por un siniestro de esa no hay ni
 * datos ni relación con esa compañía.
 *
 * Un `?vista=polizas` viejo —un correo, un enlace guardado— cae por
 * `vistaDeBoveda()` en `seguros`, que es exactamente donde ahora vive ese
 * contenido. No hace falta redirección.
 */
export const VISTAS_BOVEDA = ['seguros', 'siniestro'] as const

export type VistaBoveda = (typeof VISTAS_BOVEDA)[number]

export const VISTA_BOVEDA_POR_DEFECTO: VistaBoveda = 'seguros'

/**
 * Convierte lo que venga en la URL en una vista.
 *
 * 🚨 Un valor que no reconocemos NO es un error: es la vista por defecto. Quien
 * llega con `?vista=cualquiercosa` —un enlace viejo, un correo reenviado, un
 * corrector que se comió una letra— tiene que ver sus seguros, no una página
 * de fallo. Aquí no hay nada que proteger: la vista no da acceso a nada; lo que
 * decide qué datos se leen es la sesión, no este parámetro.
 *
 * Acepta el array que Next entrega cuando el parámetro aparece repetido
 * (`?vista=a&vista=b`): se queda con el primero en vez de caerse.
 */
export function vistaDeBoveda(crudo: string | string[] | undefined): VistaBoveda {
  const valor = Array.isArray(crudo) ? crudo[0] : crudo
  if (typeof valor !== 'string') return VISTA_BOVEDA_POR_DEFECTO
  const limpio = valor.trim().toLowerCase()
  return (VISTAS_BOVEDA as readonly string[]).includes(limpio)
    ? (limpio as VistaBoveda)
    : VISTA_BOVEDA_POR_DEFECTO
}

/** Una pestaña de la barra de navegación del portal. */
export interface PestanaPortal {
  /** Identificador estable; `null` cuando la pestaña es otra ruta. */
  vista: VistaBoveda | null
  etiqueta: string
  href: string
}

/**
 * Las pestañas, en orden.
 *
 * 📌 Son TRES y no nueve a propósito. El panel del corredor tiene nueve
 * entradas porque detrás de cada una hay cientos de filas; un asegurado entra
 * con una, dos o tres pólizas. Una pestaña «Siniestros» que casi siempre dice
 * cero no parece un producto moderno: parece un producto a medio hacer.
 *
 * Eran cuatro hasta el 05/09/2026, y la que sobraba era «Mis pólizas» — ver
 * `VISTAS_BOVEDA`. De paso arregla algo que se veía en el móvil de Alberto: con
 * cuatro, la última salía **cortada** («Qu…»). El carril hace scroll
 * horizontal, pero con la barra oculta no hay ninguna pista de que se pueda
 * arrastrar, así que «Quién me ve» solo la encontraba quien lo hiciera por
 * casualidad. Con tres caben.
 *
 * La última no es un panel, es la otra ruta (`/autorizaciones`). Va en la misma
 * barra porque para quien la usa es «otra sección», no «otra página web».
 */
export function pestanasPortal(): PestanaPortal[] {
  return [
    { vista: 'seguros', etiqueta: 'Mis seguros', href: '/boveda' },
    { vista: 'siniestro', etiqueta: 'Un siniestro', href: '/boveda?vista=siniestro' },
    { vista: null, etiqueta: 'Quién me ve', href: '/autorizaciones' },
  ]
}

/**
 * La vista por defecto se enlaza como `/boveda` a secas, sin `?vista=seguros`.
 *
 * No es cosmética: si la pestaña activa llevara el parámetro, `/boveda` y
 * `/boveda?vista=seguros` serían la misma pantalla con dos direcciones, y la
 * de la barra nunca coincidiría con la que la gente tiene guardada.
 */
export function hrefDeVista(vista: VistaBoveda): string {
  return vista === VISTA_BOVEDA_POR_DEFECTO ? '/boveda' : `/boveda?vista=${vista}`
}
