import { Cabecera } from '../_cabecera'
import { datosPagina } from '@/lib/pagina'
import { conRepo } from '@/lib/db'

export const dynamic = 'force-dynamic'

const GRUPOS: Record<number, string> = {
  1: 'Financiación básica', 2: 'Activo no corriente', 3: 'Existencias', 4: 'Acreedores y deudores',
  5: 'Cuentas financieras', 6: 'Compras y gastos', 7: 'Ventas e ingresos', 8: 'Gastos imputados al patrimonio neto', 9: 'Ingresos imputados al patrimonio neto',
}

export default async function Plan() {
  const { ctx, empresa, variasEmpresas, avisos } = await datosPagina()
  const cuentas = await conRepo(ctx.empresaId, (r) => r.planCuentas())
  const grupos = [...new Set(cuentas.map((c) => c.grupo))].sort((a, b) => a - b)
  return (
    <>
      <Cabecera empresa={empresa} variasEmpresas={variasEmpresas} avisos={avisos} />
      <main className="contenido">
        <h1>Plan de cuentas</h1>
        <p className="tenue">PGC de pymes como punto de partida (copia propia de tu empresa). Una cuenta con apuntes no se borra: se desactiva.</p>
        {cuentas.length === 0 && <p className="aviso-error">Sin datos: el plan de esta empresa aún no se ha sembrado. Pide al operador que complete el alta.</p>}
        {grupos.map((g) => (
          // Plegado por grupo (rendimiento): solo el grupo abierto monta sus filas visibles.
          <details key={g} className="seccion" style={{ marginBottom: 12 }}>
            <summary>Grupo {g} · {GRUPOS[g] ?? ''} ({cuentas.filter((c) => c.grupo === g).length})</summary>
            <div className="tabla-scroll" style={{ margin: '0 16px 16px', boxShadow: 'none' }}>
              <table className="tabla-cards">
                <thead><tr><th>Cuenta</th><th>Nombre</th><th>Naturaleza</th><th>Estado</th></tr></thead>
                <tbody>
                  {cuentas.filter((c) => c.grupo === g).map((c) => (
                    <tr key={c.codigo}>
                      <td><a href={`/mayor?cuenta=${c.codigo}`}>{c.codigo}</a></td>
                      <td data-label="Nombre">{c.nombre}</td>
                      <td data-label="Naturaleza">{c.naturaleza}</td>
                      <td data-label="Estado">{!c.activa ? 'Desactivada' : c.admiteApuntes ? 'Admite apuntes' : 'Agrupadora'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </main>
    </>
  )
}
