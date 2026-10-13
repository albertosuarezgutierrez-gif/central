import { NextResponse } from 'next/server'
import { exigirCorreduria } from '@/lib/correduria-acceso'
import { avisosAsegura } from '@/lib/seguimiento-asegura'
import { leerIngestaCima } from '@/lib/correduria/ingesta-cima'
import { interpretarVistaIngesta, type VistaIngesta } from '@/lib/correduria/ingesta-pantalla'
import { componerAvisos } from '@/lib/correduria/avisos'

export const dynamic = 'force-dynamic'
// Puerto de avisos (20 s) e ingesta (dos llamadas de 8 s) EN PARALELO.
export const maxDuration = 30

/**
 * GET — banda de avisos de «Mi mesa» (13/10/2026): solo lo que tiene PLAZO encima o es urgente.
 *   { estado:'ok', hoy, avisos:[{ tipo, nivel:'urgente'|'no_comprobado'|'aviso', texto, n, plazo, diasRestantes, href }] }
 * Lista vacía = todo comprobado y nada pendiente. Una cola que no se pudo leer sale como línea
 * `no_comprobado` («No se han podido comprobar …»), nunca desaparece. La ingesta usa el MISMO veredicto que
 * su pantalla (`veredictoIngesta`).
 */
export async function GET() {
  const guarda = await exigirCorreduria()
  if (!guarda.ok) return guarda.respuesta

  const [puerto, ingesta] = await Promise.all([
    avisosAsegura(),
    leerIngestaCima()
      .then((r): VistaIngesta => interpretarVistaIngesta(200, r))
      .catch((): VistaIngesta => ({ estado: 'error', motivo: 'respuesta_ilegible' })),
  ])
  const hoy = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Madrid' })
  return NextResponse.json(componerAvisos(puerto.status, puerto.json, ingesta, hoy), { headers: { 'cache-control': 'no-store' } })
}
