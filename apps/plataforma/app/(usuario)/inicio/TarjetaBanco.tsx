import { Suspense } from 'react'
import { getSession } from '@/lib/session'
import { getSaldoConsolidado, getEvolucionMensual, listarPorRevisar } from '@/lib/banca'
import { getEstadoFeedPsd2 } from '@/lib/psd2-estado'
import { getTesoreria } from '@/lib/tesoreria'
import { BANCO_STALE_H } from '@/lib/inicio-acciones'
import { proximosCargos } from '@/lib/inicio-resumen'
import { eur } from '@/lib/dinero'
import { Aviso, Cifra, Cifras, NoDisponible, Tarjeta, fila, subTitulo } from './piezas'

function hoyMadrid(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
}
const ddmm = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7)
const firmado = (n: number) => `${n >= 0 ? '+' : '−'}${eur(Math.abs(n))}`

export default async function TarjetaBanco() {
  const session = await getSession()
  if (!session) return null
  const mes = hoyMadrid().slice(0, 7)
  const [saldo, evol, porRevisar, feed] = await Promise.all([
    getSaldoConsolidado(session.id).catch(() => null),
    getEvolucionMensual(session.id, 1).catch(() => null),
    listarPorRevisar(session.id).catch(() => null),
    getEstadoFeedPsd2(session.id).catch(() => undefined),
  ])

  if (!saldo) {
    return (
      <Tarjeta titulo="Banco" href="/banca" enlace="Ir a Banca" ancha>
        <NoDisponible que="Banco" motivo="no se ha podido leer el saldo de las cuentas" donde="/banca" />
      </Tarjeta>
    )
  }

  // Frescura del feed: número de horas, `null` = no se pudo saber, 'no_aplica' = sin banco vinculado.
  const horas: number | null | 'no_aplica' =
    feed === undefined ? null
      : feed === null ? 'no_aplica'
      : !feed.ultimoSync ? null
      : (Date.now() - new Date(feed.ultimoSync).getTime()) / 3_600_000
  const viejo = typeof horas === 'number' && horas > BANCO_STALE_H
  const actual = evol?.find(e => e.mes === mes) ?? (evol ? { mes, ingresos: 0, gastos: 0 } : null)

  return (
    <Tarjeta titulo="Banco" href="/banca" enlace="Ir a Banca" ancha>
      {viejo && feed?.ultimoSync && (
        <Aviso tono="negativo">El banco no sincroniza desde el {ddmm(feed.ultimoSync.slice(0, 10))}: los saldos son de esa fecha, no de hoy. Reconecta en Banca.</Aviso>
      )}
      {horas === null && <Aviso tono="aviso">No se ha podido comprobar cuándo sincronizó el banco por última vez: los saldos pueden ser viejos.</Aviso>}
      <Cifras>
        <Cifra
          label="Saldo del grupo"
          valor={eur(saldo.total)}
          sub={saldo.sinSaldo > 0 ? `mínimo: ${saldo.sinSaldo} cuenta(s) sin saldo` : typeof horas === 'number' ? `sincronizado hace ${horas < 1 ? 'menos de 1 h' : Math.round(horas) + ' h'}` : undefined}
        />
        <Cifra label="Entradas del mes" valor={actual ? firmado(actual.ingresos) : '—'} color={actual ? 'var(--positive)' : undefined} sub={actual ? 'sin traspasos internos' : 'no se pudo leer'} />
        <Cifra label="Salidas del mes" valor={actual ? firmado(-actual.gastos) : '—'} color={actual ? 'var(--negative)' : undefined} sub={actual ? undefined : 'no se pudo leer'} />
        <Cifra
          label="Por revisar"
          valor={porRevisar == null ? '—' : porRevisar.length >= 40 ? '40+' : porRevisar.length}
          color={porRevisar && porRevisar.length > 0 ? 'var(--warning)' : undefined}
          sub={porRevisar == null ? 'no se pudo contar' : 'movimientos sin negocio'}
        />
      </Cifras>
      <Suspense fallback={<p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Calculando próximos cargos…</p>}>
        <ProximosCargos cuentaId={session.id} />
      </Suspense>
    </Tarjeta>
  )
}

/** En su propio Suspense: la tesorería recorre TODO el histórico de movimientos. */
async function ProximosCargos({ cuentaId }: { cuentaId: string }) {
  const hoy = hoyMadrid()
  const t = await getTesoreria(cuentaId, hoy).catch(() => null)
  if (!t) return <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>No se han podido calcular los próximos cargos (la previsión no respondió).</p>
  const lista = proximosCargos(t.recurrentes.map(r => ({ concepto: r.concepto, importeMedio: r.importeMedio, intervaloDias: r.intervaloDias, ultimaFecha: r.ultimaFecha })), hoy, 7)
  const p30 = t.proyecciones.find(p => p.dias === 30)
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <p style={subTitulo}>Próximos cargos · 7 días</p>
        {p30 && <span style={{ fontSize: 12, color: 'var(--muted)' }}>saldo previsto en 30 días: <b style={{ color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>{eur(p30.proyectado)}</b>{t.cuentasSinSaldo > 0 ? ' (mínimo)' : ''}</span>}
      </div>
      {lista.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: '8px 0 0' }}>No se espera ningún cargo recurrente esta semana.</p>
      ) : (
        <div style={{ marginTop: 6 }}>
          {lista.slice(0, 6).map((c, i) => (
            <div key={i} style={fila}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontWeight: 600, overflowWrap: 'anywhere' }}>{c.concepto}</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>{ddmm(c.fecha)} · cada ~{Math.round(c.intervaloDias)} días</span>
              </span>
              <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: c.importe >= 0 ? 'var(--positive)' : 'var(--negative)' }}>{firmado(c.importe)}</span>
            </div>
          ))}
        </div>
      )}
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '8px 0 0' }}>Sale de los cargos que se repiten en tus movimientos: es una previsión, no pagos confirmados.</p>
    </div>
  )
}
