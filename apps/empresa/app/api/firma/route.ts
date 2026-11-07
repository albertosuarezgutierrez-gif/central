import { NextResponse } from 'next/server'
import { canjearCodigo, claveFirma } from '@/lib/acceso'
import { conRepoFirma, personaPropia } from '@/lib/db'
import { firmarContrato } from '@/lib/firma'
import { leerContexto } from '@/lib/contexto'
import { ipDeCabecera } from '@/lib/ip'
import { esUuid } from '@/lib/rls'
import { avisarFirma } from '@/lib/avisos'
import { MEDIADOR } from '@central/legal-templates/encargado'

// Firma: todo en UNA transacción RLS (lectura de la versión + herramientas.firmar_version). Si algo falla, nada queda firmado.
export const dynamic = 'force-dynamic'

const MENSAJE_BD: Record<string, [number, string]> = {
  documento_cambiado: [409, 'documento_cambiado'], version_no_firmable: [409, 'version_no_firmable'],
  solo_firma_el_dueno: [403, 'solo_firma_el_dueno'], version_de_otro_firmante: [403, 'version_de_otro_firmante'],
  duplicate: [409, 'ya_firmado'],
  version_no_existe: [404, 'version_no_existe'], sello_de_tiempo_fuera_de_rango: [409, 'sello_de_tiempo_fuera_de_rango'],
  sin_persona: [401, 'sin_persona'],
}

export async function POST(req: Request) {
  const ctx = await leerContexto()
  if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || !esUuid(b.versionId)) return NextResponse.json({ error: 'version_no_valida' }, { status: 400 })
  const versionId = (b.versionId as string).toLowerCase()
  const yo = await personaPropia(ctx.personaId)
  if (!yo) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  try {
    const r = await conRepoFirma(ctx.personaId, (repo, repoOtp) => firmarContrato(repo, yo,
      { versionId, nombre: b.nombre, titulo: b.titulo, shaVisto: b.sha256, consiento: b.consiento, ip: ipDeCabecera(req.headers.get('x-forwarded-for')), ua: req.headers.get('user-agent') ?? 'desconocido' },
      () => canjearCodigo(repoOtp, { email: yo.email, codigo: b.codigo, proposito: 'firma', clave: claveFirma(versionId, yo.email) }),
      MEDIADOR.marca))
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    await avisarFirma(r.razonSocial, r.n).catch(() => undefined)
    return NextResponse.json({ ok: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    const k = Object.keys(MENSAJE_BD).find((x) => msg.includes(x))
    if (k) return NextResponse.json({ error: MENSAJE_BD[k][1] }, { status: MENSAJE_BD[k][0] })
    console.error('[empresa] fallo al firmar:', msg.slice(0, 200))
    return NextResponse.json({ error: 'error_firma' }, { status: 500 })
  }
}
