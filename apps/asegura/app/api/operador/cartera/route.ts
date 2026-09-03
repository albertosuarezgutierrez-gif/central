import { NextResponse } from 'next/server'
import { parseFiltroCartera } from '@central/module-seguros'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { listarCartera } from '@/lib/cartera-filtro'

export const dynamic = 'force-dynamic'

// GET /api/operador/cartera?grupo=&ramo=&sinRamo=&compania=&estado=&provincia=&vence=&canal=&q=&pagina=&porPagina=
//
// El LISTADO FILTRABLE de la cartera (read-only). Este puerto es la trastienda:
// la pantalla vive en `apps/plataforma` → `/correduria`, que es la única que
// mira Alberto. Aquí solo se consulta; no se escribe nada y no se gasta dinero.
//
// Tres estados, nunca dos: «sin conectar» no puede leerse como «no hay nadie».
// Una lista vacía con estado 'ok' sí significa que no hay ningún cliente que
// cumpla el filtro.
//
// El parseo del filtro NO se hace aquí: es `parseFiltroCartera` de
// `@central/module-seguros`, compartido con plataforma, para que las dos partes
// entiendan exactamente lo mismo. De ahí salen también `descartados` (los
// valores que venían en la URL y no se han entendido) y `buscable` (si el texto
// tenía letras suficientes para buscar): los dos VIAJAN en la respuesta porque
// un filtro ignorado en silencio devuelve una lista más ancha de la pedida y
// tiene el mismo aspecto que haber funcionado.
export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const { filtro, descartados, buscable } = parseFiltroCartera(new URL(req.url).searchParams)
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar' })
    const correduria = await correduriaUnica()
    if (!correduria) {
      return NextResponse.json({ estado: 'error', causa: 'sin_correduria' })
    }
    const { total, clientes, facetas, truncado } = await listarCartera(correduria.id, filtro)
    return NextResponse.json({
      estado: 'ok',
      total,
      pagina: filtro.pagina,
      porPagina: filtro.porPagina,
      buscable,
      descartados,
      clientes,
      facetas,
      // Cota de seguridad: hoy no muerde (máximo medido 20 pólizas por cliente y
      // 52 provincias), pero si mordiera la respuesta lo dice en vez de dar una
      // lista recortada con pinta de completa.
      truncado,
    })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/cartera', e) })
  }
}
