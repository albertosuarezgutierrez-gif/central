// Importación de empleados desde CSV (UTF-8, «;» o «,»). POST multipart `archivo` + `modo`:
//  - `previa`    → valida cada fila (mismas reglas del asistente) y marca duplicados. No escribe nada.
//  - `confirmar` → vuelve a leer y validar EL MISMO fichero en el servidor (la vista previa del navegador no se cree) y da
//                  de alta SOLO las filas válidas, en UNA transacción (`darDeAltaLote`).
// `empresa_id` SIEMPRE de getSesion(); nunca del formulario. 🚨 Ni el fichero ni sus filas van a logs.
// 🚨 SOLO CSV: no se LEE ningún .xlsx subido (xlsx@0.18.5, CVE-2023-30533: contaminación de prototipo en la instancia
// caliente, que atiende a todas las empresas). Volverá con xlsx ≥0.20.3. Un ZIP/.xlsx/.xls/.ods se rechaza con 422.
import { NextResponse } from 'next/server'
import { getSesion, AuthError } from '@/lib/tenant'
import { listarTablasConvenio, convenioDeEmpresa } from '@/lib/convenio-tablas-repo'
import { hoyMadrid } from '@/lib/fecha-madrid'
import { LIMITE_BYTES, leerCsvSubido, prepararImportacion, tablaDesdeMatriz } from '@/lib/importar-empleados'
import { darDeAltaLote, identidadesDeEmpresa } from '@/lib/alta-empleado-repo'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(req: Request) {
  let empresa_id: string
  try { ({ empresa_id } = await getSesion()) } catch (e) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 })
    throw e
  }
  const largo = Number(req.headers.get('content-length') ?? 0)
  if (largo > LIMITE_BYTES + 64 * 1024) return NextResponse.json({ error: 'Fichero demasiado grande (máx. 2 MB)' }, { status: 413 })
  const form = await req.formData().catch(() => null)
  const archivo = form?.get('archivo')
  const modo = form?.get('modo')
  if (!(archivo instanceof File)) return NextResponse.json({ error: 'Falta el fichero' }, { status: 400 })
  if (modo !== 'previa' && modo !== 'confirmar') return NextResponse.json({ error: 'Modo inválido' }, { status: 400 })
  if (archivo.size > LIMITE_BYTES) return NextResponse.json({ error: 'Fichero demasiado grande (máx. 2 MB)' }, { status: 413 })

  let matriz: unknown[][]
  try { matriz = leerCsvSubido(new Uint8Array(await archivo.arrayBuffer()), archivo.name) }
  catch (e) {
    const msg = e instanceof Error && /Formato|Excel|CSV|UTF-8/.test(e.message) ? e.message : 'No se pudo leer el fichero'
    return NextResponse.json({ error: msg }, { status: 422 })
  }

  // Tablas del convenio: si fallan, la importación sigue sin proponer salario («no se sabe», nunca 0).
  const [tablas, convenio, ya] = await Promise.all([
    listarTablasConvenio(empresa_id).catch(() => null),
    convenioDeEmpresa(empresa_id).catch(() => null),
    identidadesDeEmpresa(empresa_id),
  ])
  const { previa, altas } = prepararImportacion(tablaDesdeMatriz(matriz), { hoy: hoyMadrid(), tablas, convenio }, ya)
  if (modo === 'previa' || !altas.length) return NextResponse.json({ previa })

  try {
    const r = await darDeAltaLote(empresa_id, altas.map(a => a.alta))
    return NextResponse.json({
      previa,
      creados: r.creados.length,
      rechazadas: r.rechazadas.map(x => ({ numero: altas[x.indice].numero, motivo: x.motivo })),
    }, { status: r.creados.length ? 201 : 200 })
  } catch (e) {
    // Solo el código del error: el mensaje de Prisma puede llevar valores de la fila.
    console.error('[importar-empleados] alta del lote fallida', (e as { code?: string })?.code ?? 'sin_codigo')
    return NextResponse.json({ error: 'No se ha dado de alta ninguna fila: error al guardar. Vuelve a intentarlo.' }, { status: 500 })
  }
}
