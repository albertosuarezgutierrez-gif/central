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
import {
  elegirVia,
  errorCatastro,
  nombreViaBuscable,
  parcelaUnica,
  parsearVias,
  parsearCatastro,
  parsearCoordenadas,
  parsearFichaBoe,
  parsearInmueblesDnploc,
  refParcela,
  type CoordenadasCatastro,
  type DatosCatastro,
  type FichaBoe,
  paresFicha,
  resultadoDeFicha,
} from '@central/module-subastas'

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
const FICHA = 'https://subastas.boe.es/detalleSubasta.php'
const CATASTRO = 'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx/Consulta_DNPRC'
const CATASTRO_COORD = 'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCoordenadas.asmx/Consulta_CPMRC'
const CATASTRO_DIR = 'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx/Consulta_DNPLOC'
const CATASTRO_VIA = 'https://ovc.catastro.meh.es/ovcservweb/OVCSWLocalizacionRC/OVCCallejero.asmx/ConsultaVia'

async function bajar(url: string, ms = 20000): Promise<string> {
  const r = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml' },
    signal: AbortSignal.timeout(ms),
    cache: 'no-store',
  })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.text()
}

/** Descarga y parsea las tres pestañas de la ficha de una subasta. */
export async function bajarFicha(identificador: string): Promise<FichaBoe> {
  const base = `${FICHA}?idSub=${encodeURIComponent(identificador)}`
  // Las pestañas secundarias son un extra: si fallan, la general ya trae las
  // cifras, que es lo que desbloquea el scoring.
  const [general, bien, autoridad] = await Promise.all([
    bajar(base),
    bajar(`${base}&ver=3`).catch(() => ''),
    bajar(`${base}&ver=2`).catch(() => ''),
  ])
  return parsearFichaBoe(general, bien, autoridad)
}

/**
 * Consulta el Catastro por referencia catastral. `null` si no hay dato.
 *
 * ⚠️ Solo devuelve datos del BIEN (superficie, año, uso) con la referencia
 * COMPLETA de 20 caracteres. Con la de parcela (14) el servicio responde el
 * LISTADO de inmuebles del edificio, sin bloque `<bico>`, y el parseo sale vacío
 * — comprobado el 30/07/2026. Por eso una referencia hallada por dirección en un
 * portal con varios pisos da ubicación exacta pero no datos del piso: no se sabe
 * cuál de ellos se subasta y inventarlo sería peor que no tenerlo.
 */
export async function bajarCatastro(refCatastral: string): Promise<DatosCatastro | null> {
  const xml = await bajar(`${CATASTRO}?Provincia=&Municipio=&RC=${encodeURIComponent(refCatastral)}`)
  const err = errorCatastro(xml)
  if (err) {
    console.warn('[subastas/catastro]', refCatastral, err)
    return null
  }
  return parsearCatastro(xml)
}

/**
 * Coordenadas WGS84 por referencia catastral (`Consulta_CPMRC`, probado el
 * 30/07/2026). El servicio trabaja a nivel de PARCELA: acepta los 14 primeros
 * caracteres; con la referencia de 20 del bien concreto responde error.
 */
export async function bajarCoordenadas(refCatastral: string): Promise<CoordenadasCatastro | null> {
  const rc14 = refParcela(refCatastral)
  if (!rc14) return null
  const xml = await bajar(`${CATASTRO_COORD}?Provincia=&Municipio=&SRS=EPSG:4326&RC=${encodeURIComponent(rc14)}`)
  return parsearCoordenadas(xml)
}

/**
 * Nombre OFICIAL de la vía según el callejero del Catastro (`ConsultaVia`, que
 * busca por prefijo). Imprescindible porque el Catastro archiva los artículos al
 * final: «Avenida de Madrid» → «MADRID DE».
 */
export async function resolverNombreVia(
  provincia: string,
  municipio: string,
  sigla: string,
  calle: string,
): Promise<string | null> {
  const buscada = nombreViaBuscable(calle)
  if (!buscada) return null
  const q = new URLSearchParams({ Provincia: provincia, Municipio: municipio, TipoVia: sigla, NombreVia: buscada })
  const vias = parsearVias(await bajar(`${CATASTRO_VIA}?${q.toString()}`))
  return elegirVia(vias, buscada)
}

/**
 * DIRECCIÓN → referencia catastral (`Consulta_DNPLOC`, servicio libre; probado
 * el 30/07/2026). Es lo que desbloquea la ubicación EXACTA de la mayor parte del
 * corpus: el BOE publica la dirección del inmueble pero solo a veces su
 * referencia catastral (5 de 34 subastas vigentes el 30/07/2026).
 *
 * Devuelve la referencia de PARCELA cuando todos los inmuebles del portal
 * coinciden en ella — que es el caso normal («CL PACO GANDIA 26» → 10 pisos, una
 * parcela) y basta para ubicar el edificio. Si la respuesta mezcla parcelas la
 * dirección era ambigua y se devuelve `null` en lugar de adivinar.
 */
export async function buscarRefPorDireccion(p: {
  provincia: string
  municipio: string
  sigla: string
  calle: string
  numero: string
}): Promise<{ refParcela: string; refCompleta: string | null } | null> {
  // Paso previo obligado: el nombre EXACTO del callejero. `Consulta_DNPLOC` no
  // perdona («DE MADRID» no existe; está archivada como «MADRID DE»).
  const oficial = await resolverNombreVia(p.provincia, p.municipio, p.sigla, p.calle).catch(() => null)

  const q = new URLSearchParams({
    Provincia: p.provincia,
    Municipio: p.municipio,
    Sigla: p.sigla,
    Calle: oficial ?? p.calle,
    Numero: p.numero,
    Bloque: '',
    Escalera: '',
    Planta: '',
    Puerta: '',
  })
  const inmuebles = parsearInmueblesDnploc(await bajar(`${CATASTRO_DIR}?${q.toString()}`))
  const parcela = parcelaUnica(inmuebles)
  if (!parcela) return null
  // La referencia COMPLETA solo se da por buena si el portal tiene un único
  // inmueble; con varios no se sabe cuál se subasta y el dato sería inventado.
  return { refParcela: parcela, refCompleta: inmuebles.length === 1 ? inmuebles[0].refCompleta : null }
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
export async function capturarResultados(max = 20): Promise<{ revisadas: number; capturadas: number }> {
  const filas = await prisma.$queryRaw<Array<{ dedupe_key: string; identificador: string }>>(Prisma.sql`
    SELECT dedupe_key, identificador FROM subastas
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
      const pares = paresFicha(html)
      const res = resultadoDeFicha(pares)
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
