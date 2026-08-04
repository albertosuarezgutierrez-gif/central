import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { validarIban, generarSepaXml } from '@central/module-pagos'
import { iniciarPago, disponiblePis } from '@/lib/enablebanking'
import { baseUrl } from '@/lib/base-url'

export const dynamic = 'force-dynamic'

// Tope de seguridad por transferencia, en €. Se puede subir con la env TRANSFERENCIA_MAX_EUR.
// Es una red anti-error/anti-dedazo: el importe SIEMPRE lo teclea el dueño (la IA no interviene),
// pero un cero de más no debe salir sin fricción.
const MAX_EUR = Number(process.env.TRANSFERENCIA_MAX_EUR ?? '3000') || 3000

// POST /api/banca/transferencia { creditorName, creditorIban, importe, concepto }
// Ordena una transferencia SEPA "libre" (a cualquier destinatario que teclee el dueño).
// La IA NO participa: los datos vienen del formulario, no de un LLM (regla del repo:
// "la IA nunca inventa cifras"). Dos capas de seguridad: (1) confirmación en pantalla antes de
// llamar aquí, y (2) firma en el banco (SCA) cuando PIS está activo.
//   · Con PIS (EB_PIS_ENABLED=true + EB_DEBTOR_IBAN) → devuelve auth_url para firmar en el banco.
//   · Sin PIS → genera el SEPA XML pain.001 para importarlo manualmente en el banco.
export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    creditorName?: string
    creditorIban?: string
    importe?: number | string
    concepto?: string
  }

  const creditorName = (body.creditorName ?? '').trim()
  const creditorIban = (body.creditorIban ?? '').replace(/\s/g, '').toUpperCase()
  const importe = typeof body.importe === 'string' ? Number(body.importe.replace(',', '.')) : Number(body.importe)
  const concepto = (body.concepto ?? '').trim() || `Transferencia a ${creditorName || 'destinatario'}`

  if (!creditorName) return NextResponse.json({ error: 'Falta el nombre del destinatario.' }, { status: 400 })
  if (!validarIban(creditorIban)) return NextResponse.json({ error: 'El IBAN del destinatario no es válido.' }, { status: 400 })
  if (!Number.isFinite(importe) || importe <= 0) return NextResponse.json({ error: 'El importe no es válido.' }, { status: 400 })

  const importe2 = Math.round(importe * 100) / 100
  if (importe2 > MAX_EUR) {
    return NextResponse.json(
      { error: `Por seguridad, el máximo por transferencia es ${MAX_EUR}€. Súbelo con TRANSFERENCIA_MAX_EUR si necesitas más.` },
      { status: 400 },
    )
  }

  const debtorIban = (process.env.EB_DEBTOR_IBAN ?? '').replace(/\s/g, '')
  if (!debtorIban) {
    return NextResponse.json(
      { error: 'Falta configurar EB_DEBTOR_IBAN (tu IBAN de origen) en Vercel.' },
      { status: 400 },
    )
  }

  // PIS activo → transferencia real; el dueño la firma en su banco (SCA).
  if (disponiblePis()) {
    try {
      const pago = await iniciarPago({
        debtorIban,
        creditorName,
        creditorIban,
        importe: importe2,
        concepto,
        redirectUrl: `${baseUrl()}/banca?transferencia=ok`,
      })
      return NextResponse.json({ modo: 'pis', auth_url: pago.auth_url, payment_id: pago.payment_id })
    } catch (e: any) {
      return NextResponse.json({ error: `El banco rechazó iniciar el pago: ${e?.message ?? 'error'}` }, { status: 502 })
    }
  }

  // Sin PIS → SEPA XML pain.001 para importarlo a mano en el banco.
  const xml = generarSepaXml({
    debtorName: session.nombre ?? 'Titular',
    debtorIban,
    fechaEjecucion: new Date().toISOString().slice(0, 10),
    transferencias: [{ creditorName, creditorIban, importe: importe2, concepto }],
  })
  return NextResponse.json({ modo: 'sepa_xml', xml })
}
