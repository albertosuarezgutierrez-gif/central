// Lo que ha casado con los criterios de la cuenta. `descartar` alimenta el
// aprendizaje futuro de criterios (mismo espíritu que `banca_destino_reglas`).
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireEmpresaId } from '@/lib/tenant'
import { RADAR_CON_CORPUS, RADAR_VIGENTE } from '@/lib/subastas-radar'
import { caducidadDeFila } from '@/lib/subastas/caducidad-fila'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  let cuentaId: string
  try {
    cuentaId = await requireEmpresaId()
  } catch {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const soloNuevos = new URL(req.url).searchParams.get('no_vistos') === '1'
  const filtro = soloNuevos ? Prisma.sql`AND r.visto = false` : Prisma.empty

  // `RADAR_VIGENTE` deja fuera lo ya cerrado: la bandeja es de cosas que aún
  // se pueden pujar, no un histórico (para eso está el corpus).
  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT r.id, r.dedupe_key, r.subasta, r.puntuacion, r.motivos, r.avisos, r.coste_total,
           r.descuento, r.visto, r.descartado, COALESCE(s.fecha_fin, r.fecha_fin) AS fecha_fin,
           r.created_at,
           -- 🚨 La documentación viaja con la fila. Sin estas columnas este
           -- endpoint devolvía el anuncio PELADO, y como la pantalla recarga la
           -- bandeja por aquí al marcar «visto», la misma ficha que acababa de
           -- decir «El BOE SÍ publica la certificación» pasaba a decir «la ficha
           -- del BOE todavía no se ha revisado» con solo tocarla (20/08/2026).
           s.semaforo, s.analisis, s.notas_edicto, s.documentos, s.documentos_muro, s.documentos_sesion, s.cargas_detalle
    ${RADAR_CON_CORPUS}
    WHERE r.cuenta_id = ${cuentaId}::uuid AND ${RADAR_VIGENTE} ${filtro}
    ORDER BY r.puntuacion DESC NULLS LAST, r.created_at DESC
    LIMIT 200
  `)

  const anuncios = filas.map(({ semaforo, analisis, notas_edicto, documentos, documentos_muro, documentos_sesion, cargas_detalle, ...r }) => ({
    ...r,
    doc: {
      semaforo: semaforo ?? null,
      analisis: analisis ?? null,
      notasEdicto: notas_edicto ?? null,
      documentos: documentos ?? null,
      documentosMuro: documentos_muro ?? null,
      documentosSesion: documentos_sesion ?? null,
      caducidad: caducidadDeFila(cargas_detalle),
    },
  }))

  // El contador va por el MISMO filtro: un badge que cuenta subastas cerradas
  // manda a Alberto a una bandeja donde no hay nada que hacer.
  const noVistos = await prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
    SELECT COUNT(*)::int AS n
    ${RADAR_CON_CORPUS}
    WHERE r.cuenta_id = ${cuentaId}::uuid AND r.visto = false AND ${RADAR_VIGENTE}
  `)

  return NextResponse.json({ anuncios, no_vistos: noVistos[0]?.n ?? 0 })
}

export async function POST(req: NextRequest) {
  let cuentaId: string
  try {
    cuentaId = await requireEmpresaId()
  } catch {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { id, accion } = await req.json()
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const campo =
    accion === 'descartar'
      ? Prisma.sql`descartado = true, visto = true`
      : Prisma.sql`visto = true`

  await prisma.$executeRaw(Prisma.sql`
    UPDATE subastas_radar SET ${campo}
    WHERE id = ${id}::uuid AND cuenta_id = ${cuentaId}::uuid
  `)
  return NextResponse.json({ ok: true })
}
