import { redirect } from 'next/navigation'
import { getSesion, AuthError } from '@/lib/tenant'
import FichajesClient from './FichajesClient'

const MES = /^\d{4}-(0[1-9]|1[0-2])$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// `?mes=AAAA-MM&empleado_id=<uuid>`: enlace desde el panel de nóminas a los fichajes de origen (solo precarga el filtro;
// la consulta sigue filtrando por la empresa de la sesión).
export default async function Page({ searchParams }: { searchParams: Promise<{ mes?: string; empleado_id?: string }> }) {
  try { await getSesion() } catch (e) { if (e instanceof AuthError) redirect('/login'); throw e }
  const q = await searchParams
  return <FichajesClient mesInicial={q.mes && MES.test(q.mes) ? q.mes : undefined} empleadoInicial={q.empleado_id && UUID.test(q.empleado_id) ? q.empleado_id : undefined} />
}
