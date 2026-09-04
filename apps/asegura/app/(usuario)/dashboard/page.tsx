import { requireSession } from '@/lib/session'
import { correduriaUnica, resumenCartera, type ResumenCartera } from '@/lib/cartera'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  await requireSession()

  const correduria = await correduriaUnica().catch(() => null)
  const resumen: ResumenCartera = correduria
    ? await resumenCartera(correduria.id)
    : { estado: correduriaUnicaFallo() }

  return (
    <div className="grid">
      <div>
        <h1>Grupo ASegura</h1>
        <p className="muted">Correduría de seguros — cartera, recibos y siniestros</p>
      </div>

      {resumen.estado === 'sin_configurar' ? (
        // 🚨 Regla «dato que NO hay ≠ dato que NO se ha mirado»: sin conexión a la
        // base real NO se pintan KPIs a 0 — eso afirmaría «no tienes clientes»
        // sobre una cartera de 32.600 fichas que existe y está viva.
        <div className="card">
          <h2>⏳ Conexión con la cartera pendiente de configurar</h2>
          <p>
            Falta la variable <code>ASEGURA_DATABASE_URL</code> (la base real del proyecto
            ASEGURA-prod-eu). Esto <strong>no</strong> significa que la correduría no tenga cartera:
            significa que esta app aún no está conectada a ella.
          </p>
          <p className="muted">
            Mientras tanto, la cartera se consulta en el CRM actual (<code>app.grupoasegura.com</code>).
            Estado del traspaso: <code>docs/TRASPASO-CORREDURIA.md</code>
          </p>
        </div>
      ) : resumen.estado === 'error' ? (
        <div className="card">
          <h2>⚠️ No se ha podido leer la cartera</h2>
          <p>
            La consulta a la base real falló, así que <strong>no sabemos</strong> el estado de la
            cartera. No interpretes esta pantalla como «no hay datos».
          </p>
        </div>
      ) : (
        <>
          <div className="card">
            <h2>Cartera</h2>
            <p className="muted">
              {resumen.clientes} clientes · {resumen.leads} leads
            </p>
            <p>
              <strong>{resumen.polizasVigentes} pólizas en vigor</strong>
              {' · '}
              {resumen.polizasPendientesFecha} sin fecha de vencimiento (pendientes de revisar)
              {' · '}
              {resumen.polizasNoVigentes} históricas o no vigentes
            </p>
            <p className="muted">
              «En vigor» = estado vigente y vencimiento hoy o futuro. Las pólizas sin fecha NO se
              cuentan como vigentes ni como vencidas: no se sabe.
            </p>
          </div>
          <div className="card">
            <h2>Siniestros</h2>
            <p className="muted">{resumen.siniestrosAbiertos} abiertos o en tramitación</p>
          </div>
        </>
      )}
    </div>
  )
}

// La ausencia de fila de correduría con conexión configurada es un caso raro que
// se muestra como error de lectura, no como cartera vacía.
function correduriaUnicaFallo(): 'sin_configurar' | 'error' {
  return process.env.ASEGURA_DATABASE_URL ? 'error' : 'sin_configurar'
}
