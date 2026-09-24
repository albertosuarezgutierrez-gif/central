import { getSession } from '@/lib/session'
import { getCarteraReal } from '@/lib/trading/cartera-real-io'
import { getBrokerSaldos } from '@/lib/broker'
import { bolsaVieja, importeDivisa, resumenBolsa, BOLSA_STALE_H } from '@/lib/inicio-resumen'
import { Aviso, Cifra, Cifras, NoDisponible, Tarjeta, fila } from './piezas'

// Bolsa = solo IBKR (el patrimonio inmobiliario «cambia poco», decisión de Alberto 24/09/2026).
// Todo POR DIVISA: sumar dólares con euros daría una cifra plausible y falsa.

const firmado = (n: number, divisa: string) => `${n >= 0 ? '+' : '−'}${importeDivisa(Math.abs(n), divisa)}`
const colorDe = (n: number | null) => (n == null ? undefined : n >= 0 ? 'var(--positive)' : 'var(--negative)')

function fechaHora(d: Date): string {
  return new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d)
}

export default async function TarjetaBolsa() {
  const session = await getSession()
  if (!session) return null
  const [cartera, saldos] = await Promise.all([
    getCarteraReal(session.id).catch(() => undefined),
    getBrokerSaldos(session.id).catch(() => null),
  ])

  if (cartera === undefined && saldos === null) {
    return (
      <Tarjeta titulo="Bolsa · IBKR" href="/trading" enlace="Ver cartera">
        <NoDisponible que="Bolsa" motivo="no se ha podido leer la cartera ni el saldo del bróker" donde="/trading" />
      </Tarjeta>
    )
  }

  const porDivisa = cartera ? resumenBolsa(cartera.posiciones) : []
  const vieja = cartera ? bolsaVieja(cartera.actualizado, new Date()) : false
  const principal = porDivisa[0] ?? null

  return (
    <Tarjeta titulo="Bolsa · IBKR" href="/trading" enlace="Ver cartera">
      {cartera === null && <Aviso tono="aviso">La cartera no se ha leído nunca de IBKR{saldos ? ': solo hay saldo de cuenta' : ''}.</Aviso>}
      {cartera === undefined && <Aviso tono="aviso">No se ha podido leer la cartera{saldos ? ': solo se enseña el saldo de cuenta' : ''}.</Aviso>}
      {saldos === null && <Aviso tono="aviso">No se ha podido leer el saldo de la cuenta del bróker: falta en las cifras de abajo.</Aviso>}
      {vieja && cartera && <Aviso tono="aviso">IBKR no se lee desde el {fechaHora(cartera.actualizado)} (más de {BOLSA_STALE_H} h): las cifras pueden estar desfasadas.</Aviso>}

      <Cifras>
        {(saldos ?? []).map(s => (
          <Cifra key={s.broker} label={`Saldo cuenta ${s.broker}`} valor={importeDivisa(s.saldo, s.divisa || 'EUR')} sub={s.actualizado ? `a ${s.actualizado.split('-').reverse().join('/')}` : 'sin fecha'} />
        ))}
        {principal && (
          <Cifra
            label={`Valor posiciones (${principal.divisa})`}
            valor={principal.valor == null ? '—' : importeDivisa(principal.valor, principal.divisa)}
            sub={principal.completo ? `${cartera!.posiciones.filter(p => p.divisa === principal.divisa).length} posición(es)` : 'falta algún precio: es un mínimo'}
          />
        )}
        {principal && (
          <Cifra
            label="Resultado latente"
            valor={principal.pnl == null ? '—' : firmado(principal.pnl, principal.divisa)}
            color={colorDe(principal.pnl)}
            sub={principal.pnlHoy == null ? 'hoy: sin dato' : `hoy ${firmado(principal.pnlHoy, principal.divisa)}`}
          />
        )}
      </Cifras>

      {cartera && cartera.posiciones.length === 0 && <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Cartera leída y sin posiciones abiertas.</p>}
      {cartera && cartera.posiciones.length > 0 && (
        <div>
          {cartera.posiciones.slice(0, 5).map(p => (
            <div key={p.simbolo} style={fila}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600 }}>{p.simbolo}{p.descripcion ? ` · ${p.descripcion}` : ''}</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>
                  {p.cantidad.toLocaleString('es-ES')} acc.{p.precioMedio != null ? ` · medio ${importeDivisa(p.precioMedio, p.divisa)}` : ''}
                </span>
              </span>
              <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: colorDe(p.pnlNoRealizado) }}>
                {p.pnlNoRealizado == null ? 'sin dato' : firmado(p.pnlNoRealizado, p.divisa)}
              </span>
            </div>
          ))}
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>Última lectura de IBKR: {fechaHora(cartera.actualizado)}.</p>
        </div>
      )}
      {porDivisa.length > 1 && <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>Hay posiciones en {porDivisa.length} divisas: cada una se cuenta por separado en /trading.</p>}
    </Tarjeta>
  )
}
