import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'
import { prisma } from '@/lib/db'
import { tuyaListDevices } from '@/lib/domotica/tuya'
import { smoobuFetch } from '@/lib/smoobu'

export const dynamic = 'force-dynamic'

// POST: da de alta los dispositivos Tuya que falten y devuelve los apartamentos de
// Smoobu para el selector piso→reservas de la UI.
export async function POST() {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  try {
    const devices = await tuyaListDevices()
    for (const d of devices) {
      await prisma.$executeRaw`
        INSERT INTO domotica_dispositivos (nombre, tuya_device_id, categoria)
        VALUES (${d.name || d.id}, ${d.id}, ${d.category || null})
        ON CONFLICT (tuya_device_id)
        DO UPDATE SET categoria = COALESCE(EXCLUDED.categoria, domotica_dispositivos.categoria)`
    }

    // Apartamentos de Smoobu para vincular piso → reservas (best effort).
    let apartamentos: { id: number; name: string }[] = []
    try {
      const r = await smoobuFetch('/api/apartments', { cache: 'no-store' }).then(x => x.json())
      const lista = Array.isArray(r) ? r : r?.apartments || []
      apartamentos = lista.map((a: { id: number; name: string }) => ({ id: a.id, name: a.name }))
    } catch { /* el selector queda vacío; se puede reintentar */ }

    return NextResponse.json({ encontrados: devices, apartamentos })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
