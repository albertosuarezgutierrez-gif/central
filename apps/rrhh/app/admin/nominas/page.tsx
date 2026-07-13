import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSesion, AuthError } from '@/lib/tenant'
import { listarPeriodosConNominas, periodoActual } from '@/lib/nominas'
import { getBranding } from '@/lib/empresa'
import AdminShell from '@/components/AdminShell'
import DistribuirPdfPanel from './DistribuirPdfPanel'

export default async function Page() {
  let empresa_id: string
  try { ({ empresa_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }

  const [periodos, branding] = await Promise.all([listarPeriodosConNominas(empresa_id), getBranding(empresa_id)])
  const actual = periodoActual()

  return (
    <AdminShell activo="nominas" logoUrl={branding.logo_url} nombreEmpresa={branding.nombre} colorPrimario={branding.color_primario} tieneFichaje={branding.tiene_fichaje}>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl">Nóminas</h1>
        <Link href={`/admin/nominas/${actual}`} className="rounded bg-accent px-4 py-2 text-sm text-white no-underline">
          {actual}
        </Link>
      </div>

      <DistribuirPdfPanel />

      {periodos.length === 0 ? (
        <p className="mt-6 text-ink-3">Aún no hay nóminas. Accede al período actual para generarlas.</p>
      ) : (
        <ul className="mt-4 grid gap-2 list-none p-0">
          {periodos.map(p => (
            <li key={p.periodo}>
              <Link
                href={`/admin/nominas/${p.periodo}`}
                className="flex items-center justify-between rounded-card border border-line bg-card p-3 no-underline hover:bg-paper-2"
              >
                <span className="font-medium">{p.periodo}</span>
                <span className="text-ink-3 text-sm">
                  {p.confirmadas}/{p.total} confirmadas
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  )
}
