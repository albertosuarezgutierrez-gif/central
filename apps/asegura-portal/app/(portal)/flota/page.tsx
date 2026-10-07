import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { TEXTO_JEFE_FLOTA } from '@central/module-seguros-portal'

import { empresasDeFlota, flotaDeEmpresa, nombramientosPendientes } from '@/lib/flota'
import { fechaEs } from '@/lib/fechas'
import { getIdentidad } from '@/lib/session'

import { FlotaEmpresa, NombramientoPendiente } from './FlotaEmpresa'

export const dynamic = 'force-dynamic'

/**
 * «Tu flota» (05/10/2026) — el mínimo de empresa del piloto.
 *
 * Sin `?empresa=`: índice de las sociedades cuya flota puede ver esta identidad
 * (dueño o jefe de flota) y los nombramientos que tiene pendientes de aceptar.
 * Con `?empresa=<id>`: la flota de esa sociedad. 🚨 El id de la URL NO consulta:
 * `flotaDeEmpresa()` lo busca dentro de los accesos ya resueltos por la cookie, y
 * si no está, 404 (nunca 403: no confirma que exista).
 *
 * No está en la barra de secciones a propósito: la ven pocas identidades y la
 * barra es la misma para todas. Se llega desde el aviso de la bóveda
 * (`EnlaceFlota`) y desde la tarjeta de la sociedad.
 */
export default async function FlotaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')
  const pedida = (await searchParams).empresa

  if (pedida !== undefined) {
    const flota = await flotaDeEmpresa(identidad.id, pedida)
    if (flota === null) notFound()
    return (
      <>
        <p className="antetitulo">Tu sociedad</p>
        <h1>Flota de {flota.empresa.nombre}</h1>
        <p className="suave" style={{ marginTop: 0 }}>
          {flota.papel === 'dueno'
            ? 'Los vehículos de la sociedad con su seguro en vigor. Ves esto porque constas como dueño.'
            : 'Los vehículos de la sociedad con su seguro en vigor. Ves esto porque te han nombrado jefe de flota: no ves el resto de seguros de la sociedad.'}
        </p>
        <FlotaEmpresa
          empresaId={flota.empresa.id}
          papel={flota.papel}
          recortada={flota.recortada}
          vehiculos={flota.vehiculos}
          jefes={
            flota.jefes === null
              ? null
              : flota.jefes.map((j) => ({ ...j, otorgadoEn: fechaEs(j.otorgadoEn) }))
          }
          candidatos={flota.candidatos}
          textoJefe={TEXTO_JEFE_FLOTA}
        />
        <p style={{ marginTop: 24 }}>
          <Link href="/flota">← Todas tus flotas</Link>
        </p>
      </>
    )
  }

  const [empresas, pendientes] = await Promise.all([
    empresasDeFlota(identidad.id),
    nombramientosPendientes(identidad.id),
  ])

  return (
    <>
      <h1>Tu flota</h1>
      <p className="suave" style={{ marginTop: 0 }}>
        Los vehículos de las sociedades que llevas: seguro, vencimiento y próxima ITV.
      </p>

      {pendientes.length > 0 && (
        <section className="seccion" aria-labelledby="pendientes-flota">
          <p className="antetitulo">Pendiente de ti</p>
          <h2 id="pendientes-flota">Te han nombrado jefe de flota</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr)' }}>
            {pendientes.map((p) => (
              <li key={p.autorizacionId}>
                <NombramientoPendiente
                  autorizacionId={p.autorizacionId}
                  empresa={p.empresa}
                  otorgadoEn={fechaEs(p.otorgadoEn)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {empresas.length === 0 ? (
        pendientes.length === 0 && (
          <section className="seccion">
            <p style={{ margin: 0 }}>
              No llevas la flota de ninguna sociedad. Si eres el dueño de una empresa cliente y no la ves aquí,
              escríbenos: puede que no conste en tu ficha que eres el dueño.
            </p>
          </section>
        )
      ) : (
        <section className="seccion" aria-labelledby="empresas-flota">
          <h2 id="empresas-flota" style={{ marginTop: 0 }}>Tus sociedades</h2>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8, gridTemplateColumns: 'minmax(0, 1fr)' }}>
            {empresas.map((e) => (
              <li key={e.id}>
                <Link className="boton-tenue" style={{ width: '100%', justifyContent: 'space-between' }} href={`/flota?empresa=${encodeURIComponent(e.id)}`}>
                  <span style={{ overflowWrap: 'anywhere', textAlign: 'left' }}>{e.nombre}</span>
                  <span className="chip">{e.papel === 'dueno' ? 'Dueño' : 'Jefe de flota'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  )
}
