import { formatearEur } from '@central/module-taller'
import { pbAPorcentaje } from '@/lib/ajustes'

type Linea = { id: string; descripcion: string; cantidad: number; unidad: string; baseCent: bigint; ivaCodigo: string; ivaPuntosBasicos: number; cuotaIvaCent: bigint; totalCent: bigint }

const cantidad = (l: Linea) => (l.unidad === 'ml' ? `${l.cantidad / 1000} l` : l.unidad === 'min' ? `${l.cantidad} min` : String(l.cantidad))

/** Líneas + base + IVA por tipo + total. Todo lo que ve el cliente sale de lo CONGELADO en el presupuesto. */
export function TablaPresupuesto({ lineas, baseCent, cuotaIvaCent, totalCent }: { lineas: Linea[]; baseCent: bigint; cuotaIvaCent: bigint; totalCent: bigint }) {
  const iva = new Map<string, { pb: number; base: number; cuota: number }>()
  for (const l of lineas) {
    const d = iva.get(l.ivaCodigo) ?? { pb: l.ivaPuntosBasicos, base: 0, cuota: 0 }
    d.base += Number(l.baseCent); d.cuota += Number(l.cuotaIvaCent)
    iva.set(l.ivaCodigo, d)
  }
  return (
    <div className="tabla-scroll"><table className="tabla-cards">
      <thead><tr><th>Concepto</th><th className="num">Cant.</th><th className="num">Base</th><th className="num">IVA</th><th className="num">Total</th></tr></thead>
      <tbody>
        {lineas.map((l) => (
          <tr key={l.id}>
            <td>{l.descripcion}</td><td className="num" data-label="Cant.">{cantidad(l)}</td>
            <td className="num" data-label="Base">{formatearEur(Number(l.baseCent))}</td>
            <td className="num" data-label="IVA">{pbAPorcentaje(l.ivaPuntosBasicos)} %</td>
            <td className="num" data-label="Total">{formatearEur(Number(l.totalCent))}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr><td colSpan={4} className="num">Base imponible</td><td className="num">{formatearEur(Number(baseCent))}</td></tr>
        {[...iva.entries()].map(([cod, d]) => (
          <tr key={cod}><td colSpan={4} className="num">IVA {pbAPorcentaje(d.pb)} % sobre {formatearEur(d.base)}</td><td className="num">{formatearEur(d.cuota)}</td></tr>
        ))}
        <tr><td colSpan={4} className="num"><strong>Total (IVA {Number(cuotaIvaCent) === 0 ? 'no aplicable' : 'incluido'})</strong></td><td className="num"><strong>{formatearEur(Number(totalCent))}</strong></td></tr>
      </tfoot>
    </table></div>
  )
}
