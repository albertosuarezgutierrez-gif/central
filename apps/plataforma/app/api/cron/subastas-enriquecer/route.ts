// Enriquece las subastas del corpus con la ficha del Portal del BOE (cifras)
// y el Catastro (superficie oficial, año, uso). Es el paso que convierte un
// «sin datos para puntuar» en un descuento real.
//
// Se procesan pocas por pasada y en serie: son servicios públicos y no hay
// prisa — el corpus crece a unas pocas subastas al día.
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { isCronAuthorized } from '@/lib/cron-auth'
import { bajarCatastro, bajarCoordenadas, bajarFicha, buscarRefPorDireccion, capturarResultados, geocodificarMunicipio } from '@/lib/subastas/enriquecer'
import { paramsDnploc, provinciaCanonica, type CoordenadasCatastro } from '@central/module-subastas'
import { archivarPasadas, procesarDocumentos } from '@/lib/subastas/documentos'
import { clasificarSubastas } from '@/lib/subastas/clasificar'
import { reextraerDatosDeTexto } from '@/lib/subastas/reextraer'
import { tgSend } from '@central/core-telegram'
import { sesionPortal, titularSesionPortal } from '@/lib/subastas/portal-sesion'

export const dynamic = 'force-dynamic'
// 🚨 300 s, no 60: la pasada espacia a propósito sus llamadas a servicios
// públicos (Catastro 350 ms entre consultas —hasta cinco por subasta—, Nominatim
// 1,1 s por su límite de 1 req/s). Con `?max=40` esos descansos por sí solos se
// comen el minuto y la pasada se truncaba a mitad, dejando filas sin enriquecer
// en silencio. Mismo techo que `subastas-mercado`.
export const maxDuration = 300

/**
 * Se reenriquece pasado este tiempo: los importes cambian durante la subasta.
 * 23 y no 24: el cron corre a diario a la misma hora, así que con un umbral de
 * 24 h exactas la fila enriquecida ayer a las 06:15:31 aún no es elegible
 * cuando la query corre hoy a las 06:15:05 — y cada ficha pasaba a releerse
 * cada DOS días, no cada día.
 */
const REFRESCO_HORAS = 23

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  // 24 (no 12): la pasada diaria debe cubrir TODAS las fichas vivas del BOE en
  // un día. Con 12 plazas y ~40 filas elegibles (23 de la Junta + ~18 del BOE),
  // la rotación por `enriquecida_at ASC` dejaba fichas del BOE 3-4 días sin
  // releer — y la relectura diaria es la que refresca puja mínima/importes
  // mientras la subasta está abierta. El techo real lo ponen `maxDuration` 300
  // y los presupuestos de tiempo internos, calibrados para `?max=40`.
  const max = Math.min(Math.max(parseInt(new URL(req.url).searchParams.get('max') || '24', 10) || 24, 1), 40)

  try {
    // Prioridad: las que nunca se enriquecieron y las que cierran antes.
    // Las fuentes SIN ficha en el Portal (Junta…) solo entran en la cola si les
    // queda trabajo real: geocodificar (`lat IS NULL`) o subir de centroide a
    // punto exacto (aparece la referencia catastral). Su re-pasada de las 24 h
    // era un no-op —solo refrescaba `enriquecida_at`— pero consumía las plazas
    // de la pasada y dejaba fuera a las fichas del BOE, que sí cambian.
    const pendientes = await prisma.$queryRaw<{ dedupe_key: string; fuente: string; identificador: string | null; ref_catastral: string | null; lat: number | null; geo_precision: string | null; municipio: string | null; provincia: string | null; direccion: string | null }[]>(
      Prisma.sql`
        SELECT dedupe_key, fuente, identificador, ref_catastral, lat, geo_precision,
               municipio, provincia, direccion
        FROM subastas
        WHERE identificador IS NOT NULL
          AND (fecha_fin IS NULL OR fecha_fin >= now())
          AND (
            enriquecida_at IS NULL
            OR (enriquecida_at < now() - make_interval(hours => ${REFRESCO_HORAS}::int)
                AND (fuente = 'boe'
                     OR lat IS NULL
                     OR (geo_precision = 'municipio' AND ref_catastral IS NOT NULL)))
          )
        ORDER BY enriquecida_at NULLS FIRST, fecha_fin ASC NULLS LAST
        LIMIT ${max}
      `,
    )

    let ok = 0
    const fallos: string[] = []

    // Presupuesto de tiempo: geocodificar un municipio cuesta ≥1,1 s por el
    // límite de 1 req/s de Nominatim, así que una pasada con `?max=40` podría
    // comerse el `maxDuration` (300 s). Se deja margen amplio para el resto de
    // la pasada (fichas, Catastro, resultados, documentos, lentes) y lo que no
    // entre va a la siguiente: las coordenadas se guardan para siempre, no hay
    // prisa.
    //
    // Devuelve `'sin_presupuesto'` cuando NO se ha llegado a intentar, que es
    // distinto de haberlo intentado sin éxito: solo lo primero justifica volver
    // a coger la fila en la pasada siguiente (si un municipio es ilocalizable
    // —«LA M1 DE LA UE-1 DEL PP-G3 DE GUILLENA»— insistir cada pasada la
    // devolvería al principio de la cola, que es el bug que se arregla arriba).
    const inicio = Date.now()
    const PRESUPUESTO_GEO_MS = 60000
    const geoConTiempo = async (
      municipio: string,
      provincia: string | null,
    ): Promise<CoordenadasCatastro | null | 'sin_presupuesto'> =>
      Date.now() - inicio < PRESUPUESTO_GEO_MS
        ? await geocodificarMunicipio(municipio, provincia).catch(() => null)
        : 'sin_presupuesto'
    const coords = (r: CoordenadasCatastro | null | 'sin_presupuesto') => (r === 'sin_presupuesto' ? null : r)

    for (const p of pendientes) {
      try {
        // Las fuentes SIN ficha en el Portal del BOE (Junta…) solo necesitan
        // coordenadas: antes entraban en `bajarFicha`, fallaban SIEMPRE y se
        // reintentaban en cada pasada, monopolizando la cola (van primeras por
        // `enriquecida_at NULLS FIRST`) sin llegar a enriquecerse nunca.
        if (p.fuente !== 'boe') {
          // `mejorable`, igual que en la rama BOE: una fila que ya se geocodificó
          // al centroide del municipio DEBE poder subir a punto exacto cuando
          // aparece la referencia catastral. Con la condición vieja
          // (`lat == null`) los lotes de la Junta se quedaban aproximados para
          // siempre en cuanto tenían un punto, aunque fuese el malo.
          const mejorableJ = p.lat == null || p.geo_precision === 'municipio'
          const geoJ = mejorableJ && p.ref_catastral ? await bajarCoordenadas(p.ref_catastral).catch(() => null) : null
          const rJ = p.lat == null && !geoJ && p.municipio
            ? await geoConTiempo(p.municipio, p.provincia)
            : null
          const geoJAprox = coords(rJ)
          // Solo se deja SIN marcar (para reintentar ya en la pasada siguiente)
          // si no se llegó a intentar por falta de presupuesto.
          const reintentar = rJ === 'sin_presupuesto'
          await prisma.$executeRaw(Prisma.sql`
            UPDATE subastas SET
              -- El punto EXACTO pisa el centroide previo (misma regla que la
              -- rama BOE); el aproximado solo entra si no había nada.
              lat = COALESCE(${geoJ?.lat ?? null}, lat, ${geoJAprox?.lat ?? null}),
              lon = COALESCE(${geoJ?.lon ?? null}, lon, ${geoJAprox?.lon ?? null}),
              geo_precision = CASE
                WHEN ${geoJ?.lat ?? null}::double precision IS NOT NULL THEN 'catastro'
                ELSE COALESCE(geo_precision, ${geoJAprox ? 'municipio' : null})
              END,
              enriquecida_at = ${reintentar ? null : new Date()}::timestamptz,
              actualizado_en = now()
            WHERE dedupe_key = ${p.dedupe_key}
          `)
          ok++
          continue
        }

        const f = await bajarFicha(p.identificador!)
        const muni = f.localidad ?? p.municipio
        const prov = f.provincia ?? p.provincia

        // 🏛️ Referencia catastral: la del correo/ficha si la hay y, si NO, se
        // BUSCA POR DIRECCIÓN en el Catastro (`Consulta_DNPLOC`). Esto es lo que
        // da ubicación exacta a la mayoría del corpus: el BOE publica la
        // dirección casi siempre, pero la referencia solo a veces (5 de 34 el
        // 30/07/2026). Idea de Alberto ese mismo día.
        let rc = p.ref_catastral
        let rcDeDireccion: string | null = null
        if (!rc && muni && prov) {
          const dir = paramsDnploc(f.direccion ?? p.direccion)
          if (dir) {
            const hallado = await buscarRefPorDireccion({
              provincia: prov, municipio: muni, ...dir,
            }).catch(() => null)
            if (hallado) {
              // La completa (20) solo cuando el portal tiene un único inmueble;
              // si no, la de parcela basta para ubicar el edificio.
              rc = hallado.refCompleta ?? hallado.refParcela
              rcDeDireccion = rc
            }
          }
        }

        const cat = rc ? await bajarCatastro(rc).catch(() => null) : null
        // Coordenadas exactas: no cambian, así que se piden mientras falten O
        // mientras el punto guardado sea el centroide del municipio (mejorable).
        const mejorable = p.lat == null || p.geo_precision === 'municipio'
        const geo = rc && mejorable ? await bajarCoordenadas(rc).catch(() => null) : null
        // En el camino del BOE la ficha ya se ha descargado, así que la fila se
        // marca igualmente: perder el punto aproximado de una pasada no
        // justifica repetir la ficha entera en la siguiente.
        const geoAprox = coords(!geo && p.lat == null && muni
          ? await geoConTiempo(muni, prov)
          : null)

        await prisma.$executeRaw(Prisma.sql`
          UPDATE subastas SET
            boe_id = COALESCE(${f.boeId}, boe_id),
            tipo = COALESCE(${f.tipo}, tipo),
            fecha_inicio = COALESCE(${f.fechaInicio}::timestamptz, fecha_inicio),
            fecha_fin = COALESCE(${f.fechaFin}::timestamptz, fecha_fin),
            -- 🚨 COALESCE también en las CIFRAS. Antes se escribían crudas, así
            -- que cualquier pasada que leyera la ficha «a medias» (una pestaña
            -- caída, un cambio de marcado que el parser no reconozca) BORRABA
            -- del corpus el tipo de salida, el depósito o la tasación — y con
            -- enriquecida_at recién puesta, el agujero duraba 24 h. Una cifra
            -- que se deja de publicar no se cae del anuncio: lo que se cae es
            -- nuestra lectura. Los importes se refrescan igual cuando la ficha
            -- SÍ trae valor (que es lo que cambia durante la subasta).
            valor_subasta = COALESCE(${f.valorSubasta}, valor_subasta),
            tasacion = COALESCE(${f.tasacion}, tasacion),
            puja_minima = COALESCE(${f.pujaMinima}, puja_minima),
            tramos = COALESCE(${f.tramos}, tramos),
            deposito = COALESCE(${f.deposito}, deposito),
            cantidad_reclamada = COALESCE(${f.cantidadReclamada}, cantidad_reclamada),
            lotes = COALESCE(${f.lotes}, lotes),
            situacion_posesoria = COALESCE(${f.situacionPosesoria}, situacion_posesoria),
            arrendamiento_inscrito = COALESCE(${f.arrendamientoInscrito}, arrendamiento_inscrito),
            sin_visita = COALESCE(${f.sinVisita}, sin_visita),
            cargas = COALESCE(${f.cargas}, cargas),
            cargas_texto = COALESCE(${f.cargasTexto}, cargas_texto),
            -- Sticky: el true puede venir de la CERTIFICACIÓN adjunta (paso de
            -- documentos), que la ficha no refleja en su campo «Cargas».
            cargas_conocidas = (${f.cargasConocidas} OR COALESCE(cargas_conocidas, false)),
            autoridad = COALESCE(${f.autoridad}, autoridad),
            telefono_autoridad = COALESCE(${f.telefonoAutoridad}, telefono_autoridad),
            email_autoridad = COALESCE(${f.emailAutoridad}, email_autoridad),
            -- Canónica: la ficha del BOE escribe «Sevilla» y la Junta «SEVILLA»;
            -- sin unificar, todo lo que agrupa por provincia parte la muestra.
            provincia = COALESCE(${provinciaCanonica(f.provincia)}, provincia),
            municipio = COALESCE(${f.localidad}, municipio),
            codigo_postal = COALESCE(${f.codigoPostal}, codigo_postal),
            direccion = COALESCE(${f.direccion}, direccion),
            -- Catastro: fuente oficial, prevalece sobre lo deducido del texto.
            superficie_catastro = COALESCE(${cat?.superficie ?? null}, superficie_catastro),
            anio_construccion = COALESCE(${cat?.anioConstruccion ?? null}, anio_construccion),
            uso_catastral = COALESCE(${cat?.uso ?? null}, uso_catastral),
            direccion_catastro = COALESCE(${cat?.direccion ?? null}, direccion_catastro),
            cuota_participacion = COALESCE(cuota_participacion, ${cat?.cuotaParticipacion ?? null}),
            -- La hallada por dirección se guarda para no repetir la búsqueda.
            ref_catastral = COALESCE(ref_catastral, ${rcDeDireccion}),
            -- El punto EXACTO pisa un centroide de municipio previo: ganamos
            -- precisión y la fila puede llevar días con el aproximado puesto.
            lat = COALESCE(${geo?.lat ?? null}, lat, ${geoAprox?.lat ?? null}),
            lon = COALESCE(${geo?.lon ?? null}, lon, ${geoAprox?.lon ?? null}),
            geo_precision = CASE
              WHEN ${geo?.lat ?? null}::double precision IS NOT NULL THEN 'catastro'
              ELSE COALESCE(geo_precision, ${geoAprox ? 'municipio' : null})
            END,
            enriquecida_at = now(),
            actualizado_en = now()
          WHERE dedupe_key = ${p.dedupe_key}
        `)
        ok++
      } catch (e: any) {
        fallos.push(`${p.identificador}: ${e?.message ?? e}`)
        // 🚨 La fila que falla CEDE EL SITIO. Sin esto se queda con
        // `enriquecida_at IS NULL` y, como la cola va `NULLS FIRST`, un puñado
        // de identificadores muertos (ficha retirada, 404 permanente) se come
        // las 12 plazas de la pasada TODOS los días y el resto del corpus no se
        // enriquece nunca — el mismo bug que ya se arregló para las fuentes sin
        // ficha, colándose por otra puerta. Se marca como si se hubiera
        // enriquecido hace `REFRESCO_HORAS - 1`: vuelve a ser elegible dentro de
        // una hora, pero detrás de las que aún no se han intentado.
        await prisma.$executeRaw(Prisma.sql`
          UPDATE subastas
          SET enriquecida_at = now() - make_interval(hours => ${REFRESCO_HORAS - 1}::int)
          WHERE dedupe_key = ${p.dedupe_key}
        `).catch(() => {})
      }
    }

    // Las CONCLUIDAS: capturar el resultado calibra el scoring con realidad.
    const resultados = await capturarResultados().catch((e) => {
      console.error('[subastas-enriquecer] resultados', e)
      return { revisadas: 0, capturadas: 0 }
    })

    // Documentos de la ficha (edictos con texto → señales explícitas).
    const documentos = await procesarDocumentos().catch((e) => {
      console.error('[subastas-enriquecer] documentos', e)
      return { revisadas: 0, conHallazgos: 0, conCargas: 0, analizadas: 0, conMuro: 0, sesion: 'no se llegó a intentar' }
    })

    // 🚨 Si el Portal RECHAZA las credenciales, esto se dice en voz alta. La
    // degradación es honesta —las fichas vuelven a decir «inicia sesión»— pero
    // silenciosa: sin este aviso, una contraseña caducada dejaría el lector
    // ciego durante semanas sin que nada se pusiera rojo. Un check que se queda
    // verde porque no ha podido mirar es el fallo más caro que hay.
    const portal = await sesionPortal()
    if (portal.estado === 'rechazada') {
      await tgSend(titularSesionPortal(portal)).catch(() => {})
    }

    // Datos que ya estaban en el TEXTO y no se habían sabido leer. Va ANTES de
    // las lentes a propósito: sin superficie no hay valor de mercado y el margen
    // de flip sale null, que es como estaban 12 de 17 subastas vivas.
    const reextraidos = await reextraerDatosDeTexto().catch((e) => {
      console.error('[subastas-enriquecer] reextraer', e)
      return { revisadas: 0, completadas: 0, conSuperficie: 0 }
    })

    // Lentes (flip / playa / semáforo): determinista y barato, al final para
    // que vea la fila ya enriquecida.
    const lentes = await clasificarSubastas().catch((e) => {
      console.error('[subastas-enriquecer] clasificar', e)
      return { revisadas: 0, playa: 0, flipViables: 0 }
    })

    // Cierre del ciclo: lo ya pasado sale de la vista y su fila de la bandeja de
    // avisos se borra. El HISTÓRICO se conserva: sin él no hay detección de
    // reapariciones (la misma finca más barata) ni calibración con resultados.
    const archivado = await archivarPasadas().catch((e) => {
      console.error('[subastas-enriquecer] archivar', e)
      return { archivadas: 0, radarLimpiado: 0 }
    })

    return NextResponse.json({ ok: true, procesadas: pendientes.length, enriquecidas: ok, fallos, ...resultados, documentos, reextraidos, lentes, archivado })
  } catch (e: any) {
    console.error('[subastas-enriquecer]', e)
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 })
  }
}
