import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getSession } from '@/lib/session'
import ContableChat from './ContableChat'
import PreciosChat from './PreciosChat'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Asistentes · plataforma' }

// 🤖 Los asistentes con los que SE PUEDE HABLAR, en un solo sitio.
//
// Alberto (02/09/2026): «unifica agentes en una página… me refiero asistentes como contable,
// precios». Estaban repartidos en /contable y /agente, dos URLs que nadie relaciona entre sí.
// Aquí se eligen con una pestaña; cada chat es EL MISMO componente de antes, movido tal cual
// (git mv) y no reescrito — reescribir un chat que funciona para «unificarlo» es la forma cara
// de unificar. /contable y /agente siguen existiendo como redirect, que es lo que salva los
// marcadores viejos.
//
// Distinto de /operador/agentes: allí están los 29 AUTÓNOMOS (crons y rutinas, que no conversan)
// y su semáforo de salud. Aquí solo lo que responde cuando le preguntas.

type Clave = 'contable' | 'precios'

const ASISTENTES: { clave: Clave; nombre: string; icono: string }[] = [
  { clave: 'contable', nombre: 'Contable', icono: '🧮' },
  { clave: 'precios', nombre: 'Precios', icono: '🏷️' },
]

export default async function AsistentesPage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string }>
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const sp = await searchParams.catch(() => ({} as { a?: string }))
  const activo: Clave = sp?.a === 'precios' ? 'precios' : 'contable'

  const pestanas = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
      {ASISTENTES.map(a => (
        <Link
          key={a.clave}
          href={`/asistentes?a=${a.clave}`}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
            textDecoration: 'none', minHeight: 40,
            border: '1px solid var(--border)',
            background: activo === a.clave ? 'var(--primary)' : 'var(--surface)',
            color: activo === a.clave ? '#fff' : 'var(--text)',
          }}
        >
          <span aria-hidden>{a.icono}</span>{a.nombre}
        </Link>
      ))}
    </div>
  )

  return activo === 'precios'
    ? <PreciosChat cabecera={pestanas} />
    : <ContableChat cabecera={pestanas} />
}
