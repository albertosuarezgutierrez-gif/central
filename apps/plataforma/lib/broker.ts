// Saldo de cuentas de bróker/inversión (Interactive Brokers) para la vista 💶 Dinero de /banca.
//
// La app en Vercel NO habla con IBKR: el saldo lo refresca la pasada diaria del agente
// `trading-analista` (que sí tiene el MCP de IBKR) vía POST /api/trading/saldo. Aquí solo se lee/
// escribe el último saldo conocido por cuenta. Se pinta como una tarjeta más (igual que BBVA/
// Kutxabank) y su importe suma al «Saldo total del grupo». Importe en EUR (net liquidation base).
import { prisma } from '@/lib/db'

export type BrokerSaldo = {
  broker: string
  saldo: number
  divisa: string
  /** ISO YYYY-MM-DD del último refresco. */
  actualizado: string | null
}

// Saldos de bróker de una cuenta (scope multi-tenant), ordenados por importe desc.
export async function getBrokerSaldos(cuentaId: string): Promise<BrokerSaldo[]> {
  const rows = await prisma.brokerSaldo.findMany({
    where: { cuentaId },
    orderBy: { saldo: 'desc' },
  })
  return rows.map(r => ({
    broker: r.broker,
    saldo: Number(r.saldo),
    divisa: r.divisa,
    actualizado: r.actualizadoEn ? r.actualizadoEn.toISOString().slice(0, 10) : null,
  }))
}

// Suma de todos los saldos de bróker de una cuenta (para el total del grupo).
export async function getBrokerTotal(cuentaId: string): Promise<number> {
  const saldos = await getBrokerSaldos(cuentaId)
  return saldos.reduce((acc, s) => acc + s.saldo, 0)
}

// Upsert del saldo (una fila por cuenta+bróker). Lo llama el endpoint que refresca el agente.
export async function upsertBrokerSaldo(
  cuentaId: string,
  saldo: number,
  opts: { broker?: string; divisa?: string } = {},
): Promise<void> {
  const broker = (opts.broker || 'Interactive Brokers').trim()
  const divisa = (opts.divisa || 'EUR').trim().toUpperCase()
  await prisma.brokerSaldo.upsert({
    where: { cuentaId_broker: { cuentaId, broker } },
    create: { cuentaId, broker, saldo, divisa },
    update: { saldo, divisa, actualizadoEn: new Date() },
  })
}
