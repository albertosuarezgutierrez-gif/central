// A quién llama el cliente cuando acaba de pasarle algo.
//
// ── POR QUÉ ESTO EXISTE, Y POR QUÉ ES UN MÓDULO PURO ────────────────────────
//
// Una correduría es mediadora del CLIENTE, no del asegurador: contárnoslo a
// nosotros **no es** comunicárselo a la compañía (ver `parte-siniestro.ts`).
// Decisión de Alberto (05/09/2026): «los siniestros mejor intentar llamen a la
// compañía; nosotros nos enteramos por CIMA y hacemos el seguimiento». O sea,
// la pantalla tiene DOS caminos y el primero no somos nosotros.
//
// El primero exige un dato que hasta el 05/09/2026 no existía en el sistema: a
// qué canal acude el asegurado de ESA compañía. Vive en `companias_dgs`
// (`telefono_siniestros`, `telefono_asistencia`, `whatsapp_siniestros`,
// `horario_siniestros`) y lo rellena una persona contra la fuente.
//
// Las reglas de qué se puede DECIR de ese canal están aquí, puras y con test,
// porque son las que más caro salen si se relajan: lo que sale de aquí acaba
// delante de alguien que acaba de tener un golpe, y en la hoja imprimible que
// Alberto quiere que la gente pegue en el frigorífico.
//
// ── 🚨 LAS CUATRO COSAS QUE NO SE PUEDEN DECIR ─────────────────────────────
//
//  1. **«Esta compañía no tiene teléfono de siniestros.»** `null` es «no lo
//     hemos verificado». Son cosas distintas y la segunda es la única cierta
//     hoy: de las cuatro compañías de la cartera, Occident no publica número en
//     su web (buscado el 05/09/2026) y Allianz tiene DOS de asistencia según el
//     ramo, así que su columna está a NULL a propósito. Un hueco en blanco se
//     lee como «no hay». Se dice «pídenoslo».
//
//  2. **«24 h».** No hay ni un solo dato en la tabla que signifique «siempre»:
//     lo único que hay es `horario_siniestros`, que puede ser NULL. Inferir
//     «24 h» de un horario que falta es convertir un «no lo sé» en una promesa,
//     y es la promesa que se rompe un sábado por la noche. Aquí NO se calcula
//     ningún `siempre`: se pinta el horario cuando lo hay y se calla cuando no.
//
//  3. **«Llama a este número» de un WhatsApp.** Que un fijo de Madrid publicado
//     como WhatsApp Business atienda además voz es probable; probable no se
//     imprime en una nevera. Por eso `tipo` los separa y NUNCA se colapsan en
//     una lista de «teléfonos».
//
//  4. **Nada de una compañía que no es la suya.** El cruce póliza→compañía es
//     por nombre EXACTO y no hay coincidencia aproximada a propósito: ver
//     `canalDeCompania()`.

/** La fila de `companias_dgs`, tal y como la puede leer el rol del portal. */
export type FilaCompania = {
  nombreComun: string
  telefonoSiniestros: string | null
  telefonoAsistencia: string | null
  whatsappSiniestros: string | null
  horarioSiniestros: string | null
  /** `YYYY-MM-DD`. Viaja hasta la pantalla: un número comprobado hace tres años falla igual que uno equivocado. */
  verificadoEn: string | null
}

/**
 * Una forma de llegar a la compañía.
 *
 * 🚨 `tipo` no es decorativo: es lo que impide que un canal de mensajería se
 * pinte como un número al que llamar. Un `switch` sobre él es obligatorio en la
 * pantalla, y por eso es una unión discriminada y no un `{ etiqueta, valor }`.
 */
export type ViaCanal =
  | {
      tipo: 'telefono'
      /** `siniestros` = dar parte · `asistencia` = grúa / urgencia in situ. Son distintas. */
      uso: 'siniestros' | 'asistencia'
      numero: string
      /** `null` = no consta. La pantalla NO rellena ese hueco con «24 h». */
      horario: string | null
    }
  | {
      tipo: 'whatsapp'
      numero: string
      /** `https://wa.me/<dígitos>`. Ya validado: si no se pudo construir, la vía no existe. */
      enlace: string
      horario: string | null
    }

export type CanalCompania = {
  nombre: string
  vias: ViaCanal[]
  /**
   * 🚨 `true` = **no lo hemos verificado**, jamás «esta compañía no tiene».
   * Es el mismo `true` cuando la póliza no cruza con ninguna fila, y eso es
   * deliberado: en los dos casos lo único cierto es que nosotros no lo sabemos.
   */
  sinDatos: boolean
  verificadoEn: string | null
}

/** E.164 canónico, el mismo que exige el CHECK `companias_dgs_whatsapp_e164`. */
const E164 = /^\+[1-9][0-9]{7,14}$/

/**
 * `https://wa.me/34917838383`, o `null` si el valor no es E.164.
 *
 * Se revalida aquí aunque la BD ya lo obligue, y no es ceremonia: esta función
 * también la usa la hoja imprimible y cualquier importador futuro, y un enlace
 * mal construido **no falla** — abre WhatsApp con un número que no existe, que
 * es un fallo que solo se descubre el día que hace falta.
 */
export function enlaceWhatsapp(e164: string | null): string | null {
  if (typeof e164 !== 'string') return null
  const t = e164.trim()
  if (!E164.test(t)) return null
  return `https://wa.me/${t.slice(1)}`
}

/** Vacío o solo espacios es «no consta», no un horario. */
function textoONull(v: string | null): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t === '' ? null : t
}

/**
 * Las vías que se pueden ofrecer de una compañía, en orden fijo.
 *
 * ⚠️ **El orden NO es un ranking y no se calcula.** La tentación es poner
 * primero «el que atiende siempre», y eso exigiría saber cuál atiende siempre —
 * que es justo el dato que no tenemos. Con el orden fijo y el horario pegado a
 * cada vía, quien mira decide con lo que hay delante; con un ranking inventado,
 * decide con una suposición nuestra.
 */
export function viasDeCompania(f: FilaCompania): ViaCanal[] {
  const horario = textoONull(f.horarioSiniestros)
  const vias: ViaCanal[] = []

  const siniestros = textoONull(f.telefonoSiniestros)
  if (siniestros !== null) vias.push({ tipo: 'telefono', uso: 'siniestros', numero: siniestros, horario })

  const enlace = enlaceWhatsapp(f.whatsappSiniestros)
  if (enlace !== null) {
    vias.push({ tipo: 'whatsapp', numero: (f.whatsappSiniestros as string).trim(), enlace, horario })
  }

  const asistencia = textoONull(f.telefonoAsistencia)
  // 🚨 La asistencia NO hereda `horario_siniestros`. Ese horario es del canal de
  // dar parte; la grúa puede tener otro, y copiárselo sería inventarse el dato
  // de la vía que se usa justo a la hora en la que el otro no atiende.
  if (asistencia !== null) vias.push({ tipo: 'telefono', uso: 'asistencia', numero: asistencia, horario: null })

  return vias
}

/**
 * El canal de la compañía de una póliza.
 *
 * 🚨 **El cruce es por nombre EXACTO (normalizado a minúsculas y sin espacios
 * de sobra) y NO hay coincidencia aproximada.** Medido el 05/09/2026: la
 * cartera viva tiene cuatro aseguradoras —Mapfre, Allianz, Occident y Reale— y
 * su texto casa exacto con `companias_dgs.nombre_comun`. Pero una póliza que el
 * cliente APORTA trae el nombre que leyó una IA de un PDF («MAPFRE ESPAÑA
 * S.A.», «Grupo Catalana Occidente»…), y ahí una coincidencia aproximada
 * acertaría casi siempre y fallaría alguna vez — enseñándole a alguien el
 * teléfono de urgencias de OTRA compañía. Un fallo que no se ve hasta que
 * alguien marca. Sin cruce → `sinDatos`, que dice «pídenoslo».
 */
export function canalDeCompania(
  aseguradora: string | null,
  companias: readonly FilaCompania[],
): CanalCompania {
  const nombre = textoONull(aseguradora)
  const clave = nombre === null ? null : nombre.toLowerCase()
  const fila = clave === null ? undefined : companias.find((c) => c.nombreComun.trim().toLowerCase() === clave)

  if (fila === undefined) {
    return { nombre: nombre ?? '', vias: [], sinDatos: true, verificadoEn: null }
  }

  const vias = viasDeCompania(fila)
  return {
    nombre: fila.nombreComun,
    vias,
    sinDatos: vias.length === 0,
    // Sin vías no se enseña fecha: sería la fecha en que comprobamos que no
    // teníamos nada, y en pantalla se leería como «verificado».
    verificadoEn: vias.length === 0 ? null : textoONull(fila.verificadoEn),
  }
}

/**
 * Las compañías distintas a las que puede tener que acudir esta persona, para
 * pintarlas ANTES de que abra el formulario.
 *
 * 🚨 **El camino urgente no puede estar detrás de un formulario.** Quien acaba
 * de tener un golpe no debería tener que abrir «dar parte», desplegar un
 * selector y elegir una póliza para descubrir a quién llama. Por eso esto no
 * depende de la póliza elegida: colapsa las compañías de TODAS sus pólizas.
 *
 * Dos decisiones que parecen limpieza y no lo son:
 *
 *  · **Las `sinDatos` NO se filtran.** Es tentador enseñar solo las que tienen
 *    número. Pero una compañía que desaparece de la lista se lee como que no
 *    hay nada que hacer con ella, y lo cierto es que no lo hemos verificado —
 *    que es justo lo que el texto de «pídenoslo» viene a decir.
 *  · **Las que no tienen NOMBRE sí se caen.** Una póliza aportada sin compañía
 *    identificada no produce un «pídenoslo» de nadie: produce ruido.
 */
export function canalesDeLasPolizas(canales: readonly CanalCompania[]): CanalCompania[] {
  const vistos = new Set<string>()
  const salida: CanalCompania[] = []
  for (const c of canales) {
    const clave = c.nombre.trim().toLowerCase()
    if (clave === '' || vistos.has(clave)) continue
    vistos.add(clave)
    salida.push(c)
  }
  return salida
}

/**
 * Lo que la pantalla dice cuando no hay nada. Vive aquí, y no en el JSX, porque
 * es la frase que la regla de la casa protege: **`null` = no lo hemos
 * verificado, nunca «no tiene»**.
 */
export const TEXTO_SIN_CANAL =
  'No tenemos verificado el teléfono de siniestros de esta compañía. Pídenoslo y te lo damos.'
