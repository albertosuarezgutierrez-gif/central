// El paquete del **derecho de acceso (art. 15 RGPD)** y de **portabilidad
// (art. 20)** de una persona, leído desde la pantalla de Alberto.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🚨 POR QUÉ ESTE FICHERO EXISTE: el puerto estaba construido y NO LO LLAMABA
// NADIE. `apps/asegura` sirve `GET /api/operador/export-rgpd?identidad=…` desde
// que se escribió, pero en plataforma no había ni lib, ni ruta, ni botón — o
// sea, el derecho de acceso no lo podía ejercer nadie, porque Alberto no tenía
// dónde atenderlo. Es la regla de la casa en su forma extrema: no es que el
// aviso saliera por un canal que nadie abre, es que no salía por ninguno.
//
// 🚨 Y NO se sirve desde el portal del cliente a propósito. La identidad del
// portal es un código de un solo uso a un correo, sin segundo factor; un export
// en autoservicio convertiría el secuestro de una sesión en una fuga completa
// de la cartera. Lo genera Alberto, comprueba quién lo pide y lo entrega él,
// dentro del mes del art. 12.3. Lo fija `test/regression-export-rgpd.test.ts`,
// que además prohíbe que el portal tenga su propia ruta de export.
// ─────────────────────────────────────────────────────────────────────────────
//
// Dos partes, como en `supresiones-asegura.ts`:
//
//   1. Lo PURO: leer e interpretar lo que manda el puerto. Sin red ni env, así
//      que lo importa también el client component y lo prueba
//      `test/regression-export-rgpd-plataforma.test.ts`.
//   2. La RED: la llamada al puerto, solo desde las rutas API de plataforma.
//
// Esta app NO toca la BD de la correduría: habla con el puerto de `apps/asegura`
// con el secreto de operador.

// `@central/module-seguros` SÍ es dependencia de esta app (a diferencia de
// `module-seguros-portal` en `supresiones-asegura.ts`), así que el vocabulario
// se IMPORTA en vez de copiarse: el motivo de un apartado ausente viaja como
// TEXTO —`construirExport` lo traduce con `MOTIVO_TEXTO` antes de mandarlo—, y
// una copia de esas frases aquí se desincronizaría en cuanto se retocara una
// coma, dejando de reconocer los apartados que no se pudieron consultar sin que
// nada fallara.
import { CATEGORIAS_EXPORT, MOTIVO_TEXTO, type CategoriaExport } from '@central/module-seguros'
import { cabecerasPuerto } from './puerto-actor.ts'


const CATEGORIAS = new Set<string>(CATEGORIAS_EXPORT)

/** Un apartado del paquete, ya validado. `filas` sin más no existe: o hay, o hay motivo. */
export type ApartadoExport = {
  categoria: CategoriaExport
  titulo: string
  descripcion: string
  origen: string
  portable: boolean
  /** 🚨 `filas: []` NO es lo mismo que `incluida:false`: el primero sería «hay cero». */
  incluida: boolean
  motivo: string | null
  filas: readonly unknown[] | null
}

export type PaqueteExport = {
  generadoEn: string
  versionTextosLegales: string
  mediador: { nombre: string; nif: string; claveDgsfp: string; contacto: string }
  /** `true` solo si TODAS las categorías se pudieron consultar. Lo decide asegura. */
  completo: boolean
  apartados: ApartadoExport[]
  /** Los apartados del art. 15.1 que acompañan a los datos. Se entrega tal cual. */
  informacion: Record<string, unknown>
}

function cadena(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function objeto(v: unknown): Record<string, unknown> | null {
  return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/** Un apartado del puerto. `null` = llegó con forma rara → cuenta como ilegible. */
export function leerApartado(fila: unknown): ApartadoExport | null {
  const o = objeto(fila)
  if (!o) return null
  const categoria = cadena(o.categoria)
  const titulo = cadena(o.titulo)
  const descripcion = cadena(o.descripcion)
  const origen = cadena(o.origen)
  if (!categoria || !titulo || !descripcion || !origen) return null
  // Una categoría fuera del vocabulario es un apartado que esta pantalla no
  // entiende. NO se pinta «tal cual por si acaso»: se cuenta como ilegible, que
  // es lo que manda a mirar el puerto en vez de entregar un documento a medias.
  if (!CATEGORIAS.has(categoria)) return null
  if (typeof o.incluida !== 'boolean') return null
  if (typeof o.portable !== 'boolean') return null
  const filas = Array.isArray(o.filas) ? (o.filas as readonly unknown[]) : null
  // 🚨 Un apartado incluido SIN filas no es «no tiene nada»: es una respuesta
  // que no cuadra con su propio contrato, y darla por buena pintaría un hueco
  // como un dato comprobado.
  if (o.incluida && filas === null) return null
  if (!o.incluida && cadena(o.motivo) === null) return null
  return {
    categoria: categoria as CategoriaExport,
    titulo,
    descripcion,
    origen,
    portable: o.portable,
    incluida: o.incluida,
    motivo: cadena(o.motivo),
    filas: o.incluida ? filas : null,
  }
}

/**
 * El paquete entero. `null` si le falta cualquier pieza del art. 15 — un
 * documento al que le falta un apartado y uno completo se ven IGUAL en
 * pantalla, y el que se entrega es el que se descarga.
 */
export function leerPaquete(json: unknown): PaqueteExport | null {
  const o = objeto(json)
  if (!o) return null
  const generadoEn = cadena(o.generadoEn)
  const versionTextosLegales = cadena(o.versionTextosLegales)
  const mediador = objeto(o.mediador)
  const informacion = objeto(o.informacion)
  if (!generadoEn || !versionTextosLegales || !mediador || !informacion) return null
  if (typeof o.completo !== 'boolean') return null
  if (!Array.isArray(o.apartados)) return null
  const apartados: ApartadoExport[] = []
  for (const a of o.apartados) {
    const leido = leerApartado(a)
    // Un apartado ilegible invalida el paquete entero: no se entrega un
    // documento del art. 15 al que le falta un apartado sin decirlo.
    if (leido === null) return null
    apartados.push(leido)
  }
  if (apartados.length !== CATEGORIAS_EXPORT.length) return null
  return {
    generadoEn,
    versionTextosLegales,
    mediador: {
      nombre: cadena(mediador.nombre) ?? '',
      nif: cadena(mediador.nif) ?? '',
      claveDgsfp: cadena(mediador.claveDgsfp) ?? '',
      contacto: cadena(mediador.contacto) ?? '',
    },
    completo: o.completo,
    apartados,
    informacion,
  }
}

/**
 * La lectura de `GET /api/correduria/export-rgpd`.
 *
 * 🚨 Ningún fallo puede acabar en un `ok` con un paquete vacío: «no se ha
 * podido leer» y «esta persona no tiene datos» son cosas distintas, y la
 * segunda es una afirmación que se le entrega por escrito a un interesado.
 */
export type RespuestaExport =
  | { estado: 'ok'; paquete: PaqueteExport }
  | { estado: 'sin_configurar' }
  /** Se miró y esa identidad no existe. Es una respuesta, no un fallo. */
  | { estado: 'no_encontrado' }
  | { estado: 'error'; motivo: string }

export function interpretarExport(status: number, json: unknown): RespuestaExport {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  const o = objeto(json) ?? {}
  if (o.estado === 'sin_configurar' || status === 503) return { estado: 'sin_configurar' }
  if (status === 404 || o.estado === 'no_encontrado') return { estado: 'no_encontrado' }
  if (status === 200) {
    if (o.estado === 'error') {
      return { estado: 'error', motivo: cadena(o.causa) ?? cadena(o.motivo) ?? 'asegura_error' }
    }
    // Un 200 sin paquete NO es «esta persona no tiene nada»: es una respuesta
    // que no se entiende.
    const paquete = leerPaquete(o.paquete)
    if (paquete === null) return { estado: 'error', motivo: 'respuesta_ilegible' }
    return { estado: 'ok', paquete }
  }
  return {
    estado: 'error',
    motivo: cadena(o.causa) ?? cadena(o.motivo) ?? cadena(o.error) ?? `HTTP ${status}`,
  }
}

/**
 * Los apartados que NO se pudieron consultar. Son los que hacen que el paquete
 * no se pueda entregar todavía: al interesado le llegaría un documento que
 * dice «no consta» sobre algo que sí puede constar.
 *
 * Se reconocen por el TEXTO de `MOTIVO_TEXTO.no_consultable`, que es lo que
 * manda el puerto, y por eso la constante se importa del módulo en vez de
 * copiarse: `no_aplica` («no tienes ficha enlazada») y `sin_datos` son
 * respuestas, no huecos, y contarlos aquí pintaría una alarma permanente.
 */
export function apartadosIncompletos(paquete: PaqueteExport): ApartadoExport[] {
  return paquete.apartados.filter((a) => !a.incluida && a.motivo === MOTIVO_TEXTO.no_consultable)
}

/**
 * El contador que sube a la pestaña. TRES desenlaces, y ninguno de los dos
 * primeros es 0:
 *
 *   no llamar   → todavía no se ha pedido ningún paquete. `agregarContadores`
 *                 distingue ese `undefined` («aún no ha contestado») del `null`
 *                 («ha contestado que no se sabe»), y confundirlos pinta un `!`
 *                 de alarma en la pestaña sin que haya pasado nada. Por eso
 *                 esta función NO tiene un valor para ese caso: se expresa no
 *                 llamándola, que es lo único que no se puede malinterpretar.
 *   `null`      → se pidió y NO hay paquete (fallo, o esa identidad no existe):
 *                 no se sabe si falta algo, y la barra pinta `!`.
 *   número      → apartados que el paquete no pudo consultar. Aquí un `0` SÍ es
 *                 una afirmación comprobada —el paquete salió entero— y por eso
 *                 es el único caso en que puede valer 0.
 */
export function contadorExport(r: RespuestaExport): number | null {
  return r.estado === 'ok' ? apartadosIncompletos(r.paquete).length : null
}

/**
 * Un uuid de identidad. Se comprueba ANTES de llamar porque el puerto contesta
 * 400 a una cadena vacía y 404 a cualquier otra cosa, y un 404 se lee como «esa
 * persona no existe» — que es una afirmación sobre alguien, no sobre un dedazo.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function identidadValida(v: string): boolean {
  return UUID.test(v.trim())
}

/** Motivo del puerto → castellano de pantalla. Los que ya son frase se dejan. */
export function textoMotivoExport(motivo: string): string {
  switch (motivo) {
    case 'secreto_rechazado':
      return 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET no coincide entre los dos proyectos).'
    case 'respuesta_ilegible':
      return 'la respuesta de asegura no tenía la forma de un paquete del art. 15 (le faltaba algún apartado o llegó con una forma que esta pantalla no entiende).'
    case 'asegura_error':
      return 'asegura respondió, pero no pudo leer los datos en su base de datos.'
    case 'red':
      return 'no se pudo llegar a asegura (timeout, DNS o TLS).'
    case 'credenciales':
      return 'asegura no puede entrar en su base de datos (contraseña del rol). Se arregla en Vercel, no reintentando.'
    default:
      return motivo
  }
}

/** Nombre del fichero que se descarga. Sin datos personales dentro. */
export function nombreFicheroExport(identidadId: string, generadoEn: string): string {
  const dia = (generadoEn.slice(0, 10) || 'sin-fecha').replace(/[^0-9-]/g, '')
  return `rgpd-art15-${identidadId}-${dia}.json`
}

// ─── Red (solo desde las rutas API de plataforma) ────────────────────────────

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

async function cabeceras(): Promise<Record<string, string> | null> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  return secret ? await cabecerasPuerto(secret) : null
}

export type Reenvio = { status: number; json: unknown }

/**
 * `GET /api/operador/export-rgpd?identidad=…`.
 *
 * El plazo es de 30 s y no de los 15 del resto del puerto: este paquete son
 * nueve consultas encadenadas (y la cartera se recorre por cada ficha enlazada),
 * no una lista.
 */
export async function exportRgpdAsegura(identidadId: string): Promise<Reenvio> {
  const h = await cabeceras()
  if (!h) return { status: 503, json: { estado: 'sin_configurar' } }
  try {
    const res = await fetch(
      `${urlAsegura()}/api/operador/export-rgpd?identidad=${encodeURIComponent(identidadId)}`,
      { method: 'GET', headers: h, cache: 'no-store', signal: AbortSignal.timeout(30_000) },
    )
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return { status: 502, json: { estado: 'error', motivo: 'red' } }
  }
}
