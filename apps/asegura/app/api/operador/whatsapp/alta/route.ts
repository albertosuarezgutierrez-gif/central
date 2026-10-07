import { NextResponse } from 'next/server'
import { encryptField } from '@central/module-seguros-pii'
import { operadorAutorizado } from '@/lib/operador'
import { registrarErrorCartera } from '@/lib/error-cartera'
import { aseguraConfigurada } from '@/lib/asegura-db'
import { correduriaUnica } from '@/lib/cartera'
import { auditado } from '@/lib/auditoria'
import { darDeAltaWhatsapp } from '@/lib/whatsapp/alta'
import { crearClienteGraph, versionGraph } from '@/lib/whatsapp/graph'
import { secretoWhatsapp } from '@/lib/whatsapp/secretos'
import { guardarAltaConexion, guardarSuscripcion, guardarSync, guardarVerificacion, leerConexion } from '@/lib/whatsapp/conexion'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/operador/whatsapp/alta — cierre del Embedded Signup (v4, Coexistence) que Alberto hace en
 * plataforma (/correduria/ajustes/whatsapp). Cuerpo: {code, waba_id, phone_number_id, business_id?}.
 * Canjea el code, guarda el token CIFRADO, suscribe la app a la WABA, pide las dos syncs de
 * Coexistence y verifica el número. Toda la lógica en lib/whatsapp/alta.ts. Doc: docs/WHATSAPP.md.
 * 🚫 No envía mensajes ni registra el número.
 */
export const POST = auditado(async (req: Request) => {
  if (!operadorAutorizado(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const cuerpo: unknown = await req.json().catch(() => null)
  try {
    if (!aseguraConfigurada()) return NextResponse.json({ estado: 'sin_configurar', faltan: ['DATABASE_URL'] }, { status: 503 })
    const correduria = await correduriaUnica()
    if (!correduria) return NextResponse.json({ estado: 'error', motivo: 'sin correduría' }, { status: 500 })
    const id = correduria.id
    const r = await darDeAltaWhatsapp(cuerpo, {
      secreto: secretoWhatsapp,
      version: versionGraph(),
      graph: (version) => crearClienteGraph({ version }),
      cifrar: encryptField,
      numeroDelWebhook: secretoWhatsapp('WHATSAPP_PHONE_NUMBER_ID'),
      // Lee las columnas del SQL 2026-10-05f: si falta, falla AQUÍ, antes de gastar el code.
      comprobarAlmacen: async () => {
        if ((await leerConexion(id)) === null) throw new Error('correduría sin fila')
      },
      guardarAlta: (d) => guardarAltaConexion(id, d),
      guardarSuscripcion: () => guardarSuscripcion(id),
      guardarSync: (tipo, requestId) => guardarSync(id, tipo, requestId),
      guardarVerificacion: (v) => guardarVerificacion(id, v),
    })
    return NextResponse.json(r.cuerpo, { status: r.status })
  } catch (e) {
    return NextResponse.json({ estado: 'error', causa: registrarErrorCartera('operador/whatsapp/alta', e) }, { status: 500 })
  }
})
