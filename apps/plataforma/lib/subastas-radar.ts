// ────────────────────────────────────────────────────────────────────────────
// Radar de subastas: cruza el corpus con los criterios de cada cuenta y guarda
// los matches. El emparejado y el scoring son PUROS (`@central/module-subastas`);
// aquí solo va la BD.
// ────────────────────────────────────────────────────────────────────────────
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  coincideSubasta,
  costaDe,
  esPlaya,
  evaluarFlip,
  evaluarOportunidad,
  extraerDatos,
  FLIP_MARGEN_MIN,
  superficieUtil,
  type CriteriosSubasta,
  type ParamsCoste,
  type SubastaInmueble,
  type TipoBien,
  type TipoSubasta,
} from '@central/module-subastas'
import { paramsCoste } from '@/lib/subastas/params-coste'

export interface FilaCriterios {
  cuenta_id: string
  criterios: CriteriosSubasta
  /** Coste del dinero declarado por la cuenta (vacío si paga al contado). */
  params: ParamsCoste
}

/**
 * Columnas de `subastas` SIN `fts`: Prisma no sabe deserializar un tsvector y
 * un `SELECT *` revienta la query entera en cuanto la columna deja de ser NULL
 * (tumbó `/subastas` y el cron del radar el 29/07/2026). Contra esta tabla,
 * NUNCA `SELECT *`; si una migración añade una columna que el código necesita,
 * se añade aquí.
 */
export const COLS_SUBASTA = Prisma.raw(
  'id, dedupe_key, fuente, identificador, boe_id, tipo, autoridad, provincia, municipio, descripcion, url, ' +
    'fecha_inicio, fecha_fin, valor_subasta, tasacion, puja_minima, tramos, deposito, cargas, cargas_texto, ' +
    'cargas_conocidas, situacion_posesoria, ejecutado, porcentaje_subastado, sin_visita, ref_catastral, ' +
    'superficie, anio_construccion, valor_referencia, lotes, es_inmueble, resultado, importe_adjudicacion, ' +
    'actualizado_en, created_at, tipo_bien, direccion, finca_registral, registro_propiedad, dormitorios, banos, ' +
    'planta, cuota_participacion, busqueda_origen, estado_portal, enriquecida_at, cantidad_reclamada, ' +
    'arrendamiento_inscrito, telefono_autoridad, email_autoridad, codigo_postal, superficie_catastro, ' +
    'uso_catastral, direccion_catastro, precio_m2_mercado, muestra_mercado, zona_mercado, notas_edicto, ' +
    'documentos, documentos_muro, es_playa, margen_flip, margen_flip_pct, flip_apto, semaforo, analisis, precio_m2_zona, ' +
    'muestra_zona, zona_portal, lat, lon, geo_precision, ' +
    'cargas_detalle, cargas_fuente, documentos_leidos, lector_version, valor_orientativo, mejor_puja, mejor_puja_at, ' +
    // Estado de pujas y techo congelado: los lee `subastas-cierre` para redactar
    // el aviso. Sin ellos las filas llegan con `undefined` y el aviso sale MUDO
    // («estado de pujas sin comprobar») con el dato en la BD — y `tsc` no lo caza
    // porque estas filas son `any`. Lo vigila `cols-subasta.test.ts`.
    'pujas_estado, pujas_estado_at, puja_maxima_calc, ' +
    // Remate esperado con los remates REALES ya capturados, y si el techo
    // calculado se sostiene (ver `remate.ts` del módulo).
    'remate_esperado, remate_ratio, remate_muestra, techo_fiable, techo_motivo',
)

/**
 * Filtro CANÓNICO del corpus VISIBLE: lo que todavía puede pujarse.
 *
 * `fecha_fin IS NULL` = plazo no publicado (los lotes de adquisición directa de
 * la Junta no lo tienen), NO «caducada»: se sigue viendo. Sin alias de tabla —
 * para `FROM subastas` a secas.
 *
 * 🚨 Toda lectura que pinte una subasta como pujable DEBE llevarlo. La bandeja
 * de avisos tiene el suyo (`RADAR_VIGENTE`), que además mira el corpus vivo.
 */
export const SUBASTA_VIGENTE = Prisma.sql`archivada_at IS NULL AND (fecha_fin IS NULL OR fecha_fin >= now())`

/**
 * `FROM` canónico de la bandeja de avisos: la fila del radar con su subasta del
 * corpus al lado. `LEFT JOIN` (no `JOIN`) porque el corpus puede podarse y el
 * radar guarda un snapshot propio; `subastas.dedupe_key` es único, así que el
 * join no multiplica filas.
 */
export const RADAR_CON_CORPUS = Prisma.sql`FROM subastas_radar r LEFT JOIN subastas s ON s.dedupe_key = r.dedupe_key`

/**
 * Filtro CANÓNICO de la bandeja `subastas_radar`: lo que sigue VIVO para esta
 * cuenta. Asume los alias de `RADAR_CON_CORPUS` (`r` bandeja, `s` corpus).
 *
 * 🚨 LANDMINE (01/08/2026): antes NINGÚN camino de lectura del radar miraba la
 * fecha — la bandeja se limpiaba SOLO con el `DELETE` diario de `archivarPasadas`
 * (06:15 UTC) y encima con un día de gracia, así que una subasta cerrada seguía
 * en «🎯 Mi radar» con sus botones de pujar entre 14 y 38 horas después de su
 * cierre (y para siempre si el cron fallaba). Depender de un batch para no
 * afirmar algo falso es lo mismo que no comprobarlo: el filtro va en la LECTURA
 * y el `DELETE` queda solo como recogida de basura.
 *
 * La fecha VIVA del corpus manda sobre la del snapshot (el BOE aplaza cierres, y
 * un snapshot viejo puede tenerla a NULL); si la subasta ya no está en el corpus,
 * manda el snapshot.
 */
export const RADAR_VIGENTE = Prisma.sql`
  r.descartado = false
  AND s.archivada_at IS NULL
  AND (COALESCE(s.fecha_fin, r.fecha_fin) IS NULL OR COALESCE(s.fecha_fin, r.fecha_fin) >= now())
`

/** Fila cruda de `subastas` → el tipo del módulo. */
export function filaASubasta(f: any): SubastaInmueble {
  const num = (v: any): number | null => (v == null ? null : Number(v))
  const superficie = superficieUtil(num(f.superficie_catastro), num(f.superficie))
  // Características físicas: la columna manda, y si el enriquecimiento aún no
  // la ha rellenado se cae a lo que diga la descripción registral (que es de
  // donde salen esas columnas). Sin este fallback la ficha aparece vacía en
  // los anuncios recién ingeridos, que es justo cuando se miran.
  const d = extraerDatos(f.descripcion)
  return {
    dedupeKey: f.dedupe_key,
    fuente: f.fuente,
    identificador: f.identificador,
    tipo: f.tipo as TipoSubasta,
    autoridad: f.autoridad,
    provincia: f.provincia,
    municipio: f.municipio,
    // SIN fusionar: la del anuncio puede ser prosa registral y la del Catastro
    // es el dato oficial. Quien pinte o enlace decide con cuál se queda.
    direccion: f.direccion ?? null,
    direccionCatastro: f.direccion_catastro ?? null,
    lat: num(f.lat),
    lon: num(f.lon),
    geoPrecision: f.geo_precision ?? null,
    codigoPostal: f.codigo_postal ?? null,
    usoCatastral: f.uso_catastral ?? null,
    superficieCatastro: num(f.superficie_catastro),
    descripcion: f.descripcion,
    url: f.url,
    fechaInicio: f.fecha_inicio ? new Date(f.fecha_inicio).toISOString() : null,
    fechaFin: f.fecha_fin ? new Date(f.fecha_fin).toISOString() : null,
    valorSubasta: num(f.valor_subasta),
    tasacion: num(f.tasacion),
    pujaMinima: num(f.puja_minima),
    cantidadReclamada: num(f.cantidad_reclamada),
    mejorPuja: num(f.mejor_puja),
    // Cuatro estados a propósito: el `?? false` de siempre convertiría un «no lo
    // hemos mirado» en «nadie ha pujado», que es la afirmación cara.
    pujasEstado: f.pujas_estado ?? null,
    pujasAt: f.pujas_estado_at ? new Date(f.pujas_estado_at).toISOString() : null,
    remateEsperado: num(f.remate_esperado),
    remateRatio: num(f.remate_ratio),
    remateMuestra: f.remate_muestra == null ? null : Number(f.remate_muestra),
    techoFiable: f.techo_fiable ?? null,
    techoMotivo: f.techo_motivo ?? null,
    tramos: num(f.tramos),
    deposito: num(f.deposito),
    cargas: num(f.cargas),
    cargasTexto: f.cargas_texto,
    cargasConocidas: f.cargas_conocidas ?? false,
    situacionPosesoria: f.situacion_posesoria ?? 'desconocida',
    ejecutado: f.ejecutado ?? 'desconocido',
    porcentajeSubastado: num(f.porcentaje_subastado),
    sinVisita: f.sin_visita ?? false,
    refCatastral: f.ref_catastral,
    // La del CATASTRO manda sobre la del anuncio: es la oficial y la que usa
    // `aplicarReferenciaMercado` para calcular el €/m². Si divergen y el scoring
    // usara la registral, el valor estimado saldría con otra superficie que la
    // referencia guardada — y una subasta sin superficie en el anuncio pero CON
    // ficha catastral (Belmonte: 100 m²) se quedaba sin poder estimarse.
    superficie,
    superficieOrigen: superficie == null ? null : num(f.superficie_catastro) === superficie ? 'catastro' : 'anuncio',
    // Los m² del anuncio SIN mezclar con los del Catastro: `superficie` ya se
    // quedó con la mejor de las dos, y para valorar hay que poder compararlas.
    superficieRegistral: num(f.superficie),
    anioConstruccion: f.anio_construccion ?? null,
    tipoBien: (f.tipo_bien as TipoBien | null) ?? d.tipoBien ?? null,
    dormitorios: f.dormitorios ?? d.dormitorios,
    banos: f.banos ?? d.banos,
    planta: f.planta ?? d.planta,
    valorReferencia: num(f.valor_referencia),
    // Tercer escalón de valor cuando no hay tasación ni valor de referencia.
    precioM2Mercado: num(f.precio_m2_mercado),
    muestraMercado: f.muestra_mercado ?? null,
    // De la etiqueta de zona depende que ese €/m² valga para decidir o solo
    // para hacerse una idea (`granularidadZona`).
    zonaMercado: f.zona_mercado ?? null,
    lotes: f.lotes ?? null,
  }
}

/** Cuentas con el radar activo y sus criterios. */
export async function cuentasConRadar(): Promise<FilaCriterios[]> {
  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT cuenta_id, provincias, palabras_clave, tipos, precio_min, precio_max,
           descuento_min, excluir_ocupadas,
           financia_pct, financia_tipo_anual, financia_meses, financia_comision
    FROM subastas_criterios WHERE activo = true
  `)
  return filas.map((f) => ({
    cuenta_id: f.cuenta_id,
    params: paramsCoste(f),
    criterios: {
      provincias: f.provincias ?? [],
      palabrasClave: f.palabras_clave ?? [],
      tipos: (f.tipos ?? []) as TipoSubasta[],
      precioMin: f.precio_min == null ? undefined : Number(f.precio_min),
      precioMax: f.precio_max == null ? undefined : Number(f.precio_max),
      descuentoMin: f.descuento_min ?? 0,
      excluirOcupadas: f.excluir_ocupadas ?? false,
    },
  }))
}

/**
 * Subastas candidatas: en plazo (o sin fecha conocida) y recientes. No se
 * rebarre todo el histórico en cada pasada.
 */
export async function corpusVigente(limite = 500): Promise<SubastaInmueble[]> {
  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT ${COLS_SUBASTA} FROM subastas
    WHERE es_inmueble = true AND ${SUBASTA_VIGENTE}
    ORDER BY actualizado_en DESC
    LIMIT ${limite}
  `)
  return filas.map(filaASubasta)
}

/**
 * Casa el corpus con los criterios de una cuenta e inserta lo nuevo.
 *
 * El upsert REFRESCA el snapshot y las cifras: el radar corre a las 06:30, DESPUÉS
 * del enriquecimiento (06:15) y del valor de mercado (06:20), así que la primera
 * pasada de una subasta recién ingerida la ve sin depósito, sin tasación y sin
 * municipio. Con `DO NOTHING` esa foto en blanco se quedaba congelada para siempre
 * y el aviso de cierre decía «sin valor de subasta publicado» aunque el corpus ya
 * lo tuviera. `avisado_at` y `descartado` NO se tocan: la idempotencia del aviso y
 * la decisión de Alberto mandan sobre el refresco.
 */
export async function casarParaCuenta(
  cuentaId: string,
  criterios: CriteriosSubasta,
  corpus: SubastaInmueble[],
  params: ParamsCoste = {},
): Promise<number> {
  // 🧠 Aprendizaje de los descartes de Telegram: 3 descartes con motivo «zona»
  // en el mismo municipio = Alberto no quiere más avisos de allí. Aplica a todo
  // (también a la lente playa): tres noes explícitos mandan. Se reactiva
  // borrando sus filas de `subastas_descartes`.
  const municipiosExcluidos = new Set(
    (
      await prisma.$queryRaw<Array<{ municipio: string }>>(Prisma.sql`
        SELECT upper(municipio) AS municipio FROM subastas_descartes
        WHERE cuenta_id = ${cuentaId}::uuid AND motivo = 'zona' AND municipio IS NOT NULL
        GROUP BY upper(municipio) HAVING COUNT(*) >= 3
      `).catch(() => [] as Array<{ municipio: string }>)
    ).map((f) => f.municipio),
  )
  const yaVistas = new Set(
    (
      await prisma.$queryRaw<Array<{ dedupe_key: string }>>(
        Prisma.sql`SELECT dedupe_key FROM subastas_radar WHERE cuenta_id = ${cuentaId}::uuid`,
      )
    ).map((r) => r.dedupe_key),
  )
  const anio = new Date().getFullYear()
  let nuevos = 0
  for (const s of corpus) {
    if (s.municipio && municipiosExcluidos.has(s.municipio.toUpperCase())) continue
    const oportunidad = evaluarOportunidad(s, null, params)
    const c = coincideSubasta(s, criterios, oportunidad)

    // 🏖️ Costa de Huelva y de Cádiz = segunda residencia: entra al radar AUNQUE no case
    // con los criterios de inversión (sin tope de precio, decisión de Alberto
    // 29/07/2026 — el precio va en el aviso y decide él).
    const playa = esPlaya(s.municipio, s.descripcion, s.provincia)
    const costa = costaDe(s.municipio, s.descripcion, s.provincia)
    if (!c.casa && !playa) continue
    const motivos = c.casa ? [...c.motivos] : [`🏖️ Costa de ${costa} — posible segunda residencia (fuera de tus criterios de inversión)`]
    if (c.casa && playa) motivos.push(`🏖️ Costa de ${costa} — también vale como segunda residencia`)

    // 🔨 Lente flip: si el margen estimado supera el mínimo, se dice.
    const flip = evaluarFlip(s, oportunidad, anio)
    if (flip.apto && (flip.margenPct ?? -1) >= FLIP_MARGEN_MIN && flip.margen != null) {
      motivos.push(`🔨 Flip: margen estimado ${Math.round((flip.margenPct ?? 0) * 100)}% (~${Math.round(flip.margen / 1000)} mil € tras reforma e impuestos)`)
    }

    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO subastas_radar
        (cuenta_id, dedupe_key, subasta, puntuacion, motivos, avisos, coste_total, descuento, fecha_fin)
      VALUES (
        ${cuentaId}::uuid, ${s.dedupeKey}, ${JSON.stringify(s)}::jsonb,
        ${oportunidad.puntuacion}, ${JSON.stringify(motivos)}::jsonb,
        ${JSON.stringify(oportunidad.avisos)}::jsonb,
        ${oportunidad.coste.total}, ${oportunidad.descuento},
        ${s.fechaFin ?? null}::timestamptz
      )
      ON CONFLICT (cuenta_id, dedupe_key) DO UPDATE SET
        subasta = EXCLUDED.subasta,
        puntuacion = EXCLUDED.puntuacion,
        motivos = EXCLUDED.motivos,
        avisos = EXCLUDED.avisos,
        coste_total = EXCLUDED.coste_total,
        descuento = EXCLUDED.descuento,
        fecha_fin = EXCLUDED.fecha_fin
    `)
    if (!yaVistas.has(s.dedupeKey)) nuevos++
  }
  return nuevos
}

/** Pasada completa: descarga el corpus UNA vez y lo empareja con cada cuenta. */
export async function pasadaRadar(): Promise<{ cuentas: number; nuevos: number }> {
  const cuentas = await cuentasConRadar()
  if (!cuentas.length) return { cuentas: 0, nuevos: 0 }

  const corpus = await corpusVigente()
  let nuevos = 0
  for (const { cuenta_id, criterios, params } of cuentas) {
    nuevos += await casarParaCuenta(cuenta_id, criterios, corpus, params)
  }
  return { cuentas: cuentas.length, nuevos }
}
