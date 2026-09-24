// El vigía de los partes que el cliente nos da y NADIE ha abierto todavía.
//
// ── EL HUECO QUE TAPA, MEDIDO EL 05/09/2026 ────────────────────────────────
//
// El portal del cliente guarda los partes en `seguros.portal_parte_siniestro` y
// `apps/asegura` los sirve por `/api/operador/partes`. Hasta hoy la cadena se
// cortaba ahí: **no había ningún cron, ningún Telegram y ningún correo**. El
// único camino era que Alberto abriera `/correduria` y mirara. El plazo del
// art. 16 LCS se calculaba… y solo se PINTABA.
//
// O sea: un cliente podía contarnos un accidente el viernes, quedarse tranquilo
// porque la pantalla le dijo que nos había llegado, y que los siete días se
// consumieran sin que nada fallara ni nadie se enterara. Es exactamente el modo
// de fallo que persigue la regla de la casa: no se ve, no da error, y lo paga
// quien confió en la pantalla.
//
// ── 🚨 LA TRAMPA CENTRAL: `recibido` NO es «atendido» ──────────────────────
//
// La bandeja de Alberto llama «sin atender» a los de estado `enviado`
// (`partesSinAtender`, en plataforma). Para VIGILAR EL PLAZO eso se queda corto
// y de la peor manera: un parte que Alberto ha leído pasa a `recibido` y
// **desaparecería de la vigilancia sin estar en la compañía**. Es el estado más
// peligroso de los cuatro — el cliente cree que está hecho, nosotros lo hemos
// leído, y la entidad no sabe nada.
//
// Por eso aquí el corte es `comunicado`, que sale de `comunicadoACompania()` y
// solo es cierto en `abierto_en_compania`. **Nunca `estado !== 'enviado'`.**

/** Días del art. 16 LCS. Se importa del mismo sitio que todo lo demás. */
import { DIAS_COMUNICACION_LCS } from './siniestros.ts'

/**
 * Lo mínimo que el vigía necesita de un parte. Deliberadamente pobre: no
 * importa el tipo de `apps/plataforma` ni el del portal, para que este módulo
 * no arrastre ninguna app y se pueda probar sin nada montado.
 */
export type ParteVigilado = {
  id: string
  /** `null` = quien lo mandó no está vinculado a ninguna ficha. Es trabajo pendiente, no un dato feo. */
  cliente: string | null
  estado: string
  /** 🚨 La ÚNICA fuente de «la compañía ya lo sabe». Ver la cabecera. */
  comunicado: boolean
  /** Días que quedan de los 7. Negativo = ya pasaron. `null` = no se pudo calcular. */
  diasRestantes: number | null
}

/**
 * En qué punto del plazo está.
 *
 * 🚨 `sin_plazo` **NO es «no corre prisa»**: es «no sabemos cuánto queda»,
 * normalmente porque el parte llegó sin fecha del hecho. Tiene cubo propio para
 * que no se pueda colar entre los holgados ni desaparecer — no poder contar el
 * plazo es justo el caso en el que hay que mirar el parte a mano.
 */
export type UrgenciaParte = 'vencido' | 'hoy' | 'pronto' | 'holgado' | 'sin_plazo'

export function urgenciaParte(diasRestantes: number | null): UrgenciaParte {
  if (diasRestantes === null) return 'sin_plazo'
  if (diasRestantes < 0) return 'vencido'
  if (diasRestantes <= 1) return 'hoy'
  if (diasRestantes <= 3) return 'pronto'
  return 'holgado'
}

/** De más urgente a menos. `sin_plazo` va delante de `holgado`: hay que mirarlo. */
const ORDEN: readonly UrgenciaParte[] = ['vencido', 'hoy', 'pronto', 'sin_plazo', 'holgado']

/**
 * Los partes que siguen SIN estar abiertos en la compañía.
 *
 * Sale `descartado` —eso es una decisión tomada— y sale todo lo `comunicado`.
 * **No sale `recibido`**: ver la cabecera.
 */
export function partesPendientes(partes: readonly ParteVigilado[]): ParteVigilado[] {
  return partes.filter((p) => !p.comunicado && p.estado !== 'descartado')
}

/** Los pendientes, ordenados por urgencia y, dentro de cada cubo, por lo que queda. */
export function ordenarPorUrgencia(partes: readonly ParteVigilado[]): ParteVigilado[] {
  return [...partes].sort((a, b) => {
    const ua = ORDEN.indexOf(urgenciaParte(a.diasRestantes))
    const ub = ORDEN.indexOf(urgenciaParte(b.diasRestantes))
    if (ua !== ub) return ua - ub
    return (a.diasRestantes ?? 0) - (b.diasRestantes ?? 0)
  })
}

/**
 * La firma anti-repetición: **por CUBO, nunca por días exactos.**
 *
 * Con los días exactos la firma cambiaría cada mañana y el aviso sonaría los
 * siete días seguidos de cada parte. Un aviso que suena todos los días se
 * silencia, y entonces deja de sonar también el día que importa. Con cubos
 * suena cuando entra un parte nuevo y cuando uno EMPEORA —de holgado a pronto,
 * de pronto a hoy, de hoy a vencido—, que son los momentos en los que hay algo
 * nuevo que hacer.
 *
 * Los ids van ordenados para que dos lecturas del mismo estado den la misma
 * firma: sin `sort`, el orden que devuelva la BD haría sonar el aviso solo.
 */
export function firmaPartes(partes: readonly ParteVigilado[]): string {
  return partesPendientes(partes)
    .map((p) => `${p.id}:${urgenciaParte(p.diasRestantes)}`)
    .sort()
    .join(',')
}

/** Cómo se nombra cada cubo en el aviso. Sin exclamaciones: el dato ya asusta lo justo. */
const COMO_SE_DICE: Record<UrgenciaParte, string> = {
  vencido: 'pasado el plazo',
  hoy: 'hoy o mañana',
  pronto: 'esta semana',
  holgado: 'con margen',
  sin_plazo: 'sin fecha del hecho',
}

export function textoUrgencia(u: UrgenciaParte): string {
  return COMO_SE_DICE[u]
}

/** Cuántos partes caben en un Telegram antes de que el mensaje deje de servir. */
export const TOPE_AVISO_PARTES = 12

export type AvisoPartes = {
  /** El mensaje entero, listo para `tgAviso` en HTML. */
  texto: string
  pendientes: number
}

function linea(p: ParteVigilado): string {
  const u = urgenciaParte(p.diasRestantes)
  const quien = p.cliente ?? 'sin ficha identificada'
  const cuando =
    p.diasRestantes === null
      ? 'no se puede contar el plazo'
      : p.diasRestantes < 0
        ? `${Math.abs(p.diasRestantes)} d de más`
        : `quedan ${p.diasRestantes} d`
  // El estado va en el texto A PROPÓSITO: `recibido` es el que engaña, porque
  // parece atendido. Verlo escrito al lado del plazo es lo que evita darlo por
  // hecho al leer el aviso de reojo.
  return `· ${quien} — ${textoUrgencia(u)} (${cuando}, estado «${p.estado}»)`
}

/**
 * El aviso.
 *
 * 🚨 Dos frases que NO puede contener, y las dos tienen cepo:
 *
 *  1. **«ha perdido la cobertura»** o cualquier equivalente. El art. 16 solo
 *     permite a la compañía reclamar los daños que le cause el retraso, y la
 *     pérdida del derecho exige dolo o culpa grave. Un parte fuera de plazo se
 *     abre igual, y cuanto antes.
 *  2. **«ya está comunicado»** de nada que esté en esta lista: por definición,
 *     lo que aparece aquí es justo lo que la compañía NO sabe.
 */
export function textoAvisoPartes(partes: readonly ParteVigilado[]): AvisoPartes {
  const pendientes = ordenarPorUrgencia(partesPendientes(partes))
  const cabeza =
    pendientes.length === 1
      ? '🚑 <b>Un parte del portal sin abrir en la compañía</b>'
      : `🚑 <b>${pendientes.length} partes del portal sin abrir en la compañía</b>`

  const cuerpo = pendientes.slice(0, TOPE_AVISO_PARTES).map(linea)
  const resto =
    pendientes.length > TOPE_AVISO_PARTES
      ? [`… y ${pendientes.length - TOPE_AVISO_PARTES} más en /correduria.`]
      : []

  return {
    pendientes: pendientes.length,
    texto: [
      cabeza,
      // La frase que sostiene el aviso entero: el cliente ya cree que está hecho.
      'El cliente nos lo contó y da por hecho que está en marcha. Hasta que se abra en la entidad, no lo está.',
      '',
      ...cuerpo,
      ...resto,
      '',
      `Plazo del art. 16 LCS: ${DIAS_COMUNICACION_LCS} días desde el hecho. Pasarse NO quita la cobertura ` +
        '(solo permite a la compañía reclamar los daños del retraso), así que un parte vencido se abre igual y cuanto antes.',
    ].join('\n'),
  }
}
