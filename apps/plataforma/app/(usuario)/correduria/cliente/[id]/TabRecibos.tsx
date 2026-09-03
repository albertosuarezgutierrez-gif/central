import Link from 'next/link'
import type { PolizaFicha } from '@/lib/ficha-asegura'
import { eur } from '@/lib/dinero'
import { CeldaRecibos, Tarjeta, TIPOS, etiquetaPoliza, fmt, sub, td, th } from './piezas'

/**
 * El estado de cobro de TODAS sus pólizas de un vistazo: una fila por póliza.
 *
 * 🚨 No es un extracto de recibos, y la pantalla lo dice en vez de aparentarlo.
 * El puerto de asegura manda por póliza los CONTADORES y el ÚLTIMO recibo; la
 * lista completa vive en el endpoint de la póliza, así que para verla se salta
 * a su ficha. Inventar aquí un extracto con lo que hay sería enseñar cuatro
 * recibos y dejar creer que son todos.
 *
 * Las cuatro cosas que un contador de recibos puede querer decir siguen sin
 * colapsarse: `—` = asegura no informa · «sin informar» = la compañía no ha
 * mandado recibos (que NO es «pagada») · devuelto · al día.
 */
export default function TabRecibos({ polizas }: { polizas: PolizaFicha[] }) {
  if (polizas.length === 0) {
    return (
      <Tarjeta titulo="Recibos">
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>Todavía no tiene pólizas en la cartera.</p>
      </Tarjeta>
    )
  }
  const sinInformar = polizas.filter(p => p.recibos === null).length
  const sinRecibos = polizas.filter(p => p.recibos !== null && p.recibos.total === 0).length
  return (
    <Tarjeta titulo={`Recibos por póliza (${polizas.length})`}>
      <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 0 }}>
        El detalle recibo a recibo está en la ficha de cada póliza.
        {sinInformar > 0 && ` · ${sinInformar} póliza(s) sin datos de recibos desde asegura`}
        {sinRecibos > 0 && ` · ${sinRecibos} póliza(s) de las que la compañía no ha mandado ningún recibo: no se sabe si están pagadas`}
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
          <thead>
            <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
              <th style={th}>Póliza</th>
              <th style={th}>Estado de cobro</th>
              <th style={th}>Último recibo</th>
              <th style={{ ...th, textAlign: 'right' }}>Importe</th>
              <th style={th}>Forma de pago</th>
            </tr>
          </thead>
          <tbody>
            {polizas.map(p => (
              <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={td}>
                  <Link href={`/correduria/poliza/${p.id}`} style={{ fontWeight: 600 }}>{etiquetaPoliza(p)}</Link>
                  <div style={sub}>{TIPOS[p.tipo] ?? p.tipo} · {p.aseguradora}{p.viva ? '' : ' · histórica'}</div>
                </td>
                <td style={td}><CeldaRecibos r={p.recibos} /></td>
                <td style={td}><UltimoRecibo r={p.recibos} /></td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {p.recibos?.ultimo?.importe == null
                    ? <span style={{ color: 'var(--muted)' }}>—</span>
                    : eur(p.recibos.ultimo.importe)}
                </td>
                <td style={td}>
                  {p.recibos?.ultimo?.formaPago ?? p.pago?.formaCobro ?? <span style={{ color: 'var(--muted)' }}>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  )
}

function UltimoRecibo({ r }: { r: PolizaFicha['recibos'] }) {
  if (r === null || r.ultimo === null) return <span style={{ color: 'var(--muted)' }}>—</span>
  const f = r.ultimo.fechaVencimiento ?? r.ultimo.fechaEmision
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      {r.ultimo.situacion.replace(/_/g, ' ')}
      {f && <div style={sub}>{fmt(f)}</div>}
    </span>
  )
}
