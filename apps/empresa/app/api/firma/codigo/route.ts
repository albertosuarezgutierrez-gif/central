import { NextResponse } from 'next/server'
import { solicitarCodigo, claveFirma, CANAL_NO_CONECTADO } from '@/lib/acceso'
import { canalCodigos } from '@/lib/canal-correo'
import { repoOtpBd, conRepoFirma, personaPropia } from '@/lib/db'
import { leerContexto } from '@/lib/contexto'
import { ipDeCabecera } from '@/lib/ip'
import { esUuid } from '@/lib/rls'
import { firmable, puede } from '@central/core-herramientas'

// Código NUEVO para firmar (control exclusivo en el momento de firmar). Solo el dueño destinatario de una versión firmable.
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const ctx = await leerContexto()
  if (!ctx) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as { versionId?: unknown } | null
  if (!esUuid(b?.versionId)) return NextResponse.json({ error: 'version_no_valida' }, { status: 400 })
  const versionId = b!.versionId.toLowerCase()
  const yo = await personaPropia(ctx.personaId)
  if (!yo) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const apto = await conRepoFirma(ctx.personaId, async (repo) => {
    const v = await repo.version(versionId)
    if (!v) return 'version_no_existe'
    if (!puede(await repo.rol(v.cuentaId), 'firmar') || v.destinatarioPersonaId !== yo.id) return 'solo_firma_el_dueno'
    return firmable(v, new Date()) ? null : 'version_no_firmable'
  })
  if (apto) return NextResponse.json({ error: apto }, { status: apto === 'version_no_existe' ? 404 : apto === 'solo_firma_el_dueno' ? 403 : 409 })
  const canal = canalCodigos() ?? (process.env.NODE_ENV === 'development' ? CANAL_NO_CONECTADO : null)
  if (!canal) return NextResponse.json({ error: 'canal_no_disponible' }, { status: 503 })
  const r = await solicitarCodigo(repoOtpBd, canal, {
    email: yo.email, ip: ipDeCabecera(req.headers.get('x-forwarded-for')), proposito: 'firma', clave: claveFirma(versionId, yo.email),
    destinatarioValido: async () => true,
  })
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ok: true, enviado: r.enviado })
}
