import Link from 'next/link'
import { alertaVencimiento } from '@central/module-seguros'
import type { RepartoSeguros, SeguroCliente } from '@/lib/correduria/seguros-cliente'
import { ESTADOS_ABIERTOS, aniversarioOportunidad, estaHuerfana, estadoVencimiento, referenciaRiesgo, vencimientoPoliza } from '@/lib/correduria/seguros-cliente'
import { textoVenceCadaAño } from '@/lib/correduria/aniversario'
import { ROTULO_ESTADO, TIPOS_TAREA_UI, rotuloMotivo, rotuloRamo, type OportunidadDeCliente } from '@/lib/seguimiento-asegura'
import type { SiniestroCartera } from '@/lib/siniestros-asegura'
import { eur } from '@/lib/dinero'
import { urlRetarificar } from '@/lib/ficha-asegura'
import { btnStyle } from '@/components/ui'
import { rotuloRetarificar } from '../../rotulo-retarificar'
import { TIPOS, fmt } from './piezas'
import EliminarDeOportunidades, { RecuperarLead } from './EliminarDeOportunidades'
import EditarVencimiento from './EditarVencimiento'
import DescartarVolcado from './DescartarVolcado'
import TarificarOportunidad from './TarificarOportunidad'
import { destinoTarificar } from '@/lib/correduria/tarificar-oportunidad'

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
  const { conNosotros, oportunidades, yaNoExiste, historicas, descartadas } = reparto

  return (
    <>
      <Cubo titulo={`Con nosotros (${conNosotros.length})`}>
        {conNosotros.length === 0
          ? <Vacio>Ahora no tiene ningún seguro con nosotros.</Vacio>
          : <Rejilla>{conNosotros.map(s => <TarjetaSeguro key={s.id} s={s} ctx={ctx} />)}</Rejilla>}
      </Cubo>

      <Cubo titulo={`Oportunidades (${oportunidades.length})`} nota="Otros seguros que se le conocen (otra compañía, volcado antiguo, lo que dice el cliente). El vencimiento es un aniversario: se avisa cada año, el año da igual. Sin día y mes conocidos: pregúntale.">
        {!reparto.oportunidadesLeidas && <Vacio aviso>No se han podido leer sus oportunidades: puede haber más de las que se ven.</Vacio>}
        {!reparto.declaradasLeidas && <Vacio aviso>No se han podido leer las pólizas que aportó desde el portal.</Vacio>}
        {oportunidades.length > 0
          ? <Rejilla>{oportunidades.map(s => <TarjetaSeguro key={s.id} s={s} ctx={ctx} eliminable />)}</Rejilla>
          : reparto.oportunidadesLeidas && <Vacio>Ninguna abierta. <Link href={`/correduria/cliente/${clienteId}?tab=oportunidades`}>+ Abrir una oportunidad</Link></Vacio>}
        {historicas.length > 0 && (
          <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
            Además, {historicas.length} póliza(s) más del volcado histórico (2013-2018, sin CIMA).{' '}
            <Link href={`/correduria/cliente/${clienteId}?tab=polizas`}>verlas</Link>
          </p>
        )}
        {descartadas.length > 0 && (
          <details style={{ fontSize: 12, color: 'var(--muted)' }}>
            <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>Eliminadas de oportunidades ({descartadas.length})</summary>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
              {descartadas.map(p => (
                <li key={p.id} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <span>{TIPOS[p.tipo] ?? p.tipo}{p.numeroPoliza ? ` · nº ${p.numeroPoliza}` : ''}{p.leadDescartado ? ` · el ${fmt(p.leadDescartado.fecha.slice(0, 10))}${p.leadDescartado.motivo ? ` («${p.leadDescartado.motivo}»)` : ''}` : ''}</span>
                  <RecuperarLead polizaId={p.id} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </Cubo>

      {yaNoExiste.length > 0 && (
        <details style={{ display: 'grid', gap: 10 }}>
          <summary style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center', fontSize: 15, fontWeight: 700 }}>
            Ya no existe ({yaNoExiste.length})
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
    <section style={{ display: 'grid', gap: 12 }}>
      <div>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700 }}>{titulo}</h2>
        {nota && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--muted)' }}>{nota}</p>}
      </div>
      {children}
    </section>
  )
}

function Rejilla({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: 12 }}>{children}</div>
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

/**
 * El vencimiento en tres estados (nunca se proyecta una fecha): futuro conocido → «Vence …»;
 * pasado o sin fecha → «vencimiento desconocido», con lo último que se anotó solo como contexto.
 */
function textoVence(fecha: string | null | undefined, hoy: Date, fuente = 'anotado', opciones: { vencidaSiPasada?: boolean; anual?: boolean } = {}): string {
  // Oportunidad: aniversario, se dice día y mes sin año (da igual el año guardado).
  if (opciones.anual) {
    const prox = aniversarioOportunidad(fecha, hoy)
    if (prox) return textoVenceCadaAño(prox) as string
    return 'Vencimiento desconocido — preguntar al cliente'
  }
  const e = estadoVencimiento(fecha, hoy)
  if (e.estado === 'futuro') return `Vence ${fmt(e.fecha)}`
  // Una póliza viva de la compañía con la fecha pasada: se dice UNA cosa («Venció el …»), no «desconocido»
  // a la vez que otros avisos hablan de esa misma fecha. Sin fecha utilizable (o centinela): desconocido.
  const a = alertaVencimiento(e.ultimaFecha, hoy)
  if (opciones.vencidaSiPasada && a.estado === 'vencido') return a.titular
  return `Vencimiento desconocido — preguntar al cliente${e.ultimaFecha && a.estado !== 'desconocido' ? ` (${fuente}: ${fmt(e.ultimaFecha)})` : ''}`
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

function TarjetaSeguro({ s, ctx, eliminable = false }: { s: SeguroCliente; ctx: Ctx; eliminable?: boolean }) {
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
    href = o ? `/correduria/cliente/${ctx.clienteId}?tab=oportunidades&op=${o.id}` : `/correduria/poliza/${p.id}`
    ramo = TIPOS[p.tipo] ?? p.tipo
    // Del volcado histórico, el estado y el año son de hace una década: sin rótulo de estado
    // (una fila de 2017 con «activa» leía como en vigor) y con su vencimiento en tres estados.
    estado = s.historica ? '' : p.confirmadaCima ? ESTADO_POLIZA[p.estado.trim()] ?? p.estado.replace(/_/g, ' ') : 'Pendiente de CIMA'
    // El modelo va de título y la matrícula debajo, bien visible: citarla al cliente genera confianza.
    titulo = p.objeto?.titulo ?? p.matricula ?? (p.numeroPoliza ? `Póliza nº ${p.numeroPoliza}` : 'Sin detalle del bien')
    // El vencimiento anotado en su seguimiento (corregido a mano) manda sobre el de la póliza.
    const venc = vencimientoPoliza(s, ctx.hoy)
    const fechaBase = venc.delSeguimiento ? o?.fechaFinVigencia ?? null : p.fechaVencimiento
    lineas = [
      `${p.aseguradora}${p.numeroPoliza ? ` · nº ${p.numeroPoliza}` : ''}${s.historica ? ' (volcado histórico)' : ''}`,
      // Matrícula (auto/moto) o dirección del riesgo (inmueble): así se reconoce la póliza, no por su nº.
      referenciaRiesgo(p, titulo),
      [textoVence(fechaBase, ctx.hoy, venc.delSeguimiento ? 'anotado' : 'volcado', { vencidaSiPasada: p.viva && !venc.delSeguimiento, anual: eliminable }), p.prima !== null ? eur(p.prima) : null].filter(Boolean).join(' · '),
      // El cambio de compañía va en la tarjeta de la nueva, no en una segunda del mismo bien.
      s.sustituye
        ? `Sustituye a ${s.sustituye.aseguradora}${s.sustituye.numeroPoliza ? ` nº ${s.sustituye.numeroPoliza}` : ''}${s.sustituye.fechaVencimiento ? `, que cubre hasta el ${fmt(s.sustituye.fechaVencimiento.slice(0, 10))}` : ''}`
        : null,
    ]
    if (p.recibos?.devueltos) avisos.push({ texto: `${p.recibos.devueltos} recibo(s) devuelto(s)`, tono: 'malo' })
    const sin = ctx.abiertos?.get(p.id) ?? 0
    if (sin > 0) avisos.push({ texto: `${sin} siniestro(s) abierto(s)`, tono: 'aviso' })
    const vigente = p.viva && !['cancelada', 'vencida', 'competencia', 'fin_riesgo'].includes(p.estado.trim())
    // Sustituida por otra: cubre hasta su vencimiento pero no se renueva, así que ni
    // «vence en N días» ni «renovación sin confirmar» (la moto Allianz→Occident, 28/09/2026).
    if (vigente && p.sustituida) avisos.push({ texto: 'Sustituida por otra póliza: no se renueva', tono: 'info' })
    else if (vigente && p.fechaVencimiento) {
      const d = dias(p.fechaVencimiento.slice(0, 10), ctx.hoy)
      if (d >= 0 && d <= 45) avisos.push({ texto: `Vence en ${d} día(s)`, tono: 'aviso' })
      // En vigor para la compañía pero con la fecha ya pasada: la renovación no ha llegado
      // por CIMA (ni la fecha nueva ni el recibo). No se inventa la fecha: se avisa
      // (27/09/2026: 10 de Mapfre así desde junio, entre ellas un Mercedes GLC).
      if (d < 0) avisos.push({ texto: 'Renovación sin confirmar por la compañía', tono: 'malo' })
    }
    if (o) {
      avisos.push({ texto: `Seguimiento: ${ROTULO_ESTADO[o.estado]}`, tono: 'info' })
      avisos.push(...avisosOportunidad(o, ctx.hoy))
    } else if (!vigente && !s.historica && p.estado.trim() !== 'fin_riesgo') {
      avisos.push({ texto: 'Sin seguimiento abierto', tono: 'aviso' })
    }
  } else if (s.clase === 'oportunidad') {
    const o = s.oportunidad
    href = `/correduria/cliente/${ctx.clienteId}?tab=oportunidades&op=${o.id}`
    ramo = TIPOS[o.ramo ?? ''] ?? rotuloRamo(o.ramo)
    estado = ROTULO_ESTADO[o.estado]
    // El bien primero (con dos coches, la compañía sola no dice cuál es cuál).
    const bien = o.vehiculo ?? o.matricula
    const compania = o.aseguradora ? `Lo tiene en ${o.aseguradora}` : 'Compañía actual sin anotar'
    titulo = bien ?? compania
    // Un fin de vigencia anotado hace más de un año no es «le vence» en pasado: un seguro
    // anual renueva el mismo día cada año, así que se dice el próximo (y de dónde sale).
    // Uno que venció hace menos se queda tal cual: esa renovación se acaba de pasar.
    lineas = [
      bien ? `${compania}${o.numeroPoliza ? ` · nº ${o.numeroPoliza}` : ''}${o.vehiculo && o.matricula ? ` · ${o.matricula}` : ''}` : null,
      [textoVence(o.fechaFinVigencia, ctx.hoy, 'anotado', { anual: true }), o.prima !== null ? `paga ${eur(o.prima)}` : null].filter(Boolean).join(' · '),
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
      [textoVence(d.fechaVencimiento, ctx.hoy, 'declarado', { anual: true }), d.primaAnual !== null ? eur(d.primaAnual) : null].filter(Boolean).join(' · '),
    ]
    avisos.push({ texto: 'Abrir seguimiento', tono: 'aviso' })
  }

  const cuerpo = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
        <span style={{ fontWeight: 700, color: 'var(--text)' }}>{ramo}</span>
        {estado !== '' && <span>{estado}</span>}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700 }}>{titulo}</div>
      {lineas.filter(Boolean).map((l, i) => <div key={i} style={{ color: 'var(--muted)', overflowWrap: 'anywhere' }}>{l}</div>)}
      {avisos.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
          {avisos.map((a, i) => <Chip key={i} a={a} />)}
        </div>
      )}
    </>
  )
  // «Eliminar» va DENTRO del marco de la tarjeta pero FUERA del enlace (un botón dentro de
  // un <a> no es válido): suelto debajo parecía una acción de todo el cubo (25/09/2026).
  // Solo en Oportunidades: una póliza (del volcado o viva cancelada/vencida) se marca y su
  // seguimiento abierto, si lo hay, se descarta; una oportunidad abierta suelta, se descarta.
  const abiertaDe = (o: OportunidadDeCliente | null) => o !== null && (ESTADOS_ABIERTOS as readonly string[]).includes(o.estado) ? o.id : undefined
  const quitar = !eliminable ? null
    : s.clase === 'poliza' ? <EliminarDeOportunidades tipo="poliza" polizaId={s.id} oportunidadId={abiertaDe(s.oportunidad)} />
      : s.clase === 'oportunidad' && abiertaDe(s.oportunidad) ? <EliminarDeOportunidades tipo="oportunidad" oportunidadId={s.oportunidad.id} />
        : null
  // El vencimiento es con lo que se llama a la clienta: se corrige aquí mismo, sin entrar al
  // seguimiento. En una póliza sin seguimiento, guardarlo abre el suyo (29/09/2026).
  const abierta = eliminable && s.clase !== 'declarada' ? abiertaDe(s.oportunidad) : undefined
  const vencimiento = !eliminable ? null
    : s.clase === 'poliza'
      ? abierta
        ? <EditarVencimiento oportunidadId={abierta} vence={aniversarioOportunidad(vencimientoPoliza(s, ctx.hoy).delSeguimiento ? s.oportunidad?.fechaFinVigencia : s.poliza.fechaVencimiento, ctx.hoy)} proximaLlamada={s.oportunidad?.proximaTarea?.fechaLimite.slice(0, 10) ?? null} />
        : <EditarVencimiento polizaId={s.id} vence={aniversarioOportunidad(s.poliza.fechaVencimiento, ctx.hoy)} proximaLlamada={null} />
      : s.clase === 'oportunidad' && abierta
        ? <EditarVencimiento oportunidadId={abierta} vence={aniversarioOportunidad(s.oportunidad.fechaFinVigencia, ctx.hoy)} proximaLlamada={s.oportunidad.proximaTarea?.fechaLimite.slice(0, 10) ?? null} />
        : null
  // La derivada del volcado (sin seguimiento): no se escribe nada hasta que Alberto decide. Crear
  // la oportunidad abre el alta ya existente, precargada; «Descartar» la cierra como perdida.
  const derivada = s.clase === 'poliza' && s.historica === true && s.oportunidad === null ? s.poliza : null
  const accionesDerivada = derivada && (
    <>
      <Link
        href={`/correduria/cliente/${ctx.clienteId}?tab=oportunidades&oportunidad=nueva&desde=${encodeURIComponent(derivada.id)}`}
        prefetch={false}
        style={{ ...btnStyle('primario', 'sm'), minHeight: 44, textDecoration: 'none' }}
      >
        Crear oportunidad
      </Link>
      {derivada.retarificable && derivada.estado !== 'cancelada' && (
        <Link href={urlRetarificar(derivada.id)} prefetch={false} style={{ ...btnStyle('secundario', 'sm'), minHeight: 44, textDecoration: 'none' }}>
          {rotuloRetarificar(derivada.retarificacion)}
        </Link>
      )}
      <DescartarVolcado
        clienteId={ctx.clienteId} ramo={derivada.tipo} aseguradora={derivada.aseguradora} numeroPoliza={derivada.numeroPoliza}
        matricula={derivada.matricula} vehiculo={derivada.objeto?.titulo ?? null}
      />
    </>
  )
  // «Tarificar» (07/10/2026): abre la pantalla de precio del ramo con lo que la oportunidad ya sabe (nunca cotiza).
  // Póliza sin seguimiento: abre el suyo antes. Una oportunidad cerrada o una aportada sin seguimiento no la llevan.
  const tarificar = !eliminable || s.clase === 'declarada' || (s.clase === 'oportunidad' && !abierta) ? null : (
    <TarificarOportunidad
      tomadorId={ctx.clienteId}
      destino={destinoTarificar(s.clase === 'poliza'
        ? { ramo: s.poliza.tipo, tomadorId: ctx.clienteId, oportunidadId: abiertaDe(s.oportunidad) ?? null, polizaId: s.poliza.id }
        : { ramo: s.oportunidad.ramo, tomadorId: ctx.clienteId, oportunidadId: s.oportunidad.id, polizaId: null })}
    />
  )
  if (!quitar && !vencimiento && !accionesDerivada && !tarificar) return <Link href={href} prefetch={false} style={tarjetaSeguro}>{cuerpo}</Link>
  return (
    <div style={{ ...tarjetaSeguro, gap: 8 }}>
      <Link href={href} prefetch={false} style={{ display: 'grid', gap: 4, alignContent: 'start', color: 'inherit', textDecoration: 'none' }}>{cuerpo}</Link>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'start' }}>
        {tarificar}
        {accionesDerivada}
        {!derivada && vencimiento}
        {!derivada && quitar && <div style={{ display: 'grid', flex: '1 1 auto' }}>{quitar}</div>}
      </div>
    </div>
  )
}

function Chip({ a }: { a: Aviso }) {
  const color = a.tono === 'malo' ? 'var(--negative)' : a.tono === 'aviso' ? 'var(--warning)' : 'var(--muted)'
  const fondo = a.tono === 'malo' ? 'var(--negative-bg)' : a.tono === 'aviso' ? 'var(--warning-bg)' : 'var(--border)'
  return <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 999, color, background: fondo }}>{a.texto}</span>
}
