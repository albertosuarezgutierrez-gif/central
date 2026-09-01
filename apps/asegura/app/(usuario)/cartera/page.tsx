import Link from 'next/link'
import { requireSession } from '@/lib/session'
import { correduriaUnica } from '@/lib/cartera'
import { buscarClientes } from '@/lib/cartera-ficha'
import { aseguraConfigurada } from '@/lib/asegura-db'

export const dynamic = 'force-dynamic'

/**
 * Buscador de clientes de la cartera. Es la puerta de la retarificación: se
 * busca a la persona, se abre su ficha y desde una póliza suya se pide precio.
 *
 * Busca por nombre y apellidos, que van EN CLARO en la base. Es deliberado: el
 * DNI y el email se buscan por índice ciego, y si esa clave se desincroniza la
 * búsqueda no falla — devuelve vacío, o sea que dice «no existe» sobre un
 * cliente que sí está (ver `apps/asegura/CLAUDE.md`). Por nombre no hay ese
 * modo de fallo silencioso.
 */
export default async function CarteraPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  await requireSession()
  const { q } = await searchParams
  const termino = (q ?? '').trim()

  if (!aseguraConfigurada()) {
    return (
      <div className="card">
        <h2>⏳ Conexión con la cartera pendiente de configurar</h2>
        <p>
          Falta <code>ASEGURA_DATABASE_URL</code>. Esto <strong>no</strong> significa que la
          correduría no tenga clientes: significa que esta pantalla aún no está conectada a ellos.
        </p>
      </div>
    )
  }

  const correduria = await correduriaUnica().catch(() => null)
  const resultados =
    correduria && termino.length >= 3 ? await buscarClientes(correduria.id, termino) : []

  return (
    <div className="grid">
      <div>
        <h1>Cartera</h1>
        <p className="muted">Busca un cliente para ver sus pólizas y pedir precio de calle</p>
      </div>

      <div className="card">
        <form method="get" className="row">
          <input
            type="search"
            name="q"
            defaultValue={termino}
            placeholder="Nombre o apellidos (mínimo 3 letras)"
            aria-label="Buscar cliente por nombre o apellidos"
            style={{ flex: '1 1 240px', minWidth: 0 }}
          />
          <button type="submit" className="primary">
            Buscar
          </button>
          <Link href="/cartera/subir" style={{ marginLeft: 'auto' }}>
            Subir una póliza →
          </Link>
        </form>
      </div>

      {!correduria ? (
        <div className="card">
          <h2>⚠️ No se ha podido resolver la correduría</h2>
          <p>
            Sin ese dato no se consulta la cartera, porque una consulta sin filtro devolvería datos
            de otra correduría sin dar ningún error. No lo interpretes como «no hay clientes».
          </p>
        </div>
      ) : termino.length === 0 ? null : termino.length < 3 ? (
        <p className="muted">Escribe al menos 3 letras.</p>
      ) : resultados.length === 0 ? (
        <div className="card">
          <p>
            Ningún cliente coincide con <strong>{termino}</strong> por nombre o apellidos.
          </p>
          <p className="muted">
            La búsqueda es por nombre, no por DNI ni email. Si buscas a alguien que sabes que está,
            prueba solo con el primer apellido.
          </p>
        </div>
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Tipo</th>
                  <th>Pólizas</th>
                </tr>
              </thead>
              <tbody>
                {resultados.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/cartera/${c.id}`}>{c.nombre}</Link>
                    </td>
                    <td>
                      <span className={`badge ${c.tipo === 'cliente' ? 'ok' : ''}`}>{c.tipo}</span>
                    </td>
                    <td>{c.polizas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
