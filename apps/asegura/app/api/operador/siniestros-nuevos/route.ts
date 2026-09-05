import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada, prismaAsegura } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Los siniestros que han ENTRADO en la cartera desde un instante dado, para el
 * vigía `correduria-siniestros` de plataforma (que avisa a Alberto por Telegram
 * para que llame al cliente y le haga seguimiento).
 *
 *   GET ?desde=<ISO>&limite=<n>
 *     → { estado:'ok', siniestros: [...], total }
 *
 * `siniestros` viene ordenado por `created_at` ASCENDENTE y recortado a
 * `limite`; `total` es cuántos casan el filtro (para que quien llama sepa si se
 * ha quedado corto). Sin `desde` devuelve la cartera entera: es la PRIMERA
 * pasada del vigía, que solo sirve para anclar su marca de agua y NO avisa de
 * nada (los 67 del volcado no pueden salir en un Telegram).
 *
 * 🚨 El eje es `created_at` (cuándo entró aquí), NO `fecha_hora` (cuándo
 * ocurrió). No son lo mismo: hay siniestros de agosto de 2025 que CIMA nos
 * mandó en junio de 2026. Con la fecha del hecho, un siniestro viejo que la
 * compañía manda hoy —justo el que la correduría no conoce— nacería por debajo
 * de la marca y no sonaría jamás.
 *
 * 🚨 Lo que NO sale a propósito: tramitador y perito (gestión interna, regla de
 * visibilidad del 03/09/2026) y cualquier campo cifrado. Para llamar al cliente
 * hacen falta su nombre, la compañía, la póliza, cuándo pasó y la referencia.
 */
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const q = new URL(req.url).searchParams
  const desdeTexto = (q.get('desde') ?? '').trim()
  const desde = desdeTexto === '' ? null : new Date(desdeTexto)
  // Una fecha ilegible NO se ignora en silencio: ignorarla devolvería la
  // cartera entera, que aguas arriba se leería como «han entrado 67 hoy».
  if (desde !== null && Number.isNaN(desde.getTime())) {
    return NextResponse.json({ estado: 'invalido', motivo: 'desde no es una fecha' }, { status: 422 })
  }
  const limiteBruto = Number(q.get('limite') ?? '50')
  const limite = Number.isFinite(limiteBruto) ? Math.min(500, Math.max(0, Math.trunc(limiteBruto))) : 50

  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' })

    const db = prismaAsegura()
    // Inclusivo (`gte`) a propósito: quien llama desempata por id. Con un `>`
    // estricto, dos filas grabadas en el mismo instante perderían la segunda.
    //
    // Y SOLO los de CIMA. Un `gestionado_correduria` lo ha abierto Alberto desde
    // la ficha: avisarle de su propia acción es ruido, y además el aviso dice
    // «ya está abierto en la compañía» — cierto de los de CIMA y FALSO de los
    // nuestros, que pueden estar todavía sin comunicar. Mezclarlos convertiría
    // el aviso en una afirmación equivocada sobre la cobertura de un cliente.
    const where = {
      correduriaId: correduria.id,
      origen: 'cima' as const,
      ...(desde ? { createdAt: { gte: desde } } : {}),
    }
    const [total, filas] = await Promise.all([
      db.siniestro.count({ where }),
      db.siniestro.findMany({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        take: limite,
        select: {
          id: true,
          createdAt: true,
          fechaHora: true,
          referencia: true,
          idSiniestroEntidad: true,
          clienteId: true,
          polizaId: true,
          cliente: { select: { nombre: true, apellidos: true } },
          poliza: { select: { numeroPoliza: true, aseguradora: true } },
        },
      }),
    ])

    return NextResponse.json({
      estado: 'ok',
      total,
      siniestros: filas.map(s => ({
        id: s.id,
        entradoEn: s.createdAt.toISOString(),
        ocurridoEn: s.fechaHora ? s.fechaHora.toISOString().slice(0, 10) : null,
        // Nombre y apellidos van EN CLARO en la cartera; un nombre vacío se
        // queda en `null` y quien pinta lo declara, nunca «Cliente desconocido».
        cliente: `${s.cliente.nombre} ${s.cliente.apellidos}`.trim() || null,
        clienteId: s.clienteId,
        polizaId: s.polizaId,
        poliza: s.poliza.numeroPoliza,
        compania: s.poliza.aseguradora || null,
        // La referencia de la compañía es la llave para preguntar por él; si
        // solo consta la de la entidad, vale igual.
        referencia: s.referencia ?? s.idSiniestroEntidad,
      })),
    })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/siniestros-nuevos', e) })
  }
}
