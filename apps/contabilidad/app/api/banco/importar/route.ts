import { NextResponse } from 'next/server'
import { leerContexto } from '@/lib/contexto'
import { conRepo } from '@/lib/db'
import { cabecerasDeCsv, importarExtractos, leerExtracto, MAX_TEXTO_EXTRACTO } from '@/lib/banco'

// POST /api/banco/importar { accion: 'cabeceras' | 'importar', formato: 'norma43' | 'csv', texto, mapeo?, cuentaRef? }
//   · cabeceras: solo CSV; devuelve separador, cabeceras y un mapeo sugerido (no guarda nada).
//   · importar: lee el fichero y guarda los movimientos NUEVOS (los ya importados se cuentan como repetidos).
// El fichero llega como texto (máx. 3 MB) y NO se almacena: solo sus movimientos.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const c = await leerContexto()
  if (!c) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b.texto !== 'string' || b.texto.length > MAX_TEXTO_EXTRACTO) return NextResponse.json({ error: 'datos_no_validos', errores: ['fichero obligatorio (máx. 3 MB)'] }, { status: 400 })
  if (b.accion === 'cabeceras') return NextResponse.json(cabecerasDeCsv(b.texto))
  if (b.formato !== 'norma43' && b.formato !== 'csv') return NextResponse.json({ error: 'datos_no_validos', errores: ['formato: norma43 o csv'] }, { status: 400 })
  const cuentaRef = typeof b.cuentaRef === 'string' ? b.cuentaRef.trim().slice(0, 60) : undefined
  const lec = leerExtracto({ formato: b.formato, texto: b.texto, mapeo: b.mapeo as never, cuentaRef })
  if (!lec.ok) return NextResponse.json({ error: 'fichero_no_valido', errores: lec.errores }, { status: 422 })
  const r = await conRepo(c.empresaId, (repo) => importarExtractos(repo, lec.extractos, { origen: b.formato as 'norma43' | 'csv', cuentaRef }, { usuarioId: c.usuarioId, hoy: new Date() }), { timeout: 30_000 })
  if (!r.ok) return NextResponse.json({ error: 'importacion_no_valida', errores: r.errores }, { status: 422 })
  return NextResponse.json({ nuevos: r.nuevos, repetidos: r.repetidos, avisos: [...lec.avisos, ...r.descartados] }, { status: 201 })
}
