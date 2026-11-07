import { NextResponse } from 'next/server'
import { operadorAutorizado, noAutorizado, actorValido, textoONull } from '@/lib/http'
import { opListar, opAltaCuenta } from '@/lib/db'
import { cifValido } from '@central/core-herramientas'
import { normalizarHex } from '@/lib/marca'

// Puerto del operador: listado (solo ESTADO del servicio, nunca datos de negocio) y alta/actualización de cuenta (idempotente por CIF).
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  if (!operadorAutorizado(req)) return noAutorizado()
  return NextResponse.json({ cuentas: await opListar() })
}

export async function POST(req: Request) {
  if (!operadorAutorizado(req)) return noAutorizado()
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const actor = actorValido(b?.actor)
  const cif = cifValido(b?.cif)
  const razon = textoONull(b?.razonSocial)
  if (!actor) return NextResponse.json({ error: 'falta_actor' }, { status: 400 })
  if (!cif || !razon) return NextResponse.json({ error: 'cif_o_razon_invalidos' }, { status: 400 })
  const dom = (b?.domicilio ?? {}) as Record<string, unknown>
  const cp = textoONull(dom.cp, 5)
  if (cp && !/^\d{5}$/.test(cp)) return NextResponse.json({ error: 'cp_invalido' }, { status: 400 })
  const logo = textoONull(b?.logoUrl, 500)
  const r = await opAltaCuenta({
    cif, razon, via: textoONull(dom.via), numero: textoONull(dom.numero, 20), resto: textoONull(dom.resto), cp,
    municipio: textoONull(dom.municipio), provincia: textoONull(dom.provincia), acento: normalizarHex(b?.acento),
    logo: logo && /^https:\/\//.test(logo) ? logo : null,
  }, actor)
  return NextResponse.json({ ok: true, ...r })
}
