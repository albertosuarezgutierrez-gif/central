// ────────────────────────────────────────────────────────────────────────────
// Enriquecimiento de una subasta: ficha del Portal del BOE + Catastro.
// Aquí va SOLO la red; el parseo es puro (`@central/module-subastas`).
//
// Notas de campo (probadas contra los servicios reales el 28/07/2026):
//   · Ambos hosts rechazan la conexión sin un User-Agent de navegador.
//   · El endpoint REST `/json/` del Catastro devuelve 400; el que funciona es
//     el `.asmx` que responde XML.
//   · La ficha del BOE son 3 pestañas (`&ver=2` autoridad, `&ver=3` bien); la
//     general no lleva parámetro.
// ────────────────────────────────────────────────────────────────────────────
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { sesionPortalAbierta } from '@/lib/subastas/portal-sesion'
import {
  fichaLegible,
  parsearFichaBoe,
  type CoordenadasCatastro,
  type FichaBoe,
  pujasDeFicha,
  paresFicha,
  parsearCertificadoCierre,
  resultadoDeBanner,
  resultadoDeFicha,
  type ResultadoSubasta,
  type PujasFicha,
} from '@central/module-subastas'

// El Catastro (red + cerrojo anti-corte) vive desde el 02/09/2026 en
// `@central/core-catastro/http`, compartido con la correduría. Se re-exporta
// para que los consumidores de este fichero no cambien.
export {
  bajarCatastro,
  bajarCoordenadas,
  resolverNombreVia,
  buscarRefPorDireccion,
} from '@central/core-catastro/http'

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
const FICHA = 'https://subastas.boe.es/detalleSubasta.php'
const CERTIFICADO_CIERRE = 'https://subastas.boe.es/verCertificadoCierre.php'

async function bajar(url: string, ms = 20000, cookie?: string): Promise<string> {
  const r = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    signal: AbortSignal.timeout(ms),
    cache: 'no-store',
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.text()
}


/**
 * Descarga y parsea las tres pestañas de la ficha de una subasta.
 *
 * 🚨 Un HTTP 200 que NO sea la ficha (mantenimiento del Portal, muro de un WAF,
 * página de error) es lo más peligroso que puede pasar aquí: `parsearFichaBoe`
 * nunca lanza —devuelve todos los campos a `null`— y quien llama no distingue
 * «la subasta no publica tipo» de «no he podido leer la ficha». El cron
 * escribiría esos nulls encima de las cifras buenas del corpus y marcaría
 * `enriquecida_at`, así que el estropicio duraría 24 h sin que nada lo notase.
 * Por eso se valida ANTES de parsear y se lanza: la fila queda intacta y vuelve
 * a la cola en la pasada siguiente. Misma guarda que `documentos.ts`.
 */
export async function bajarFicha(identificador: string): Promise<FichaBoe> {
  const base = `${FICHA}?idSub=${encodeURIComponent(identificador)}`
  // Las pestañas secundarias son un extra: si fallan, la general ya trae las
  // cifras, que es lo que desbloquea el scoring.
  const [general, bien, autoridad] = await Promise.all([
    bajar(base),
    bajar(`${base}&ver=3`).catch(() => ''),
    bajar(`${base}&ver=2`).catch(() => ''),
  ])
  if (!fichaLegible(general, identificador)) {
    throw new Error('la respuesta del Portal no es la ficha de esta subasta')
  }
  return parsearFichaBoe(general, bien, autoridad)
}

/**
 * Estado de las PUJAS en vivo, de la pestaña que de verdad lo publica.
 *
 * 🚨 Esto sustituye a `mejorPujaViva`, que leía la pestaña GENERAL — donde solo
 * están la puja MÍNIMA y los tramos. Nunca encontraba nada: `subastas.mejor_puja`
 * llevaba 26 filas a NULL y `mejor_puja_at` sin estrenar, y como el `null` se
 * trataba (bien) como «no publicado», el fallo era invisible. Auditado el
 * 20/08/2026 contra las 13 vivas: la pestaña `ver=5` responde a un anónimo con
 * una de cuatro frases, y 10 de las 13 dicen si hay pujas o no.
 *
 * Sin sesión no da el IMPORTE mientras la subasta está abierta (lo publica al
 * concluir). Si la pasada ya tiene sesión abierta por los documentos (#1540 y
 * #1548), se aprovecha y el importe en vivo también se ve; NO se abre una para
 * esto: cada login manda un SMS y el Portal bloquea cuentas, y el sí/no público
 * ya es la señal de competencia. Su ausencia no es un error, es menos dato.
 *
 * Lanza si la respuesta no es la ficha, igual que `bajarFicha`: un fallo de
 * lectura no es un dato.
 */
export async function estadoPujasViva(identificador: string): Promise<PujasFicha> {
  // Timeout corto a propósito: el cron que llama vigila hasta 10 fichas con
  // maxDuration 60 s — con el timeout por defecto (20 s) bastarían 3 fichas
  // lentas para comerse la pasada entera.
  const pujas = await bajar(`${FICHA}?idSub=${encodeURIComponent(identificador)}&ver=5`, 8000, sesionPortalAbierta()?.cookie ?? undefined)
  if (!fichaLegible(pujas, identificador)) {
    throw new Error('la respuesta del Portal no es la ficha de esta subasta')
  }
  return pujasDeFicha(pujas)
}

/**
 * Guarda una observación de pujas: el último estado en la fila y una línea en el
 * HISTÓRICO (`subastas_pujas_obs`).
 *
 * El histórico es lo único que permitirá saber DESPUÉS **cuándo entró la primera
 * puja**: el Portal publica el estado de HOY y nada más — ni la escalera de
 * pujas, ni el número de postores, ni siquiera en el certificado de cierre. Sin
 * serie propia, esa pregunta no se puede responder nunca.
 *
 * `desconocido` NO se guarda: un fallo de lectura no es un dato, y escribirlo
 * ensuciaría la serie con huecos que parecen observaciones.
 */
export async function guardarObservacionPujas(args: {
  dedupeKey: string
  identificador: string | null
  pujas: PujasFicha
  fechaFin?: Date | string | null
}): Promise<boolean> {
  const { dedupeKey, identificador, pujas } = args
  if (pujas.estado === 'desconocido') return false

  const fin = args.fechaFin == null ? null : new Date(args.fechaFin)
  const horas = fin && !Number.isNaN(fin.getTime()) ? (fin.getTime() - Date.now()) / 3_600_000 : null
  // De dónde salió el importe, para poder distinguir después una serie rica de
  // una de sí/no: 'sesion' = lo destapó la cookie con la subasta aún abierta ·
  // 'cierre' = lo publicó el Portal al concluir · 'publico' = no hubo importe.
  const fuente = pujas.importe == null ? 'publico' : horas != null && horas > 0 ? 'sesion' : 'cierre'

  await prisma.$executeRaw(Prisma.sql`
    UPDATE subastas SET
      pujas_estado = ${pujas.estado},
      pujas_estado_at = now(),
      mejor_puja = CASE
        WHEN ${pujas.importe}::numeric IS NULL THEN mejor_puja
        -- Una puja solo puede SUBIR: una lectura posterior más baja es un error
        -- de lectura, no una puja retirada.
        WHEN mejor_puja IS NULL OR ${pujas.importe}::numeric > mejor_puja THEN ${pujas.importe}::numeric
        ELSE mejor_puja END,
      mejor_puja_at = CASE WHEN ${pujas.importe}::numeric IS NULL THEN mejor_puja_at ELSE now() END,
      actualizado_en = now()
    WHERE dedupe_key = ${dedupeKey}
  `)
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO subastas_pujas_obs (dedupe_key, identificador, estado, importe, fuente, horas_para_cierre)
    VALUES (${dedupeKey}, ${identificador}, ${pujas.estado}, ${pujas.importe}, ${fuente}, ${horas})
    ON CONFLICT DO NOTHING
  `)
  return true
}



/**
 * Nominatim exige **≤1 petición/segundo** y lo hace cumplir BLOQUEANDO LA IP —
 * y la IP sería la de Vercel, compartida por todo lo demás. No basta con que el
 * cron vaya en serie: las filas que solo se geocodifican (fuentes sin ficha en
 * el BOE) no pagan ninguna otra latencia, así que saldrían seguidas. Este
 * cerrojo de módulo serializa y espacia TODAS las llamadas del proceso.
 */
const ESPERA_NOMINATIM_MS = 1100
let ultimaNominatim = 0
async function esperarTurnoNominatim(): Promise<void> {
  const ahora = Date.now()
  const espera = Math.max(0, ultimaNominatim + ESPERA_NOMINATIM_MS - ahora)
  // Se reserva el turno ANTES de esperar: dos llamadas concurrentes se ponen en
  // cola una detrás de otra en vez de dormir lo mismo y salir a la vez.
  ultimaNominatim = ahora + espera
  if (espera > 0) await new Promise((r) => setTimeout(r, espera))
}

/**
 * Centro del municipio por Nominatim (OSM, gratis). Es el escalón APROXIMADO
 * para las subastas sin referencia catastral (la mayoría del corpus): mejor un
 * pin honesto en el centro del pueblo que un mapa con el 15% de los inmuebles.
 * Quien lo pinte debe declarar la imprecisión (columna `geo_precision`).
 *
 * Verificado el 30/07/2026: el servicio responde 200 desde infraestructura
 * cloud (probado con `pg_net` desde Supabase). Respeta el límite de 1 req/s.
 */
export async function geocodificarMunicipio(
  municipio: string,
  provincia?: string | null,
): Promise<CoordenadasCatastro | null> {
  const q = [municipio.trim(), provincia?.trim(), 'España'].filter(Boolean).join(', ')
  await esperarTurnoNominatim()
  const r = await fetch(
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=es&q=${encodeURIComponent(q)}`,
    { headers: { 'User-Agent': 'central-subastas/1.0', Accept: 'application/json' }, signal: AbortSignal.timeout(15000), cache: 'no-store' },
  )
  if (!r.ok) return null
  const j = (await r.json().catch(() => null)) as Array<{ lat?: string; lon?: string }> | null
  const lat = Number(j?.[0]?.lat)
  const lon = Number(j?.[0]?.lon)
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) return null
  return { lat, lon }
}

// ── Captura del RESULTADO tras la conclusión ─────────────────────────────────

/**
 * Revisa las subastas recién concluidas y captura el resultado (adjudicada /
 * desierta / cancelada) y la mejor puja si la ficha la publica. Con meses de
 * esto se calibra el scoring con realidad: a qué % del valor de subasta se
 * adjudica de verdad en cada zona.
 *
 * OJO: la ficha de una subasta ABIERTA no publica estado (verificado 28/07);
 * el marcado de una CONCLUIDA aún no se ha podido ver, así que el parser
 * (`resultadoDeFicha`) es defensivo — si no reconoce nada deja la fila
 * pendiente y aquí se loguean las claves vistas para ajustar el parser con la
 * primera conclusión real (03/08/2026, El Puerto).
 */
/**
 * Desenlace desde el certificado de cierre (PDF público del Portal): «La
 * subasta concluyó con pujas (puja máxima X euros)» / «concluyó sin pujas».
 * `null` = certificado no disponible o marcado no reconocido (se reintenta).
 */
async function resultadoDeCertificado(identificador: string): Promise<ResultadoSubasta | null> {
  try {
    const r = await fetch(`${CERTIFICADO_CIERRE}?idSub=${encodeURIComponent(identificador)}`, {
      headers: { 'User-Agent': UA, Accept: 'application/pdf' },
      signal: AbortSignal.timeout(15000),
      cache: 'no-store',
    })
    if (!r.ok || !(r.headers.get('content-type') ?? '').includes('pdf')) return null
    const buf = Buffer.from(await r.arrayBuffer())
    // Mismo subpath que lib/extracto-tarjeta-pdf.ts: la raíz de pdf-parse
    // ejecuta código de debug al importarse.
    const mod: any = await import('pdf-parse/lib/pdf-parse.js')
    const pdf = mod.default ?? mod
    const texto: string = (await pdf(buf))?.text ?? ''
    const cierre = parsearCertificadoCierre(texto)
    if (!cierre) return null
    return { resultado: cierre.resultado, importe: cierre.pujaMaxima }
  } catch (e) {
    console.error('[subastas-resultado] certificado', identificador, e)
    return null
  }
}

export async function capturarResultados(max = 20): Promise<{ revisadas: number; capturadas: number }> {
  const filas = await prisma.$queryRaw<Array<{ dedupe_key: string; identificador: string; fecha_fin: Date }>>(Prisma.sql`
    SELECT dedupe_key, identificador, fecha_fin FROM subastas
    WHERE es_inmueble = true
      AND resultado IS NULL
      AND fecha_fin IS NOT NULL
      AND fecha_fin < now() - interval '6 hours'
      AND fecha_fin > now() - interval '60 days'
    ORDER BY fecha_fin DESC
    LIMIT ${max}
  `)

  let capturadas = 0
  for (const f of filas) {
    try {
      const html = await bajar(`${FICHA}?idSub=${encodeURIComponent(f.identificador)}`)
      // Misma cautela que en `bajarFicha`: sin esto, una página de error del
      // Portal daría `pares` vacío y se registraría como «sin estado
      // reconocible», ensuciando el log que sirve para ajustar el parser.
      if (!fichaLegible(html, f.identificador)) throw new Error('la respuesta del Portal no es la ficha')
      const pares = paresFicha(html)
      let res = resultadoDeFicha(pares)
      if (!res && resultadoDeBanner(html)) {
        // La primera conclusión real (09/08/2026, El Puerto) enseñó el marcado:
        // la ficha concluida publica el estado como BANNER, no como par.
        //
        // 20/08/2026: el desenlace NO hace falta ir a buscarlo al PDF en la
        // mayoría de los casos — la pestaña «Pujas» (`ver=5`) de una concluida
        // publica «Puja máxima de la subasta» con el importe en HTML plano. Se
        // mira primero (una petición, sin parsear un PDF) y el CERTIFICADO DE
        // CIERRE queda de respaldo para cuando esa pestaña no es legible o hay
        // pujas sin importe visible. Sin ninguna de las dos se deja NULL y la
        // ventana de 60 días reintenta — nunca se inventa un desenlace.
        const pujas = await estadoPujasViva(f.identificador).catch((e) => {
          console.error('[subastas-resultado] pestaña pujas', f.identificador, e)
          return { estado: 'desconocido', importe: null } as PujasFicha
        })
        await guardarObservacionPujas({
          dedupeKey: f.dedupe_key, identificador: f.identificador, pujas, fechaFin: f.fecha_fin,
        })
        if (pujas.estado === 'con_puja' && pujas.importe != null) {
          res = { resultado: 'con_pujas', importe: pujas.importe }
        } else if (pujas.estado === 'sin_pujas') {
          // El Portal lo AFIRMA sobre una subasta ya cerrada: eso es desierta.
          res = { resultado: 'desierta', importe: null }
        } else {
          res = await resultadoDeCertificado(f.identificador)
        }
      }
      if (!res) {
        // La materia prima para ajustar el parser con la primera real.
        console.log('[subastas-resultado] sin estado reconocible en', f.identificador, 'claves:', [...pares.keys()].slice(0, 20).join(' | '))
        continue
      }
      await prisma.$executeRaw(Prisma.sql`
        UPDATE subastas SET resultado = ${res.resultado},
          importe_adjudicacion = ${res.importe}, actualizado_en = now()
        WHERE dedupe_key = ${f.dedupe_key}
      `)
      capturadas++
    } catch (e) {
      console.error('[subastas-resultado]', f.identificador, e)
    }
  }
  return { revisadas: filas.length, capturadas }
}
