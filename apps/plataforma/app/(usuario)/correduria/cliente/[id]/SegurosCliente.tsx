import Link from 'next/link'
import type { RepartoSeguros, SeguroCliente } from '@/lib/correduria/seguros-cliente'
import { estaHuerfana } from '@/lib/correduria/seguros-cliente'
import { ROTULO_ESTADO, TIPOS_TAREA_UI, rotuloMotivo, rotuloRamo, type OportunidadDeCliente } from '@/lib/seguimiento-asegura'
import type { SiniestroCartera } from '@/lib/siniestros-asegura'
import { eur } from '@/lib/dinero'
import { TIPOS, fmt } from './piezas'

/**
 * Los seguros del cliente en tres cubos, cada uno una tarjeta que se pincha
 * entera (24/09/2026): «con nosotros» → su póliza; «oportunidad» → su
 * seguimiento de venta; «ya no existe», plegado al final. Lo urgente
 * (recibo devuelto, siniestro abierto, vence pronto, oportunidad sin próximo
 * paso) va en la propia tarjeta: no se esconde detrás de un clic.
 */
export default function SegurosCliente({ reparto, siniestros, clienteId, hoy }: {
  reparto: RepartoSeguros
  siniestros: SiniestroCartera[] | null
  clienteId: string
  hoy: Date
}) {
  const abiertos = new Map<string, number>()
  for (const s of siniestros ?? []) if (s.abierto) abiertos.set(s.polizaId, (abiertos.get(s.polizaId) ?? 0) + 1)
  const ctx: Ctx = { abiertos: siniestros === null ? null : abiertos, clienteId, hoy }
  const { conNosotros, oportunidades, yaNoExiste, historicas } = reparto

  return (
    <>
      <Cubo titulo={`🛡️ Con nosotros (${conNosotros.length})`}>
        {conNosotros.length === 0
          ? <Vacio>Ahora no tiene ningún seguro con nosotros.</Vacio>
          : <Rejilla>{conNosotros.map(s => <TarjetaSeguro key={s.id} s={s} ctx={ctx} />)}</Rejilla>}
      </Cubo>

      <Cubo titulo={`🎯 Oportunidades (${oportunidades.length})`} nota="Lo tiene en otra compañía. Pincha para ver el seguimiento de la venta.">
        {!reparto.oportunidadesLeidas && <Vacio aviso>⚠️ No se han podido leer sus oportunidades: puede haber más de las que se ven.</Vacio>}
        {!reparto.declaradasLeidas && <Vacio aviso>⚠️ No se han podido leer las pólizas que aportó desde el portal.</Vacio>}
        {oportunidades.length > 0
          ? <Rejilla>{oportunidades.map(s => <TarjetaSeguro key={s.id} s={s} ctx={ctx} />)}</Rejilla>
          : reparto.oportunidadesLeidas && <Vacio>Ninguna abierta. <Link href={`/correduria/cliente/${clienteId}?tab=oportunidades`}>➕ Abrir una oportunidad</Link></Vacio>}
        {historicas.length > 0 && (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            Además, {historicas.length} póliza(s) del volcado histórico (2013-2018, sin CIMA): son leads viejos.{' '}
            <Link href={`/correduria/cliente/${clienteId}?tab=polizas`}>verlas</Link>
          </p>
        )}
      </Cubo>

      {yaNoExiste.length > 0 && (
        <details style={{ display: 'grid', gap: 10 }}>
          <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 700 }}>
            🗂️ Ya no existe ({yaNoExiste.length})
          </summary>
          <Rejilla>{yaNoExiste.map(s => <TarjetaSeguro key={s.id} s={s} ctx={ctx} />)}</Rejilla>
        </details>
      )}
    </>
  )
}

type Ctx = { abiertos: Map<string, number> | null; clienteId: string; hoy: Date }
type Aviso = { texto: string; tono: 'malo' | 'aviso' | 'info' }

function Cubo({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 16 }}>{titulo}</h2>
        {nota && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted)' }}>{nota}</p>}
      </div>
      {children}
    </section>
  )
}

function Rejilla({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: 10 }}>{children}</div>
}

function Vacio({ children, aviso }: { children: React.ReactNode; aviso?: boolean }) {
  return <p style={{ margin: 0, fontSize: 13, color: aviso ? 'var(--warning)' : 'var(--muted)' }}>{children}</p>
}

const tarjetaSeguro: React.CSSProperties = {
  display: 'grid', gap: 4, alignContent: 'start', padding: 14, minHeight: 44,
  background: 'var(--surface)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)',
  color: 'var(--text)', textDecoration: 'none', fontSize: 13,
}

function dias(iso: string, hoy: Date): number {
  const d = Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
  const h = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate())
  return Math.round((d - h) / 86_400_000)
}

const ESTADO_POLIZA: Record<string, string> = {
  activa: 'En vigor', en_vigor: 'En vigor', en_renovacion: 'En renovación', recibo_devuelto: 'Recibo devuelto',
  cambio_clave: 'Cambio de clave', anula_al_vencimiento: 'Anula al vencimiento', cancelada: 'Cancelada',
  vencida: 'Vencida', competencia: 'En la competencia', fin_riesgo: 'Fin del riesgo',
}

function rotuloTarea(t: string): string {
  return TIPOS_TAREA_UI.find(x => x.valor === t)?.rotulo ?? t
}

function avisosOportunidad(o: OportunidadDeCliente, hoy: Date): Aviso[] {
  const a: Aviso[] = []
  if (o.estado === 'perdida') {
    a.push({ texto: `Perdida${o.motivoPerdida ? ` · ${rotuloMotivo(o.motivoPerdida)}` : ''}`, tono: 'info' })
    return a
  }
  if (o.aparcadaHasta) a.push({ texto: `Aparcada hasta el ${fmt(o.aparcadaHasta.slice(0, 10))}`, tono: 'info' })
  if (o.proximaTarea) {
    const f = o.proximaTarea.fechaLimite.slice(0, 10)
    const d = dias(f, hoy)
    a.push({ texto: `${rotuloTarea(o.proximaTarea.tipo)} ${d < 0 ? `atrasada (${fmt(f)})` : d === 0 ? 'hoy' : `el ${fmt(f)}`}`, tono: d <= 0 ? 'malo' : 'info' })
  }
  if (estaHuerfana(o)) a.push({ texto: 'Sin próximo paso', tono: 'aviso' })
  return a
}

function TarjetaSeguro({ s, ctx }: { s: SeguroCliente; ctx: Ctx }) {
  let href: string
  let ramo: string
  let estado: string
  let titulo: string
  let lineas: (string | null)[]
  const avisos: Aviso[] = []

  if (s.clase === 'poliza') {
    const p = s.poliza
    const o = s.oportunidad
    // En «oportunidad», si hay seguimiento abierto la tarjeta lleva a él: eso es lo que se trabaja.
    href = o ? `/correduria/oportunidad/${o.id}` : `/correduria/poliza/${p.id}`
    ramo = TIPOS[p.tipo] ?? p.tipo
    estado = p.confirmadaCima ? ESTADO_POLIZA[p.estado.trim()] ?? p.estado.replace(/_/g, ' ') : 'Pendiente de CIMA'
    titulo = p.objeto?.titulo ?? p.matricula ?? (p.numeroPoliza ? `Póliza nº ${p.numeroPoliza}` : 'Sin detalle del bien')
    lineas = [
      `${p.aseguradora}${p.numeroPoliza ? ` · nº ${p.numeroPoliza}` : ''}`,
      [p.fechaVencimiento ? `Vence ${fmt(p.fechaVencimiento.slice(0, 10))}` : 'Sin fecha de vencimiento', p.prima !== null ? eur(p.prima) : null].filter(Boolean).join(' · '),
    ]
    if (p.recibos?.devueltos) avisos.push({ texto: `${p.recibos.devueltos} recibo(s) devuelto(s)`, tono: 'malo' })
    const sin = ctx.abiertos?.get(p.id) ?? 0
    if (sin > 0) avisos.push({ texto: `${sin} siniestro(s) abierto(s)`, tono: 'aviso' })
    const vigente = p.viva && !['cancelada', 'vencida', 'competencia', 'fin_riesgo'].includes(p.estado.trim())
    if (vigente && p.fechaVencimiento) {
      const d = dias(p.fechaVencimiento.slice(0, 10), ctx.hoy)
      if (d >= 0 && d <= 45) avisos.push({ texto: `Vence en ${d} día(s)`, tono: 'aviso' })
    }
    if (o) {
      avisos.push({ texto: `Seguimiento: ${ROTULO_ESTADO[o.estado]}`, tono: 'info' })
      avisos.push(...avisosOportunidad(o, ctx.hoy))
    } else if (!vigente && p.estado.trim() !== 'fin_riesgo') {
      avisos.push({ texto: 'Sin seguimiento abierto', tono: 'aviso' })
    }
  } else if (s.clase === 'oportunidad') {
    const o = s.oportunidad
    href = `/correduria/oportunidad/${o.id}`
    ramo = TIPOS[o.ramo ?? ''] ?? rotuloRamo(o.ramo)
    estado = ROTULO_ESTADO[o.estado]
    titulo = o.aseguradora ? `Lo tiene en ${o.aseguradora}` : 'Compañía actual sin anotar'
    lineas = [
      [o.fechaFinVigencia ? `Le vence ${fmt(o.fechaFinVigencia.slice(0, 10))}` : 'Vencimiento sin anotar', o.prima !== null ? `paga ${eur(o.prima)}` : null].filter(Boolean).join(' · '),
    ]
    avisos.push(...avisosOportunidad(o, ctx.hoy))
  } else {
    const d = s.declarada
    // Aún no tiene seguimiento: la tarjeta lleva a abrirlo.
    href = `/correduria/cliente/${ctx.clienteId}?tab=oportunidades`
    ramo = TIPOS[d.ramo ?? ''] ?? rotuloRamo(d.ramo)
    estado = 'Aportada por el cliente'
    titulo = d.bien?.cosa ?? d.matricula ?? (d.compania ? `Seguro en ${d.compania}` : 'Sin detalle del bien')
    lineas = [
      d.compania ?? 'Compañía sin leer',
      [d.fechaVencimiento ? `Vence ${fmt(d.fechaVencimiento.slice(0, 10))}` : null, d.primaAnual !== null ? eur(d.primaAnual) : null].filter(Boolean).join(' · ') || null,
    ]
    avisos.push({ texto: 'Abrir seguimiento', tono: 'aviso' })
  }

  const cuerpo = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
        <span style={{ fontWeight: 700, color: 'var(--text)' }}>{ramo}</span>
        <span>{estado}</span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{titulo}</div>
      {lineas.filter(Boolean).map((l, i) => <div key={i} style={{ color: 'var(--muted)' }}>{l}</div>)}
      {avisos.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {avisos.map((a, i) => <Chip key={i} a={a} />)}
        </div>
      )}
    </>
  )
  return <Link href={href} prefetch={false} style={tarjetaSeguro}>{cuerpo}</Link>
}

function Chip({ a }: { a: Aviso }) {
  const color = a.tono === 'malo' ? 'var(--negative)' : a.tono === 'aviso' ? 'var(--warning)' : 'var(--muted)'
  const fondo = a.tono === 'malo' ? 'var(--negative-bg)' : a.tono === 'aviso' ? 'var(--warning-bg)' : 'var(--border)'
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, color, background: fondo }}>{a.texto}</span>
}
