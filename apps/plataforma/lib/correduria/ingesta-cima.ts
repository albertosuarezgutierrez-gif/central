// Salud de la ingesta de CIMA, leída por el puerto HTTP de central-asegura.
//
// La avería que justifica este vigía (medida el 01/09/2026): 42 ficheros de
// CIMA se quedaron sin procesar entre el 24/06 y el 30/08 —23 recibos por
// 7.721,71€ de prima y 20 siniestros, casi todos de Occident— y el health-check
// del CRM de origen estuvo TODOS esos días en verde. Su parte diario llevaba
// `cuarentenaTotal: 41` y creciendo, pero sus señales de alarma miraban dos
// columnas que valían cero. Midió lo que no era.
//
// De ahí la regla que gobierna este fichero: **no poder mirar NO es estar bien.**
// Cualquier fallo de lectura acaba en `sin_datos`, jamás en «ok».
import {
  saludIngesta,
  silencioPorEntidad,
  type SaludIngesta,
  type FicheroEnCuarentena,
  type EntradaRechazada,
  type EntidadIngesta,
  type PolizaHuerfana,
  type PolizaEnCartera,
} from '@central/module-seguros'

export type RespuestaIngesta =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }
  | {
      estado: 'ok'
      salud: SaludIngesta
      /**
       * El puerto tuvo que recortar la lista de huérfanas. Con esto a `true`,
       * los recuentos por clave son un SUELO, no el total, y hay que decirlo.
       */
      huerfanasTruncadas: boolean
      /**
       * Eventos de huérfana que el puerto NO pudo atribuir a la correduría (sin
       * ámbito o de otra). No se tiran en silencio: si son > 0, hay pérdida que
       * esta lista no enseña. `null` = no se pudo contar.
       */
      huerfanasSinAmbito: number | null
    }

function esFichero(v: unknown): v is FicheroEnCuarentena {
  if (typeof v !== 'object' || v === null) return false
  const f = v as Record<string, unknown>
  // `clave` NO se exige: el puerto desplegado puede ser anterior a que
  // existiera el campo, y rechazar la respuesta entera por eso convertiría una
  // versión vieja en «no se ha podido mirar». Ausente = no consta.
  const claveOk = f.clave === undefined || f.clave === null || typeof f.clave === 'string'
  return typeof f.tipo === 'string' && typeof f.entidad === 'string'
    && typeof f.dias === 'number' && Number.isFinite(f.dias) && claveOk
}

/**
 * Un envío rechazado tal y como lo manda el puerto.
 *
 * 🚨 `rechazos` ausente NO es `[]`: un `central-asegura` desplegado ANTES del
 * 04/09/2026 no informa el campo, y convertir esa versión vieja en «se miró y no
 * hay envíos rechazados» sería la misma mentira que este fichero existe para no
 * contar. Ausente ⇒ `null` ⇒ el veredicto lo dice.
 */
function esRechazo(v: unknown): v is EntradaRechazada {
  if (typeof v !== 'object' || v === null) return false
  const r = v as Record<string, unknown>
  const horasOk =
    r.horasDesdeUltimo === null ||
    (typeof r.horasDesdeUltimo === 'number' && Number.isFinite(r.horasDesdeUltimo))
  const origenOk = r.origen === null || typeof r.origen === 'string'
  return typeof r.evento === 'string' && typeof r.n === 'number' && Number.isFinite(r.n)
    && horasOk && origenOk
}

/**
 * El ritmo de envío de una compañía tal y como lo manda el puerto.
 *
 * 🚨 Misma regla que `esRechazo`: un `central-asegura` anterior al 05/09/2026 no
 * informa `entidades`, y tratar esa versión vieja como «se miró y no hay ninguna
 * compañía callada» sería justamente la avería que este vigía persigue. Ausente
 * ⇒ `null` ⇒ el parte dice «sin comprobar».
 */
function esEntidad(v: unknown): v is EntidadIngesta {
  if (typeof v !== 'object' || v === null) return false
  const e = v as Record<string, unknown>
  const numONull = (x: unknown) => x === null || (typeof x === 'number' && Number.isFinite(x))
  const opcional = (x: unknown) => x === undefined || numONull(x)
  return typeof e.entidad === 'string'
    && numONull(e.diasSinFichero) && numONull(e.huecoMaximo)
    && typeof e.huecosObservados === 'number' && Number.isFinite(e.huecosObservados)
    && numONull(e.vivas) && numONull(e.vencidasEnSilencio) && opcional(e.vencen90d)
}

/**
 * La lista de pólizas huérfanas que manda `/api/operador/huerfanas`.
 *
 * 🚨 Dos estados, y NO se colapsan: `sin_datos` es «no he podido mirar» (el
 * puerto no responde, o es una versión de `central-asegura` anterior al
 * 05/09/2026 que no tiene ese endpoint y devuelve 404) y `ok` con `polizas: []`
 * es «he mirado y no hay ninguna». Tratar el primero como el segundo daría por
 * resuelta una pérdida activa — que es literalmente la avería que este fichero
 * existe para no repetir.
 */
export type Huerfanas =
  | { estado: 'sin_datos'; motivo: string }
  | {
      estado: 'ok'
      polizas: PolizaHuerfana[]
      truncado: boolean
      ocultasOtroAmbito: number | null
    }

function esEnCartera(v: unknown): v is PolizaEnCartera {
  return v === 'viva' || v === 'lapida' || v === 'ausente'
}

/**
 * Una póliza huérfana tal y como la manda el puerto.
 *
 * `enCartera` se EXIGE y no tiene valor por defecto: es lo que decide si hay que
 * pedírsela a la compañía o reprocesarla en casa, y suponerlo mandaría a hacer
 * el trabajo equivocado. Sin él, la fila no se entiende.
 */
function esHuerfana(v: unknown): v is PolizaHuerfana {
  if (typeof v !== 'object' || v === null) return false
  const p = v as Record<string, unknown>
  const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x)
  const numONull = (x: unknown) => x === null || num(x)
  const textoONull = (x: unknown) => x === null || typeof x === 'string'
  return typeof p.entidad === 'string'
    && typeof p.idPolizaEntidad === 'string' && p.idPolizaEntidad.trim() !== ''
    && textoONull(p.entidadNombre) && textoONull(p.clave) && textoONull(p.ultimoEn)
    && num(p.recibos) && num(p.siniestros) && numONull(p.prima)
    && esEnCartera(p.enCartera)
}

/**
 * Interpretación PURA de la respuesta del puerto de huérfanas.
 *
 * Todo-o-nada, igual que con los rechazos y el silencio por compañía: si una
 * sola fila viene rara, la lista entera se degrada a `sin_datos`. Quedarse con
 * las que se entienden daría una lista MÁS CORTA que la realidad, y una lista
 * corta se reenvía a la compañía tal cual — pediríamos de menos sin enterarnos.
 */
export function interpretarHuerfanas(status: number, json: unknown): Huerfanas {
  if (status === 401 || status === 403) return { estado: 'sin_datos', motivo: 'secreto_rechazado' }
  // 404 = el `central-asegura` desplegado es anterior a este puerto. No es «no
  // hay huérfanas»: es que todavía no se pueden listar.
  if (status === 404) return { estado: 'sin_datos', motivo: 'puerto_no_desplegado' }
  if (status !== 200 || typeof json !== 'object' || json === null) {
    return { estado: 'sin_datos', motivo: 'respuesta_ilegible' }
  }
  const r = json as Record<string, unknown>
  if (r.estado === 'sin_configurar') return { estado: 'sin_datos', motivo: 'sin_configurar' }
  if (r.estado === 'error') {
    const causa = typeof r.causa === 'string' ? r.causa : 'asegura_error'
    return { estado: 'sin_datos', motivo: causa }
  }
  if (r.estado !== 'ok' || !Array.isArray(r.polizas) || !r.polizas.every(esHuerfana)) {
    return { estado: 'sin_datos', motivo: 'respuesta_ilegible' }
  }
  return {
    estado: 'ok',
    polizas: r.polizas as PolizaHuerfana[],
    // Ante la duda, el estado conservador: si el puerto no dice si recortó, se
    // asume que sí — un total presentado como completo sin serlo es peor que
    // una nota de más.
    truncado: r.truncado !== false,
    ocultasOtroAmbito:
      typeof r.ocultasOtroAmbito === 'number' && Number.isFinite(r.ocultasOtroAmbito)
        ? r.ocultasOtroAmbito
        : null,
  }
}

/** La lista tal cual la quiere el módulo puro: `null` = no se ha podido mirar. */
export function polizasDe(h: Huerfanas): PolizaHuerfana[] | null {
  return h.estado === 'ok' ? h.polizas : null
}

/**
 * Interpretación PURA de la respuesta del puerto (testeable sin red).
 *
 * Una forma inesperada NO se degrada a «no hay nada atascado»: se degrada a
 * `sin_datos`. Es la diferencia entre «he mirado y está limpio» y «no he podido
 * mirar», y confundirlas es exactamente cómo esta avería duró dos meses.
 */
export function interpretarIngesta(
  status: number,
  json: unknown,
  huerfanas: Huerfanas = { estado: 'sin_datos', motivo: 'no_consultado' },
): RespuestaIngesta {
  if (status === 401 || status === 403) return { estado: 'error', motivo: 'secreto_rechazado' }
  if (status !== 200 || typeof json !== 'object' || json === null) {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }
  const r = json as Record<string, unknown>
  if (r.estado === 'sin_configurar') return { estado: 'sin_configurar' }
  if (r.estado === 'error') return { estado: 'error', motivo: 'asegura_error' }
  if (r.estado !== 'ok' || !Array.isArray(r.cuarentena) || !r.cuarentena.every(esFichero)) {
    return { estado: 'error', motivo: 'respuesta_ilegible' }
  }
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null
  const dias = typeof r.diasSinPersistir === 'object' && r.diasSinPersistir !== null
    ? Object.fromEntries(
        Object.entries(r.diasSinPersistir as Record<string, unknown>).map(([k, v]) => [k, num(v)]),
      )
    : null
  return {
    estado: 'ok',
    salud: saludIngesta({
      cuarentena: r.cuarentena,
      huerfanas: num(r.huerfanas),
      huerfanasResolubles: num(r.huerfanasResolubles),
      primaPerdida: num(r.primaPerdida),
      diasSinPersistir: dias,
      // Una lista con alguna fila ilegible se degrada ENTERA a `null`: contar
      // solo las que se entienden daría un número más bajo que la realidad, que
      // es la forma tranquilizadora de equivocarse.
      rechazos:
        Array.isArray(r.rechazos) && r.rechazos.every(esRechazo)
          ? (r.rechazos as EntradaRechazada[])
          : null,
      // Mismo criterio de todo-o-nada: una lista con una fila ilegible se
      // degrada ENTERA. Juzgar solo a las compañías que se entienden dejaría
      // sin mirar precisamente a la que viene rara.
      silencio:
        Array.isArray(r.entidades) && r.entidades.every(esEntidad)
          ? silencioPorEntidad(r.entidades as EntidadIngesta[])
          : null,
      // 🚨 `null` cuando no se ha podido listar. Un `[]` aquí diría «se miró y
      // no falta ninguna póliza», que es dar por resuelta una pérdida activa.
      huerfanasDetalle: polizasDe(huerfanas),
    }),
    huerfanasTruncadas: huerfanas.estado === 'ok' && huerfanas.truncado,
    huerfanasSinAmbito: huerfanas.estado === 'ok' ? huerfanas.ocultasOtroAmbito : null,
  }
}

/** La salud tal cual la ve el vigía: un fallo de red ya llega como `sin_datos`. */
export function saludDesdeRespuesta(r: RespuestaIngesta): SaludIngesta {
  return r.estado === 'ok' ? r.salud : saludIngesta({ cuarentena: null })
}

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

/** Una llamada al puerto. `null` = ni siquiera se pudo hablar con él. */
async function pedir(ruta: string, secret: string): Promise<{ status: number; json: unknown } | null> {
  try {
    const res = await fetch(`${urlAsegura()}${ruta}`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store', signal: AbortSignal.timeout(8000),
    })
    return { status: res.status, json: await res.json().catch(() => null) }
  } catch {
    return null
  }
}

export async function leerIngestaCima(): Promise<RespuestaIngesta> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { estado: 'sin_configurar' }
  // Las dos lecturas van EN PARALELO y son independientes a propósito: la lista
  // de huérfanas es un extra: que falle no puede dejar sin parte a la salud de
  // la ingesta, que es el aviso que existía antes.
  const [ingesta, listado] = await Promise.all([
    pedir('/api/operador/ingesta', secret),
    pedir('/api/operador/huerfanas', secret),
  ])
  if (ingesta === null) return { estado: 'error', motivo: 'red' }
  const huerfanas: Huerfanas = listado === null
    ? { estado: 'sin_datos', motivo: 'red' }
    : interpretarHuerfanas(listado.status, listado.json)
  return interpretarIngesta(ingesta.status, ingesta.json, huerfanas)
}
