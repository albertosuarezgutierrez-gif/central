import Link from 'next/link'
import { NECESARIOS_EMISION_AUTO, contactoEfectivo, etiquetaFraccionamiento, etiquetaRol, filasIntervinientes, interpretarCapital, ventanaAnulacion } from '@central/module-seguros'
import type { CapitalAsegurado } from '@central/module-seguros'
import Documentos from '../../Documentos'
import Siniestros from '../../Siniestros'
import EvolucionPrima from '../../EvolucionPrima'
import { polizaAsegura, type Poliza } from '@/lib/poliza-asegura'
import { urlRetarificar } from '@/lib/ficha-asegura'
import { rotuloRetarificar } from '../../rotulo-retarificar'
import { eur } from '@/lib/dinero'
import { PageHeader } from '@/components/ui'

export const dynamic = 'force-dynamic'

/**
 * La ficha de UNA póliza (Alberto, 02/09/2026: «no puedo pinchar en la póliza
 * para ir a la pantalla de póliza, ahí especifica más los datos de ese seguro,
 * documentación, siniestros, recibos»). Todo en una pantalla, cada bloque con
 * su propio «no se sabe».
 */
export default async function PolizaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await polizaAsegura(id)
  if (r.estado !== 'ok') return <NoSePudo estado={r} />
  const p = r.poliza
  const cancelada = p.estado === 'cancelada'
  const anul = p.viva && !cancelada ? ventanaAnulacion(p.fechaVencimiento) : null

  return (
    // `minmax(0, 1fr)` NO es decorativo (mismo caso que la ficha de cliente): sin él la pista
    // implícita de este grid se dimensiona con su contenido más ancho —las tablas de recibos,
    // coberturas y siniestros, que declaran `minWidth: 560`— y arrastra la página entera fuera
    // del móvil. El `overflowX: 'auto'` que las envuelve queda anulado, porque para cuando actúa
    // su contenedor ya ha crecido. Medido en Chromium el 02/09/2026: 590 → 390 con esta línea.
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
      <div>
        <div style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/correduria">← Correduría</Link>
          <span>·</span>
          <Link href={`/correduria/cliente/${p.cliente.id}`}>{p.cliente.nombre}</Link>
        </div>
        <PageHeader
          titulo={<>
            {TIPOS[p.tipo] ?? p.tipo} · {p.aseguradora}
            {p.numeroPoliza && <span style={{ fontWeight: 400, color: 'var(--muted)' }}> · nº {p.numeroPoliza}</span>}
          </>}
          sub={<span style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <span>{p.viva ? (cancelada ? '⚪ CIMA · cancelada' : '✅ CIMA · ' + p.estado.replace(/_/g, ' ')) : '🗄️ volcado histórico'}</span>
            {p.situacion && <span title="Situación según la compañía (EIAC)">situación: {p.situacion}</span>}
            {p.retarificable && (
              <a href={urlRetarificar(p.id)} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 600 }}>{rotuloRetarificar(p.retarificacion)}</a>
            )}
          </span>}
        />
      </div>

      {/* ── Qué asegura ─────────────────────────────────────────────────── */}
      <Tarjeta titulo="Qué asegura">
        <Objeto p={p} />
        {/* Solo en hogar, y solo si asegura los manda: `null` no es «no tiene capital». */}
        {p.capitalesHogar && <CapitalesHogar caps={p.capitalesHogar} />}
      </Tarjeta>

      {/* ── Fechas, prima y pago ─────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Dato label="Efecto inicial" valor={p.fechaEfectoInicial ? fmt(p.fechaEfectoInicial) : null} nota="desde cuándo está con la compañía (la antigüedad del bonus)" />
        <Dato label="Inicio de esta anualidad" valor={p.fechaInicio ? fmt(p.fechaInicio) : null} />
        <Dato label="Vence" valor={p.fechaVencimiento ? fmt(p.fechaVencimiento) : null} nota={anul ? (anul.enPlazo ? `para no renovar, avisar antes del ${fmt(anul.limiteAviso)}` : 'plazo de aviso pasado: renueva otro año') : cancelada ? 'cancelada' : undefined} color={anul?.enPlazo && anul.diasParaAvisar <= 60 ? 'var(--warning)' : undefined} />
        <Dato label="Prima" valor={p.prima !== null ? eur(p.prima) : null} nota={p.primaAnual !== null && p.primaBruta !== null && p.primaAnual !== p.primaBruta ? `neta ${eur(p.primaAnual)} · bruta ${eur(p.primaBruta)}` : undefined} />
        <Dato label="Forma de pago" valor={p.pago ? etiquetaFraccionamiento(p.pago.fraccionamiento) : null} nota={p.pago?.formaCobro ?? undefined} />
        <Dato
          label="Recargo por fraccionar"
          valor={p.pago?.recargo.estado === 'calculado' ? `${eur(p.pago.recargo.recargoEur)} (${p.pago.recargo.recargoPct.toLocaleString('es-ES')}%)` : p.pago?.recargo.estado === 'no_aplica' ? 'no aplica (anual)' : null}
          nota={p.pago?.recargo.estado === 'sin_datos' ? p.pago.recargo.motivo : p.pago?.recargo.estado === 'calculado' ? `${eur(p.pago.recargo.sumaRecibos)} en ${p.pago.recargo.recibos} recibos frente a ${eur(p.pago.recargo.primaAnual)}` : undefined}
        />
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>
        Contrato anual: solo se deja al vencimiento, avisando 30 días antes (LCS art. 22). Fraccionar es que la
        compañía financia el pago y cobra por ello.
      </p>

      {/* ── Coberturas ──────────────────────────────────────────────────── */}
      <Coberturas lista={p.coberturas} />

      {/* ── Recibos ─────────────────────────────────────────────────────── */}
      <Recibos p={p} />

      {/* ── ¿Por qué ha subido la prima? ────────────────────────────────── */}
      {/* Va justo debajo de los recibos porque de ellos sale: la prima de cada
          anualidad se DERIVA de los CA/NP de aniversario a aniversario. El salto
          a retarificar es el MISMO de la cabecera (asegura, donde se gasta). */}
      <EvolucionPrima
        modo="tarjeta"
        evolucion={p.evolucionPrima}
        retarificar={p.retarificable && !cancelada ? { href: urlRetarificar(p.id), rotulo: rotuloRetarificar(p.retarificacion) } : { motivo: p.retarificacion?.motivo ?? null }}
      />

      {/* ── ¿Merece la pena pedir precio? ───────────────────────────────── */}
      {/* Pegado a la evolución de la prima a propósito: las dos contestan a la
          misma pregunta, y ésta es la que dice si compensa gastar los 0,50€. */}
      <Estimacion
        e={p.estimacion}
        retarificar={p.retarificable && !cancelada ? { href: urlRetarificar(p.id), rotulo: rotuloRetarificar(p.retarificacion) } : null}
      />

      {/* ── Siniestros ──────────────────────────────────────────────────── */}
      {/* «Confirmada por CIMA» = viva y con `id_poliza_entidad`: la misma pregunta que en la ficha.
          «Viva» ya NO es `import_ref IS NULL` (`esCarteraViva` de @central/module-seguros: también es
          viva la que CIMA mantiene al día sobre una fila del volcado), y quien lo decide es asegura. */}
      <Siniestros
        lista={p.siniestros}
        polizas={[{ id: p.id, numeroPoliza: p.numeroPoliza, aseguradora: p.aseguradora, tipo: p.tipo, viva: p.viva, confirmadaCima: p.viva && p.idPolizaEntidad !== null }]}
        documentos={p.listaDocumentos}
      />

      {/* ── Intervinientes ──────────────────────────────────────────────── */}
      <Tarjeta titulo="Intervinientes">
        <Intervinientes p={p} />
      </Tarjeta>

      {/* ── Documentación ───────────────────────────────────────────────── */}
      <Tarjeta titulo="📎 Documentación">
        <Documentos polizaId={p.id} clienteId={p.cliente.id} inicial={p.listaDocumentos} sugeridos={NECESARIOS_EMISION_AUTO} />
        {p.documentos !== null && p.listaDocumentos !== null && p.documentos > p.listaDocumentos.filter((d) => d.estado !== 'pedido').length && (
          <p style={muted}>
            Además hay {p.documentos - p.listaDocumentos.filter((d) => d.estado !== 'pedido').length} en la tabla antigua del CRM
            (poliza_documentos), sin fichero accesible desde aquí.
          </p>
        )}
      </Tarjeta>

      {/* ── Referencias de la compañía ──────────────────────────────────── */}
      <details>
        <summary style={{ cursor: 'pointer', fontSize: 13, color: 'var(--muted)' }}>Referencias de la compañía</summary>
        <div style={{ ...muted, marginTop: 8, display: 'grid', gap: 4 }}>
          <div>Código DGS de la entidad: {p.codigoEntidadDgs ?? '—'}</div>
          <div>Id de póliza en la entidad: {p.idPolizaEntidad ?? '—'}</div>
          <div>Ramo DGS: {p.ramoDgs ?? '—'}</div>
          <div>Origen del registro: {p.origen}</div>
        </div>
      </details>
    </div>
  )
}

const TIPOS: Record<string, string> = {
  auto: '🚗 Auto', moto: '🏍️ Moto', hogar: '🏠 Hogar', vida: '🧬 Vida', salud: '🩺 Salud',
  decesos: '⚱️ Decesos', responsabilidad_civil: '⚖️ R. Civil', comercio: '🏪 Comercio', comunidades: '🏢 Comunidad', otros: '📄 Otros',
}

/**
 * Qué asegura. Si la copia de CIMA no lo trae y la GEMELA del volcado sí (10
 * de las 109 vivas: la casa de Rota está en la copia de junio), se enseña la
 * gemela y se dice de dónde sale. Sin gemela informada, no se afirma que no exista.
 */
function Objeto({ p }: { p: Poliza }) {
  const propio = p.objeto
  const conocido = propio !== null && propio.estado === 'conocido' && (propio.titulo || propio.detalle)
  const gem = p.gemela?.objeto
  const gemConocida = gem && gem.estado === 'conocido' && (gem.titulo || gem.detalle)
  return (
    <div style={{ fontSize: 13, display: 'grid', gap: 6 }}>
      {conocido ? (
        <div><strong>{propio.titulo}</strong>{propio.detalle && <div style={muted}>{propio.detalle}</div>}{propio.nota && <div style={muted}>{propio.nota}</div>}</div>
      ) : propio?.estado === 'cifrado' ? (
        <div style={muted}>🔒 {propio.nota ?? 'La dirección viene cifrada del CRM y aquí no hay clave para leerla.'}</div>
      ) : (
        <div style={muted}>{propio?.nota ?? 'La compañía no informa el objeto asegurado por CIMA.'}</div>
      )}
      {!conocido && gemConocida && p.gemela && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
          <div><strong>{gem.titulo}</strong>{gem.detalle && <div style={muted}>{gem.detalle}</div>}</div>
          <div style={muted}>
            Sale de la copia de esta misma póliza en el volcado de junio (<Link href={`/correduria/poliza/${p.gemela.polizaId}`}>ver</Link>
            {p.gemela.clienteId !== p.cliente.id && <> · cuelga de <Link href={`/correduria/cliente/${p.gemela.clienteId}`}>otra ficha</Link></>}
            ). CIMA no manda la dirección del riesgo.
          </div>
        </div>
      )}
      {!conocido && !gemConocida && p.gemelaInformada && p.gemela === null && (
        <div style={muted}>Tampoco hay copia en el volcado con más datos.</div>
      )}
      {!p.gemelaInformada && <div style={muted}>La versión desplegada de asegura no busca la copia gemela.</div>}
    </div>
  )
}

function Coberturas({ lista }: { lista: Poliza['coberturas'] }) {
  if (lista.length === 0) {
    return <Tarjeta titulo="Coberturas"><p style={muted}>La compañía no ha mandado el detalle de coberturas por CIMA.</p></Tarjeta>
  }
  const hayDetalle = lista.some((c) => c.detalle)
  const hayVigencia = lista.some((c) => c.desde || c.hasta)
  return (
    <div style={tarjeta}>
      <details open={lista.length <= 12}>
        <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>Coberturas ({lista.length})</summary>
        <p style={{ ...muted, marginTop: 6 }}>
          Códigos de la compañía, no de la correduría: el mismo número significa cosas distintas en Mapfre y en Occident.
          «Sin capital propio» es lo que manda la compañía como 0: la garantía existe y se paga según condicionado.
        </p>
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table style={tabla}>
            <thead>
              <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
                <th style={th}>#</th><th style={th}>Cobertura</th><th style={th}>Capital</th>
                {hayDetalle && <th style={th}>Límite</th>}
                <th style={th}>Franquicia</th>
                {hayDetalle && <th style={th}>Prima</th>}
                {hayVigencia && <th style={th}>Vigencia</th>}
              </tr>
            </thead>
            <tbody>
              {lista.map((c, i) => (
                <tr key={`${c.codigo ?? ''}-${i}`} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ ...td, color: 'var(--muted)' }}>{c.orden ?? i + 1}</td>
                  <td style={td}>
                    {c.descripcion ?? c.codigo ?? '—'}
                    {(c.codigo || c.modalidad) && (
                      <div style={sub}>{c.codigo}{c.codigo && c.modalidad ? ' · ' : ''}{c.modalidad && <span title="Modalidad de valoración (código EIAC de la compañía)">val. {c.modalidad}</span>}</div>
                    )}
                  </td>
                  <td style={td}><CapitalCobertura capital={c.capital} descripcion={c.descripcionCapital} /></td>
                  {hayDetalle && <td style={td}><Limites detalle={c.detalle ?? null} /></td>}
                  <td style={td}><Franquicia texto={c.franquicia} detalle={c.detalle ?? null} /></td>
                  {hayDetalle && (
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {c.detalle?.prima?.total !== null && c.detalle?.prima?.total !== undefined ? eur(c.detalle.prima.total)
                        : c.detalle?.prima?.neta !== null && c.detalle?.prima?.neta !== undefined ? <>{eur(c.detalle.prima.neta)} <span style={sub}>neta</span></>
                        : <span style={muted}>—</span>}
                    </td>
                  )}
                  {hayVigencia && <td style={{ ...td, whiteSpace: 'nowrap' }}>{c.desde || c.hasta ? `${fechaCorta(c.desde)} → ${fechaCorta(c.hasta)}` : <span style={muted}>—</span>}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

function fechaCorta(iso: string | null): string {
  if (!iso) return '?'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return y && m && d ? `${d}/${m}/${y}` : iso
}

function CapitalCobertura({ capital, descripcion }: { capital: string | null; descripcion: string | null }) {
  const c = interpretarCapital(capital)
  const pie = descripcion && <div style={sub}>{descripcion}</div>
  switch (c.tipo) {
    case 'ilimitado': return <>Ilimitado{pie}</>
    case 'sin_capital': return <><span style={muted} title="La compañía manda 0: la garantía no lleva capital propio (RC obligatoria, asistencia, defensa…)">sin capital propio</span>{pie}</>
    case 'importe': return <>{eur(c.importe)}{pie}</>
    case 'texto': return <>{c.texto}{pie}</>
    default: return <><span style={muted}>—</span>{pie}</>
  }
}

function Limites({ detalle }: { detalle: Poliza['coberturas'][number]['detalle'] | null }) {
  if (!detalle || detalle.limites.length === 0) return <span style={muted}>—</span>
  return (
    <>
      {detalle.limites.map((l, i) => (
        <div key={i} style={{ whiteSpace: 'nowrap' }}>
          {l.maximo !== null ? eur(l.maximo) : l.minimo !== null ? eur(l.minimo) : '—'}
          {l.descripcion && <span style={sub}> {l.descripcion}</span>}
          {!l.descripcion && l.clase && <span style={sub} title="Clase de límite (código EIAC)"> {l.clase}</span>}
        </div>
      ))}
    </>
  )
}

function Franquicia({ texto, detalle }: { texto: string | null; detalle: Poliza['coberturas'][number]['detalle'] | null }) {
  const fr = detalle?.franquicias ?? []
  if (fr.length === 0) return texto ? <>{texto}</> : <span style={muted}>—</span>
  return (
    <>
      {fr.map((f, i) => (
        <div key={i} style={{ whiteSpace: 'nowrap' }}>
          {f.porcentaje !== null ? `${f.porcentaje.toLocaleString('es-ES')} %` : ''}
          {f.minimo !== null || f.maximo !== null ? (
            <span style={sub}> {f.minimo !== null ? `mín. ${eur(f.minimo)}` : ''}{f.minimo !== null && f.maximo !== null ? ' · ' : ''}{f.maximo !== null ? `máx. ${eur(f.maximo)}` : ''}</span>
          ) : null}
          {f.porcentaje === null && f.minimo === null && f.maximo === null && (f.clase ?? texto ?? '—')}
        </div>
      ))}
    </>
  )
}

function Recibos({ p }: { p: Poliza }) {
  const r = p.recibos
  const titular =
    r === null ? 'asegura no informa recibos'
    : r.total === 0 ? 'la compañía no ha mandado ningún recibo: no se sabe si está pagada'
    : r.devueltos > 0 ? `🔴 ${r.devueltos} devuelto(s)`
    : r.pendientes > 0 ? `🟡 ${r.pendientes} al cobro (emitido, aún sin cargar)`
    : r.cobrados === 0 && r.anulados > 0 ? `⚪ todos anulados (${r.anulados})`
    : `🟢 ${r.cobrados} cobrado(s)${r.cobradoEur !== null ? ` · ${eur(r.cobradoEur)}` : ''}`
  return (
    <Tarjeta titulo={`Recibos${r && r.total ? ` (${r.total})` : ''}`}>
      <p style={{ margin: '0 0 8px', fontSize: 13 }}>{titular}</p>
      {p.listaRecibos.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={tabla}>
            <thead><tr style={{ color: 'var(--muted)', textAlign: 'left' }}><th style={th}>Emitido</th><th style={th}>Vence</th><th style={th}>Situación</th><th style={th}>Cobro</th><th style={{ ...th, textAlign: 'right' }}>Importe</th></tr></thead>
            <tbody>
              {p.listaRecibos.map(x => (
                <tr key={x.id} style={{ borderTop: '1px solid var(--border)', color: x.situacion === 'anulado' ? 'var(--muted)' : undefined }}>
                  <td style={td}>{x.fechaEmision ? fmt(x.fechaEmision) : '—'}</td>
                  <td style={td}>{x.fechaVencimiento ? fmt(x.fechaVencimiento) : '—'}</td>
                  <td style={td}>{ICONO[x.situacion] ?? '❔'} {ROTULO[x.situacion] ?? x.situacion.replace(/_/g, ' ')}</td>
                  <td style={td}>{x.formaPago ?? <span style={muted}>—</span>}</td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{x.importe === null ? <span style={muted} title="Importe con forma inesperada en el EIAC">ilegible</span> : eur(x.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  )
}

const ICONO: Record<string, string> = { cobrado: '🟢', pendiente: '🟡', emitido: '🟡', devuelto: '🔴', impagado: '🔴', anulado: '⚪' }
// «pendiente» del EIAC = emitido y aún sin cargar en cuenta; Alberto lo leyó como
// deuda (02/09/2026). Devuelto e impagado son los estados que sí piden llamar.
const ROTULO: Record<string, string> = { pendiente: 'al cobro (emitido, sin cargar aún)', emitido: 'al cobro (emitido, sin cargar aún)' }

// El TOMADOR va SIEMPRE, y el primero: no es un interviniente sino el titular de
// la póliza, así que no está en `poliza_intervinientes` y antes no salía. Alberto
// lo vio el 02/09/2026 en la 6930FBP, donde CIMA solo manda al conductor
// habitual y la empresa titular no aparecía por ningún lado. Quién sale y qué se
// advierte lo decide `filasIntervinientes`, que está testeado aparte.
function Intervinientes({ p }: { p: Poliza }) {
  const { filas, aviso } = filasIntervinientes(
    { polizaId: p.id, fichaId: p.cliente.id, nombre: p.cliente.nombre },
    p.intervinientes,
  )
  const ef = contactoEfectivo({ telefono: null, email: null }, p.intervinientes)
  return (
    <div style={{ display: 'grid', gap: 6, fontSize: 13 }}>
      {filas.map((i, n) => (
        <div key={n}>
          <span style={{ textTransform: 'capitalize', color: 'var(--muted)' }}>{etiquetaRol(i.rol)}</span>:{' '}
          {i.fichaId ? <Link href={`/correduria/cliente/${i.fichaId}`}>{i.nombre ?? (i.nombreIlegible ? '🔒 cifrado' : 'sin nombre')}</Link> : (i.nombre ?? (i.nombreIlegible ? '🔒 cifrado' : 'sin nombre'))}
          {/* La fila sintetizada YA se llama «tomador»: repetirlo sobra. */}
          {i.esTomador && i.rol !== 'tomador' && <span style={muted}> (el tomador)</span>}
          {i.telefono && <> · <a href={`tel:${i.telefono.replace(/\s/g, '')}`}>📞 {i.telefono}</a></>}
          {i.email && <> · <a href={`mailto:${i.email}`}>✉️</a></>}
          {/* `poliza` no es una procedencia que decir: es la póliza que se está mirando. */}
          {i.origen !== 'poliza' && <span style={sub}> · {i.origen}</span>}
        </div>
      ))}
      {ef.telefono && ef.quien && <div style={muted}>Si el tomador no contesta: {ef.quien.nombre} ({etiquetaRol(ef.quien.rol)}) 📞 {ef.telefono}</div>}
      {/* Tres estados, no dos: «no se pudo mirar» ≠ «no hay nadie más». */}
      {aviso === 'sin_mirar' && <div style={muted}>Del resto de figuras (propietario, conductor…) no se sabe: asegura no ha podido informarlas.</div>}
      {aviso === 'solo_tomador' && <div style={muted}>La compañía no ha enviado más figuras (propietario, conductor…) por CIMA.</div>}
    </div>
  )
}

function Dato({ label, valor, nota, color }: { label: string; valor: string | null; nota?: string; color?: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color ?? 'var(--text)' }}>{valor ?? <span style={{ color: 'var(--muted)', fontWeight: 400 }} title="La compañía no lo informa">sin dato</span>}</div>
      {nota && <div style={{ fontSize: 11, color: color ?? 'var(--muted)' }}>{nota}</div>}
    </div>
  )
}

const MOTIVOS: Record<string, string> = {
  secreto_rechazado: 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET no coincide entre los dos proyectos).',
  asegura_error: 'asegura respondió, pero no pudo leer su base de datos.',
  respuesta_ilegible: 'la respuesta no tenía la forma esperada (¿la versión desplegada de asegura ya sirve /api/operador/poliza?).',
  red: 'no se pudo llegar a asegura (timeout, DNS o TLS).',
}

function NoSePudo({ estado }: { estado: { estado: 'sin_configurar' } | { estado: 'error'; motivo: string } | { estado: 'no_encontrado' } }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Link href="/correduria" style={{ fontSize: 13, color: 'var(--muted)' }}>← Correduría</Link>
      <div style={tarjeta}>
        {estado.estado === 'no_encontrado' ? (
          <><h2 style={{ marginTop: 0, fontSize: 16 }}>Esa póliza no está en la cartera</h2><p style={muted}>Se ha consultado y no existe (o está fusionada con otra).</p></>
        ) : estado.estado === 'sin_configurar' ? (
          <><h2 style={{ marginTop: 0, fontSize: 16 }}>⏳ El puerto con asegura no está conectado</h2><p style={muted}>Falta <code>ASEGURA_OPERADOR_SECRET</code> en este proyecto.</p></>
        ) : (
          <><h2 style={{ marginTop: 0, fontSize: 16 }}>⚠️ No se ha podido leer la póliza</h2><p style={muted}>{MOTIVOS[estado.motivo] ?? 'motivo desconocido.'} No lo leas como «esta póliza no tiene nada».</p></>
        )}
      </div>
    </div>
  )
}

const tarjeta: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 12, padding: 14 }
const tabla: React.CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }
const th: React.CSSProperties = { padding: '6px 8px', fontWeight: 600 }
const td: React.CSSProperties = { padding: '8px' }
const sub: React.CSSProperties = { fontSize: 11, color: 'var(--muted)' }
const muted: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', margin: 0 }

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <div style={tarjeta}><div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{titulo}</div>{children}</div>
}
function fmt(iso: string): string {
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

/* ─── ¿Merece la pena pedir precio? ────────────────────────────────────────
 * Va pegada a la evolución de la prima porque responde a la MISMA pregunta:
 * pedir precio cuesta 0,50€ reales y esto dice si compensa gastarlos.
 *
 * 🚨 Lo que esta tarjeta NO puede hacer es leerse como el precio de una
 * compañía: si el cliente ve «180€» y luego le dicen 260€, no vuelve. De ahí
 * que (a) se pinte SIEMPRE la `etiqueta` que manda el puerto, tal cual, sin
 * resumirla; (b) los números vayan con `≈`, en el color de aviso informativo y
 * más pequeños que los importes REALES de la ficha (`Dato`, 18 px en
 * `--text`), para que no se confundan con una prima cobrada; y (c) el veredicto
 * `no-se` se pinte con su porqué en vez de esconder el bloque — no mojarse es
 * una respuesta, no un hueco.
 */
function Estimacion({ e, retarificar }: { e: Poliza['estimacion']; retarificar: { href: string; rotulo: string } | null }) {
  if (e === null) {
    return (
      <div style={{ ...tarjeta, borderStyle: 'dashed' }}>
        <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>🔮 ¿Merece la pena pedir precio?</div>
        <p style={muted}>La versión desplegada de asegura todavía no manda la estimación: no se sabe si compensa.</p>
      </div>
    )
  }
  return (
    <div style={cajaEstimacion}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>🔮 ¿Merece la pena pedir precio?</span>
        <span style={{ ...chipBase, ...tonoVeredicto(e.veredicto) }}>{ROTULO_VEREDICTO[e.veredicto]}</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
        <p style={{ ...muted, color: 'var(--text)' }}>
          {e.porque || 'asegura no explica el veredicto.'}
        </p>

        {e.horquilla ? (
          <div>
            <div style={{ ...sub, marginBottom: 4 }}>Horquilla estimada</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
              <Estimado etiqueta="más barato" eur={e.horquilla.minEur} />
              <Estimado etiqueta="lo más habitual" eur={e.horquilla.medianaEur} />
              <Estimado etiqueta="más caro" eur={e.horquilla.maxEur} />
            </div>
          </div>
        ) : (
          <p style={{ ...muted, color: 'var(--text)' }}>
            Sin horquilla: {e.sinBase ?? 'asegura no dice por qué (no se sabe si es que aún no hay casos o si los que hay han caducado).'}
          </p>
        )}

        {/* La etiqueta del puerto, VERBATIM: es la frase que dice que esto no es un precio. */}
        <p style={{ ...sub, color: 'var(--text)' }}>{e.etiqueta}</p>

        {(e.base !== null || e.antiguedadMedianaMeses !== null) && (
          <p style={sub}>
            {e.base === 'parecidos' && 'Se apoya en pólizas parecidas de la cartera.'}
            {e.base === 'toda-la-cartera' && 'Se apoya en toda la cartera: no hay bastantes pólizas parecidas.'}
            {e.antiguedadMedianaMeses !== null && (
              <> {e.base !== null ? ' ' : ''}Antigüedad mediana de los casos: {e.antiguedadMedianaMeses.toLocaleString('es-ES', { maximumFractionDigits: 1 })} meses.</>
            )}
          </p>
        )}

        {/* Que no haya cotizaciones en la BD es INFORMACIÓN, no un error: la
            estimación existe, solo que apoyada en menos sitios. */}
        {e.fuente === null ? (
          <p style={sub}>asegura no dice de dónde salen los casos.</p>
        ) : e.fuente.cotizacionesDisponibles ? (
          <p style={sub}>{e.fuente.cartera} de la cartera · {e.fuente.cotizaciones} cotizaciones guardadas.</p>
        ) : (
          <p style={sub}>
            Se apoya solo en la cartera ({e.fuente.cartera} caso(s)): las cotizaciones guardadas todavía no están en la
            base de datos.
          </p>
        )}

        {retarificar && (
          e.veredicto === 'merece' ? (
            <div><a href={retarificar.href} target="_blank" rel="noopener noreferrer" style={botonPedirPrecio}>{retarificar.rotulo}</a></div>
          ) : (
            <p style={sub}><a href={retarificar.href} target="_blank" rel="noopener noreferrer">Pedir precio igualmente ↗</a> (cuesta 0,50€)</p>
          )
        )}
      </div>
    </div>
  )
}

/** Un número ESTIMADO: `≈`, tamaño y color propios para no confundirlo con una prima real. */
function Estimado({ etiqueta, eur: importe }: { etiqueta: string; eur: number }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={sub}>{etiqueta}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--info)', whiteSpace: 'nowrap' }}>≈ {eur(importe)}</div>
    </div>
  )
}

const ROTULO_VEREDICTO: Record<NonNullable<Poliza['estimacion']>['veredicto'], string> = {
  merece: '✅ merece pedir precio',
  'no-merece': '⏸️ no compensa ahora',
  'no-se': '❔ no se sabe',
}

function tonoVeredicto(v: NonNullable<Poliza['estimacion']>['veredicto']): React.CSSProperties {
  switch (v) {
    case 'merece': return { background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--info)' }
    case 'no-merece': return { background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }
    case 'no-se': return { background: 'transparent', color: 'var(--muted)', border: '1px dashed var(--border)' }
  }
}

/* ─── Capitales de hogar ───────────────────────────────────────────────────
 * Cinco estados y ninguno se colapsa con otro. El que más muerde es
 * `solo_sublimites`: `mayorEur` NO es el continente — pintarlo como si lo fuera
 * daría un capital plausible y falso, que es el modo de fallo más caro de este
 * repo (un número que se lee bien y miente).
 */
function CapitalesHogar({ caps }: { caps: NonNullable<Poliza['capitalesHogar']> }) {
  return (
    <div style={{ borderTop: '1px solid var(--border)', marginTop: 10, paddingTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
      <Capital titulo="Continente (el inmueble)" c={caps.continente} />
      <Capital titulo="Contenido (el mobiliario)" c={caps.contenido} />
      <p style={{ ...sub, gridColumn: '1 / -1', margin: 0 }}>
        El estándar EIAC sí manda el capital etiquetado, pero nuestra ingesta guarda el importe y tira la etiqueta:
        aquí se deriva de las garantías, y solo se afirma cuando varias coinciden en el mismo importe.
      </p>
    </div>
  )
}

function Capital({ titulo, c }: { titulo: string; c: CapitalAsegurado | null }) {
  const marco: React.CSSProperties = { border: `1px ${c === null || c.estado !== 'consenso' ? 'dashed' : 'solid'} var(--border)`, borderRadius: 10, padding: '10px 12px', minWidth: 0, display: 'grid', gap: 4 }
  const cabecera = <div style={{ fontSize: 12, color: 'var(--muted)' }}>{titulo}</div>
  if (c === null) {
    return <div style={marco}>{cabecera}<div style={muted}>asegura no manda este capital.</div></div>
  }
  switch (c.estado) {
    case 'consenso':
      return (
        <div style={{ ...marco, borderStyle: 'solid' }}>
          {cabecera}
          <div style={{ fontSize: 18, fontWeight: 700 }}>{eur(c.eur)}</div>
          <div style={sub}>Lo dicen {c.garantias} garantías de esta póliza.</div>
          {c.ejemplo && <div style={sub}>p. ej. «{c.ejemplo}»</div>}
        </div>
      )
    case 'solo_sublimites':
      return (
        <div style={marco}>
          {cabecera}
          <div style={{ fontSize: 18, fontWeight: 400, color: 'var(--muted)' }} title="No se puede derivar de las garantías">sin dato</div>
          <div style={sub}>{c.motivo}</div>
          {/* Etiquetado como lo que es. Nunca como el capital. */}
          <div style={sub} title="Es el tope de UNA garantía suelta, no la suma asegurada">
            El mayor sublímite: {eur(c.mayorEur)}
          </div>
        </div>
      )
    case 'todo_cero':
      return (
        <div style={marco}>
          {cabecera}
          <div style={{ fontSize: 15, fontWeight: 600 }}>Sin capital propio</div>
          <div style={sub}>{c.motivo}</div>
        </div>
      )
    default:
      return (
        <div style={marco}>
          {cabecera}
          <div style={{ fontSize: 18, fontWeight: 400, color: 'var(--muted)' }}>sin dato</div>
          <div style={sub}>{c.motivo}</div>
        </div>
      )
  }
}

const chipBase: React.CSSProperties = {
  display: 'inline-block', fontSize: 11, padding: '2px 8px', borderRadius: 999, whiteSpace: 'nowrap', lineHeight: 1.5,
}
// Punteada y en el tono informativo: se distingue de un vistazo de las tarjetas
// de importes REALES de arriba, que van con borde continuo sobre el fondo normal.
const cajaEstimacion: React.CSSProperties = {
  border: '1px dashed var(--info)', background: 'var(--info-bg)', borderRadius: 12, padding: 14,
}
// ≥44 px táctil: es el botón que manda a gastar dinero.
const botonPedirPrecio: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 14px', borderRadius: 10,
  background: 'var(--primary)', color: 'var(--surface)', fontWeight: 600, fontSize: 13, textDecoration: 'none',
}
