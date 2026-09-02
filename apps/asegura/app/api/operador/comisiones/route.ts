import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { comisionesCartera } from '@/lib/comisiones'

export const dynamic = 'force-dynamic'

// GET ?desde=YYYY-MM-DD — comisiones de la cartera para el cuadre de plataforma
// (read-only). La respuesta conserva los TRES estados de ComisionesCartera:
// quien consume no puede confundir «puerto sin conectar» con «no hay comisiones».
//
// 🚨 Y un `error` NUNCA sale pelado: lleva su `causa` del mismo clasificador que
// las otras ocho rutas del puerto (`lib/error-cartera.ts`), porque credenciales,
// permisos, conexión, esquema y «no hay correduría» se arreglan en cinco sitios
// distintos. Hasta el 02/09/2026 esto devolvía `{estado:'error'}` a secas desde
// tres sitios y se tragaba la excepción sin loguearla: el aviso decía «no se ha
// podido leer la cartera» y la causa real (`credenciales` — la contraseña de
// `prisma_seguros` en el DATABASE_URL de Vercel ya no valía) solo se veía en los
// logs del pooler de Supabase.
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ comisiones: { estado: 'sin_configurar' } })

    const correduria = await correduriaUnica()
    // BD configurada pero sin fila de correduría: raro de verdad → error visible,
    // nunca unas comisiones a cero. Con su propia causa, porque esto se arregla en
    // la BD y no en la conexión.
    if (!correduria) {
      console.error('[cartera] operador/comisiones → sin_correduria · la BD responde y `corredurias` está vacía')
      return NextResponse.json({ comisiones: { estado: 'error', causa: 'sin_correduria' } })
    }

    const desdeParam = new URL(req.url).searchParams.get('desde')
    const desde =
      desdeParam && /^\d{4}-\d{2}-\d{2}$/.test(desdeParam)
        ? new Date(`${desdeParam}T00:00:00Z`)
        : new Date('2026-01-01T00:00:00Z')

    return NextResponse.json({ comisiones: await comisionesCartera(correduria.id, desde) })
  } catch (e) {
    // Lo que llegue hasta aquí es casi siempre `correduriaUnica()`: conexión,
    // credenciales, schema o permisos.
    return NextResponse.json({
      comisiones: { estado: 'error', causa: registrarErrorCartera('operador/comisiones', e) },
    })
  }
}
