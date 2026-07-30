// ────────────────────────────────────────────────────────────────────────────
// Ingesta del corpus de subastas. Aísla la red y la BD; el parseo y el scoring
// son puros (`@central/module-subastas`).
//
// FUENTE PRINCIPAL = CORREO. Alberto ya está suscrito a las alertas del Portal
// de Subastas del BOE con seis búsquedas guardadas (INMUEBLE SEVILLA, PUNTA
// UMBRIA, PUERTO SANTAMARIA, MATALASCAÑAS, MAZAGON, ASTURIAS): el BOE hace el
// filtrado y nos manda el resultado en HTML estructurado. Eso evita raspar el
// portal y esquiva el 403 que boe.es devuelve a IPs de fuera de Vercel.
//
// El correo NO trae cifras (tasación, cargas, depósito): eso vive en la ficha y
// se añadirá en la fase de enriquecimiento. Mientras tanto las filas se guardan
// con esos campos a NULL y el scoring devuelve `null` — nunca un número falso.
// ────────────────────────────────────────────────────────────────────────────
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import {
  extraerDatos,
  parsearAlertaBoe,
  provinciaCanonica,
  provinciaPorMunicipio,
  type DatosDescripcion,
  type SubastaInmueble,
} from '@central/module-subastas'
import { provinciaDeTexto } from '@central/module-concursos'
import { leerAlertas } from '@/lib/subastas/gmail-boe'

/**
 * Provincia del anuncio: primero por municipio (lo que citan las descripciones
 * del BOE), y si no hay indicio, por nombre de provincia. El nombre de la
 * búsqueda guardada entra como último recurso: cuando el BOE manda una
 * descripción plantilla, es el único dato de zona que hay.
 */
export function provinciaDe(descripcion: string | null | undefined, busqueda: string): string | null {
  return provinciaPorMunicipio(descripcion, busqueda) ?? provinciaDeTexto(`${descripcion ?? ''} ${busqueda}`) ?? null
}

/**
 * Upsert de una tanda de subastas en el corpus global.
 *
 * `COALESCE(EXCLUDED.x, subastas.x)` en los campos de cifras es deliberado: el
 * correo llega con ellos vacíos y el enriquecimiento posterior los rellena; sin
 * el COALESCE, la siguiente alerta del BOE borraría la tasación ya conocida.
 */
/** Una subasta con lo extraído de su descripción registral y su procedencia. */
export type SubastaEnriquecida = SubastaInmueble & {
  datos?: DatosDescripcion
  busquedaOrigen?: string | null
  estadoPortal?: string | null
}

export async function upsertSubastas(subastas: SubastaEnriquecida[]): Promise<number> {
  // Dedup en memoria: dos veces la misma clave en un lote rompe el ON CONFLICT.
  const porClave = new Map<string, SubastaEnriquecida>()
  for (const s of subastas) porClave.set(s.dedupeKey, s)
  const uniq = [...porClave.values()]
  if (!uniq.length) return 0

  let n = 0
  for (const s of uniq) {
    const d = s.datos ?? extraerDatos(s.descripcion)
    // El índice de búsqueda incluye lo extraído: así «vivienda 3 dormitorios
    // Dos Hermanas» encuentra la finca aunque el texto registral no lo diga así.
    const busqueda = [
      s.identificador, s.descripcion, s.municipio, s.provincia,
      d.tipoBien, d.direccion, d.registroPropiedad, s.busquedaOrigen,
    ].filter(Boolean).join(' ')
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO subastas (
        dedupe_key, fuente, identificador, tipo, autoridad, provincia, municipio, descripcion, url,
        fecha_inicio, fecha_fin, valor_subasta, tasacion, puja_minima, tramos, deposito,
        cargas, cargas_texto, cargas_conocidas, situacion_posesoria, ejecutado,
        porcentaje_subastado, sin_visita, ref_catastral, superficie, anio_construccion,
        valor_referencia, lotes, es_inmueble,
        tipo_bien, direccion, finca_registral, registro_propiedad, dormitorios, banos,
        planta, cuota_participacion, busqueda_origen, estado_portal,
        fts, actualizado_en
      ) VALUES (
        ${s.dedupeKey}, ${s.fuente}, ${s.identificador ?? null}, ${s.tipo}, ${s.autoridad ?? null},
        ${provinciaCanonica(s.provincia)}, ${s.municipio ?? null}, ${s.descripcion ?? null}, ${s.url ?? null},
        ${s.fechaInicio ?? null}::timestamptz, ${s.fechaFin ?? null}::timestamptz,
        ${s.valorSubasta ?? null}, ${s.tasacion ?? null}, ${s.pujaMinima ?? null}, ${s.tramos ?? null},
        ${s.deposito ?? null}, ${s.cargas ?? null}, ${s.cargasTexto ?? null}, ${s.cargasConocidas ?? null},
        ${s.situacionPosesoria ?? null}, ${s.ejecutado ?? null}, ${s.porcentajeSubastado ?? null},
        ${s.sinVisita ?? false}, ${s.refCatastral ?? null}, ${s.superficie ?? d.superficie ?? null},
        ${s.anioConstruccion ?? null}, ${s.valorReferencia ?? null}, ${s.lotes ?? null}, true,
        ${d.tipoBien}, ${d.direccion}, ${d.fincaRegistral}, ${d.registroPropiedad},
        ${d.dormitorios}, ${d.banos}, ${d.planta}, ${d.cuotaParticipacion},
        ${s.busquedaOrigen ?? null}, ${s.estadoPortal ?? null},
        to_tsvector('spanish', ${busqueda}), now()
      )
      ON CONFLICT (dedupe_key) DO UPDATE SET
        tipo = EXCLUDED.tipo,
        autoridad = COALESCE(EXCLUDED.autoridad, subastas.autoridad),
        provincia = COALESCE(EXCLUDED.provincia, subastas.provincia),
        municipio = COALESCE(EXCLUDED.municipio, subastas.municipio),
        descripcion = COALESCE(EXCLUDED.descripcion, subastas.descripcion),
        url = COALESCE(EXCLUDED.url, subastas.url),
        fecha_inicio = COALESCE(EXCLUDED.fecha_inicio, subastas.fecha_inicio),
        fecha_fin = COALESCE(EXCLUDED.fecha_fin, subastas.fecha_fin),
        -- Cifras: nunca pisar con NULL lo que ya se enriqueció desde la ficha.
        valor_subasta = COALESCE(EXCLUDED.valor_subasta, subastas.valor_subasta),
        tasacion = COALESCE(EXCLUDED.tasacion, subastas.tasacion),
        puja_minima = COALESCE(EXCLUDED.puja_minima, subastas.puja_minima),
        tramos = COALESCE(EXCLUDED.tramos, subastas.tramos),
        deposito = COALESCE(EXCLUDED.deposito, subastas.deposito),
        cargas = COALESCE(EXCLUDED.cargas, subastas.cargas),
        cargas_texto = COALESCE(EXCLUDED.cargas_texto, subastas.cargas_texto),
        ref_catastral = COALESCE(EXCLUDED.ref_catastral, subastas.ref_catastral),
        valor_referencia = COALESCE(EXCLUDED.valor_referencia, subastas.valor_referencia),
        superficie = COALESCE(EXCLUDED.superficie, subastas.superficie),
        tipo_bien = COALESCE(EXCLUDED.tipo_bien, subastas.tipo_bien),
        direccion = COALESCE(EXCLUDED.direccion, subastas.direccion),
        finca_registral = COALESCE(EXCLUDED.finca_registral, subastas.finca_registral),
        registro_propiedad = COALESCE(EXCLUDED.registro_propiedad, subastas.registro_propiedad),
        dormitorios = COALESCE(EXCLUDED.dormitorios, subastas.dormitorios),
        banos = COALESCE(EXCLUDED.banos, subastas.banos),
        planta = COALESCE(EXCLUDED.planta, subastas.planta),
        cuota_participacion = COALESCE(EXCLUDED.cuota_participacion, subastas.cuota_participacion),
        busqueda_origen = COALESCE(EXCLUDED.busqueda_origen, subastas.busqueda_origen),
        estado_portal = COALESCE(EXCLUDED.estado_portal, subastas.estado_portal),
        fts = EXCLUDED.fts,
        actualizado_en = now()
    `)
    n++
  }
  return n
}

/** Ingesta desde las alertas del BOE en el correo. Devuelve lo leído y lo escrito. */
export async function ingerirDesdeCorreo(dias = 7, maxCorreos = 100): Promise<{
  correos: number
  anuncios: number
  upserts: number
}> {
  const correos = await leerAlertas(dias, maxCorreos)

  const subastas: SubastaEnriquecida[] = []
  for (const c of correos) {
    for (const r of parsearAlertaBoe(c.html, c.subject)) {
      subastas.push({
        ...r.subasta,
        provincia: provinciaDe(r.subasta.descripcion, r.busqueda),
        datos: extraerDatos(r.subasta.descripcion),
        busquedaOrigen: r.busqueda,
        estadoPortal: r.estado,
      })
    }
  }

  const upserts = await upsertSubastas(subastas)
  return { correos: correos.length, anuncios: subastas.length, upserts }
}

/** Poda del corpus: las subastas cerradas hace mucho ya no aportan. */
export async function podarCorpus(diasRetencion = 90): Promise<number> {
  const r = await prisma.$executeRaw(Prisma.sql`
    DELETE FROM subastas
    WHERE fecha_fin IS NOT NULL AND fecha_fin < now() - make_interval(days => ${diasRetencion}::int)
  `)
  return Number(r)
}
