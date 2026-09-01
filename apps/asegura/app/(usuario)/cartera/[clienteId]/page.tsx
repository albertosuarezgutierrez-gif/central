import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireSession } from '@/lib/session'
import { correduriaUnica } from '@/lib/cartera'
import { fichaCliente } from '@/lib/cartera-ficha'

export const dynamic = 'force-dynamic'

/**
 * Ficha del cliente: sus pólizas, y en cada una de auto el botón de retarificar.
 *
 * El botón NO cotiza: lleva a la pantalla donde se ve qué se va a mandar, qué se
 * ha supuesto y qué falta. Gastar 0,50€ desde una lista, sin ver antes lo que
 * viaja, sería exactamente el clic accidental que hay que evitar.
 */
export default async function FichaClientePage({
  params,
}: {
  params: Promise<{ clienteId: string }>
}) {
  await requireSession()
  const { clienteId } = await params

  const correduria = await correduriaUnica().catch(() => null)
  if (!correduria) {
    return (
      <div className="card">
        <h2>⚠️ No se ha podido resolver la correduría</h2>
        <p>Sin ese dato no se consulta la cartera. No lo leas como «este cliente no existe».</p>
      </div>
    )
  }

  const ficha = await fichaCliente(correduria.id, clienteId)
  if (!ficha) notFound()

  const vivas = ficha.polizas.filter((p) => p.viva)
  const historicas = ficha.polizas.filter((p) => !p.viva)

  return (
    <div className="grid">
      <div>
        <p className="muted">
          <Link href="/cartera">← Cartera</Link>
        </p>
        <h1>{ficha.nombre}</h1>
        <p className="muted">
          {ficha.polizas.length} póliza(s) · {vivas.length} en el canal directo con las compañías
          (CIMA)
        </p>
      </div>

      {ficha.polizas.length === 0 ? (
        <div className="card">
          <p>Esta ficha no tiene ninguna póliza registrada.</p>
        </div>
      ) : (
        <>
          <TablaPolizas titulo="Pólizas vivas (CIMA)" polizas={vivas} />
          {historicas.length > 0 && (
            <TablaPolizas
              titulo="Volcado histórico"
              nota={
                'Vienen del volcado de junio de 2026, con vencimientos antiguos. Se pueden ' +
                'retarificar igual, pero el precio saldrá sobre datos viejos.'
              }
              polizas={historicas}
            />
          )}
        </>
      )}
    </div>
  )
}

function TablaPolizas({
  titulo,
  nota,
  polizas,
}: {
  titulo: string
  nota?: string
  polizas: {
    id: string
    tipo: string
    aseguradora: string
    numeroPoliza: string | null
    fechaVencimiento: string | null
    matricula: string | null
    retarificable: boolean
  }[]
}) {
  if (polizas.length === 0) {
    return (
      <div className="card">
        <h2>{titulo}</h2>
        <p className="muted">Ninguna.</p>
      </div>
    )
  }

  return (
    <div className="card">
      <h2>{titulo}</h2>
      {nota && <p className="muted">{nota}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Ramo</th>
              <th>Compañía</th>
              <th>Nº póliza</th>
              <th>Vence</th>
              <th>Objeto</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {polizas.map((p) => (
              <tr key={p.id}>
                <td>{p.tipo}</td>
                <td>{p.aseguradora}</td>
                <td>{p.numeroPoliza ?? <span className="muted">—</span>}</td>
                <td>
                  {p.fechaVencimiento ?? (
                    // NULL es «no se sabe cuándo vence», no «no vence».
                    <span className="muted" title="La compañía no ha informado el vencimiento">
                      sin fecha
                    </span>
                  )}
                </td>
                <td>{p.matricula ?? <span className="muted">—</span>}</td>
                <td>
                  {p.retarificable ? (
                    <Link href={`/cartera/poliza/${p.id}`}>Retarificar →</Link>
                  ) : (
                    <span className="muted" title={motivoNoRetarificable(p)}>
                      —
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Por qué no sale el botón. Decirlo evita que parezca que la pantalla falla. */
function motivoNoRetarificable(p: { tipo: string; matricula: string | null }): string {
  if (p.tipo !== 'auto') return `Hoy solo se retarifica auto (esta es de ${p.tipo}).`
  return 'La compañía no ha informado la matrícula, y sin ella no se puede identificar el vehículo.'
}
