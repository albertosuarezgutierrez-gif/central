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
 * 🚨 Nada de PII: se cuentan ficheros y pólizas, no personas. Los identificadores
 * de póliza NO salen por aquí — para eso está la pantalla del corredor, que va
 * detrás de sesión.
 */
import type { FicheroEnCuarentena } from '@central/module-seguros'
import { aseguraConfigurada, prismaAsegura } from './asegura-db'

export type EstadoIngestaPuerto =
  | { estado: 'sin_configurar' }
  | { estado: 'error' }
  | {
      estado: 'ok'
      cuarentena: FicheroEnCuarentena[]
      huerfanas: number
      primaPerdida: number | null
      diasSinPersistir: Record<string, number | null>
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
    const cuarentenaRaw = await db.$queryRawUnsafe<
      Array<{ tipo: string | null; entidad: string | null; dias: number | null }>
    >(`
      SELECT tipo_objeto AS tipo,
             codigo_entidad AS entidad,
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

    const fila = huerfanasRaw[0]
    return {
      estado: 'ok',
      cuarentena: cuarentenaRaw.map(f => ({
        tipo: f.tipo ?? 'desconocido',
        entidad: f.entidad ?? 'desconocida',
        dias: Math.floor(Number(f.dias ?? 0)),
      })),
      huerfanas: Number(fila?.polizas ?? 0),
      primaPerdida: fila?.prima === null || fila?.prima === undefined ? null : Number(fila.prima),
      diasSinPersistir,
    }
  } catch {
    // Un fallo de lectura NO se sirve como «ingesta sana»: quien llama lo
    // convierte en `sin_datos` y lo dice.
    return { estado: 'error' }
  }
}
