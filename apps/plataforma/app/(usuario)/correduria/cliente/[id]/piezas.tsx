import Link from 'next/link'
import { etiquetaFraccionamiento, etiquetaRol, ventanaAnulacion } from '@central/module-seguros'
import EvolucionPrima from '../../EvolucionPrima'
import { urlRetarificar, type IntervinienteFicha, type PolizaFicha, type RecibosPoliza } from '@/lib/ficha-asegura'
import { eur } from '@/lib/dinero'
import { rotuloRetarificar } from '../../rotulo-retarificar'

/**
 * Piezas compartidas por las pestañas de la ficha del cliente.
 *
 * Salieron tal cual de `page.tsx` cuando la ficha pasó de una columna larga a
 * cabecera + pestañas (03/09/2026): la tabla de pólizas la pintan «Resumen» y
 * «Pólizas», y la celda de cobro la reusa «Recibos». El comportamiento no ha
 * cambiado — en particular los TRES estados de cada dato (`null` = no se ha
 * podido mirar · `0` = mirado y no hay · el dato), que es lo que impide que la
 * pantalla afirme «está todo al día» sobre lo que nadie ha mirado.
 */

// ── Pólizas ─────────────────────────────────────────────────────────────────

export const TIPOS: Record<string, string> = {
  auto: '🚗 Auto', moto: '🏍️ Moto', hogar: '🏠 Hogar', vida: '🧬 Vida', salud: '🩺 Salud',
  decesos: '⚱️ Decesos', responsabilidad_civil: '⚖️ R. Civil', comercio: '🏪 Comercio',
  comunidades: '🏢 Comunidad', otros: '📄 Otros',
}

export function Polizas({ titulo, nota, polizas, vacio, plegado, intervinientes }: {
  titulo: string; nota?: string; polizas: PolizaFicha[]; vacio: string; plegado?: boolean
  intervinientes: IntervinienteFicha[] | null
}) {
  if (polizas.length === 0) {
    if (!vacio) return null
    return (
      <Tarjeta titulo={titulo}>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>{vacio}</p>
      </Tarjeta>
    )
  }
  const tabla = (
    <>
      {nota && <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 0 }}>{nota}</p>}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 880 }}>
          <thead>
            <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
              <th style={th}>Ramo</th>
              <th style={th}>Qué asegura</th>
              <th style={th}>Compañía</th>
              <th style={th}>Vence</th>
              <th style={{ ...th, textAlign: 'right' }}>Prima</th>
              <th style={th}>Pago</th>
              <th style={th}>Recibos</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {polizas.map(p => (
              <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={td}>{TIPOS[p.tipo] ?? p.tipo}</td>
                <td style={{ ...td, minWidth: 140 }}>
                  <ObjetoCelda p={p} />
                  <Intervinientes lista={intervinientes} polizaId={p.id} />
                </td>
                <td style={td}>
                  <Link href={`/correduria/poliza/${p.id}`} style={{ fontWeight: 600 }}>{p.aseguradora}</Link>
                  <div style={sub}>{p.numeroPoliza ? `nº ${p.numeroPoliza}` : 'sin número'} · <Link href={`/correduria/poliza/${p.id}`}>ver póliza →</Link></div>
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  {p.fechaVencimiento ? (
                    fmt(p.fechaVencimiento)
                  ) : (
                    // NULL = no se sabe cuándo vence, no «no vence».
                    <span style={{ color: 'var(--muted)' }} title="La compañía no ha informado el vencimiento">sin fecha</span>
                  )}
                  <div style={sub}>{p.estado.replace(/_/g, ' ')}</div>
                  <Anulacion vencimiento={p.fechaVencimiento} viva={p.viva} />
                </td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {p.prima === null
                    ? <span style={{ color: 'var(--muted)' }} title="La compañía no informa la prima">sin dato</span>
                    : eur(p.prima)}
                  {/* Solo en las vivas: en el volcado histórico no hay anualidades que comparar. */}
                  {p.viva && p.estado !== 'cancelada' && (
                    <div style={{ marginTop: 4 }}><EvolucionPrima modo="chip" evolucion={p.evolucionPrima} /></div>
                  )}
                </td>
                <td style={td}><CeldaPago p={p} /></td>
                <td style={td}><CeldaRecibos r={p.recibos} /></td>
                <td style={td}>
                  {p.retarificable && p.estado !== 'cancelada' ? (
                    // El único salto a asegura: es donde se gasta el dinero, y
                    // se gasta detrás de su propia pantalla de confirmación.
                    <a href={urlRetarificar(p.id)} target="_blank" rel="noopener noreferrer" style={{ whiteSpace: 'nowrap' }}>
                      {rotuloRetarificar(p.retarificacion)}
                    </a>
                  ) : (
                    <span style={{ color: 'var(--muted)' }} title={motivoNoRetarificable(p)}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
  if (!plegado) return <Tarjeta titulo={titulo}>{tabla}</Tarjeta>
  return (
    <div style={tarjeta}>
      {/* Cerrado por defecto y con montaje perezoso: el volcado histórico son
          cientos de filas en algunas fichas y no se miran casi nunca. */}
      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 14 }}>{titulo}</summary>
        <div style={{ marginTop: 10 }}>{tabla}</div>
      </details>
    </div>
  )
}

/**
 * Quién más figura en la póliza (propietario, conductor habitual, contacto…),
 * debajo de qué asegura. Se omite al tomador: ya es el título de la ficha.
 * `null` = asegura no los informa; se calla en vez de afirmar que no hay.
 */
function Intervinientes({ lista, polizaId }: { lista: IntervinienteFicha[] | null; polizaId: string }) {
  if (lista === null) return null
  const otros = lista.filter(i => i.polizaId === polizaId && !i.esTomador)
  if (otros.length === 0) return null
  return (
    <div style={{ ...sub, marginTop: 4 }}>
      {otros.map((i, n) => (
        <div key={`${i.rol}-${n}`}>
          <span style={{ textTransform: 'capitalize' }}>{etiquetaRol(i.rol)}</span>:{' '}
          {i.fichaId ? (
            <Link href={`/correduria/cliente/${i.fichaId}`}>{i.nombre ?? (i.nombreIlegible ? '🔒 cifrado' : 'sin nombre')}</Link>
          ) : (
            i.nombre ?? (i.nombreIlegible ? '🔒 cifrado' : 'sin nombre')
          )}
          {i.telefono && <> · <a href={`tel:${i.telefono.replace(/\s/g, '')}`}>📞</a></>}
        </div>
      ))}
    </div>
  )
}

function ObjetoCelda({ p }: { p: PolizaFicha }) {
  if (p.objeto === null) {
    return <span style={{ color: 'var(--muted)' }} title="La versión desplegada de asegura no informa este campo">—</span>
  }
  if (p.objeto.estado === 'cifrado') {
    return <span style={{ color: 'var(--muted)', fontStyle: 'italic' }} title={p.objeto.nota ?? undefined}>🔒 cifrado</span>
  }
  if (p.objeto.titulo === null && p.objeto.detalle === null) {
    return (
      <span style={{ color: 'var(--muted)', fontStyle: 'italic' }} title={p.objeto.nota ?? undefined}>
        {p.objeto.estado === 'sin_objeto' ? 'seguro de personas' : 'sin informar'}
      </span>
    )
  }
  return (
    <span title={p.objeto.nota ?? undefined}>
      {p.objeto.titulo}
      {p.objeto.detalle && <div style={sub}>{p.objeto.detalle}</div>}
    </span>
  )
}

/**
 * Forma de pago (Alberto, 02/09/2026): son contratos anuales que la compañía
 * FINANCIA al fraccionar, cobrando por ello. Lo que CIMA da es la periodicidad
 * y la forma de cobro; el recargo se deriva de los recibos del ciclo, y solo
 * se afirma con el ciclo completo — con la mitad de los recibos la resta sale
 * negativa y parecería que fraccionar ahorra.
 */
function CeldaPago({ p }: { p: PolizaFicha }) {
  if (p.pago === null) {
    return <span style={{ color: 'var(--muted)' }} title="La versión desplegada de asegura no informa la forma de pago">—</span>
  }
  const { fraccionamiento, formaCobro, recargo } = p.pago
  return (
    <span style={{ whiteSpace: 'nowrap' }}>
      {etiquetaFraccionamiento(fraccionamiento)}
      {formaCobro && <div style={sub}>{formaCobro}</div>}
      {recargo.estado === 'calculado' && (
        <div style={{ ...sub, color: '#c96' }} title={`${eur(recargo.sumaRecibos)} en ${recargo.recibos} recibos frente a ${eur(recargo.primaAnual)} de prima anual`}>
          +{eur(recargo.recargoEur)} ({recargo.recargoPct.toLocaleString('es-ES')}%) por fraccionar
        </div>
      )}
      {recargo.estado === 'sin_datos' && fraccionamiento !== null && fraccionamiento !== 'anual' && (
        <div style={sub} title={recargo.motivo}>recargo sin calcular</div>
      )}
    </span>
  )
}

/**
 * La única salida de una póliza es su vencimiento, avisando 30 días antes
 * (LCS art. 22). Se pinta solo en las vivas y solo mientras merece la pena
 * saberlo: cuando el plazo de aviso está cerca o ya ha pasado.
 */
function Anulacion({ vencimiento, viva }: { vencimiento: string | null; viva: boolean }) {
  if (!viva) return null
  const v = ventanaAnulacion(vencimiento)
  if (v === null || v.diasParaAvisar > 60) return null
  return (
    <div style={{ ...sub, color: v.enPlazo ? '#c96' : 'var(--muted)' }} title="Contrato anual: solo se anula al vencimiento, con 30 días de preaviso">
      {v.enPlazo ? `avisar antes del ${fmt(v.limiteAviso)} para no renovar` : 'plazo de aviso pasado: renueva otro año'}
    </div>
  )
}

/**
 * El estado de cobro de UNA póliza. Cuatro cosas distintas, cuatro pintados:
 *   null     → asegura no manda el bloque (desplegar).
 *   total 0  → la compañía no ha mandado recibos (18 de 109 vivas, medido).
 *   devuelto → hay dinero que reclamar YA.
 *   al día   → cobrado, y con cuánto.
 * Las dos primeras NUNCA se pintan como «al día».
 */
export function CeldaRecibos({ r }: { r: RecibosPoliza | null }) {
  if (r === null) {
    return <span style={{ color: 'var(--muted)' }} title="La versión desplegada de asegura todavía no informa los recibos">—</span>
  }
  if (r.total === 0) {
    return (
      <span style={{ color: 'var(--muted)' }} title="La compañía no ha mandado ningún recibo de esta póliza. No significa que esté pagada: significa que no se sabe.">
        sin informar
      </span>
    )
  }
  if (r.devueltos > 0) return <span style={{ color: '#d66' }}>🔴 {r.devueltos} devuelto(s)</span>
  if (r.pendientes > 0) return <span style={{ color: '#c96' }} title="Emitido por la compañía y aún sin cargar en cuenta. No es un impago.">🟡 {r.pendientes} al cobro</span>
  // 🚨 Todos anulados (20 de 109 vivas) se pintaba «🟢 0 cobrado(s)»: cero
  // cobros no es estar al día — es una póliza cancelada o sustituida.
  if (r.cobrados === 0 && r.anulados > 0) {
    return <span style={{ color: 'var(--muted)' }} title="Todos los recibos están anulados: la póliza se canceló o se sustituyó. No hay cobro.">⚪ {r.anulados} anulado(s)</span>
  }
  return (
    <span style={{ color: 'var(--muted)' }}>
      🟢 {r.cobrados} cobrado(s)
      {r.cobradoEur !== null && <div style={sub}>{eur(r.cobradoEur)}</div>}
      {r.ilegibles > 0 && <div style={{ ...sub, color: '#c96' }}>{r.ilegibles} importe(s) sin poder leer</div>}
    </span>
  )
}

function motivoNoRetarificable(p: PolizaFicha): string {
  // asegura ya manda el motivo (auto Y hogar, con la copia gemela mirada);
  // el texto de abajo es el respaldo para una versión desplegada más vieja.
  if (p.retarificacion?.motivo) return p.retarificacion.motivo
  if (p.tipo !== 'auto') return `Hoy solo se retarifica auto (esta es de ${p.tipo}).`
  return 'La compañía no ha informado la matrícula, y sin ella no se puede identificar el vehículo.'
}

// ── Cosillas ────────────────────────────────────────────────────────────────

export const tarjeta: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 12, padding: 14 }
export const th: React.CSSProperties = { padding: '6px 8px', fontWeight: 600 }
export const td: React.CSSProperties = { padding: '8px' }
export const sub: React.CSSProperties = { fontSize: 11, color: 'var(--muted)' }

/** Cómo se nombra una póliza en una frase: la matrícula si la hay. */
export function etiquetaPoliza(p: PolizaFicha): string {
  return p.matricula ?? (p.numeroPoliza ? `nº ${p.numeroPoliza}` : `${p.tipo} de ${p.aseguradora}`)
}

export function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={tarjeta}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{titulo}</div>
      {children}
    </div>
  )
}

/** Fecha siempre en español: "2026-06-03" → "03/06/2026". */
export function fmt(iso: string): string {
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}
