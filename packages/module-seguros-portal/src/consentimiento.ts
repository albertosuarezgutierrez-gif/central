/**
 * Registro de consentimientos y acreditaciones del portal
 * (`seguros.portal_consentimiento`).
 *
 * 🚨 La tabla admite tres tipos, pero NO son la misma cosa y por eso no se
 * escriben igual:
 *
 * - **`lds_art19`** — no es un consentimiento del RGPD: es la **acreditación de
 *   que se facilitó la información precontractual del mediador ANTES de operar**
 *   (art. 19 de la Ley 16/2018). La carga de la prueba la tiene el mediador, y
 *   por eso la fila se sella con la versión EXACTA del texto que se enseñó.
 * - **`avisos`** y **`comercial`** — esos SÍ son consentimiento (art. 6.1.a
 *   RGPD). `comercial` tiene casilla desde el 19/09/2026 (pestaña «Mis
 *   datos» del portal, `ConsentimientoComercial.tsx`, escrita por
 *   `POST /api/consentimiento`); `avisos` sigue **sin pedirse en ninguna
 *   pantalla**. Mientras no exista su casilla, escribir una fila
 *   `otorgado: true` sería fabricar una prueba de algo que la persona nunca
 *   marcó: exactamente el fallo que estas filas existen para evitar. El aviso
 *   de vencimiento se presta hoy por el contrato de mediación (art. 6.1.b), no
 *   por consentimiento.
 *
 * Regla al tocar esto: **una fila solo se escribe si la pantalla lo enseñó**.
 * Si alguien añade `avisos`, va con su casilla en la UI en el MISMO PR, y
 * `otorgado` refleja lo que marcó la persona, no lo que conviene.
 *
 * La tabla es **append-only**: nunca se actualiza una fila. Retirar un
 * consentimiento es añadir otra con `otorgado: false`, para que la historia
 * completa quede reconstruible. Por eso el estado VIGENTE de `comercial` es
 * la ÚLTIMA fila de ese tipo (`consentimientoVigente()`), no «alguna fila
 * otorgada»: `necesitaRegistro()` sirve para acreditaciones, no para esto.
 */

/** Los tres tipos del CHECK de `seguros.portal_consentimiento.tipo`. */
export const TIPOS_CONSENTIMIENTO = ['avisos', 'comercial', 'lds_art19'] as const
export type TipoConsentimiento = (typeof TIPOS_CONSENTIMIENTO)[number]

/**
 * Los tipos que el portal ESCRIBE hoy. `avisos` existe en la BD pero no se
 * emite porque no hay pantalla que lo pida (ver cabecera).
 */
export const TIPOS_QUE_SE_REGISTRAN: readonly TipoConsentimiento[] = ['lds_art19', 'comercial']

/**
 * La casilla de `comercial`, palabra por palabra, y su versión.
 *
 * Vive aquí y no en el componente por lo mismo que el resto del copy regulado
 * del monorepo: para que un test lo barra (`revisarCopy`) y para que la fila
 * de la BD selle EXACTAMENTE el texto que la persona marcó. Si el texto
 * cambia de fondo, sube la versión; una casilla marcada sobre el texto viejo
 * no consiente el nuevo.
 *
 * 🚨 Es una casilla INDEPENDIENTE y desmarcada por defecto (art. 7.2 RGPD y
 * criterio de la AEPD sobre casillas premarcadas): usar el portal no la marca,
 * subir una póliza no la marca. Y lo que autoriza es que la correduría CONTACTE
 * con una propuesta; la propuesta en sí, cuando llegue, va con su análisis
 * (RDL 3/2020) — eso no lo sustituye ninguna casilla.
 */
export const VERSION_TEXTO_COMERCIAL = '2026-09-c1'
export const TEXTO_CONSENTIMIENTO_COMERCIAL =
  'Quiero que la correduría revise los seguros que tengo guardados aquí y me contacte, cuando se acerque un vencimiento, con una propuesta sin compromiso. Puedo retirarlo cuando quiera desde esta misma pantalla.'

/** Una fila con su momento, para saber cuál es la última. */
export type ConsentimientoConFecha = ConsentimientoGuardado & { creadoEn: Date }

/**
 * Estado VIGENTE de un consentimiento revocable: lo que dice la fila más
 * reciente de ese tipo. `null` = nunca se le ha preguntado (no es «no»: la
 * pantalla tiene que enseñar la casilla, no dar por hecho el rechazo).
 *
 * Con `versionActual`, una última fila marcada sobre OTRA versión del texto
 * también devuelve `null`: una casilla marcada sobre el texto viejo no
 * consiente el nuevo, así que la pantalla la vuelve a enseñar desmarcada. Sin
 * el parámetro se contesta solo por el valor (para quien no tenga versión).
 */
export function consentimientoVigente(
  guardados: readonly ConsentimientoConFecha[],
  tipo: TipoConsentimiento,
  versionActual?: string,
): boolean | null {
  let ultima: ConsentimientoConFecha | null = null
  for (const c of guardados) {
    if (c.tipo !== tipo) continue
    if (!ultima || c.creadoEn.getTime() > ultima.creadoEn.getTime()) ultima = c
  }
  if (!ultima) return null
  if (versionActual !== undefined && ultima.versionTexto !== versionActual) return null
  return ultima.otorgado
}

/** Lo mínimo de una fila ya guardada para decidir si hace falta otra. */
export type ConsentimientoGuardado = {
  tipo: string
  otorgado: boolean
  versionTexto: string
}

/**
 * ¿Hay que escribir una fila nueva para este tipo y esta versión de texto?
 *
 * Sí cuando no consta ninguna fila otorgada de ese tipo **con esa versión
 * exacta**. Dos consecuencias buscadas:
 *
 * - Entrar cien veces no deja cien filas idénticas.
 * - Cambiar el texto legal (subir `VERSION_TEXTOS_LEGALES`) SÍ pide una
 *   acreditación nueva: una firma sobre el texto viejo no acredita el nuevo.
 *
 * Una fila con `otorgado: false` no cuenta como acreditada: si alguien retiró
 * algo, el siguiente paso vuelve a preguntarlo.
 */
export function necesitaRegistro(
  guardados: readonly ConsentimientoGuardado[],
  tipo: TipoConsentimiento,
  versionTexto: string,
): boolean {
  return !guardados.some((c) => c.tipo === tipo && c.otorgado && c.versionTexto === versionTexto)
}

/**
 * Primera IP utilizable de una cabecera `X-Forwarded-For`, o `null`.
 *
 * La columna es `inet` de Postgres: meterle una cadena que no sea una IP hace
 * fallar el INSERT entero, y con él —al ir en la misma transacción— el canje
 * del código. Por delante de la IP del cliente puede haber una lista
 * (`cliente, proxy1, proxy2`), un puerto (`1.2.3.4:5678`), corchetes de IPv6
 * (`[::1]:443`) o directamente basura de un cliente que se inventa la cabecera.
 *
 * Ante cualquier duda devuelve `null`, que la columna acepta: una IP ausente es
 * un dato que falta; una IP inventada es un dato FALSO en un registro cuyo
 * único valor es ser prueba.
 */
export function normalizarIp(cabecera: string | null | undefined): string | null {
  if (!cabecera) return null
  const primera = cabecera.split(',')[0]?.trim()
  if (!primera) return null

  // IPv6 entre corchetes, con o sin puerto: [::1] / [::1]:443
  const entreCorchetes = primera.match(/^\[([0-9a-fA-F:.]+)\](?::\d+)?$/)
  const candidata = entreCorchetes ? entreCorchetes[1] : primera

  if (esIpv4(candidata)) return candidata

  // IPv4 con puerto: 1.2.3.4:5678 (en IPv6 los dos puntos son parte de la IP,
  // así que este recorte solo se aplica cuando hay exactamente uno).
  if (!entreCorchetes && candidata.split(':').length === 2) {
    const sinPuerto = candidata.split(':')[0]
    if (esIpv4(sinPuerto)) return sinPuerto
  }

  if (esIpv6(candidata)) return candidata
  return null
}

function esIpv4(v: string): boolean {
  const partes = v.split('.')
  if (partes.length !== 4) return false
  return partes.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)
}

function esIpv6(v: string): boolean {
  // Suficiente para no meter basura en `inet`: hexadecimales y dos puntos, con
  // como mucho una abreviatura `::`. No pretende validar cada forma del RFC.
  if (!v.includes(':')) return false
  if (!/^[0-9a-fA-F:]+$/.test(v)) return false
  if (v.split('::').length > 2) return false
  return v.split(':').every((g) => g.length <= 4)
}

/** Recorta el `User-Agent` a algo razonable: la columna es `text`, pero no es un buzón. */
export const USER_AGENT_MAX = 400

export function normalizarUserAgent(ua: string | null | undefined): string | null {
  const limpio = ua?.trim()
  if (!limpio) return null
  return limpio.slice(0, USER_AGENT_MAX)
}
