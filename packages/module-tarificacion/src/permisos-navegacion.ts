// PERMISOS DE NAVEGACIÓN EN BD (0.3.45, 04/11/2026) — validación y fusión PURAS. Sin BD, sin red, sin Playwright.
//
// Para pilotar/explorar una compañía nueva sin reconstruir la imagen del worker, el operador puede AÑADIR por entrada (fila de
// `seguros.tarificador_permisos_navegacion`, SQL 2026-11-04) dos tipos de permiso ESTRECHO:
//   (a) `ruta_tolerada` — {origen https EXACTO, ruta EXACTA sin comodines, pulsable}: esa ruta deja de contar como emisión SOLO en una
//       navegación GET (documento/marco). `pulsable: true` = además se neutraliza en el href de un enlace/botón que lleve a ella (el
//       clic sigue pasando por todo el guard; si provoca un POST, la red lo mira sin el permiso). Nunca en POST/cuerpos/query.
//   (b) `avance_texto` — {texto EXACTO, origen + ruta del marco EXACTOS, tag, contenedor opcional, maxUsos}: un avance «Aceptar»-like
//       que el guard bloquea por «aceptar» y que solo se pulsa por `pulsarExploracionAutorizada` (worker), que lo repite VIVO.
//
// 🚨 TARIFICAR ≠ EMITIR. Los bloqueos DUROS siguen en código y la BD NO los relaja: verbos/rótulos de acción final (emitir, contratar,
//    pagar, firmar, confirmar, tarificar…), URL/parámetros/cuerpos de emisión (fuera de la ruta exacta y solo en GET), el TOPE del
//    wizard de Pelayo (`bloqueoZonaWizardPelayo`: la BD no añade pasos pulsables), campos de cuenta/tarjeta y credenciales.
// 🚨 FAIL-CLOSED: una fila inválida, desconocida o con forma rara se IGNORA (y se dice por qué, con códigos fijos, sin valores); sin
//    filas o con la BD caída = comportamiento de código. Nada de lo que hay aquí abre más que una regla de código equivalente.
// La validación corre DOS veces: en asegura al leer la BD y en el worker al recibir el trabajo (no se fía del transporte).

import { esTextoBotonProhibido, formasFuertes, pareceEmision, RE_ACCION_REAL_TRAS_PREFIJO, RE_ROTULO_PULSAR_PROHIBIDO, rotuloNombraAccionFinal, tieneLetraAjena, type RutaTolerable } from './guard-emision.ts'
import { clasificarAccionPortal } from './acciones-portal.ts'
import { MAX_TITULOS_MARCO, type ElementoInventario, type MarcoInventario } from './inventario-dom.ts'

export const TIPOS_PERMISO_NAVEGACION = ['ruta_tolerada', 'avance_texto'] as const
export type TipoPermisoNavegacion = (typeof TIPOS_PERMISO_NAVEGACION)[number]

/** Fila tal cual viaja (BD → asegura → worker). `datos` se valida con un esquema CERRADO por tipo. */
export type FilaPermisoNavegacion = { id: string; entrada: string; tipo: string; datos: unknown; activo?: boolean }

export type PermisoRutaBd = Readonly<{ id: string; origen: string; ruta: string; pulsable: boolean }>
export type TagAvanceBd = 'button' | 'a' | 'input'
export type PermisoAvanceBd = Readonly<{ id: string; texto: string; origen: string; rutaMarco: string; tag: TagAvanceBd; contenedor: string | null; maxUsos: number }>
export type PermisosNavegacion = Readonly<{ entrada: string; rutas: readonly PermisoRutaBd[]; avances: readonly PermisoAvanceBd[] }>

export type MotivoPermisoIgnorado =
  | 'no_es_lista' | 'tope_filas' | 'no_objeto' | 'id_invalido' | 'id_duplicado' | 'entrada_desconocida' | 'entrada_distinta' | 'inactivo'
  | 'tipo_desconocido' | 'datos_malformados' | 'clave_desconocida' | 'origen_invalido' | 'origen_fuera_de_compania' | 'ruta_invalida'
  | 'ruta_con_comodin' | 'ruta_de_accion_final' | 'pulsable_invalido' | 'texto_invalido' | 'texto_accion_final' | 'tag_invalido'
  | 'contenedor_invalido' | 'max_usos_invalido' | 'tope_tipo' | 'no_aplica_tarificar'
export type PermisoIgnorado = { id: string | null; motivo: MotivoPermisoIgnorado }
export type ResultadoPermisos = { permisos: PermisosNavegacion; ignorados: PermisoIgnorado[] }

/** Filas leídas como mucho por entrada (lo que pase se ignora con `tope_filas`). */
export const MAX_FILAS_PERMISOS = 40
export const MAX_RUTAS_BD = 20
export const MAX_AVANCES_BD = 10
/** Tope DURO de usos de un avance de BD por trabajo (el de `MAX_AVANCES_POR_ID` del worker): `maxUsos` solo lo puede BAJAR. */
export const MAX_USOS_AVANCE_BD = 3

export const permisosVacios = (entrada: string): PermisosNavegacion => Object.freeze({ entrada, rutas: Object.freeze([]), avances: Object.freeze([]) })

/**
 * Dominios REGISTRABLES de cada compañía: el origen de un permiso tiene que ser uno de ellos o un subdominio (un host NUEVO de la misma
 * compañía, p. ej. un SSO, sí; otro dominio, no). Compañía sin lista = ningún permiso de BD (fail-closed). Añadir un dominio = código.
 */
export const DOMINIOS_PORTAL_COMPANIA: Readonly<Record<string, readonly string[]>> = Object.freeze({
  allianz: Object.freeze(['allianz.es', 'e-pacallianz.com']),
  mapfre: Object.freeze(['mapfre.com', 'mapfre.es']),
  fidelidade: Object.freeze(['fidelidade.es']),
  pelayo: Object.freeze(['pelayo.com']),
  generali: Object.freeze(['generali.es']),
  occident: Object.freeze(['gco.global', 'occident.com']),
})

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const RE_ENTRADA = /^[a-z0-9_]{1,40}:[a-z0-9_]{1,40}:[a-z0-9_]{1,40}$/
/** Origen: solo https, host en minúsculas, sin puerto, credenciales, ruta ni barra final. */
const RE_ORIGEN = /^https:\/\/[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/
/** Segmento de ruta: caracteres no reservados de RFC 3986, sin «%» (nada codificado), «*», «?», «#», «;», «:», «..». */
const RE_SEGMENTO = /^[A-Za-z0-9._~-]{1,80}$/
const MAX_RUTA = 200
/**
 * Palabras de ACCIÓN FINAL o de dinero que NINGÚN segmento de ruta de BD puede llevar (además de `RE_ACCION_REAL_TRAS_PREFIJO`). En los
 * segmentos ANTERIORES al último se descuentan SOLO los sustantivos exactos «emision» y «contratacion» (aplicaciones de TARIFICAR que
 * viven bajo esos nombres: Mapfre NSE `/app/emision/`, Pelayo `/contratacion-autos/`); el último segmento no admite ni eso.
 */
const RE_SEGMENTO_PROHIBIDO = /emit|emis|emiss|contrat|contract|confirm|firm|signatur|assina|pag|pay|checkout|formaliz|grab|suplement|anul|baja|domicili|tarjet|card|iban|banc|bank|cuenta|account|poliz|policy|cobr|charge|purchase|compra/i
const SUSTANTIVOS_PADRE_TOLERADOS = /emision|contratacion/gi
/** Texto de avance: letras/cifras sueltas por un espacio tras normalizar (sin tildes, minúsculas), 1-40 car. */
const RE_TEXTO_AVANCE = /^[a-z0-9]+(?: [a-z0-9]+){0,5}$/
/**
 * Lo que un texto de avance de BD no puede nombrar, nunca (además de `pareceEmision` con «Aceptar» permitido, la lista única de
 * `acciones-portal.ts`, `rotuloNombraAccionFinal`, `esTextoBotonProhibido` y `RE_ROTULO_PULSAR_PROHIBIDO`): «Aceptar» SÍ es lo que se
 * puede autorizar; «Tarificar», «Precio», «Contratar», «Emitir», «Pagar», «Firmar», «Confirmar»… no.
 */
export const RE_TEXTO_AVANCE_BD_PROHIBIDO = /emit|emis|contrat|contract|confirm|firm|sign|pag|pay|formaliz|tarific|precio|price|iban|tarjet|card|cuenta|banc|domicili|grab|guard|save|archiv|suplement|anul|baja|envi|send|solicit|finaliz|termin|complet|compr|suscri|acepto|polic|poliz/
/** Títulos de pantalla con los que un avance de BD NUNCA se pulsa (inventario y, VIVO, el worker sobre todos los marcos). */
export const NUNCA_TITULO_AVANCE_BD = /tarific|revisi|emisi|contrat|pago|pagar|firma|iban|resumen|formaliz|confirm|precio|tarjeta|cuenta|poliza|oferta final/
/** Contenedor: selector SIMPLE (tag con hasta 3 `.clase`/`#id`), sin combinadores, atributos ni pseudoclases. */
const RE_CONTENEDOR = /^[a-z][a-z0-9-]{0,30}(?:[.#][A-Za-z0-9_-]{1,40}){0,3}$/
const TAGS_AVANCE: readonly TagAvanceBd[] = Object.freeze(['button', 'a', 'input'])

const plano = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
const truncado = (s: string | null | undefined) => typeof s === 'string' && s.endsWith('…')
const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const soloClaves = (o: Record<string, unknown>, permitidas: readonly string[], obligatorias: readonly string[]) =>
  Object.keys(o).every((k) => permitidas.includes(k)) && obligatorias.every((k) => Object.hasOwn(o, k))

/** ¿El host del origen es de la compañía? PURA. */
export function origenDeCompania(origen: string, compania: string): boolean {
  const doms = Object.hasOwn(DOMINIOS_PORTAL_COMPANIA, compania) ? DOMINIOS_PORTAL_COMPANIA[compania] : []
  const host = origen.slice('https://'.length)
  return doms.some((d) => host === d || host.endsWith(`.${d}`))
}

function motivoOrigen(v: unknown, compania: string): MotivoPermisoIgnorado | null {
  if (typeof v !== 'string' || v.length > 120 || !RE_ORIGEN.test(v)) return 'origen_invalido'
  return origenDeCompania(v, compania) ? null : 'origen_fuera_de_compania'
}

/** Ruta normalizada (sin «/» final salvo la raíz) o el motivo. Una ruta EXACTA: nada de comodines, query, fragmento ni codificación. */
function rutaExacta(v: unknown): { ruta: string } | { motivo: MotivoPermisoIgnorado } {
  if (typeof v !== 'string' || v.length === 0 || v.length > MAX_RUTA || !v.startsWith('/') || v.startsWith('//')) return { motivo: 'ruta_invalida' }
  if (/[*?#%\\]|\{|\}|\[|\]|\$/.test(v)) return { motivo: 'ruta_con_comodin' }
  const r = v.length > 1 ? v.replace(/\/+$/, '') : v
  if (r === '/') return { ruta: '/' }
  const segs = r.slice(1).split('/')
  if (segs.some((s) => !RE_SEGMENTO.test(s) || s === '.' || s === '..' || s.includes('..'))) return { motivo: 'ruta_invalida' }
  return { ruta: r }
}

/** ¿Algún segmento de la ruta nombra una acción final? El último, entero; los anteriores sin los sustantivos tolerados. PURA. */
export function rutaNombraAccionFinal(ruta: string): boolean {
  const segs = ruta.split('/').filter(Boolean).map((s) => plano(s))
  return segs.some((s, i) => {
    const t = i === segs.length - 1 ? s : s.replace(SUSTANTIVOS_PADRE_TOLERADOS, '')
    return RE_SEGMENTO_PROHIBIDO.test(t) || RE_ACCION_REAL_TRAS_PREFIJO.test(t)
  })
}

/** ¿El texto (YA normalizado) de un avance nombra algo que la BD no puede autorizar nunca? PURA. Lo repite el worker al recibirlo. */
export function textoAvanceProhibido(texto: string): boolean {
  if (!RE_TEXTO_AVANCE.test(texto) || texto.length > 40) return true
  if (tieneLetraAjena(texto) || rotuloNombraAccionFinal(texto) || RE_TEXTO_AVANCE_BD_PROHIBIDO.test(texto)) return true
  const cat = clasificarAccionPortal([texto])
  if (cat.emision || cat.prohibida || cat.guardar) return true
  return formasFuertes(texto).some((f) => pareceEmision(f, { permitirAceptar: true }) || esTextoBotonProhibido(f) || RE_ROTULO_PULSAR_PROHIBIDO.test(f) || RE_TEXTO_AVANCE_BD_PROHIBIDO.test(f))
}

function validarRuta(id: string, d: Record<string, unknown>, compania: string): PermisoRutaBd | MotivoPermisoIgnorado {
  if (!soloClaves(d, ['origen', 'ruta', 'pulsable'], ['origen', 'ruta', 'pulsable'])) return 'clave_desconocida'
  const mo = motivoOrigen(d.origen, compania)
  if (mo) return mo
  const r = rutaExacta(d.ruta)
  if ('motivo' in r) return r.motivo
  if (rutaNombraAccionFinal(r.ruta)) return 'ruta_de_accion_final'
  if (typeof d.pulsable !== 'boolean') return 'pulsable_invalido'
  return Object.freeze({ id, origen: d.origen as string, ruta: r.ruta, pulsable: d.pulsable })
}

function validarAvance(id: string, d: Record<string, unknown>, compania: string): PermisoAvanceBd | MotivoPermisoIgnorado {
  if (!soloClaves(d, ['texto', 'origen', 'rutaMarco', 'tag', 'contenedor', 'maxUsos'], ['texto', 'origen', 'rutaMarco', 'tag', 'maxUsos'])) return 'clave_desconocida'
  if (typeof d.texto !== 'string' || d.texto.length > 60 || truncado(d.texto)) return 'texto_invalido'
  const texto = plano(d.texto)
  if (!RE_TEXTO_AVANCE.test(texto)) return 'texto_invalido'
  if (textoAvanceProhibido(texto)) return 'texto_accion_final'
  const mo = motivoOrigen(d.origen, compania)
  if (mo) return mo
  const r = rutaExacta(d.rutaMarco)
  if ('motivo' in r) return r.motivo
  if (rutaNombraAccionFinal(r.ruta)) return 'ruta_de_accion_final'
  if (typeof d.tag !== 'string' || !(TAGS_AVANCE as readonly string[]).includes(d.tag)) return 'tag_invalido'
  let contenedor: string | null = null
  if (d.contenedor !== undefined && d.contenedor !== null) {
    if (typeof d.contenedor !== 'string' || !RE_CONTENEDOR.test(d.contenedor) || RE_TEXTO_AVANCE_BD_PROHIBIDO.test(plano(d.contenedor))) return 'contenedor_invalido'
    contenedor = d.contenedor
  }
  if (typeof d.maxUsos !== 'number' || !Number.isInteger(d.maxUsos) || d.maxUsos < 1 || d.maxUsos > MAX_USOS_AVANCE_BD) return 'max_usos_invalido'
  return Object.freeze({ id, texto, origen: d.origen as string, rutaMarco: r.ruta, tag: d.tag as TagAvanceBd, contenedor, maxUsos: d.maxUsos })
}

/**
 * Valida las filas de BD de UNA entrada. `compania`: la de la entrada en código (la pone el llamante desde `ENTRADAS_EXPLORACION`;
 * cadena vacía = entrada desconocida → todo ignorado). Fail-closed: nada que no sea exactamente el esquema pasa. PURA.
 */
export function validarPermisosNavegacion(entrada: string, compania: string, filas: unknown): ResultadoPermisos {
  const ignorados: PermisoIgnorado[] = []
  const rutas: PermisoRutaBd[] = []
  const avances: PermisoAvanceBd[] = []
  const fin = (): ResultadoPermisos => ({ permisos: Object.freeze({ entrada, rutas: Object.freeze(rutas), avances: Object.freeze(avances) }), ignorados })
  if (filas === undefined || filas === null) return fin()
  if (!Array.isArray(filas)) {
    ignorados.push({ id: null, motivo: 'no_es_lista' })
    return fin()
  }
  const vistos = new Set<string>()
  filas.forEach((f0, i) => {
    if (i >= MAX_FILAS_PERMISOS) return void (i === MAX_FILAS_PERMISOS && ignorados.push({ id: null, motivo: 'tope_filas' }))
    if (!esObjeto(f0)) return void ignorados.push({ id: null, motivo: 'no_objeto' })
    const id = typeof f0.id === 'string' && UUID.test(f0.id) ? f0.id : null
    if (!id) return void ignorados.push({ id: null, motivo: 'id_invalido' })
    if (vistos.has(id)) return void ignorados.push({ id, motivo: 'id_duplicado' })
    vistos.add(id)
    if (!soloClaves(f0, ['id', 'entrada', 'tipo', 'datos', 'activo'], ['id', 'entrada', 'tipo', 'datos'])) return void ignorados.push({ id, motivo: 'clave_desconocida' })
    if (compania === '' || !RE_ENTRADA.test(entrada)) return void ignorados.push({ id, motivo: 'entrada_desconocida' })
    if (f0.entrada !== entrada) return void ignorados.push({ id, motivo: 'entrada_distinta' })
    if (f0.activo !== undefined && f0.activo !== true) return void ignorados.push({ id, motivo: 'inactivo' })
    if (typeof f0.tipo !== 'string' || !(TIPOS_PERMISO_NAVEGACION as readonly string[]).includes(f0.tipo)) return void ignorados.push({ id, motivo: 'tipo_desconocido' })
    if (!esObjeto(f0.datos)) return void ignorados.push({ id, motivo: 'datos_malformados' })
    if (f0.tipo === 'ruta_tolerada') {
      const r = validarRuta(id, f0.datos, compania)
      if (typeof r === 'string') return void ignorados.push({ id, motivo: r })
      if (rutas.length >= MAX_RUTAS_BD) return void ignorados.push({ id, motivo: 'tope_tipo' })
      rutas.push(r)
    } else {
      const a = validarAvance(id, f0.datos, compania)
      if (typeof a === 'string') return void ignorados.push({ id, motivo: a })
      if (avances.length >= MAX_AVANCES_BD) return void ignorados.push({ id, motivo: 'tope_tipo' })
      avances.push(a)
    }
  })
  return fin()
}

/** Las filas CANÓNICAS de unos permisos ya validados (lo que asegura manda al worker; el worker las vuelve a validar). PURA. */
export function filasDePermisos(p: PermisosNavegacion): FilaPermisoNavegacion[] {
  return [
    ...p.rutas.map((r) => ({ id: r.id, entrada: p.entrada, tipo: 'ruta_tolerada', datos: { origen: r.origen, ruta: r.ruta, pulsable: r.pulsable } })),
    ...p.avances.map((a) => ({ id: a.id, entrada: p.entrada, tipo: 'avance_texto', datos: { texto: a.texto, origen: a.origen, rutaMarco: a.rutaMarco, tag: a.tag, contenedor: a.contenedor, maxUsos: a.maxUsos } })),
  ]
}

/** Resumen SIN valores para el log (ids y códigos). PURA. */
export function resumenPermisos(r: ResultadoPermisos): { rutas: number; avances: number; ignorados: string[] } {
  return { rutas: r.permisos.rutas.length, avances: r.permisos.avances.length, ignorados: r.ignorados.map((x) => `${x.id ?? '?'}:${x.motivo}`) }
}

// ─── Fusión con el código ───────────────────────────────────────────────────

/**
 * Una ruta exacta de BD como `RutaTolerable` de `neutralizarRutaTolerable`: prefijo = la carpeta padre, `rutasExactas` = SOLO el último
 * segmento (la raíz: prefijo «/» y resto vacío). Así la comparación es la MISMA función del código (con o sin «/» final, sin query).
 */
export function rutaBdComoTolerable(r: Pick<PermisoRutaBd, 'origen' | 'ruta'>): RutaTolerable {
  if (r.ruta === '/') return Object.freeze({ origen: r.origen, prefijo: '/', rutasExactas: Object.freeze(['']) })
  const i = r.ruta.lastIndexOf('/')
  return Object.freeze({ origen: r.origen, prefijo: `${r.ruta.slice(0, i)}/`, rutasExactas: Object.freeze([r.ruta.slice(i + 1)]) })
}

/** Rutas de BD toleradas en la RED, SOLO para navegaciones GET (el guard no las usa en POST/cuerpos). PURA. */
export function rutasRedGetBd(p: PermisosNavegacion | null | undefined): RutaTolerable[] {
  return (p?.rutas ?? []).map(rutaBdComoTolerable)
}

/** Rutas de BD toleradas también en el HREF de un control (`pulsable: true`). PURA. */
export function rutasHrefBd(p: PermisosNavegacion | null | undefined): RutaTolerable[] {
  return (p?.rutas ?? []).filter((r) => r.pulsable).map(rutaBdComoTolerable)
}

/** Origen y ruta (sin `;jsessionid` final) de una URL https legible, o `null`. PURA. */
export function origenYRuta(url: string | null | undefined): { origen: string; ruta: string } | null {
  if (typeof url !== 'string' || !/^https:\/\//i.test(url)) return null
  try {
    const u = new URL(url)
    if (u.username || u.password || u.port) return null
    const ruta = u.pathname.replace(/;jsessionid=[^/?#;]*$/i, '')
    return { origen: u.origin, ruta: ruta.length > 1 ? ruta.replace(/\/+$/, '') : ruta }
  } catch {
    return null
  }
}

/**
 * ¿Es este control del INVENTARIO un avance de BD autorizado? Todo EXACTO: tag (input solo button/submit), texto (y aria-label, si lo
 * hay) igual al del permiso tras normalizar, sin recortes, habilitado, marco con el origen y la ruta del permiso, ÚNICO control del marco
 * con ese texto, sin importes, sin títulos recortados y ningún título que case {@link NUNCA_TITULO_AVANCE_BD}. El texto del permiso se
 * vuelve a comprobar contra los verbos de acción final (aunque venga ya validado). Devuelve el permiso o `null`. PURA.
 */
export function avanceTextoBdAutorizado(p: PermisosNavegacion | null | undefined, el: ElementoInventario, marco: MarcoInventario): PermisoAvanceBd | null {
  if (!p || p.avances.length === 0 || typeof el.texto !== 'string' || truncado(el.texto) || el.deshabilitado === true) return null
  const tag = (el.tag ?? '').toLowerCase()
  if (tag === 'input' && !['button', 'submit'].includes((el.type ?? '').toLowerCase())) return null
  const texto = plano(el.texto)
  const aria = typeof el.ariaLabel === 'string' && el.ariaLabel.trim() !== '' ? el.ariaLabel : null
  if (aria !== null && (truncado(aria) || plano(aria) !== texto)) return null
  const ubic = origenYRuta(marco.url)
  if (!ubic) return null
  if ((marco.importes?.length ?? 0) > 0) return null
  if ((marco.titulos?.length ?? 0) >= MAX_TITULOS_MARCO || (marco.titulosPantalla?.length ?? 0) >= MAX_TITULOS_MARCO) return null
  if ([...(marco.titulos ?? []), ...(marco.titulosPantalla ?? [])].some((t) => NUNCA_TITULO_AVANCE_BD.test(plano(t)))) return null
  const iguales = (marco.elementos ?? []).filter((x) => [x.texto, x.ariaLabel].some((d) => typeof d === 'string' && !truncado(d) && plano(d) === texto)).length
  if (iguales !== 1) return null
  return p.avances.find((a) => a.texto === texto && a.tag === tag && a.origen === ubic.origen && a.rutaMarco === ubic.ruta && !textoAvanceProhibido(a.texto)) ?? null
}

/** Tope de usos de un avance de BD por trabajo: el de la fila, nunca por encima de {@link MAX_USOS_AVANCE_BD}. PURA. */
export function topeUsosAvanceBd(a: Pick<PermisoAvanceBd, 'maxUsos'>): number {
  return Number.isInteger(a.maxUsos) && a.maxUsos >= 1 ? Math.min(a.maxUsos, MAX_USOS_AVANCE_BD) : 0
}

/** Expresión ANCLADA del texto exacto (para la unicidad viva del worker, sobre texto plano). PURA. */
export function fuenteTextoExacto(texto: string): string {
  return `^${texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`
}
