// `GET /api/operador/codeoscopic/reproceso?limite=50` — vuelve a leer las respuestas REALES
// guardadas (`tarificaciones.respuesta`) con el lector de HOY y las compara con lo que se
// guardó (`tarificacion_precios`). Gratis: no llama al vendor. Solo lectura.
//
// Para qué: tras tocar `respuesta.ts` (o lo que lea precios), las diferencias son lo que ese
// cambio hará distinto en pantalla, medido sobre cotizaciones de verdad (ver `reproceso.ts`).
// No devuelve la respuesta cruda (lleva datos personales): solo diferencias y reparos.
// Y `coberturasNuevas`: nombres de cobertura que el catálogo no reconoce ni excluye a propósito
// (`nombresNuevosSinCatalogo`). El vocabulario del vendor es cerrado; uno nuevo se decide a mano.
import { NextResponse } from 'next/server'
import { operadorAutorizado } from '@/lib/operador'
import { correduriaUnica } from '@/lib/cartera'
import { prisma } from '@/lib/tenant'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { compararReproceso, type FilaGuardadaReproceso } from '@/lib/codeoscopic/reproceso'
import { nombresNuevosSinCatalogo, ramoDeCatalogo } from '@central/module-seguros'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Cabecera = { id: string; project_id_codeoscopic: string | null; creado_at: Date; ramo: string; respuesta: unknown }
type FilaPrecio = {
  tarificacion_id: string
  compania: string | null
  categoria: string | null
  modalidad: string | null
  prima_eur: number | string | null
  franquicia_eur: number | string | null
  id_precio: string | null
}

const num = (v: number | string | null) => (v === null ? null : Number.isFinite(Number(v)) ? Number(v) : null)

export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const bruto = Number(new URL(req.url).searchParams.get('limite') ?? '50')
  const limite = Number.isFinite(bruto) ? Math.min(200, Math.max(1, Math.trunc(bruto))) : 50

  const correduria = await correduriaUnica().catch(() => null)
  if (!correduria) return NextResponse.json({ estado: 'error', causa: 'sin_correduria' }, { status: 503 })

  try {
    const cabeceras = await prisma.$queryRaw<Cabecera[]>`
      select id::text as id, project_id_codeoscopic, creado_at, ramo, respuesta
      from tarificaciones
      where correduria_id = ${correduria.id}::uuid and simulado = false and respuesta is not null
      order by creado_at desc
      limit ${limite}`
    const [{ sinRespuesta }] = await prisma.$queryRaw<{ sinRespuesta: bigint }[]>`
      select count(*) as "sinRespuesta" from tarificaciones
      where correduria_id = ${correduria.id}::uuid and simulado = false and respuesta is null`
    const ids = cabeceras.map((c) => c.id)
    const filas = ids.length === 0 ? [] : await prisma.$queryRaw<FilaPrecio[]>`
      select tarificacion_id::text as tarificacion_id, compania, categoria, modalidad, prima_eur, franquicia_eur, id_precio
      from tarificacion_precios
      where tarificacion_id = any(${ids}::uuid[])`
    const porCabecera = new Map<string, FilaGuardadaReproceso[]>()
    for (const f of filas) {
      const g: FilaGuardadaReproceso = {
        compania: f.compania, categoria: f.categoria, modalidad: f.modalidad,
        primaEur: num(f.prima_eur), franquiciaEur: num(f.franquicia_eur), idPrecio: f.id_precio,
      }
      porCabecera.set(f.tarificacion_id, [...(porCabecera.get(f.tarificacion_id) ?? []), g])
    }

    const detalle = cabeceras.map((c) => ({
      cotizacionId: c.id,
      projectId: c.project_id_codeoscopic,
      ramo: c.ramo,
      creadaEn: c.creado_at.toISOString(),
      ...compararReproceso(c.respuesta, porCabecera.get(c.id) ?? []),
    }))
    const nombres = await prisma.$queryRaw<{ ramo: string; nombre: string; veces: bigint }[]>`
      select t.ramo, e->>'nombre' as nombre, count(*) as veces
      from tarificacion_precios p
      join tarificaciones t on t.id = p.tarificacion_id
      cross join lateral jsonb_array_elements(p.coberturas->'lista') e
      where t.correduria_id = ${correduria.id}::uuid and jsonb_typeof(p.coberturas->'lista') = 'array'
      group by 1, 2`
    const coberturasNuevas = nombres.flatMap((n) => {
      const ramo = ramoDeCatalogo(n.ramo)
      if (!ramo || typeof n.nombre !== 'string') return []
      return nombresNuevosSinCatalogo(ramo, [n.nombre]).map((nombre) => ({ ramo, nombre, veces: Number(n.veces) }))
    })

    return NextResponse.json({
      estado: 'ok',
      coberturasNuevas,
      revisadas: detalle.length,
      // Las anteriores al 29/09/2026 no guardaban la respuesta: no se pueden re-procesar, y se dice.
      sinRespuesta: Number(sinRespuesta),
      ilegibles: detalle.filter((d) => d.estado === 'ilegible').length,
      conDiferencias: detalle.filter((d) => d.estado === 'ok' && d.diferencias.length > 0).length,
      conReparos: detalle.filter((d) => d.estado === 'ok' && d.reparos.length > 0).length,
      detalle: detalle.filter((d) => d.estado !== 'ok' || d.diferencias.length > 0 || d.reparos.length > 0),
    })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/codeoscopic/reproceso', e) }, { status: 500 })
  }
}
