// Criterios del radar de subastas, por cuenta.
import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireEmpresaId } from '@/lib/tenant'

export const dynamic = 'force-dynamic'

/** Tanto por uno guardado → % para la UI. (No exportar: `route.ts` solo admite handlers.) */
function pct(v: unknown): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.round(n * 10000) / 100 : null
}

export async function GET() {
  let cuentaId: string
  try {
    cuentaId = await requireEmpresaId()
  } catch {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const filas = await prisma.$queryRaw<any[]>(Prisma.sql`
    SELECT * FROM subastas_criterios WHERE cuenta_id = ${cuentaId}::uuid
  `)
  const f = filas[0]
  return NextResponse.json({
    criterios: {
      activo: f?.activo ?? false,
      provincias: f?.provincias ?? [],
      palabras_clave: f?.palabras_clave ?? [],
      tipos: f?.tipos ?? [],
      precio_min: f?.precio_min == null ? null : Number(f.precio_min),
      precio_max: f?.precio_max == null ? null : Number(f.precio_max),
      descuento_min: f?.descuento_min ?? 0,
      excluir_ocupadas: f?.excluir_ocupadas ?? false,
      // Coste del dinero (art. 670 LEC). Sin declarar = se paga al contado.
      // En BD van en tanto por uno (lo que consume el módulo); al exterior
      // salen en % porque es como se teclean y se leen.
      financia_pct: pct(f?.financia_pct),
      financia_tipo_anual: pct(f?.financia_tipo_anual),
      financia_meses: f?.financia_meses == null ? null : Number(f.financia_meses),
      financia_comision: pct(f?.financia_comision),
      // Perfil de inversión (vacío / null / false = no filtra).
      municipios: f?.municipios ?? [],
      solo_unifamiliar: f?.solo_unifamiliar ?? false,
      dormitorios_min: f?.dormitorios_min == null ? null : Number(f.dormitorios_min),
      banos_min: f?.banos_min == null ? null : Number(f.banos_min),
      superficie_parcela_min: f?.superficie_parcela_min == null ? null : Number(f.superficie_parcela_min),
      requiere_piscina: f?.requiere_piscina ?? false,
    },
  })
}

export async function PUT(req: NextRequest) {
  let cuentaId: string
  try {
    cuentaId = await requireEmpresaId()
  } catch {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const b = await req.json()
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : [])
  const num = (v: unknown): number | null => {
    const n = Number(v)
    return v === null || v === '' || !Number.isFinite(n) ? null : n
  }

  // Los porcentajes llegan de la UI en % (70, 8, 1) y se guardan en tanto por
  // uno, que es lo que consume el módulo. Fuera de rango = no declarado (null),
  // nunca un valor absurdo que infle el coste en silencio.
  const tantoPorUno = (v: unknown, maxPct: number): number | null => {
    const n = num(v)
    if (n == null || n <= 0 || n > maxPct) return null
    return n / 100
  }

  // Perfil de inversión: si el cliente NO manda el campo (UI antigua), se conserva
  // el valor guardado en vez de borrarlo.
  const tiene = (k: string) => Object.prototype.hasOwnProperty.call(b, k)
  const entero = (v: unknown): number | null => {
    const n = num(v)
    return n != null && n > 0 ? Math.round(n) : null
  }
  const positivo = (v: unknown): number | null => {
    const n = num(v)
    return n != null && n > 0 ? n : null
  }

  const financiaMeses = (() => { const n = num(b.financia_meses); return n != null && n > 0 && n <= 36 ? Math.round(n) : null })()
  const comunes = {
    activo: !!b.activo, provincias: arr(b.provincias), palabras: arr(b.palabras_clave), tipos: arr(b.tipos),
    pmin: num(b.precio_min), pmax: num(b.precio_max),
    dmin: Math.max(0, Math.min(100, Number(b.descuento_min) || 0)), ocup: !!b.excluir_ocupadas,
  }

  // Perfil de inversión: SOLO entra en la consulta si el body trae alguno de sus
  // campos. Sin ellos (UI actual) la consulta es la de siempre y no nombra
  // columnas que quizá aún no existan (migración sin aplicar).
  const CAMPOS_PERFIL = ['municipios', 'solo_unifamiliar', 'dormitorios_min', 'banos_min', 'superficie_parcela_min', 'requiere_piscina']
  const conPerfil = CAMPOS_PERFIL.some(tiene)

  try {
    if (!conPerfil) {
      await prisma.$executeRaw(Prisma.sql`
      INSERT INTO subastas_criterios
        (cuenta_id, activo, provincias, palabras_clave, tipos, precio_min, precio_max, descuento_min, excluir_ocupadas,
         financia_pct, financia_tipo_anual, financia_meses, financia_comision)
      VALUES (
        ${cuentaId}::uuid, ${comunes.activo}, ${comunes.provincias}::text[], ${comunes.palabras}::text[],
        ${comunes.tipos}::text[], ${comunes.pmin}, ${comunes.pmax},
        ${comunes.dmin}, ${comunes.ocup},
        ${tantoPorUno(b.financia_pct, 100)}, ${tantoPorUno(b.financia_tipo_anual, 60)},
        ${financiaMeses},
        ${tantoPorUno(b.financia_comision, 10)}
      )
      ON CONFLICT (cuenta_id) DO UPDATE SET
        activo = EXCLUDED.activo,
        provincias = EXCLUDED.provincias,
        palabras_clave = EXCLUDED.palabras_clave,
        tipos = EXCLUDED.tipos,
        precio_min = EXCLUDED.precio_min,
        precio_max = EXCLUDED.precio_max,
        descuento_min = EXCLUDED.descuento_min,
        excluir_ocupadas = EXCLUDED.excluir_ocupadas,
        financia_pct = EXCLUDED.financia_pct,
        financia_tipo_anual = EXCLUDED.financia_tipo_anual,
        financia_meses = EXCLUDED.financia_meses,
        financia_comision = EXCLUDED.financia_comision,
        actualizado_en = now()
    `)
    } else {
      await prisma.$executeRaw(Prisma.sql`
      INSERT INTO subastas_criterios
        (cuenta_id, activo, provincias, palabras_clave, tipos, precio_min, precio_max, descuento_min, excluir_ocupadas,
         financia_pct, financia_tipo_anual, financia_meses, financia_comision,
         municipios, solo_unifamiliar, dormitorios_min, banos_min, superficie_parcela_min, requiere_piscina)
      VALUES (
        ${cuentaId}::uuid, ${comunes.activo}, ${comunes.provincias}::text[], ${comunes.palabras}::text[],
        ${comunes.tipos}::text[], ${comunes.pmin}, ${comunes.pmax},
        ${comunes.dmin}, ${comunes.ocup},
        ${tantoPorUno(b.financia_pct, 100)}, ${tantoPorUno(b.financia_tipo_anual, 60)},
        ${financiaMeses},
        ${tantoPorUno(b.financia_comision, 10)},
        ${arr(b.municipios)}::text[], ${!!b.solo_unifamiliar}, ${entero(b.dormitorios_min)}, ${entero(b.banos_min)},
        ${positivo(b.superficie_parcela_min)}, ${!!b.requiere_piscina}
      )
      ON CONFLICT (cuenta_id) DO UPDATE SET
        activo = EXCLUDED.activo,
        provincias = EXCLUDED.provincias,
        palabras_clave = EXCLUDED.palabras_clave,
        tipos = EXCLUDED.tipos,
        precio_min = EXCLUDED.precio_min,
        precio_max = EXCLUDED.precio_max,
        descuento_min = EXCLUDED.descuento_min,
        excluir_ocupadas = EXCLUDED.excluir_ocupadas,
        financia_pct = EXCLUDED.financia_pct,
        financia_tipo_anual = EXCLUDED.financia_tipo_anual,
        financia_meses = EXCLUDED.financia_meses,
        financia_comision = EXCLUDED.financia_comision,
        municipios = CASE WHEN ${tiene('municipios')} THEN EXCLUDED.municipios ELSE subastas_criterios.municipios END,
        solo_unifamiliar = CASE WHEN ${tiene('solo_unifamiliar')} THEN EXCLUDED.solo_unifamiliar ELSE subastas_criterios.solo_unifamiliar END,
        dormitorios_min = CASE WHEN ${tiene('dormitorios_min')} THEN EXCLUDED.dormitorios_min ELSE subastas_criterios.dormitorios_min END,
        banos_min = CASE WHEN ${tiene('banos_min')} THEN EXCLUDED.banos_min ELSE subastas_criterios.banos_min END,
        superficie_parcela_min = CASE WHEN ${tiene('superficie_parcela_min')} THEN EXCLUDED.superficie_parcela_min ELSE subastas_criterios.superficie_parcela_min END,
        requiere_piscina = CASE WHEN ${tiene('requiere_piscina')} THEN EXCLUDED.requiere_piscina ELSE subastas_criterios.requiere_piscina END,
        actualizado_en = now()
    `)
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    // 42703 = undefined_column: el body trae el perfil pero la migración aún no está aplicada.
    if (conPerfil && /42703|does not exist/i.test(`${e?.code ?? ''} ${e?.meta?.code ?? ''} ${e?.message ?? ''}`)) {
      return NextResponse.json(
        { error: 'Falta aplicar la migración 2026-10-28_subastas_perfil_inversion.sql: aún no existen las columnas del perfil de inversión.' },
        { status: 409 },
      )
    }
    console.error('[api/subastas/criterios]', e)
    return NextResponse.json({ error: e?.message ?? String(e) }, { status: 500 })
  }
}
