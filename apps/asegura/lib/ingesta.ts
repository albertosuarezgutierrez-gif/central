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
import type {
  EntradaRechazada,
  EntidadIngesta,
  FicheroEnCuarentena,
  FicheroParcial,
  CampoImportanteSinLeer,
} from '@central/module-seguros'
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
      /**
       * Crudo EIAC en cuarentena CON incidencia (mig 0096/0097). `null` = no se
       * pudo leer la tabla —p. ej. leyendo del Supabase de origen, que no la
       * tiene—, que NO es «no hay nada pendiente».
       */
      crudo: CrudoPendiente | null
      /**
       * Campos que CIMA manda y el mapper no lee nunca (mig 0097). `null` =
       * todavía sin medir: hace falta que pase un pull con ficheros. Un 0 aquí
       * diría «lo leemos todo», que es la mentira que esta medición evita.
       */
      cobertura: CoberturaResumen | null
      /**
       * Caja negra del webhook de Codeoscopic (mig 0098). `null` = no se pudo
       * leer. `capturaActiva:false` = la captura existe pero aún no ha entrado
       * ningún cuerpo: tampoco autoriza a decir que el canal esté sano.
       */
      cajaNegra: CajaNegraCodeoscopic | null
      /** Última corrida del cron CIMA. `null` = no consta ninguna. */
      ultimoPull: UltimoPullPuerto | null
      /**
       * Ficheros YA confirmados que se dejaron objetos sin guardar. `[]` = se
       * miró y no hay; `null` = no se pudo mirar. Es la única pérdida de esta
       * lista que NO se puede volver a pedir: CIMA ya los confirmó a TIREA.
       */
      parciales: FicheroParcial[] | null
      /**
       * Watchlist curada de campos que CIMA manda de forma constante y nunca
       * se leen (mig 0099). `null` = no se pudo comprobar; `[]` = se miró y
       * hoy no hay ninguno conocido.
       */
      camposImportantes: CampoImportanteSinLeer[] | null
    }

/** Crudo EIAC guardado por una incidencia y todavía sin reprocesar. */
export type CrudoPendiente = {
  pendientes: number
  /** Filas que el TTL va a borrar pronto: la última oportunidad de reprocesarlas. */
  purgaInminente: number
  /** Antigüedad de la más vieja. `null` = no hay ninguna. */
  masAntiguaHoras: number | null
}

/**
 * Cuántas RUTAS distintas manda CIMA y cuántas NO se leen jamás.
 *
 * 🚨 Rutas, no filas: la tabla es única por `(correduria_id, tipo_objeto,
 * codigo_entidad, ruta)` y contar filas multiplicaba el campo por el número de
 * compañías que lo mandan (755 filas / 563 rutas, medido el 20/09/2026).
 */
export type CoberturaResumen = {
  rutas: number
  rutasNuncaLeidas: number
  /** De cuántas compañías sale la medida. `null` = no consta, nunca «ninguna». */
  entidadesObservadas: number | null
  /** Desglose por tipo EIAC, ordenado por lo que más se pierde. */
  porTipo: Array<{ tipoObjeto: string; rutas: number; nuncaLeidas: number }>
}

/** Cuerpos que Codeoscopic nos mandó y rechazamos, capturados para poder mirarlos. */
export type CajaNegraCodeoscopic = {
  /** true = ha entrado al menos un cuerpo. false = capturado nada AÚN. */
  capturaActiva: boolean
  /** Cuerpos DISTINTOS (dedup por hash). La señal: si crece, no es un sondeo. */
  cuerpos: number
  /** POSTs totales, contando repeticiones. */
  posts: number
  /** Horas desde el último. `null` = no hay ninguno. */
  horasDesdeUltimo: number | null
  /** Filas sin cuerpo guardado (faltaba la clave de cifrado): no reprocesables. */
  sinCuerpo: number
}

export type UltimoPullPuerto = { horas: number; procesados: number | null }

/** Tipos de objeto EIAC que la ingesta persiste. El evento que lo confirma es
 *  `cima_<objeto>_persisted`; si un tipo lleva mucho sin aparecer, algo pasa. */
const TIPOS = [
  { tipo: 'POL', evento: 'cima_poliza_persisted' },
  { tipo: 'REC', evento: 'cima_recibo_persisted' },
  { tipo: 'SIN', evento: 'cima_siniestro_persisted' },
  { tipo: 'CEF', evento: 'cima_cef_persisted' },
] as const

/**
 * El CTE que deja sobre la mesa solo las huérfanas que SIGUEN sin colgar.
 *
 * 🚨 Vive aquí y lo importa también `app/api/operador/huerfanas/route.ts` a
 * propósito: si el recuento y la LISTA usaran criterios distintos, el aviso
 * diría «7 pólizas» y enseñaría 24 — o al revés, pediría a la compañía pólizas
 * cuyos recibos ya están dentro. Un solo sitio, o vuelven a divergir.
 *
 * El descarte es por OBJETO concreto (`idRecibo` / `idSiniestroEntidad`), no
 * por póliza: una póliza con cuatro recibos de los que uno se perdió sigue
 * teniendo un recibo perdido, y mirar solo «¿tiene recibos?» lo taparía.
 *
 * `filtroExtra` se concatena tal cual dentro del `WHERE`, así que solo se le
 * pasan literales escritos en este repo (nunca entrada del usuario): los
 * identificadores siguen yendo por parámetro.
 */
export function sqlHuerfanasPendientes(filtroExtra = ''): string {
  return `
    WITH citadas AS (
      SELECT e.event_name,
             e.occurred_at,
             NULLIF(btrim(e.payload->>'idPolizaEntidad'), '') AS id_poliza,
             NULLIF(btrim(e.payload->>'codigoEntidad'), '') AS entidad,
             NULLIF(split_part(e.payload->>'nombreFichero', '_', 2), '') AS clave,
             NULLIF(btrim(e.payload->>'idRecibo'), '') AS id_recibo,
             NULLIF(btrim(e.payload->>'idSiniestroEntidad'), '') AS id_siniestro,
             -- La prima se castea SOLO si de verdad parece un número:
             -- un ::numeric a pelo sobre un valor raro tumbaría la consulta
             -- ENTERA y nos quedaríamos sin vigía por culpa de un importe.
             CASE WHEN e.payload->>'primaTotal' ~ '^-?[0-9]+([.,][0-9]+)?$'
                  THEN REPLACE(e.payload->>'primaTotal', ',', '.')::numeric END AS prima
      FROM operational_events e
      WHERE e.event_name IN ('cima_siniestro_sin_poliza_review', 'cima_recibo_sin_poliza_review')
        AND NULLIF(btrim(e.payload->>'idPolizaEntidad'), '') IS NOT NULL
        ${filtroExtra}
    ), pendientes AS (
      SELECT * FROM citadas c
      WHERE NOT EXISTS (
              SELECT 1 FROM poliza_recibos r
              WHERE c.id_recibo IS NOT NULL
                AND r.id_recibo = c.id_recibo
                AND r.codigo_entidad_dgs IS NOT DISTINCT FROM c.entidad
            )
        AND NOT EXISTS (
              SELECT 1 FROM siniestros s
              WHERE c.id_siniestro IS NOT NULL
                AND s.id_siniestro_entidad = c.id_siniestro
                AND s.codigo_entidad_dgs IS NOT DISTINCT FROM c.entidad
            )
    )`
}

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
    //
    //    🚨 Y desde el 20/09/2026 solo cuentan las que SIGUEN sin colgar. Esta
    //    consulta agregaba TODOS los eventos desde el principio de los tiempos,
    //    sin comprobar si el recibo o el siniestro acabó entrando: era un
    //    contador monótono. Medido ese día: de 88 eventos, **52 ya estaban
    //    resueltos** (los 26 siniestros, todos; y 26 de los 62 recibos), y el
    //    panel llevaba `degradada` permanente por una pérdida en gran parte
    //    cerrada. Una alarma que grita siempre se acaba silenciando, que es la
    //    segunda vuelta del fallo que este vigía existe para arreglar.
    //    Números: 24 pólizas → **7**; prima 15.951,91€ → **7.565,23€**.
    //
    //    ⚠️ El filtro es de ESTADO, no de fecha, y eso es deliberado. Una
    //    ventana temporal callaría una pérdida que nadie ha arreglado solo por
    //    vieja —silenciar por antigüedad es exactamente lo que no puede hacer
    //    este vigía—; `EXISTS` sobre el objeto CONCRETO (`idRecibo` /
    //    `idSiniestroEntidad`, que el payload sí trae) solo puede descontar lo
    //    que está demostradamente dentro. Se compara además por entidad para
    //    que un identificador repetido entre compañías no tape nada.
    const huerfanasRaw = await db.$queryRawUnsafe<
      Array<{ polizas: bigint | null; prima: number | null }>
    >(`
      ${sqlHuerfanasPendientes()}
      SELECT COUNT(DISTINCT id_poliza) AS polizas,
             SUM(prima) FILTER (WHERE event_name LIKE '%recibo%') AS prima
      FROM pendientes
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
    //        Cuenta sobre las PENDIENTES, igual que el total: si contara sobre
    //        todos los eventos podría salir «7 huérfanas, 20 de ellas ya en la
    //        cartera», que además de imposible manda a reprocesar cosas hechas.
    const resolublesRaw = await db.$queryRawUnsafe<Array<{ polizas: bigint | null }>>(`
      ${sqlHuerfanasPendientes()}
      SELECT COUNT(DISTINCT c.id_poliza) AS polizas
      FROM pendientes c
      WHERE EXISTS (
        SELECT 1 FROM polizas p
        WHERE p.id_poliza_entidad = c.id_poliza
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

    // 6. Las tres señales de la ingesta que el panel no tenía. Cada una en su
    //    PROPIO try: estas tablas son nuevas (mig 0096-0098) y NO existen en el
    //    Supabase de origen. Si una consulta las tumbara todas, el panel entero
    //    caería a «no se sabe» y el corredor perdería de vista la cuarentena y
    //    las huérfanas, que sí se leen. Fallo de lectura → `null` sólo en SU
    //    bloque, y `null` significa «no se pudo mirar», nunca «no hay».
    const leerONull = async <T>(fn: () => Promise<T>): Promise<T | null> => {
      try {
        return await fn()
      } catch {
        return null
      }
    }

    const crudo = await leerONull<CrudoPendiente>(async () => {
      const r = await db.$queryRawUnsafe<
        Array<{ pendientes: bigint | null; purga: bigint | null; horas: number | null }>
      >(`
        SELECT COUNT(*) AS pendientes,
               COUNT(*) FILTER (WHERE purgar_en <= now() + interval '14 days') AS purga,
               EXTRACT(EPOCH FROM (now() - MIN(created_at))) / 3600 AS horas
        FROM cima_cuarentena_crudo
        WHERE reprocesado_at IS NULL AND con_incidencia
      `)
      const f = r[0]
      return {
        pendientes: Number(f?.pendientes ?? 0),
        purgaInminente: Number(f?.purga ?? 0),
        // Sin filas, MIN(created_at) es NULL: «no hay ninguna», no «0 horas».
        masAntiguaHoras:
          f?.horas === null || f?.horas === undefined ? null : Math.floor(Number(f.horas)),
      }
    })

    // 🚨 Se cuentan RUTAS DISTINTAS, no filas. La tabla es única por
    // `(correduria_id, tipo_objeto, codigo_entidad, ruta)`, así que el mismo
    // campo mandado por tres compañías eran tres «campos». Medido el
    // 20/09/2026: **755 filas para 563 rutas**, con solo 3 entidades vistas —
    // y esta es la cifra sobre la que se decide qué mapear.
    // Y una ruta cuenta como leída si ALGUNA compañía la trajo y se leyó
    // (`bool_or`): que otra no la haya mandado nunca no la hace «no leída».
    const cobertura = await leerONull<CoberturaResumen | null>(async () => {
      const r = await db.$queryRawUnsafe<
        Array<{ tipo: string; rutas: bigint | null; nunca: bigint | null; entidades: bigint | null }>
      >(`
        WITH por_ruta AS (
          SELECT tipo_objeto, ruta,
                 bool_or(ultima_vez_leido IS NOT NULL) AS leida
          FROM cima_cobertura_campos
          WHERE hoja
          GROUP BY tipo_objeto, ruta
        )
        SELECT tipo_objeto AS tipo,
               COUNT(*) AS rutas,
               COUNT(*) FILTER (WHERE NOT leida) AS nunca,
               (SELECT COUNT(DISTINCT codigo_entidad) FROM cima_cobertura_campos WHERE hoja) AS entidades
        FROM por_ruta
        GROUP BY tipo_objeto
      `)
      // Cero filas = todavía no se ha medido NADA. Devolver `{rutas:0,
      // rutasNuncaLeidas:0}` diría «los leemos todos», que es justo la
      // afirmación tranquilizadora y falsa que la mig 0097 existe para impedir.
      if (r.length === 0) return null
      const porTipo = r
        .map(f => ({
          tipoObjeto: f.tipo,
          rutas: Number(f.rutas ?? 0),
          nuncaLeidas: Number(f.nunca ?? 0),
        }))
        .sort((a, b) => b.nuncaLeidas - a.nuncaLeidas)
      const entidades = r[0]?.entidades
      return {
        rutas: porTipo.reduce((n, t) => n + t.rutas, 0),
        rutasNuncaLeidas: porTipo.reduce((n, t) => n + t.nuncaLeidas, 0),
        // `null` = no consta de cuántas compañías sale la cifra, que no es
        // «ninguna»: sin ese dato no se sabe si describe el EIAC o solo a tres.
        entidadesObservadas:
          entidades === null || entidades === undefined ? null : Number(entidades),
        porTipo,
      }
    })

    // 🚨 La watchlist CURADA (mig 0099, 20/09/2026): campos que CIMA manda de
    // forma CONSTANTE —no una vez suelta, `veces_visto` alto sobre las rutas
    // recientes— y que el mapper nunca lee. `cobertura` (arriba) cuenta 500+
    // rutas sin leer A PROPÓSITO sin alarmar —el EIAC trae cientos de campos y
    // siempre habrá cola—, así que un hallazgo real como este se pierde dentro
    // de esa cifra. Caso real: `Tomador.PersonaFisica.Domicilio`/
    // `DatosContacto` (dirección de contacto, email, teléfono del propio
    // tomador) llega en el 100% de los POL recientes y nunca se ha leído —es
    // justo el dato que hoy solo se puede corregir a mano desde el portal.
    //
    // La lista es CURADA (WHERE ... OR ruta ILIKE ...), no un barrido: crece
    // cuando alguien decide que un patrón importa, no solo porque algo nuevo
    // aparezca en el EIAC.
    const camposImportantes = await leerONull<CampoImportanteSinLeer[]>(async () => {
      const r = await db.$queryRawUnsafe<Array<{ id: string; visto: bigint | null }>>(`
        SELECT 'tomador_contacto' AS id, MAX(veces_visto) AS visto
        FROM cima_cobertura_campos
        WHERE hoja AND veces_leido = 0 AND veces_visto >= 3
          AND ruta ~ 'Tomador\\.Persona(Fisica|Juridica)\\.(Domicilio|DatosContacto)'
      `)
      const f = r[0]
      const visto = Number(f?.visto ?? 0)
      if (visto === 0) return []
      return [
        {
          id: 'tomador_contacto',
          etiqueta:
            'la dirección de contacto, el email y el teléfono del TOMADOR (Tomador.Domicilio/DatosContacto)',
          vecesVisto: visto,
        },
      ]
    })

    const cajaNegra = await leerONull<CajaNegraCodeoscopic>(async () => {
      const r = await db.$queryRawUnsafe<
        Array<{
          cuerpos: bigint | null
          posts: bigint | null
          sin_cuerpo: bigint | null
          horas: number | null
        }>
      >(`
        SELECT COUNT(*) AS cuerpos,
               COALESCE(SUM(veces), 0) AS posts,
               COUNT(*) FILTER (WHERE body_cifrado = '') AS sin_cuerpo,
               EXTRACT(EPOCH FROM (now() - MAX(ultima_vez))) / 3600 AS horas
        FROM codeoscopic_cuarentena_crudo
        WHERE reprocesado_at IS NULL
      `)
      const f = r[0]
      const cuerpos = Number(f?.cuerpos ?? 0)
      return {
        capturaActiva: cuerpos > 0,
        cuerpos,
        posts: Number(f?.posts ?? 0),
        horasDesdeUltimo:
          f?.horas === null || f?.horas === undefined ? null : Math.floor(Number(f.horas)),
        sinCuerpo: Number(f?.sin_cuerpo ?? 0),
      }
    })

    // 7. 🚨 LA IRREVERSIBLE: ficheros que se dieron por BUENOS dejándose objetos
    //    sin guardar. Ver `FicheroParcial` en `@central/module-seguros` para el
    //    caso medido; aquí solo importa de DÓNDE se lee y por qué de ahí:
    //
    //    - **Del EVENTO, no de `cima_ficheros`.** Las columnas `polizas_count` /
    //      `polizas_persisted` acaban reescritas a `44/44` en el mismo fichero
    //      cuyo parte dice `40 de 44` (medido 20/09/2026: 1 fila con hueco en
    //      144 ficheros). Un vigía montado sobre ellas sale verde siempre.
    //    - **El ÚLTIMO parte de cada fichero** (`DISTINCT ON (nombreFichero)`): el
    //      mismo fichero emite un parte por pasada, así que sumar eventos
    //      contaría dos veces las mismas 4 pólizas. Y así la señal se APAGA
    //      sola el día que un reproceso deje el fichero a cero, sin ventana
    //      temporal que la calle antes de tiempo. 🚨 La identidad es el NOMBRE
    //      EIAC, no el `xmlHash`: el mismo fichero re-leído emite un hash
    //      distinto (medido el 20/09/2026 — `C0468_M00171_POL_199_…` sale con
    //      `13489fbf…` el 15/09 y con `17022c62…` el 17/09), así que agrupar
    //      por hash lo contaba DOS veces.
    //    - **Las claves son por tipo de objeto** (`polizasReview`,
    //      `recibosReview`, …), así que se suman por SUFIJO en vez de
    //      enumerarlas: un tipo nuevo entra solo. `zipEntryCount` se excluye a
    //      mano porque también acaba en `Count` y no es un objeto EIAC.
    const parciales = await leerONull<FicheroParcial[]>(async () => {
      const r = await db.$queryRawUnsafe<
        Array<{
          fichero: string | null
          tipo: string | null
          entidad: string | null
          clave: string | null
          declarados: number | null
          persistidos: number | null
          en_revision: number | null
          dias: number | null
        }>
      >(`
        WITH ultimo_parte AS (
          SELECT DISTINCT ON (e.payload->>'nombreFichero')
                 e.payload->>'nombreFichero' AS fichero,
                 e.payload->>'tipoObjeto' AS tipo,
                 e.payload->>'codigoEntidad' AS entidad,
                 NULLIF(split_part(e.payload->>'nombreFichero', '_', 2), '') AS clave,
                 e.payload->>'stateTo' AS estado,
                 EXTRACT(EPOCH FROM (now() - e.occurred_at)) / 86400 AS dias,
                 (SELECT COALESCE(SUM((p.value)::numeric), 0) FROM jsonb_each(e.payload) p
                   WHERE p.key LIKE '%Count' AND p.key <> 'zipEntryCount'
                     AND jsonb_typeof(p.value) = 'number') AS declarados,
                 (SELECT COALESCE(SUM((p.value)::numeric), 0) FROM jsonb_each(e.payload) p
                   WHERE p.key LIKE '%Persisted' AND jsonb_typeof(p.value) = 'number') AS persistidos,
                 (SELECT COALESCE(SUM((p.value)::numeric), 0) FROM jsonb_each(e.payload) p
                   WHERE p.key LIKE '%Review' AND jsonb_typeof(p.value) = 'number') AS en_revision
          FROM operational_events e
          WHERE e.event_name = 'cima_fichero_persistido_parcial'
            AND NULLIF(btrim(e.payload->>'nombreFichero'), '') IS NOT NULL
          ORDER BY e.payload->>'nombreFichero', e.occurred_at DESC
        )
        SELECT fichero, tipo, entidad, clave, declarados, persistidos, en_revision, dias
        FROM ultimo_parte
        WHERE estado = 'confirmed' AND en_revision > 0
        ORDER BY en_revision DESC, dias ASC
      `)
      return r.map(f => ({
        fichero: f.fichero ?? 'desconocido',
        tipo: f.tipo ?? 'desconocido',
        entidad: f.entidad ?? 'desconocida',
        clave: f.clave,
        declarados: Number(f.declarados ?? 0),
        persistidos: Number(f.persistidos ?? 0),
        enRevision: Number(f.en_revision ?? 0),
        // `null` = el parte no traía fecha legible, no «hoy».
        dias: f.dias === null || f.dias === undefined ? null : Math.floor(Number(f.dias)),
      }))
    })

    const ultimoPull = await leerONull<UltimoPullPuerto | null>(async () => {
      const r = await db.$queryRawUnsafe<
        Array<{ horas: number | null; procesados: number | null }>
      >(`
        SELECT EXTRACT(EPOCH FROM (now() - occurred_at)) / 3600 AS horas,
               NULLIF(payload->>'processed', '')::int AS procesados
        FROM operational_events
        WHERE event_name = 'cima_pull_completed'
        ORDER BY occurred_at DESC
        LIMIT 1
      `)
      const f = r[0]
      if (!f || f.horas === null || f.horas === undefined) return null
      return {
        horas: Math.floor(Number(f.horas)),
        // `null` = el evento no trajo el contador, no «procesó 0».
        procesados:
          f.procesados === null || f.procesados === undefined ? null : Number(f.procesados),
      }
    })

    const fila = huerfanasRaw[0]
    return {
      crudo,
      cobertura,
      camposImportantes,
      cajaNegra,
      ultimoPull,
      parciales,
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
