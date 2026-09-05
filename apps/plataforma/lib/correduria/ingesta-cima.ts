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
} from '@central/module-seguros'

export type RespuestaIngesta =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo: string }
  | { estado: 'ok'; salud: SaludIngesta }

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
 * Interpretación PURA de la respuesta del puerto (testeable sin red).
 *
 * Una forma inesperada NO se degrada a «no hay nada atascado»: se degrada a
 * `sin_datos`. Es la diferencia entre «he mirado y está limpio» y «no he podido
 * mirar», y confundirlas es exactamente cómo esta avería duró dos meses.
 */
export function interpretarIngesta(status: number, json: unknown): RespuestaIngesta {
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
    }),
  }
}

/** La salud tal cual la ve el vigía: un fallo de red ya llega como `sin_datos`. */
export function saludDesdeRespuesta(r: RespuestaIngesta): SaludIngesta {
  return r.estado === 'ok' ? r.salud : saludIngesta({ cuarentena: null })
}

function urlAsegura(): string {
  return (process.env.ASEGURA_URL || 'https://central-asegura.vercel.app').replace(/\/$/, '')
}

export async function leerIngestaCima(): Promise<RespuestaIngesta> {
  const secret = process.env.ASEGURA_OPERADOR_SECRET
  if (!secret) return { estado: 'sin_configurar' }
  try {
    const res = await fetch(`${urlAsegura()}/api/operador/ingesta`, {
      headers: { Authorization: `Bearer ${secret}` },
      cache: 'no-store', signal: AbortSignal.timeout(8000),
    })
    const json = await res.json().catch(() => null)
    return interpretarIngesta(res.status, json)
  } catch {
    return { estado: 'error', motivo: 'red' }
  }
}
