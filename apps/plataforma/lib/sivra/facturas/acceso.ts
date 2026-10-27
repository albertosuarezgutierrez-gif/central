// lib/sivra/facturas/acceso.ts — guarda de las rutas internas de facturas a huéspedes (SERVIDOR).
// Sesión de plataforma y NO una cuenta acotada a otra sección (rol 'empresas'). El aislamiento entre cuentas lo da
// el `cuenta_id` de la sesión en cada consulta (una cuenta sin pisos enlazados ve un libro vacío, no el de otra).
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/session'

export async function exigirSesionFacturas(): Promise<{ ok: true; cuentaId: string } | { ok: false; respuesta: NextResponse }> {
  const s = await getSession()
  if (!s) return { ok: false, respuesta: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  if (s.rol === 'empresas') return { ok: false, respuesta: NextResponse.json({ error: 'Sin acceso' }, { status: 403 }) }
  return { ok: true, cuentaId: s.id }
}
