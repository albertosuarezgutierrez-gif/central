// ────────────────────────────────────────────────────────────────────────────
// Radar de subastas: cruza el corpus con los criterios de cada cuenta y guarda
// los matches. El emparejado y el scoring son PUROS (`@central/module-subastas`);
// aquí solo va la BD.
// ────────────────────────────────────────────────────────────────────────────
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  coincideSubasta,
  esPlayaHuelva,
  evaluarFlip,
  evaluarOportunidad,
  FLIP_MARGEN_MIN,
  superficieUtil,
  type CriteriosSubasta,
  type SubastaInmueble,
  type TipoSubasta,
} from '@central/module-subastas'

export interface FilaCriterios {
  cuenta_id: string
  criterios: CriteriosSubasta
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
    'es_playa, margen_flip, margen_flip_pct, flip_apto, semaforo, analisis, precio_m2_zona, muestra_zona',
)

/** Fila cruda de `subastas` → el tipo del módulo. */
export function filaASubasta(f: any): SubastaInmueble {
  const num = (v: any): number | null => (v == null ? null : Number(v))
  return {
    dedupeKey: f.dedupe_key,
    fuente: f.fuente,
    identificador: f.identificador,
    tipo: f.tipo as TipoSubasta,
    autoridad: f.autoridad,
    provincia: f.provincia,
    municipio: f.municipio,
    descripcion: f.descripcion,
    url: f.url,
    fechaInicio: f.fecha_inicio ? new Date(f.fecha_inicio).toISOString() : null,
    fechaFin: f.fecha_fin ? new Date(f.fecha_fin).toISOString() : null,
    valorSubasta: num(f.valor_subasta),
    tasacion: num(f.tasacion),
    pujaMinima: num(f.puja_minima),
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
    superficie: superficieUtil(num(f.superficie_catastro), num(f.superficie)),
    anioConstruccion: f.anio_construccion ?? null,
    valorReferencia: num(f.valor_referencia),
    // Tercer escalón de valor cuando no hay tasación ni valor de referencia.
    precioM2Mercado: num(f.precio_m2_mercado),
    muestraMercado: f.muestra_mercado ?? null,
    lotes: f.lotes ?? null,
  }
}

/** Cuentas con el radar activo y sus criterios. */
export async function cuentasConRadar(): Promise<FilaCriterios[]> {
  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT cuenta_id, provincias, palabras_clave, tipos, precio_min, precio_max,
           descuento_min, excluir_ocupadas
    FROM subastas_criterios WHERE activo = true
  `)
  return filas.map((f) => ({
    cuenta_id: f.cuenta_id,
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
    WHERE es_inmueble = true
      AND (fecha_fin IS NULL OR fecha_fin >= now())
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
export async function casarParaCuenta(cuentaId: string, criterios: CriteriosSubasta, corpus: SubastaInmueble[]): Promise<number> {
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
    const oportunidad = evaluarOportunidad(s)
    const c = coincideSubasta(s, criterios, oportunidad)

    // 🏖️ Costa de Huelva = segunda residencia: entra al radar AUNQUE no case
    // con los criterios de inversión (sin tope de precio, decisión de Alberto
    // 29/07/2026 — el precio va en el aviso y decide él).
    const playa = esPlayaHuelva(s.municipio, s.descripcion, s.provincia)
    if (!c.casa && !playa) continue
    const motivos = c.casa ? [...c.motivos] : ['🏖️ Costa de Huelva — posible segunda residencia (fuera de tus criterios de inversión)']
    if (c.casa && playa) motivos.push('🏖️ Costa de Huelva — también vale como segunda residencia')

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
  for (const { cuenta_id, criterios } of cuentas) {
    nuevos += await casarParaCuenta(cuenta_id, criterios, corpus)
  }
  return { cuentas: cuentas.length, nuevos }
}
