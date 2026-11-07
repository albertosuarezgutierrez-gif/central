import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getSesion, AuthError } from '@/lib/tenant'
import { listarPeriodosConNominas, periodoActual } from '@/lib/nominas'
import UiPage from '@/components/ui/Page'
import Boton from '@/components/ui/Boton'
import DistribuirPdfPanel from './DistribuirPdfPanel'
import EstadoModuloNominas from './EstadoModuloNominas'
import ReenviarContabilidadBoton from './ReenviarContabilidadBoton'
import { leerModulo } from '@/lib/modulos-empresa'

export default async function Page() {
  let empresa_id: string
  try { ({ empresa_id } = await getSesion()) } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }

  const [periodos, modulo] = await Promise.all([listarPeriodosConNominas(empresa_id), leerModulo(empresa_id, 'nominas')])
  const actual = periodoActual()

  return (
    <UiPage
      titulo="Nóminas"
      ancho="formulario"
      acciones={
        <Link href={`/admin/nominas/${actual}`} className="rounded bg-accent px-4 py-2 text-sm text-white no-underline">
          {actual}
        </Link>
      }
    >

      <EstadoModuloNominas estado={modulo} />

      <nav className="mt-4 flex flex-wrap gap-2" aria-label="Herramientas de nóminas">
        <Boton variante="secundario" href="/admin/nominas/convenio">Tablas del convenio</Boton>
        <Boton variante="secundario" href="/admin/nominas/finiquito">Calcular finiquito</Boton>
      </nav>

      <ReenviarContabilidadBoton />

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
    </UiPage>
  )
}
