// «Facturar» en la OT: se ve cuando la orden está terminada (o entregada sin factura) y la recepción firmada.
// Enseña lo que se va a facturar (o por qué no se puede) y deja elegir el cobro: uno, dividido en dos, o ninguno ahora.
import { formatearEur, LIMITE_EFECTIVO_CENT } from '@central/module-taller'
import { facturarAccion } from '../../facturas/acciones'

type Medio = { codigo: string; nombre: string; esEfectivo: boolean }
export type Previa = { ok: true; tipo: string; totalCent: number; lineas: number; excluidas: number } | { ok: false; motivo: string }

export function Facturar({ otId, previa, medios }: { otId: string; previa: Previa; medios: Medio[] }) {
  if (!previa.ok) return <p className="aviso-error">No se puede facturar todavía: {previa.motivo}</p>
  return (
    <form action={facturarAccion} className="formulario">
      <input type="hidden" name="otId" value={otId} />
      <p>
        {previa.tipo === 'F2' ? 'Factura simplificada' : 'Factura completa'} de <strong>{formatearEur(previa.totalCent)}</strong>
        {' '}({previa.lineas} {previa.lineas === 1 ? 'línea' : 'líneas'} aceptadas
        {previa.excluidas > 0 ? `; ${previa.excluidas} sin aceptar quedan fuera` : ''}).
      </p>
      <div className="dos-col">
        <label className="campo">Cobro
          <select name="medio1" defaultValue="">
            <option value="">No se cobra ahora</option>
            {medios.map((m) => <option key={m.codigo} value={m.codigo}>{m.nombre}</option>)}
          </select>
        </label>
        <label className="campo">Importe (vacío = el total)
          <input name="importe1" inputMode="decimal" placeholder={formatearEur(previa.totalCent)} />
        </label>
        <label className="campo">Segundo medio (cobro dividido)
          <select name="medio2" defaultValue="">
            <option value="">—</option>
            {medios.map((m) => <option key={m.codigo} value={m.codigo}>{m.nombre}</option>)}
          </select>
        </label>
        <label className="campo">Importe del segundo
          <input name="importe2" inputMode="decimal" />
        </label>
      </div>
      <p className="tenue">En efectivo, menos de {formatearEur(LIMITE_EFECTIVO_CENT)} por factura (límite legal). La factura queda registrada y no se puede modificar.</p>
      <button className="btn">Facturar</button>
    </form>
  )
}
