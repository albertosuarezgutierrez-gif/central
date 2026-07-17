// Página de acceso INVITADO (Pablo prueba «Empresas» sin cuenta). Fuera del grupo (usuario) → sin sidebar
// ni guard de sesión. El acceso se valida por token (EMPRESAS_INVITADO_TOKEN) vía ?token= o cookie.
import { cookies } from 'next/headers'
import { getEmpresasYRadar, getProvincias, getCnaes } from '@/lib/empresas'
import { tokenInvitadoValido, COOKIE_INVITADO } from '@/lib/empresas-acceso'
import EmpresasClient from '@/app/(usuario)/empresas/EmpresasClient'

export const dynamic = 'force-dynamic'

export default async function InvitadoEmpresasPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const sp = await searchParams
  const jar = await cookies()
  const token = sp.token || jar.get(COOKIE_INVITADO)?.value

  if (!tokenInvitadoValido(token)) {
    return (
      <div style={{ maxWidth: 480, margin: '15vh auto', padding: 24, textAlign: 'center', color: 'var(--text)' }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
        <h1 style={{ fontSize: 20 }}>Acceso no válido</h1>
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>Este enlace de acceso no es correcto o ha caducado. Pide a Alberto el enlace actualizado.</p>
      </div>
    )
  }

  let inicial: Awaited<ReturnType<typeof getEmpresasYRadar>> & { provincias: string[]; cnaes: string[] } | null = null
  try {
    const [datos, provincias, cnaes] = await Promise.all([getEmpresasYRadar({}), getProvincias(), getCnaes()])
    inicial = { ...datos, provincias, cnaes }
  } catch (e) {
    console.error('[invitado empresas inicial]', e)
  }

  return (
    <div>
      <div style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '10px 16px', color: 'var(--muted)', fontSize: 13 }}>
        🏢 Empresas en dificultad · <strong style={{ color: 'var(--text)' }}>acceso de prueba</strong> (invitado)
      </div>
      <EmpresasClient inicial={inicial} invitado />
    </div>
  )
}
