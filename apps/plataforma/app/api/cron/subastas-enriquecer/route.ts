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
import { bajarCatastro, bajarFicha, capturarResultados } from '@/lib/subastas/enriquecer'
import { procesarDocumentos } from '@/lib/subastas/documentos'
import { clasificarSubastas } from '@/lib/subastas/clasificar'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Se reenriquece pasado este tiempo: los importes cambian durante la subasta. */
const REFRESCO_HORAS = 24

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const max = Math.min(Math.max(parseInt(new URL(req.url).searchParams.get('max') || '12', 10) || 12, 1), 40)

  try {
    // Prioridad: las que nunca se enriquecieron y las que cierran antes.
    const pendientes = await prisma.$queryRaw<{ dedupe_key: string; identificador: string | null; ref_catastral: string | null }[]>(
      Prisma.sql`
        SELECT dedupe_key, identificador, ref_catastral
        FROM subastas
        WHERE identificador IS NOT NULL
          AND (fecha_fin IS NULL OR fecha_fin >= now())
          AND (enriquecida_at IS NULL OR enriquecida_at < now() - make_interval(hours => ${REFRESCO_HORAS}::int))
        ORDER BY enriquecida_at NULLS FIRST, fecha_fin ASC NULLS LAST
        LIMIT ${max}
      `,
    )

    let ok = 0
    const fallos: string[] = []

    for (const p of pendientes) {
      try {
        const f = await bajarFicha(p.identificador!)
        // La referencia catastral puede venir del correo o aparecer en la ficha.
        const rc = p.ref_catastral
        const cat = rc ? await bajarCatastro(rc).catch(() => null) : null

        await prisma.$executeRaw(Prisma.sql`
          UPDATE subastas SET
            boe_id = COALESCE(${f.boeId}, boe_id),
            tipo = COALESCE(${f.tipo}, tipo),
            fecha_inicio = COALESCE(${f.fechaInicio}::timestamptz, fecha_inicio),
            fecha_fin = COALESCE(${f.fechaFin}::timestamptz, fecha_fin),
            valor_subasta = ${f.valorSubasta},
            tasacion = ${f.tasacion},
            puja_minima = ${f.pujaMinima},
            tramos = ${f.tramos},
            deposito = ${f.deposito},
            cantidad_reclamada = ${f.cantidadReclamada},
            lotes = COALESCE(${f.lotes}, lotes),
            situacion_posesoria = ${f.situacionPosesoria},
            arrendamiento_inscrito = ${f.arrendamientoInscrito},
            sin_visita = ${f.sinVisita},
            cargas = COALESCE(${f.cargas}, cargas),
            cargas_texto = COALESCE(${f.cargasTexto}, cargas_texto),
            -- Sticky: el true puede venir de la CERTIFICACIÓN adjunta (paso de
            -- documentos), que la ficha no refleja en su campo «Cargas».
            cargas_conocidas = (${f.cargasConocidas} OR COALESCE(cargas_conocidas, false)),
            autoridad = COALESCE(${f.autoridad}, autoridad),
            telefono_autoridad = COALESCE(${f.telefonoAutoridad}, telefono_autoridad),
            email_autoridad = COALESCE(${f.emailAutoridad}, email_autoridad),
            provincia = COALESCE(${f.provincia}, provincia),
            municipio = COALESCE(${f.localidad}, municipio),
            codigo_postal = COALESCE(${f.codigoPostal}, codigo_postal),
            direccion = COALESCE(${f.direccion}, direccion),
            -- Catastro: fuente oficial, prevalece sobre lo deducido del texto.
            superficie_catastro = COALESCE(${cat?.superficie ?? null}, superficie_catastro),
            anio_construccion = COALESCE(${cat?.anioConstruccion ?? null}, anio_construccion),
            uso_catastral = COALESCE(${cat?.uso ?? null}, uso_catastral),
            direccion_catastro = COALESCE(${cat?.direccion ?? null}, direccion_catastro),
            cuota_participacion = COALESCE(cuota_participacion, ${cat?.cuotaParticipacion ?? null}),
            enriquecida_at = now(),
            actualizado_en = now()
          WHERE dedupe_key = ${p.dedupe_key}
        `)
        ok++
      } catch (e: any) {
        fallos.push(`${p.identificador}: ${e?.message ?? e}`)
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
      return { revisadas: 0, conHallazgos: 0 }
    })

    // Lentes (flip / playa / semáforo): determinista y barato, al final para
    // que vea la fila ya enriquecida.
    const lentes = await clasificarSubastas().catch((e) => {
      console.error('[subastas-enriquecer] clasificar', e)
      return { revisadas: 0, playa: 0, flipViables: 0 }
    })

    return NextResponse.json({ ok: true, procesadas: pendientes.length, enriquecidas: ok, fallos, ...resultados, documentos, lentes })
  } catch (e: any) {
    console.error('[subastas-enriquecer]', e)
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 })
  }
}
