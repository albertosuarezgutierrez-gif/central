// Aviso por Telegram de las subastas nuevas que han casado.
//
// UN solo mensaje agregado por pasada (patrón de `facturas-conciliar-gmail`),
// no uno por subasta: el ruido es justo lo que hace que Alberto no lea las 200
// alertas del BOE que ya tiene sin abrir.
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { tgSend, tgSendButtons } from '@central/core-telegram'
import { prisma } from '@/lib/db'
import { isCronAuthorized } from '@/lib/cron-auth'
import { eur } from '@/lib/dinero'
import { decidirAviso, esEmpresaInmobiliaria, umbralesPuja } from '@central/module-subastas'
import { RADAR_CON_CORPUS, RADAR_VIGENTE } from '@/lib/subastas-radar'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MAX_EN_MENSAJE = 10
/** Los matches que llevan más de esto sin avisar se silencian: son backfill. */
const DIAS_FRESCURA = 2

/**
 * Señal ANTICIPADA: promotoras/inmobiliarias en concurso de acreedores en las
 * provincias vigiladas. Sus inmuebles suelen acabar en subasta o liquidación
 * meses después — enterarse hoy da ventaja. Ventana de 1 día (el cron es
 * diario): sin estado extra que deduplicar.
 */
async function avisarAntesalaConcursal(): Promise<number> {
  const provincias = await prisma.$queryRaw<Array<{ p: string }>>(Prisma.sql`
    SELECT DISTINCT unnest(provincias) AS p FROM subastas_criterios WHERE activo = true
  `)
  if (!provincias.length) return 0

  const eventos = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT empresa, provincia, fecha, url FROM borme_eventos
    WHERE tipo = 'concurso'
      AND created_at >= now() - interval '1 day'
      AND provincia = ANY(${provincias.map((x) => x.p)}::text[])
    ORDER BY fecha DESC
    LIMIT 50
  `)
  const inmobiliarias = eventos.filter((e) => esEmpresaInmobiliaria(e.empresa))
  if (!inmobiliarias.length) return 0

  const lineas = [`🏗️ <b>Antesala de subastas</b> — ${inmobiliarias.length} empresa${inmobiliarias.length > 1 ? 's' : ''} del ladrillo en concurso en tus provincias`, '']
  for (const e of inmobiliarias.slice(0, 6)) {
    lineas.push(`• <b>${escapar(e.empresa)}</b> (${escapar(e.provincia ?? '—')})`)
  }
  lineas.push('', '<i>Sus inmuebles pueden acabar en subasta o liquidación en los próximos meses.</i>')
  await tgSend(lineas.join('\n'), { html: true }).catch(() => {})
  return inmobiliarias.length
}

function escapar(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function GET(req: NextRequest) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const pendientes = await prisma.$queryRaw<any[]>(Prisma.sql`
      SELECT r.id, r.cuenta_id, r.dedupe_key, r.subasta, r.puntuacion, r.coste_total, r.descuento,
             COALESCE(s.fecha_fin, r.fecha_fin) AS fecha_fin,
             -- 🚨 Sin esta columna, p.valor_orientativo llegaba SIEMPRE undefined y
             -- la guarda de decidirAviso (no interrumpir con una rentabilidad
             -- calculada sobre la mediana de todo el municipio) nunca se disparaba.
             s.valor_orientativo,
             -- Cargas ya leídas de los documentos: lo que hereda el adjudicatario
             -- es la diferencia entre un chollo y una ruina, así que va EN el aviso,
             -- no escondido en la ficha.
             s.cargas AS cargas_subsistentes, s.cargas_fuente, s.semaforo, s.identificador,
             s.cargas_conocidas, s.lector_version, s.analisis, s.flip_apto, s.margen_flip_pct, s.es_playa,
             -- Umbrales de aprobación del remate en el propio aviso: el 70% es
             -- del VALOR DE SUBASTA (no de la deuda), y la deuda marca hasta
             -- dónde puja el ejecutante sin desembolso.
             s.tipo AS tipo_subasta, s.valor_subasta, s.cantidad_reclamada
      ${RADAR_CON_CORPUS}
      WHERE r.avisado_at IS NULL
        AND ${RADAR_VIGENTE}
        AND r.created_at >= now() - make_interval(days => ${DIAS_FRESCURA}::int)
      ORDER BY r.puntuacion DESC NULLS LAST, r.created_at DESC
    `)

    if (!pendientes.length) {
      // Backfill viejo: se marca como avisado sin mandar nada, para no soltar
      // una ráfaga la primera vez que se enciende el radar.
      const silenciados = await prisma.$executeRaw(Prisma.sql`
        UPDATE subastas_radar SET avisado_at = now()
        WHERE avisado_at IS NULL AND created_at < now() - make_interval(days => ${DIAS_FRESCURA}::int)
      `)
      return NextResponse.json({ ok: true, avisados: 0, silenciados: Number(silenciados) })
    }

    // Un mensaje POR SUBASTA con botones [👀 Seguir][🚫 Descartar]: el volumen
    // diario real es de 0-4, así que no es ruido, y la decisión de Alberto
    // queda registrada (el descarte alimenta el aprendizaje). Si un día llega
    // una avalancha, el resto va agregado como antes.
    // Política de Alberto (30/07/2026): solo interrumpen las RENTABLES y LIMPIAS.
    // Lo que hereda cargas, está ocupado o es un proindiviso se queda en /subastas
    // sin sonar; lo que todavía no se ha leído ESPERA a la pasada del lector (y
    // sigue pendiente de aviso), salvo que esté a punto de cerrar.
    const decisiones = pendientes.map((p) => {
      const fin = p.fecha_fin ? new Date(p.fecha_fin).getTime() : null
      const dias = fin == null ? null : Math.ceil((fin - Date.now()) / 86_400_000)
      // El SQL ya deja fuera lo cerrado; esto es el segundo cerrojo. `dias` NO
      // sirve para detectarlo: `Math.ceil` de unas horas negativas da 0, que es
      // justo el valor que `decidirAviso` lee como «urgentísima, avisa aunque no
      // esté verificada» — una subasta vencida se colaría como la más urgente.
      const cerrada = fin != null && fin < Date.now()
      const claves = Array.isArray(p.analisis) ? p.analisis.map((x: any) => x?.clave).filter(Boolean) : []
      return {
        p,
        d: decidirAviso({
          // Rentabilidad: el radar ya casó criterios, y las lentes marcan flip/playa.
          rentable: true,
          // …pero «rentable» se calculó contra un valor de mercado que a veces
          // es la mediana de una ciudad entera. Eso no basta para interrumpir.
          valorOrientativo: p.valor_orientativo === true,
          semaforo: p.semaforo ?? null,
          cargasSubsistentes: p.cargas_subsistentes == null ? null : Number(p.cargas_subsistentes),
          cargasConocidas: p.cargas_conocidas ?? false,
          documentosLeidos: (p.lector_version ?? 0) > 0,
          diasParaCierre: dias,
          cerrada,
          claves,
        }),
      }
    })

    const aAvisar = decisiones.filter((x) => x.d.decision === 'avisar')
    const silenciadas = decisiones.filter((x) => x.d.decision === 'silenciar')
    const esperando = decisiones.filter((x) => x.d.decision === 'esperar')

    for (const { p, d } of aAvisar.slice(0, MAX_EN_MENSAJE)) {
      const s = p.subasta ?? {}
      const punt = p.puntuacion == null ? 'sin datos para puntuar' : `${p.puntuacion}/100`
      const coste = p.coste_total == null ? null : eur(Number(p.coste_total))
      const cierre = p.fecha_fin ? new Date(p.fecha_fin).toLocaleDateString('es-ES') : null

      const lineas = [`⚖️ <b>${escapar(s.identificador ?? p.dedupe_key)}</b> — ${punt}`]
      if (s.descripcion) lineas.push(escapar(String(s.descripcion).slice(0, 160)))
      // «coste estimado» a secas se confundía con una valoración: es el coste
      // puerta abierta simulando el remate a la salida (mismo criterio que la ficha).
      const pie = [s.provincia, coste ? `coste a la salida ${coste}` : null, cierre ? `cierra ${cierre}` : null]
        .filter(Boolean)
        .join(' · ')
      if (pie) lineas.push(`<i>${escapar(pie)}</i>`)

      // Cargas que hereda quien se lo adjudique, leídas de la certificación. Es
      // el dato que convierte un «descuento del 55%» en una pérdida, así que se
      // dice en el aviso y con su procedencia (OCR o texto).
      // Cuánto hay que pujar de verdad: umbral de aprobación directa (70% del
      // valor de subasta en la judicial) y la deuda reclamada.
      const u = umbralesPuja({
        dedupeKey: p.dedupe_key,
        fuente: 'boe',
        tipo: p.tipo_subasta,
        valorSubasta: p.valor_subasta == null ? null : Number(p.valor_subasta),
        cantidadReclamada: p.cantidad_reclamada == null ? null : Number(p.cantidad_reclamada),
      })
      const directa = u.umbrales.find((x) => x.clave === 'aprobacion_directa')
      const trozos = [
        directa ? `aprobación directa desde ${eur(directa.importe)} (${Math.round((directa.pct ?? 0) * 100)}% del tipo)` : null,
        u.cantidadReclamada != null ? `deuda reclamada ${eur(u.cantidadReclamada)}` : null,
      ].filter(Boolean)
      if (trozos.length) lineas.push(`⚖️ ${escapar(trozos.join(' · '))}`)

      const subsistentes = p.cargas_subsistentes == null ? null : Number(p.cargas_subsistentes)
      if (subsistentes != null && subsistentes > 0) {
        const via = p.cargas_fuente === 'ocr_ia' ? ' (leído del escaneo por IA)' : ''
        lineas.push(`🚨 <b>Hereda cargas por ${escapar(eur(subsistentes))}</b>${via} — súmalas al coste`)
      } else if (subsistentes === 0) {
        lineas.push('✅ Sin cargas subsistentes según la certificación')
      }
      // Honestidad sobre lo que se ha comprobado: si el plazo obligó a avisar sin
      // haber leído la documentación, se dice en el propio mensaje.
      if (d.sinVerificar) lineas.push('⏳ <b>Documentación SIN verificar</b> — cierra pronto y avisa igualmente')
      if (s.url) lineas.push(escapar(s.url))

      // Tercer botón: el «siguiente paso» que pidió Alberto (30/07/2026). En vez
      // de tener que abrir el portal y buscar a quién preguntar, el agente redacta
      // la consulta al juzgado con las dudas concretas de ESTA subasta.
      await tgSendButtons(lineas.join('\n'), [
        [
          { texto: '👀 Seguir', callback: `subr:seguir:${p.id}` },
          { texto: '🚫 Descartar', callback: `subr:desc:${p.id}` },
        ],
        [{ texto: '📝 Preparar consulta al juzgado', callback: `subn:consulta:${p.id}` }],
      ]).catch(() => {})
    }
    if (aAvisar.length > MAX_EN_MENSAJE) {
      await tgSend(`⚖️ …y ${aAvisar.length - MAX_EN_MENSAJE} subastas limpias más en /subastas`, { html: true }).catch(() => {})
    }
    // Las descartadas NO se enumeran una a una (sería el ruido que se quiere
    // evitar), pero se dice cuántas y por qué en una línea: si el filtro se pasa
    // de estricto, se nota enseguida.
    if (silenciadas.length) {
      const motivos = [...new Set(silenciadas.map((x) => x.d.motivo))].slice(0, 3)
      await tgSend(
        `🔇 ${silenciadas.length} ${silenciadas.length === 1 ? 'subasta' : 'subastas'} no ${silenciadas.length === 1 ? 'pasa' : 'pasan'} el filtro de «rentable y limpia» (${motivos.join('; ')}). Están en /subastas.`,
        { html: true },
      ).catch(() => {})
    }

    // Solo se marcan como avisadas las que de verdad han sonado o se han
    // descartado: las que ESPERAN al lector deben volver a evaluarse mañana, ya
    // con su documentación leída. Marcarlas aquí las perdería para siempre.
    const cerradas = [...aAvisar, ...silenciadas].map((x) => x.p.id)
    if (cerradas.length) {
      await prisma.$executeRaw(Prisma.sql`
        UPDATE subastas_radar SET avisado_at = now()
        WHERE id = ANY(${cerradas}::uuid[])
      `)
    }

    const antesala = await avisarAntesalaConcursal().catch(() => 0)

    // La misma finca que vuelve más barata tras quedar desierta: no pasa por el
    // filtro de «nuevas del radar» porque no es nueva, es una segunda vuelta.
    const { avisarReapariciones } = await import('@/lib/subastas/reapariciones')
    const reapariciones = await avisarReapariciones().catch((e) => {
      console.error('[subastas-avisos] reapariciones', e)
      return { detectadas: 0, avisadas: 0 }
    })

    return NextResponse.json({
      ok: true,
      avisados: aAvisar.length,
      silenciados: silenciadas.length,
      // Vuelven mañana, ya con la documentación leída.
      esperandoLector: esperando.length,
      antesala,
      reapariciones,
    })
  } catch (e: any) {
    console.error('[subastas-avisos]', e)
    return NextResponse.json({ ok: false, error: e?.message ?? String(e) }, { status: 200 })
  }
}
