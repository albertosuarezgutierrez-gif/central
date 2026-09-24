import Link from 'next/link'
import { getSession } from '@/lib/session'
import { resolverAccesoCorreduria } from '@/lib/correduria-acceso'
import { carteraAsegura, vencimientosAsegura } from '@/lib/cartera-asegura'
import { describirCausaAsegura } from '@/lib/correduria-puerto'
import { colaLlamadas, interpretarLeads, interpretarTareasHoy, leadsCompetenciaAsegura, tareasHoyAsegura } from '@/lib/seguimiento-asegura'
import { cuandoTarea } from '../correduria/hoy-cockpit'
import { Badge } from '@/components/ui'
import { Cifra, Cifras, NoDisponible, Tarjeta, fila, subTitulo } from './piezas'

// Correduría = lo que Alberto está TRATANDO (dictado 24/09/2026): oportunidades en curso,
// vencimientos y siniestros abiertos. La foto de cartera (clientes/pólizas) NO va aquí.

function hoyMadrid(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' }).format(new Date())
}

function motivoCaida(e: { estado: 'sin_configurar' } | { estado: 'error'; motivo: string; causa?: string }): string {
  if (e.estado === 'sin_configurar') return 'la conexión con la cartera no está configurada'
  return describirCausaAsegura(e.causa) ?? `la cartera no ha respondido (${e.motivo})`
}

export default async function TarjetaCorreduria() {
  const session = await getSession()
  if (!session) return null
  const acceso = await resolverAccesoCorreduria(session)
  // Quien no es de la casa no ve la correduría: tampoco su tarjeta.
  if (acceso.estado === 'no-autorizado') return null
  if (acceso.estado === 'sin-comprobar') {
    return (
      <Tarjeta titulo="Correduría" href="/correduria" enlace="Abrir Hoy">
        <NoDisponible que="Correduría" motivo={`no se ha podido comprobar el acceso (${acceso.detalle})`} donde={<Link href="/correduria">/correduria</Link>} />
      </Tarjeta>
    )
  }

  const hoy = hoyMadrid()
  const [rTareas, rLeads, venc, cartera] = await Promise.all([
    tareasHoyAsegura().catch(() => ({ status: 502, json: null })),
    leadsCompetenciaAsegura(90).catch(() => ({ status: 502, json: null })),
    vencimientosAsegura(60).catch(() => null),
    carteraAsegura().catch(() => null),
  ])
  const tareas = interpretarTareasHoy(rTareas.status, rTareas.json)
  const leads = interpretarLeads(rLeads.status, rLeads.json)
  const llamadas = leads.estado === 'ok' ? colaLlamadas(leads.leads) : null

  // Todo caído a la vez = el puerto no responde: un solo aviso, no cuatro.
  if (tareas.estado !== 'ok' && leads.estado !== 'ok' && venc?.estado !== 'ok' && cartera?.estado !== 'ok') {
    const motivo = venc ? motivoCaida(venc) : 'la cartera no ha respondido'
    return (
      <Tarjeta titulo="Correduría · lo que tienes entre manos" href="/correduria" enlace="Abrir Hoy">
        <NoDisponible que="Correduría" motivo={motivo} donde={<Link href="/correduria">/correduria</Link>} />
      </Tarjeta>
    )
  }

  const vencidas = tareas.estado === 'ok' ? tareas.tareas.filter(t => cuandoTarea(t.fechaLimite, hoy).vencida).length : 0
  const nOportunidades = tareas.estado === 'ok' && llamadas ? tareas.tareas.length + llamadas.length : null
  const vencOk = venc?.estado === 'ok' ? venc : null
  const esteMes = vencOk ? vencOk.polizas.filter(p => p.dias <= 30).length : null
  const siniestros = cartera?.estado === 'ok' ? cartera.siniestrosAbiertos : null

  const top = tareas.estado === 'ok' ? tareas.tareas.slice(0, 3) : []
  const proximas = vencOk ? [...vencOk.polizas].sort((a, b) => a.dias - b.dias).slice(0, 3) : []

  return (
    <Tarjeta titulo="Correduría · lo que tienes entre manos" href="/correduria" enlace="Abrir Hoy">
      <Cifras>
        <Cifra
          label="Oportunidades hoy"
          valor={nOportunidades ?? '—'}
          sub={nOportunidades == null ? 'no se pudo contar' : vencidas > 0 ? `${vencidas} van tarde` : `${llamadas?.length ?? 0} llamadas`}
          color={vencidas > 0 ? 'var(--negative)' : undefined}
        />
        <Cifra
          label="Vencen ≤60 días"
          valor={vencOk ? vencOk.polizas.length + (vencOk.truncado ? '+' : '') : '—'}
          sub={esteMes == null ? 'no se pudo leer' : `${esteMes} en 30 días`}
        />
        <Cifra
          label="Siniestros abiertos"
          valor={siniestros ?? '—'}
          sub={siniestros == null ? 'no se pudo leer' : undefined}
          color={siniestros ? 'var(--warning)' : undefined}
        />
      </Cifras>

      <div>
        <p style={subTitulo}>Oportunidades en curso</p>
        {tareas.estado !== 'ok' ? (
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '8px 0 0' }}>No se han podido leer las tareas: {tareas.estado === 'sin_configurar' ? 'conexión sin configurar' : tareas.motivo}.</p>
        ) : top.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted)', margin: '8px 0 0' }}>Ninguna tarea para hoy{llamadas && llamadas.length > 0 ? <> · <Link href="/correduria/vencimientos/llamada" style={{ color: 'var(--primary)' }}>{llamadas.length} llamada(s) en cola</Link></> : ''}.</p>
        ) : (
          <div style={{ marginTop: 6 }}>
            {top.map(t => {
              const c = cuandoTarea(t.fechaLimite, hoy)
              return (
                <Link key={t.id} href={`/correduria/oportunidad/${t.oportunidadId}`} style={fila}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, overflowWrap: 'anywhere' }}>{t.cliente ?? 'Cliente sin nombre legible'}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)', overflowWrap: 'anywhere' }}>{[t.ramo, t.observaciones].filter(Boolean).join(' · ') || t.tipo}</span>
                  </span>
                  <Badge tono={c.vencida ? 'negativo' : 'aviso'}>{c.vencida ? `Vencida ${c.texto}` : 'Hoy'}</Badge>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {vencOk && proximas.length > 0 && (
        <div>
          <p style={subTitulo}>Próximos vencimientos</p>
          <div style={{ marginTop: 6 }}>
            {proximas.map(p => {
              const contenido = (
                <>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontWeight: 600, overflowWrap: 'anywhere' }}>{p.cliente}</span>
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--muted)' }}>{p.tipo} · {p.aseguradora}</span>
                  </span>
                  <Badge tono={p.dias <= 15 ? 'negativo' : p.dias <= 30 ? 'aviso' : 'info'}>{p.fechaVencimiento.split('-').reverse().slice(0, 2).join('/')}</Badge>
                </>
              )
              return p.clienteId
                ? <Link key={p.id} href={`/correduria/cliente/${p.clienteId}`} style={fila}>{contenido}</Link>
                : <div key={p.id} style={fila}>{contenido}</div>
            })}
          </div>
        </div>
      )}
      {venc && venc.estado !== 'ok' && (
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Vencimientos no disponibles: {motivoCaida(venc)}.</p>
      )}
    </Tarjeta>
  )
}
