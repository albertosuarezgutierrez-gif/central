/**
 * Estado de la INGESTA de CIMA, leído de la BD del CRM de origen.
 *
 * Por qué existe (medido el 01/09/2026): entre el 24/06 y el 30/08 se quedaron
 * 42 ficheros en cuarentena — 23 recibos por 7.721,71€ de prima y 20 siniestros
 * de Occident— y nadie se enteró. El vigía de origen corría a diario con
 * `cuarentenaTotal: 41` en su propio parte y sus señales de alarma miraban otras
 * columnas, así que estuvo en verde dos meses sobre una pérdida activa.
 *
 * Este puerto expone lo que hay que mirar. El veredicto lo pone el helper PURO
 * `saludIngesta` de `@central/module-seguros`; aquí solo se leen números.
 *
 * 🚨 Ampliado el 04/09/2026 con los ENVÍOS RECHAZADOS, que es la misma avería
 * por otra puerta. Ese día se midió que Codeoscopic lleva al menos 24 h
 * mandándonos webhooks cada 30 minutos —autenticados, desde su IP— y que los
 * estamos tirando TODOS por una diferencia de forma (mandan un array donde el
 * validador espera un objeto). Nadie se enteró porque este vigía miraba la
 * cuarentena de CIMA y las huérfanas, no la puerta de Codeoscopic. Un dato que
 * llega y se rechaza se pierde igual que uno que no llega.
 *
 * 🚨 Nada de PII: se cuentan ficheros y pólizas, no personas. Los identificadores
 * de póliza NO salen por aquí — para eso está la pantalla del corredor, que va
 * detrás de sesión.
 */
import type { EntradaRechazada, FicheroEnCuarentena } from '@central/module-seguros'
import { HORAS_RECHAZO_RECIENTE } from '@central/module-seguros'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'

export type EstadoIngestaPuerto =
  | { estado: 'sin_configurar' }
  | { estado: 'error' }
  | {
      estado: 'ok'
      cuarentena: FicheroEnCuarentena[]
      huerfanas: number
      huerfanasResolubles: number
      primaPerdida: number | null
      diasSinPersistir: Record<string, number | null>
      /** Envíos de un proveedor que rechazamos. `[]` = comprobado y no hay. */
      rechazos: EntradaRechazada[]
    }

/** Tipos de objeto EIAC que la ingesta persiste. El evento que lo confirma es
 *  `cima_<objeto>_persisted`; si un tipo lleva mucho sin aparecer, algo pasa. */
const TIPOS = [
  { tipo: 'POL', evento: 'cima_poliza_persisted' },
  { tipo: 'REC', evento: 'cima_recibo_persisted' },
  { tipo: 'SIN', evento: 'cima_siniestro_persisted' },
  { tipo: 'CEF', evento: 'cima_cef_persisted' },
] as const

export async function leerIngesta(): Promise<EstadoIngestaPuerto> {
  if (!aseguraConfigurada()) return { estado: 'sin_configurar' }
  try {
    const db = prismaAsegura()

    // 1. Lo que se quedó por el camino. `estado <> 'confirmed'` es la definición
    //    de «no se procesó»: cubre review, error y deferred sin depender de que
    //    el enum no cambie de valores.
    //    La CLAVE DE MEDIADOR sale del 2º campo del nombre EIAC
    //    (`C0468_8-92361_REC_…`). Cada compañía asigna la suya y una misma
    //    compañía manda por varias —Occident usa `8-92361`, `M00171` y
    //    `306333`—, así que sin ella el reparto por entidad no dice de QUÉ
    //    cartera se están perdiendo los datos. `NULLIF` para que un nombre con
    //    otro formato llegue como «no consta» y no como cadena vacía.
    const cuarentenaRaw = await db.$queryRawUnsafe<
      Array<{ tipo: string | null; entidad: string | null; dias: number | null; clave: string | null }>
    >(`
      SELECT tipo_objeto AS tipo,
             codigo_entidad AS entidad,
             NULLIF(split_part(nombre_fichero, '_', 2), '') AS clave,
             EXTRACT(EPOCH FROM (now() - descargado_at)) / 86400 AS dias
      FROM cima_ficheros
      WHERE estado::text <> 'confirmed'
    `)

    // 2. Recibos y siniestros que no encuentran su póliza. Es el fallo que se
    //    comió los 7.721,71€: la póliza existe en la cartera con otro nombre de
    //    compañía (Occident / Catalana Occidente / Plus Ultra son el mismo grupo)
    //    o directamente no está.
    const huerfanasRaw = await db.$queryRawUnsafe<
      Array<{ polizas: bigint | null; prima: number | null }>
    >(`
      SELECT COUNT(DISTINCT payload->>'idPolizaEntidad') AS polizas,
             SUM(NULLIF(REPLACE(payload->>'primaTotal', ',', '.'), '')::numeric)
               FILTER (WHERE event_name LIKE '%recibo%') AS prima
      FROM operational_events
      WHERE event_name IN ('cima_siniestro_sin_poliza_review', 'cima_recibo_sin_poliza_review')
    `)

    // 3. Cuánto lleva cada tipo sin guardar ni uno. NULL = nunca se ha visto ese
    //    evento, que NO es lo mismo que «hace mucho»: puede que esa compañía no
    //    mande ese objeto.
    const persistidoRaw = await db.$queryRawUnsafe<
      Array<{ event_name: string; dias: number | null }>
    >(`
      SELECT event_name,
             EXTRACT(EPOCH FROM (now() - MAX(occurred_at))) / 86400 AS dias
      FROM operational_events
      WHERE event_name = ANY($1::text[])
      GROUP BY event_name
    `, TIPOS.map(t => t.evento))

    const porEvento = new Map(persistidoRaw.map(r => [r.event_name, r.dias]))
    const diasSinPersistir: Record<string, number | null> = {}
    for (const { tipo, evento } of TIPOS) {
      const d = porEvento.get(evento)
      diasSinPersistir[tipo] = d === undefined || d === null ? null : Math.floor(Number(d))
    }

    // 2-bis. De esas huérfanas, cuántas tienen YA su póliza en la cartera. Son
    //        dos averías distintas y llevan a sitios distintos: éstas llegaron
    //        antes que su póliza y se arreglan REPROCESANDO en casa; las otras
    //        son cartera que la compañía nunca mandó (CIMA solo envía POL en
    //        altas y modificaciones) y exigen la carga inicial de esa clave.
    //        Contarlas juntas manda a preguntar a la compañía por algo que ya
    //        está en la BD.
    const resolublesRaw = await db.$queryRawUnsafe<Array<{ polizas: bigint | null }>>(`
      SELECT COUNT(DISTINCT e.payload->>'idPolizaEntidad') AS polizas
      FROM operational_events e
      WHERE e.event_name IN ('cima_siniestro_sin_poliza_review', 'cima_recibo_sin_poliza_review')
        AND EXISTS (
          SELECT 1 FROM polizas p
          WHERE p.id_poliza_entidad = e.payload->>'idPolizaEntidad'
        )
    `)

    // 4. Lo que un proveedor nos MANDÓ y no aceptamos. Se agrupa por evento y
    //    origen porque cada par manda a un sitio distinto a arreglarlo.
    //    El patrón es por SUFIJO (`%_invalid_payload`) y no una lista cerrada de
    //    nombres: si mañana entra otro proveedor con su propio evento de rechazo,
    //    un vigía con la lista cableada lo dejaría fuera y volveríamos a no
    //    enterarnos, que es justo lo que pasó aquí.
    const rechazosRaw = await db.$queryRawUnsafe<
      Array<{ evento: string; origen: string | null; n: bigint | null; horas: number | null }>
    >(`
      SELECT event_name AS evento,
             NULLIF(btrim(source), '') AS origen,
             COUNT(*) AS n,
             EXTRACT(EPOCH FROM (now() - MAX(occurred_at))) / 3600 AS horas
      FROM operational_events
      WHERE (event_name LIKE '%_invalid_payload' OR event_name LIKE '%_rejected')
        AND occurred_at > now() - ($1 || ' hours')::interval
      GROUP BY event_name, NULLIF(btrim(source), '')
      ORDER BY COUNT(*) DESC
    `, String(HORAS_RECHAZO_RECIENTE))

    const fila = huerfanasRaw[0]
    return {
      estado: 'ok',
      cuarentena: cuarentenaRaw.map(f => ({
        tipo: f.tipo ?? 'desconocido',
        entidad: f.entidad ?? 'desconocida',
        clave: f.clave,
        dias: Math.floor(Number(f.dias ?? 0)),
      })),
      huerfanas: Number(fila?.polizas ?? 0),
      huerfanasResolubles: Number(resolublesRaw[0]?.polizas ?? 0),
      primaPerdida: fila?.prima === null || fila?.prima === undefined ? null : Number(fila.prima),
      diasSinPersistir,
      rechazos: rechazosRaw.map(r => ({
        evento: r.evento,
        origen: r.origen,
        n: Number(r.n ?? 0),
        // `null` si no se pudo calcular: sin la hora del último no se sabe si
        // esto es de ahora o de hace un mes, y no se supone.
        horasDesdeUltimo:
          r.horas === null || r.horas === undefined || !Number.isFinite(Number(r.horas))
            ? null
            : Math.floor(Number(r.horas)),
      })),
    }
  } catch {
    // Un fallo de lectura NO se sirve como «ingesta sana»: quien llama lo
    // convierte en `sin_datos` y lo dice.
    return { estado: 'error' }
  }
}
