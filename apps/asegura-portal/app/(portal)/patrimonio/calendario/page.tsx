import Link from 'next/link'
import { redirect } from 'next/navigation'

import { calendarioDeIdentidad, type CalendarioDeIdentidad } from '@/lib/patrimonio/calendario-bd'
import { getIdentidad } from '@/lib/session'

export const dynamic = 'force-dynamic'

const fechaEs = (f: string) => f.split('-').reverse().join('/')
const ESTADO: Record<string, string> = {
  vencida: 'Vencida',
  avisar: 'Se acerca',
  sin_dato: 'Sin fecha',
  al_dia: 'Al día',
  cumplida: 'Hecha',
}

function cuando(dias: number | null, vence: string | null): string {
  if (vence === null || dias === null) return 'No sabemos cuándo te toca'
  if (dias === 0) return `Hoy (${fechaEs(vence)})`
  if (dias > 0) return `${fechaEs(vence)} · dentro de ${dias} ${dias === 1 ? 'día' : 'días'}`
  return `${fechaEs(vence)} · hace ${-dias} ${dias === -1 ? 'día' : 'días'}`
}

/**
 * «Calendario y avisos» del patrimonio (24/10/2026, P13). 🚨 Todo parte de `accesosPatrimonio()` (dentro de
 * `calendarioDeIdentidad`): solo los inmuebles de los titulares que esta sesión ve. Una lectura que falla NO se pinta
 * como «no tienes nada pendiente»; un vencimiento sin fecha NO se pinta como «al día».
 */
export default async function CalendarioPatrimonioPage() {
  const identidad = await getIdentidad()
  if (!identidad) redirect('/')
  let datos: CalendarioDeIdentidad | null = null
  let fallo = false
  try {
    datos = await calendarioDeIdentidad(identidad.id)
  } catch (e) {
    console.error('[patrimonio/calendario]', e instanceof Error ? e.message : e)
    fallo = true
  }

  return (
    <>
      <p className="antetitulo">Patrimonio</p>
      <h1>Calendario y avisos</h1>
      <p className="suave" style={{ marginTop: 0 }}>
        Lo que vence en tus inmuebles y contratos. Te avisamos desde la campana y, si lo tienes activado, por notificación.
      </p>

      {fallo ? (
        <section className="seccion"><p role="status" style={{ margin: 0 }}>Ahora no hemos podido leer tu calendario. Vuelve a intentarlo en un rato; no significa que no tengas nada pendiente.</p></section>
      ) : datos === null ? (
        <section className="seccion"><p style={{ margin: 0 }}>No tienes ningún patrimonio asignado en este portal.</p></section>
      ) : datos.vencimientos.length === 0 ? (
        <section className="seccion">
          <p style={{ margin: 0 }}>
            Todavía no hay nada en el calendario. Los contratos que anotes aparecen aquí con su fin, su fianza y su actualización de renta, y también los recordatorios que añadas en la ficha de cada inmueble (IBI, comunidad, caldera…).
          </p>
        </section>
      ) : (
        <section className="seccion" aria-label="Vencimientos">
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 12 }}>
            {datos.vencimientos.map((v) => (
              <li key={v.clave} style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <strong style={{ overflowWrap: 'anywhere' }}>{v.etiqueta}</strong>
                  <span className="chip">{ESTADO[v.estado] ?? v.estado}</span>
                </div>
                <div className="suave" style={{ fontSize: 14, overflowWrap: 'anywhere' }}>
                  {v.inmueble} · {cuando(v.dias, v.vence)}
                </div>
                {v.detalle && <div style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{v.detalle}</div>}
                {v.estado === 'sin_dato' && v.falta && <div style={{ fontSize: 14 }}>{v.falta}</div>}
                <Link
                  href={v.contratoId ? `/patrimonio/contrato/${v.contratoId}` : `/patrimonio/inmueble/${v.inmuebleId}`}
                  style={{ display: 'inline-block', minHeight: 44, paddingBlock: 10 }}
                >
                  Abrir
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p style={{ marginTop: 24 }}>
        <Link href="/patrimonio">← Todo el patrimonio</Link>
      </p>
    </>
  )
}
