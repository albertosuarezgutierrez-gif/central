import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { aseguraConfigurada, fuenteCartera } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { comisionesCartera, detalleError } from '@/lib/comisiones'

export const dynamic = 'force-dynamic'

// GET ?desde=YYYY-MM-DD — comisiones de la cartera para el cuadre de plataforma
// (read-only). La respuesta conserva los TRES estados de ComisionesCartera:
// quien consume no puede confundir «puerto sin conectar» con «no hay comisiones».
//
// 🚨 Y un `error` NUNCA sale pelado: lleva `motivo` y una pista sin secretos.
// Hasta el 02/09/2026 este endpoint devolvía `{estado:'error'}` a secas desde
// tres sitios distintos y se tragaba la excepción sin loguearla: el aviso decía
// «no se ha podido leer la cartera» y no había forma —ni aquí ni en los logs de
// la función— de saber si era el schema, los permisos o la fila que falta.
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ comisiones: { estado: 'sin_configurar' } })

    const correduria = await correduriaUnica()
    // BD configurada pero sin fila de correduría: raro de verdad → error
    // visible, nunca unas comisiones a cero. Y con su propio motivo, porque esto
    // se arregla en la BD y no en la conexión.
    if (!correduria) {
      console.error('[comisiones] BD conectada pero sin fila en corredurias', { fuente: fuenteCartera() })
      return NextResponse.json({
        comisiones: { estado: 'error', motivo: 'sin_correduria', detalle: `${fuenteCartera()}/sin-corredurias` },
      })
    }

    const desdeParam = new URL(req.url).searchParams.get('desde')
    const desde =
      desdeParam && /^\d{4}-\d{2}-\d{2}$/.test(desdeParam)
        ? new Date(`${desdeParam}T00:00:00Z`)
        : new Date('2026-01-01T00:00:00Z')

    return NextResponse.json({ comisiones: await comisionesCartera(correduria.id, desde) })
  } catch (e) {
    // Lo que llegue hasta aquí es casi siempre `correduriaUnica()`: conexión,
    // schema o permisos. Se loguea entero y se responde con la pista corta.
    console.error('[comisiones] el puerto no ha podido servir las comisiones', e)
    return NextResponse.json({
      comisiones: { estado: 'error', motivo: 'bd', detalle: detalleError(e, fuenteCartera()) },
    })
  }
}
