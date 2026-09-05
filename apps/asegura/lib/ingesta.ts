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
import type { EntradaRechazada, EntidadIngesta, FicheroEnCuarentena } from '@central/module-seguros'
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
      /** Ritmo de envío por compañía. `[]` = comprobado y no hay ninguna. */
      entidades: EntidadIngesta[]
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

    // 5. 🚨 QUIÉN HA DEJADO DE MANDAR — la avería que no deja rastro en nada de
    //    lo anterior. Se compara a cada compañía con SU PROPIO ritmo (el mayor
    //    hueco que se le ha visto nunca), no con una constante: Mapfre manda
    //    cada día y medio, Reale cada 23. Un umbral global acusaría a Reale y
    //    tardaría un mes en ver a Mapfre. El veredicto lo pone el helper PURO
    //    `silencioPorEntidad`; aquí solo se leen números.
    //
    //    Los huecos se calculan sobre DÍAS DISTINTOS con fichero, no sobre
    //    ficheros: una compañía que manda cinco ficheros el mismo martes tiene
    //    cuatro huecos de cero, y esos ceros hunden el baremo hasta hacerlo
    //    inservible.
    const ritmoRaw = await db.$queryRawUnsafe<
      Array<{ entidad: string | null; dias: number | null; hueco_max: number | null; huecos: bigint | null }>
    >(`
      WITH dias_con_fichero AS (
        SELECT codigo_entidad AS entidad, descargado_at::date AS dia
        FROM cima_ficheros
        WHERE descargado_at IS NOT NULL AND codigo_entidad IS NOT NULL
        GROUP BY 1, 2
      ), huecos AS (
        SELECT entidad, dia,
               dia - lag(dia) OVER (PARTITION BY entidad ORDER BY dia) AS hueco
        FROM dias_con_fichero
      )
      SELECT entidad,
             (CURRENT_DATE - MAX(dia)) AS dias,
             MAX(hueco) AS hueco_max,
             COUNT(*) FILTER (WHERE hueco IS NOT NULL) AS huecos
      FROM huecos GROUP BY entidad
    `)

    //    Y la consecuencia MEDIDA, que es la que no depende de ningún umbral:
    //    pólizas vivas por compañía y renovaciones que vencieron DESDE su
    //    último fichero sin que llegara nada. `esCarteraViva` en SQL:
    //    `import_ref IS NULL OR eiac_xml_hash IS NOT NULL`.
    const carteraRaw = await db.$queryRawUnsafe<
      Array<{ entidad: string | null; vivas: bigint | null; vencidas: bigint | null; proximas: bigint | null }>
    >(`
      WITH ultimo AS (
        SELECT codigo_entidad AS entidad, MAX(descargado_at::date) AS dia
        FROM cima_ficheros WHERE codigo_entidad IS NOT NULL GROUP BY 1
      ), viva AS (
        SELECT codigo_entidad_dgs AS entidad, fecha_vencimiento
        FROM polizas
        WHERE codigo_entidad_dgs IS NOT NULL
          AND (import_ref IS NULL OR eiac_xml_hash IS NOT NULL)
      )
      SELECT v.entidad,
             COUNT(*) AS vivas,
             COUNT(*) FILTER (
               WHERE u.dia IS NOT NULL
                 AND v.fecha_vencimiento >= u.dia
                 AND v.fecha_vencimiento <= CURRENT_DATE
             ) AS vencidas,
             COUNT(*) FILTER (
               WHERE v.fecha_vencimiento > CURRENT_DATE
                 AND v.fecha_vencimiento <= CURRENT_DATE + 90
             ) AS proximas
      FROM viva v LEFT JOIN ultimo u ON u.entidad = v.entidad
      GROUP BY v.entidad
    `)

    const porCartera = new Map(carteraRaw.map(r => [r.entidad ?? '', r]))
    const entidades: EntidadIngesta[] = ritmoRaw.map(r => {
      const clave = r.entidad ?? ''
      const c = porCartera.get(clave)
      const n = (v: bigint | null | undefined) => (v === null || v === undefined ? null : Number(v))
      return {
        entidad: clave || 'desconocida',
        diasSinFichero: r.dias === null ? null : Math.floor(Number(r.dias)),
        huecoMaximo: r.hueco_max === null ? null : Math.floor(Number(r.hueco_max)),
        huecosObservados: Number(r.huecos ?? 0),
        // Una compañía con ficheros pero sin fila de cartera tiene 0 vivas
        // MEDIDAS (el LEFT JOIN sale de las vivas), no «no se sabe».
        vivas: c ? Number(c.vivas ?? 0) : 0,
        vencidasEnSilencio: c ? n(c.vencidas) : 0,
        vencen90d: c ? n(c.proximas) : 0,
      }
    })

    const fila = huerfanasRaw[0]
    return {
      estado: 'ok',
      entidades,
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
