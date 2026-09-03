import { NextRequest, NextResponse } from 'next/server'
import { describirFiltro, parseFiltroCartera } from '@central/module-seguros'
import { getSession } from '@/lib/session'
import { construirCsv, interpretarLista, pedirCartera, type ClienteListado } from '@/lib/cartera-lista-asegura'

export const dynamic = 'force-dynamic'
// Un CSV del conjunto filtrado son hasta 10 páginas contra el puerto de
// asegura; con los 10 s por defecto se cortaría a mitad y el navegador se
// bajaría media lista sin decirlo.
export const maxDuration = 60

/**
 * Proxy del LISTADO de cartera hacia el puerto de asegura
 * (`GET /api/operador/cartera`). Read-only, y el filtro se reenvía TAL CUAL:
 * el vocabulario lo define `@central/module-seguros` y lo parsean los dos
 * lados igual — si esta ruta reinterpretara los parámetros, la lista servida
 * podría no ser la pedida sin que nada fallara.
 *
 * Con `formato=csv` devuelve el CSV del conjunto FILTRADO (no de la página
 * que se está viendo), paginando hasta agotar con un tope duro.
 */

/** Tope duro de filas exportadas. Los leads son ~29.860 fichas: sin tope, un
 *  clic en «Descargar» son 150 llamadas al puerto y un fichero que nadie abre. */
const TOPE_CSV = 2000
const POR_PAGINA_CSV = 200
/** Cinturón: 2000/200 = 10 páginas. Si el puerto devolviera siempre lo mismo,
 *  esto es lo que impide el bucle infinito. */
const MAX_PAGINAS = 12

function sinSesion() {
  return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
}

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return sinSesion()

  const entrada = new URL(req.url).searchParams
  const csv = entrada.get('formato') === 'csv'

  // El `formato` es de esta ruta, no del puerto: no se reenvía.
  const params = new URLSearchParams(entrada)
  params.delete('formato')

  if (!csv) {
    const r = await pedirCartera(params.toString())
    // Se devuelve la respuesta del puerto TAL CUAL (status incluido): quien la
    // interpreta es `interpretarLista` en la pantalla, y un error tiene que
    // llegar como error y no como una lista vacía.
    return NextResponse.json(r.json ?? { estado: 'error', motivo: 'respuesta_ilegible' }, { status: r.status })
  }

  // ── CSV: el conjunto filtrado, no la página ───────────────────────────────
  const descripcion = describirFiltro(parseFiltroCartera(params).filtro)
  const clientes: ClienteListado[] = []
  let total: number | null = null
  let truncado = false
  let ilegibles = 0

  params.set('porPagina', String(POR_PAGINA_CSV))
  for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
    params.set('pagina', String(pagina))
    const r = await pedirCartera(params.toString())
    const lista = interpretarLista(r.status, r.json)
    // 🚨 Un fallo a mitad NO se sirve como CSV corto: un fichero con la mitad
    // de la cartera y sin avisar es peor que no descargar nada, porque fuera
    // del navegador se lee como la lista completa.
    if (lista.estado !== 'ok') {
      return NextResponse.json(lista, { status: lista.estado === 'sin_configurar' ? 503 : 502 })
    }
    total = lista.total
    ilegibles += lista.ilegibles
    for (const c of lista.clientes) {
      if (clientes.length >= TOPE_CSV) { truncado = true; break }
      clientes.push(c)
    }
    if (truncado) break
    if (lista.clientes.length + lista.ilegibles < POR_PAGINA_CSV) break
    if (clientes.length >= lista.total) break
    if (pagina === MAX_PAGINAS) truncado = true
  }

  let cuerpo = construirCsv(descripcion, clientes, { total, truncado, tope: TOPE_CSV })
  if (ilegibles > 0) {
    // Las fichas que no se pudieron leer se DICEN en el propio fichero: si no,
    // el recuento del CSV no cuadra con el de la pantalla y nadie sabe por qué.
    cuerpo += `\r\n\r\n${ilegibles} ficha(s) llegaron sin identificador y no se han podido exportar.`
  }

  const nombre = `cartera-asegura-${new Date().toISOString().slice(0, 10)}.csv`
  return new NextResponse(`\uFEFF${cuerpo}`, {
    status: 200,
    headers: {
      // El BOM de arriba es lo que hace que Excel abra los acentos bien.
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Cache-Control': 'no-store',
    },
  })
}
