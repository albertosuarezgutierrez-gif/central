import { redirect } from 'next/navigation'
import { AbrirEmpresa } from './AbrirEmpresa'
import { leerUsuario } from '@/lib/contexto'
import { conF6 } from '@/lib/f6-carga'
import { empresasDeUsuarioBd } from '@/lib/db'
import { bandejaDelUsuario, fuenteContadores } from '@/lib/gestoria'
import { SELLO } from '@/lib/marca'

export const dynamic = 'force-dynamic'

const n = (v: number | null) => (v === null ? '—' : String(v))

/**
 * Portal de la gestoría: SOLO las empresas con vínculo ACTIVO de rol gestor (la lista sale de BD por `empresas_de_usuario`, nunca de la URL).
 * Cada empresa se consulta en su propia transacción RLS. «—» = no se pudo leer (≠ 0): suele ser que falta aplicar 0006_gestoria.sql (o 0002/0004).
 */
export default async function Gestoria() {
  const u = await leerUsuario()
  if (!u) redirect('/login')
  const vinculos = await empresasDeUsuarioBd(u.usuarioId)
  const bandeja = await bandejaDelUsuario(vinculos, fuenteContadores((id, fn) => conF6(id, (_r, f6) => fn(f6))))
  return (
    <main className="contenido">
      <h1>Portal de la gestoría</h1>
      <span className="sello">{SELLO}</span>
      <p className="tenue">Tus empresas asignadas y lo que está pendiente en cada una. <a href="/empresas">Elegir empresa</a>{u.empresaActual ? <> · <a href="/">Volver a la contabilidad</a></> : null}</p>
      {bandeja.sinAsignaciones && <p className="aviso-lectura" role="note">No tienes ninguna empresa asignada como gestor. Pide al dueño de la empresa que te dé acceso.</p>}
      {bandeja.incompleta && <p className="aviso-lectura" role="note">«—» significa que ese dato no se ha podido leer (no es cero). Suele faltar aplicar el esquema de la fase 6 (0006_gestoria.sql).</p>}
      {!bandeja.sinAsignaciones && <p className="tenue">Pendiente en total (solo lo que se ha podido leer): <strong>{bandeja.totalGeneral}</strong></p>}
      <div className="lista">
        {bandeja.empresas.map((e) => (
          <section key={e.empresaId} className="ficha" aria-label={e.razonSocial}>
            <h2 style={{ margin: 0 }}>{e.razonSocial}</h2>
            <p className="tenue" style={{ margin: '4px 0 10px' }}>
              <span className={`estado ${e.total > 0 ? 'estado-aviso' : e.incompleto ? 'estado-marca' : 'estado-ok'}`}>{e.total > 0 ? `${e.total} pendientes` : e.incompleto ? 'Sin datos completos' : 'Al día'}</span>
            </p>
            <ul className="lista-simple">
              <li>Asientos sin revisar: <strong>{n(e.asientosSinRevisar)}</strong></li>
              <li>Facturas a confirmar: <strong>{n(e.facturasAConfirmar)}</strong></li>
              <li>Avisos sin leer: <strong>{n(e.avisosSinLeer)}</strong></li>
              <li>Declaraciones en borrador: <strong>{n(e.declaracionesBorrador)}</strong></li>
            </ul>
            <AbrirEmpresa empresaId={e.empresaId} />
          </section>
        ))}
      </div>
    </main>
  )
}
