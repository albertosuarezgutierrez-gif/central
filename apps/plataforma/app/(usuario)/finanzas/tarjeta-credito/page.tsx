import { requireSession } from '@/lib/session'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'
import TarjetaCreditoClient from './TarjetaCreditoClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Tarjeta de crédito · plataforma' }

export default async function TarjetaCreditoPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>
}) {
  const session = await requireSession().catch(() => null)
  if (!session) redirect('/login')

  const { mes: mesParam } = await searchParams
  const hoy = new Date()
  const mesActual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}`
  const mes = /^\d{4}-\d{2}$/.test(mesParam ?? '') ? mesParam! : mesActual

  const [anio, numMes] = mes.split('-').map(Number)
  const inicio = `${mes}-01`
  const fin = new Date(anio, numMes, 0).toISOString().slice(0, 10)

  const rows = await prisma.$queryRaw<Array<{
    cuenta_bancaria_id: string
    iban_mascara: string | null
    banco: string | null
    alias: string | null
    id: string
    fecha_operacion: Date | null
    concepto: string | null
    importe: unknown
    destino: string | null
    destino_confirmado: boolean | null
    requiere_revision: boolean | null
    conciliado: boolean | null
  }>>`
    SELECT mb.id, mb.cuenta_bancaria_id, cb.iban_mascara, cb.banco, cb.alias,
           mb.fecha_operacion, coalesce(mb.concepto_normalizado, mb.concepto) AS concepto,
           mb.importe, mb.destino, mb.destino_confirmado, mb.requiere_revision, mb.conciliado
    FROM movimientos_bancarios mb
    JOIN cuentas_bancarias cb ON cb.id = mb.cuenta_bancaria_id
    WHERE cb.cuenta_id = ${session.id}::uuid
      AND cb.tipo = 'tarjeta'
      AND mb.fecha_operacion BETWEEN ${inicio}::date AND ${fin}::date
      AND coalesce(mb.duplicado_estado, '') <> 'ignorado'
    ORDER BY mb.fecha_operacion DESC, mb.importe ASC
  `

  const countTarjetas = await prisma.$queryRaw<[{ n: unknown }]>`
    SELECT count(*) AS n FROM cuentas_bancarias
    WHERE cuenta_id = ${session.id}::uuid AND tipo = 'tarjeta'
  `
  const hasTarjetas = rows.length > 0 || Number(countTarjetas[0]?.n ?? 0) > 0

  const porCuenta = new Map<string, {
    cuentaBancariaId: string
    ibanMascara: string | null
    banco: string | null
    alias: string | null
    movimientos: Array<{
      id: string
      fecha: string | null
      concepto: string | null
      importe: number
      destino: string | null
      destinoConfirmado: boolean | null
      requiereRevision: boolean | null
      conciliado: boolean | null
    }>
  }>()

  for (const r of rows) {
    let entry = porCuenta.get(r.cuenta_bancaria_id)
    if (!entry) {
      entry = {
        cuentaBancariaId: r.cuenta_bancaria_id,
        ibanMascara: r.iban_mascara,
        banco: r.banco,
        alias: r.alias,
        movimientos: [],
      }
      porCuenta.set(r.cuenta_bancaria_id, entry)
    }
    entry.movimientos.push({
      id: r.id,
      fecha: r.fecha_operacion ? (r.fecha_operacion as Date).toISOString().slice(0, 10) : null,
      concepto: r.concepto,
      importe: Number(r.importe),
      destino: r.destino,
      destinoConfirmado: r.destino_confirmado,
      requiereRevision: r.requiere_revision,
      conciliado: r.conciliado,
    })
  }

  const tarjetas = [...porCuenta.values()]

  return <TarjetaCreditoClient tarjetas={tarjetas} mes={mes} hasTarjetas={hasTarjetas} />
}
