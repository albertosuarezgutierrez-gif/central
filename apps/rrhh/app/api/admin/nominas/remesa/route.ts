/**
 * Remesa SEPA (pain.001, propósito SALA) de las nóminas CONFIRMADAS del periodo, como descarga XML.
 *   POST { periodo, fecha_ejecucion, confirmar_repeticion? }
 * `empresa_id` SOLO de getSesion() (cepo `lib/aislamiento-nominas.test.ts`). Con cualquier problema (IBAN ausente o
 * inválido, líquido desconocido…) responde 422 con la lista de empleados afectados y NO sale fichero.
 * 🚨 Contra el DOBLE PAGO: cada nómina incluida se sella (`remesa_generada_at`). Si alguna ya tenía remesa generada responde
 * 409 con el aviso y NO sale fichero, salvo `confirmar_repeticion: true` explícito (booleano, no «truthy»). Solo POST: un GET
 * que sella se dispararía con una precarga o un enlace.
 * 🚨 Ningún IBAN a logs ni en los mensajes de error.
 */
import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { armarRemesaNominas } from '@/lib/remesa-nominas'
import { cargarDatosRemesa, sellarRemesa } from '@/lib/remesa-nominas-datos'

function hoyMadrid(ahora: Date): string {
  // en-CA formatea YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora)
}

export async function POST(req: Request) {
  let empresa_id: string
  try {
    ({ empresa_id } = await getSesion())
  } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    throw e
  }
  const cuerpo = await req.json().catch(() => ({})) as { periodo?: unknown; fecha_ejecucion?: unknown; confirmar_repeticion?: unknown }
  const { periodo } = cuerpo
  const confirmarRepeticion = cuerpo.confirmar_repeticion === true

  if (typeof periodo !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(periodo)) {
    return NextResponse.json({ error: 'periodo debe ser YYYY-MM' }, { status: 400 })
  }
  const ahora = new Date()
  const hoy = hoyMadrid(ahora)
  const fechaEjecucion = typeof cuerpo.fecha_ejecucion === 'string' && cuerpo.fecha_ejecucion ? cuerpo.fecha_ejecucion : hoy

  const datos = await cargarDatosRemesa(empresa_id, periodo)
  if (!datos.empresa) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

  const r = armarRemesaNominas({ ...datos, empresa: datos.empresa, periodo, fechaEjecucion, hoy, creadoEn: ahora })
  if (!r.ok) {
    return NextResponse.json({ error: 'No se puede generar la remesa', errores: r.errores, no_confirmadas: r.no_confirmadas }, { status: 422 })
  }

  const sello = await sellarRemesa({ empresaId: empresa_id, nominaIds: r.nomina_ids, idMensaje: r.id_mensaje, confirmarRepeticion })
  if (!sello.ok) {
    const ultima = sello.previas.map(p => p.remesa_generada_at).sort().at(-1) ?? null
    const mismoFichero = sello.previas.every(p => p.remesa_msg_id === r.id_mensaje)
    return NextResponse.json({
      error: 'remesa_ya_generada',
      aviso: `${sello.previas.length} de ${r.nomina_ids.length} nóminas ya están en una remesa generada antes. `
        + 'Si esa remesa ya se subió al banco, volver a subirla PAGA DOS VECES. Descárgala de nuevo solo si la anterior no se llegó a enviar o el banco la rechazó.',
      ya_generadas: sello.previas.length,
      total: r.nomina_ids.length,
      ultima_generacion: ultima,
      mismo_fichero: mismoFichero,
    }, { status: 409 })
  }

  return new Response(r.xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Disposition': `attachment; filename="${r.nombreFichero}"`,
      'Cache-Control': 'no-store',
      'X-Remesa-Transferencias': String(r.num_transferencias),
      'X-Remesa-Total-Centimos': String(r.total_centimos),
      'X-Remesa-No-Confirmadas': String(r.no_confirmadas),
      'X-Remesa-Id': r.id_mensaje,
      'X-Remesa-Repetida': String(sello.previas.length),
    },
  })
}
