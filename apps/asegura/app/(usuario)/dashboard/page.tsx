import { requireSession } from '@/lib/session'
import { estadoMigracion } from '@/lib/estado-migracion'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  await requireSession()
  const estado = await estadoMigracion()

  return (
    <div className="grid">
      <div>
        <h1>Grupo Asegura</h1>
        <p className="muted">Correduría de seguros — cartera, recibos y siniestros</p>
      </div>

      {estado.error ? (
        // Un fallo de consulta NO se pinta como «todo en orden» ni como «vacío»:
        // degradar en silencio es la forma más cara de mentir (regla global).
        <div className="card">
          <h2>⚠️ No se ha podido comprobar el estado</h2>
          <p>
            Falló la consulta a la base de datos, así que <strong>no sabemos</strong> si la cartera
            está migrada. No interpretes esta pantalla como «no hay datos».
          </p>
        </div>
      ) : estado.migrado ? (
        <div className="card">
          <h2>Cartera</h2>
          <p className="muted">
            {estado.tablas} tablas en el schema <code>seguros</code>. Las pantallas de clientes,
            pólizas y siniestros se montan sobre este esqueleto.
          </p>
        </div>
      ) : (
        // 🚨 Regla «dato que NO hay ≠ dato que NO se ha mirado»: mientras el schema
        // esté vacío NO se pintan KPIs a 0 — eso afirmaría «no tienes clientes»
        // sobre una cartera de 32.600 que todavía vive en el Supabase de Manuel.
        // Se dice explícitamente que el dato está PENDIENTE y dónde mirar mientras tanto.
        <div className="card">
          <h2>⏳ Cartera pendiente de migrar</h2>
          <p>
            El schema <code>seguros</code> todavía está vacío. Esto <strong>no</strong> significa que
            la correduría no tenga cartera: significa que aún no se ha traído.
          </p>
          <p className="muted">
            Los datos vivos siguen en el CRM anterior, que continúa recibiendo de las compañías por
            CIMA/EIAC. Hasta que se ejecute el corte acordado, consulta ahí.
          </p>
          <p className="muted" style={{ marginTop: 12 }}>
            Estado y pasos del traspaso: <code>docs/TRASPASO-CORREDURIA.md</code>
          </p>
        </div>
      )}
    </div>
  )
}
