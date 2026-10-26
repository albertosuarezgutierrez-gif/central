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
/**
 * `datos` (09/09/2026): «Mis datos». Alberto: «añadiría pestaña mis datos,
 * donde el cliente puede ver sus datos de contacto (tlf, mail y dirección)
 * pudiendo modificarlos». Ahí viven la dirección de contacto, el teléfono y el
 * correo (editables) y el derecho de supresión — que hasta hoy colgaban al
 * final de «Mis seguros», donde solo los encontraba quien bajara del todo.
 */
/**
 * `hoja` (09/09/2026): la hoja de la nevera y su QR. Vivía embebida al final
 * de «Mis seguros» (`HojasQr`, ver `apps/asegura-portal/CLAUDE.md`) y solo la
 * encontraba quien bajara del todo tras la lista de pólizas — justo la pieza
 * que Alberto pensó para llevar encima, no para enterrar. Pasa a su propia
 * pestaña por la misma razón que ya sacó «Mis datos» de ahí abajo.
 */
export const VISTAS_BOVEDA = ['seguros', 'hoja', 'recibos', 'siniestro', 'recordatorios', 'datos'] as const

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

/** Las cinco secciones del menú (26/10/2026). */
export type SeccionPortal = 'inicio' | 'seguros' | 'herramientas' | 'contactos' | 'cuenta'

/** Una entrada del menú del portal. */
export interface PestanaPortal {
  id: SeccionPortal
  /**
   * La vista de la bóveda a la que apunta el `href`, o `null` cuando la entrada es otra ruta. Solo «Seguros» la lleva
   * (`seguros`); las demás vistas de la bóveda cuelgan de una entrada por `vistas`.
   */
  vista: VistaBoveda | null
  etiqueta: string
  href: string
  /** Las vistas de `/boveda` que pertenecen a esta entrada (para marcarla activa). */
  vistas: readonly VistaBoveda[]
  /** Las rutas (y sus hijas) que pertenecen a esta entrada. `/boveda` se decide por `vistas`, no por aquí. */
  rutas: readonly string[]
}

/**
 * El menú: CINCO entradas (26/10/2026, decisión de Alberto; eran 9 en el módulo y 12 en pantalla).
 *
 *   Inicio · Seguros · Herramientas · Contactos · Cuenta
 *
 * «Seguros» es el ÚNICO sitio de «Mis seguros» y recoge, como sub-vistas, Recibos, Siniestros y Mi QR
 * (`SUBVISTAS_SEGUROS`). «Herramientas» recoge Patrimonio, Flota, el calendario (`?vista=recordatorios`), Mi resumen
 * y el catálogo solicitable. «Cuenta» recoge Datos (`?vista=datos`) y Configuración. Las rutas viejas siguen vivas:
 * solo cambia el menú. Una vista de la bóveda que no estuviera en `vistas` de ninguna entrada sería una pantalla a la
 * que no se llega desde el menú: lo vigila `vista-portal.test.ts`.
 *
 * 🚨 «Inicio» no es «Mi resumen» (el resumen anual para la renta, `/resumen`, que vive en Herramientas). Y «Seguros»,
 * no «Mis seguros»: el h1 de la bóveda es «Mis <em>X</em>» y el posesivo lo pone él (12/09/2026).
 */
export function pestanasPortal(): PestanaPortal[] {
  return [
    { id: 'inicio', vista: null, etiqueta: 'Inicio', href: '/inicio', vistas: [], rutas: ['/inicio'] },
    {
      id: 'seguros',
      vista: 'seguros',
      etiqueta: 'Seguros',
      href: '/boveda',
      vistas: ['seguros', 'recibos', 'siniestro', 'hoja'],
      rutas: [],
    },
    {
      id: 'herramientas',
      vista: null,
      etiqueta: 'Herramientas',
      href: '/herramientas',
      vistas: ['recordatorios'],
      rutas: ['/herramientas', '/patrimonio', '/flota', '/resumen'],
    },
    // «Contactos» = la ruta `/autorizaciones` (los enlaces guardados siguen llegando).
    { id: 'contactos', vista: null, etiqueta: 'Contactos', href: '/autorizaciones', vistas: [], rutas: ['/autorizaciones'] },
    { id: 'cuenta', vista: null, etiqueta: 'Cuenta', href: '/cuenta', vistas: ['datos'], rutas: ['/cuenta', '/configuracion'] },
  ]
}

/** Las sub-vistas de «Seguros», en orden: lo que antes eran cuatro entradas del menú. */
export const SUBVISTAS_SEGUROS: ReadonlyArray<{ vista: VistaBoveda; etiqueta: string }> = [
  { vista: 'seguros', etiqueta: 'Seguros' },
  { vista: 'recibos', etiqueta: 'Recibos' },
  { vista: 'siniestro', etiqueta: 'Siniestros' },
  { vista: 'hoja', etiqueta: 'Mi QR' },
]

/**
 * Qué entrada del menú está activa para una ruta (y, en `/boveda`, para su `?vista=`). `null` = ninguna (una ruta
 * pública o desconocida). Pura: la usan la barra, el lateral y la cabecera, para que las tres digan lo mismo.
 */
export function seccionActiva(ruta: string, vistaCruda?: string | string[] | null): SeccionPortal | null {
  const pestanas = pestanasPortal()
  if (ruta === '/boveda') {
    const v = vistaDeBoveda(vistaCruda ?? undefined)
    return pestanas.find((p) => p.vistas.includes(v))?.id ?? null
  }
  // Las rutas hijas de la bóveda (póliza, presupuesto, carta…) son «Seguros».
  if (ruta.startsWith('/boveda/')) return 'seguros'
  return pestanas.find((p) => p.rutas.some((r) => ruta === r || ruta.startsWith(`${r}/`)))?.id ?? null
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
