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
/**
 * 🚨 `recibos` se añadió el 07/09/2026, y `siniestro` cambió de ETIQUETA pero
 * NO de identificador. Alberto, tres veces sobre su portal: «sigue sin
 * aparecer siniestros ni recibo».
 *
 * El id se conserva a propósito: los enlaces `?vista=siniestro` que ya existan
 * —un correo, un marcador— siguen llevando a su sitio. Cambiarlo los mandaría
 * a `seguros` por el comportamiento de `vistaDeBoveda()`, sin error y sin que
 * nadie se enterase.
 */
export const VISTAS_BOVEDA = ['seguros', 'recibos', 'siniestro'] as const

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
 * 📌 Son CUATRO desde el 07/09/2026, y la que vuelve no es «Mis pólizas»: son
 * «Recibos» y el historial de siniestros, que Alberto echó de menos tres veces
 * seguidas mirando su propio portal.
 *
 * 🚨 Esto MATIZA el argumento que había escrito aquí («una pestaña que casi
 * siempre dice cero parece un producto a medio hacer»), que se midió en vez de
 * discutirse. Sobre la cartera viva del 07/09/2026, de los 80 titulares:
 *   · **55 (69 %) tienen algún recibo no anulado** → para recibos el argumento
 *     era sencillamente falso.
 *   · **31 (39 %) tienen algún siniestro** → aquí sí acierta a medias, y por
 *     eso el vacío de esa pestaña dice «no nos consta ninguno» (que NO es «no
 *     has tenido ninguno»), en vez de quedarse en blanco.
 * Lo que sigue siendo cierto es lo de «Mis pólizas»: aquella no aportaba una
 * pantalla, aportaba un sinónimo. Estas dos aportan datos que ya existen y que
 * solo encontraba quien entrase póliza a póliza.
 *
 * ⚠️ Y con cuatro vuelve el riesgo que las dejó en tres: en el móvil de Alberto
 * la última salía **cortada** («Qu…»). Las etiquetas de ahora son más cortas
 * («Recibos», «Siniestros») y el carril reparte el ancho por debajo de 380 px,
 * pero eso **se mide con Playwright antes de darlo por bueno**, no se supone.
 *
 * La última no es un panel, es la otra ruta (`/autorizaciones`). Va en la misma
 * barra porque para quien la usa es «otra sección», no «otra página web».
 */
export function pestanasPortal(): PestanaPortal[] {
  return [
    { vista: 'seguros', etiqueta: 'Mis seguros', href: '/boveda' },
    { vista: 'recibos', etiqueta: 'Recibos', href: '/boveda?vista=recibos' },
    // 🚨 «Siniestros» y no «Un siniestro»: la pestaña ya no es solo el
    // formulario para declarar uno, es también el historial de los que la
    // compañía nos ha informado. Y el cepo de sinónimos obliga a que sea UNA
    // palabra en la barra: «Siniestros» + «Un parte» serían dos puertas para
    // lo mismo, que es exactamente lo que mató a «Mis pólizas».
    { vista: 'siniestro', etiqueta: 'Siniestros', href: '/boveda?vista=siniestro' },
    // 08/09/2026: «Quién me ve» → «Contactos». Alberto pidió «una pestaña de
    // contactos» y la pantalla ya era eso: la gente a la que das acceso, la que
    // te lo da y la que invitas. La ruta NO cambia: los enlaces guardados a
    // `/autorizaciones` siguen llegando.
    { vista: null, etiqueta: 'Contactos', href: '/autorizaciones' },
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
