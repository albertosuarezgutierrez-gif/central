import Link from 'next/link'
import { agruparHistoricas, etiquetaFraccionamiento, etiquetaRol, ventanaAnulacion, type GrupoHistorica } from '@central/module-seguros'
import EvolucionPrima from '../../EvolucionPrima'
import { urlRetarificar, type IntervinienteFicha, type PolizaDeclaradaFicha, type PolizaFicha, type RecibosPoliza } from '@/lib/ficha-asegura'
import { eur } from '@/lib/dinero'
import { rotuloRetarificar } from '../../rotulo-retarificar'
import { Badge, type Tono } from '@/components/ui'

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

/** Semáforo del estado de una póliza: la FORMA dice vigente/cancelada antes de
 *  leer la palabra (convención de Occident, capturas Drive 11/09/2026). */
const TONO_ESTADO: Record<string, Tono> = {
  activa: 'positivo', en_vigor: 'positivo', en_renovacion: 'info',
  recibo_devuelto: 'negativo', cancelada: 'negativo', vencida: 'negativo',
  fin_riesgo: 'negativo', anula_al_vencimiento: 'aviso', cambio_clave: 'neutral',
  competencia: 'neutral',
}

export function Polizas({ titulo, nota, polizas, vacio, plegado, intervinientes, accion, agruparIguales }: {
  titulo: string; nota?: string; polizas: PolizaFicha[]; vacio: string; plegado?: boolean
  intervinientes: IntervinienteFicha[] | null
  /** CTA para el estado vacío ("+ Presupuestar auto") en vez de solo texto —
   *  avant2/Occident no dejan un hueco mudo, ofrecen la acción ahí mismo. */
  accion?: React.ReactNode
  /**
   * Solo para el VOLCADO HISTÓRICO: junta en una línea las filas que enseñan
   * exactamente lo mismo (mismo ramo, bien, compañía, estado y vencimiento) y
   * enseña todas sus primas. El volcado repite el mismo riesgo cambiando solo
   * el precio —84 grupos / 188 filas / 77 clientes, medido el 21/09/2026— y en
   * la ficha eso se lee como una duplicidad. NO se activa en las vivas ni en
   * las canceladas: ahí dos filas iguales son un problema de conciliación que
   * hay que VER, no esconder (`polizasDuplicadas` de @central/module-seguros).
   */
  agruparIguales?: boolean
}) {
  if (polizas.length === 0) {
    if (!vacio) return null
    return (
      <Tarjeta titulo={titulo}>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>{vacio}</p>
        {accion && <div style={{ marginTop: 10 }}>{accion}</div>}
      </Tarjeta>
    )
  }
  // Sin agrupar, cada póliza es su propio grupo de una fila: la tabla se pinta
  // igual y no hay dos caminos de render que mantener.
  const grupos: GrupoHistorica<PolizaFicha & { bien: string | null }>[] = agruparIguales
    ? agruparHistoricas(polizas.map(p => ({ ...p, bien: huellaBien(p) })))
    : polizas.map(p => {
        const fila = { ...p, bien: null }
        return {
          poliza: fila,
          filas: [fila],
          primas: p.prima === null ? [] : [p.prima],
          algunaSinPrima: p.prima === null,
          bienDesconocido: true,
        }
      })
  const tabla = (
    <>
      {nota && <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 0 }}>{nota}</p>}
      <div style={{ overflowX: 'auto' }}>
        <table className="tabla-polizas" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 880 }}>
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
            {grupos.map(g => {
              const p = g.poliza
              return (
              <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={td} data-rol="cabeza">{TIPOS[p.tipo] ?? p.tipo}</td>
                <td style={{ ...td, minWidth: 140 }} data-label="Qué asegura">
                  <ObjetoCelda p={p} />
                  <Intervinientes lista={intervinientes} polizaIds={g.filas.map(f => f.id)} />
                  <FilasIguales grupo={g} />
                </td>
                <td style={td} data-label="Compañía">
                  <Link href={`/correduria/poliza/${p.id}`} style={{ fontWeight: 600 }}>{p.aseguradora}</Link>
                  <div style={sub}>{p.numeroPoliza ? `nº ${p.numeroPoliza}` : 'sin número'} · <Link href={`/correduria/poliza/${p.id}`}>ver póliza →</Link></div>
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }} data-label="Vence">
                  {p.fechaVencimiento ? (
                    fmt(p.fechaVencimiento)
                  ) : (
                    // NULL = no se sabe cuándo vence, no «no vence».
                    <span style={{ color: 'var(--muted)' }} title="La compañía no ha informado el vencimiento">sin fecha</span>
                  )}
                  <div style={{ marginTop: 3 }}>
                    <Badge tono={TONO_ESTADO[p.estado] ?? 'neutral'}>{p.estado.replace(/_/g, ' ')}</Badge>
                  </div>
                  <Anulacion vencimiento={p.fechaVencimiento} viva={p.viva} />
                </td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }} data-label="Prima">
                  <PrimaGrupo grupo={g} />
                  {/* Solo en las vivas: en el volcado histórico no hay anualidades que comparar. */}
                  {p.viva && p.estado !== 'cancelada' && (
                    <div style={{ marginTop: 4 }}><EvolucionPrima modo="chip" evolucion={p.evolucionPrima} /></div>
                  )}
                </td>
                <td style={td} data-label="Pago"><CeldaPago p={p} /></td>
                <td style={td} data-label="Recibos"><CeldaRecibos r={p.recibos} /></td>
                <td style={td} data-rol="accion">
                  {p.retarificable && p.estado !== 'cancelada' ? (
                    // Interna desde el 03/09/2026: la pantalla que gasta los
                    // 0,50€ vive en /correduria, con su confirmación delante.
                    // Ya no salta a asegura, que echaba al login.
                    <Link href={urlRetarificar(p.id)} style={{ whiteSpace: 'nowrap' }}>
                      {rotuloRetarificar(p.retarificacion)}
                    </Link>
                  ) : (
                    <span style={{ color: 'var(--muted)' }} title={motivoNoRetarificable(p)}>—</span>
                  )}
                </td>
              </tr>
              )
            })}
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
function Intervinientes({ lista, polizaIds }: { lista: IntervinienteFicha[] | null; polizaIds: string[] }) {
  if (lista === null) return null
  // `polizaIds` es el grupo entero cuando el volcado repite la fila: si la
  // segunda copia trae un conductor que la primera no, se sigue viendo (3 de
  // las 188 filas repetidas traen intervinientes, medido 21/09/2026). Al
  // juntarlas hay que quitar al mismo repetido, y eso se decide por IDENTIDAD
  // —etiqueta del NIF, luego su ficha—, nunca por el nombre: dos parientes
  // homónimos en la misma póliza colapsarían en uno. Sin ninguna de las dos no
  // se deduplica: se prefiere verlo dos veces a fundir a dos personas.
  const ids = new Set(polizaIds)
  const vistos = new Set<string>()
  const otros = lista.filter(i => {
    if (!ids.has(i.polizaId) || i.esTomador) return false
    const identidad = i.personaClave ?? (i.fichaId === null ? null : `ficha:${i.fichaId}`)
    if (identidad === null) return true
    const k = `${i.rol}§${identidad}`
    if (vistos.has(k)) return false
    vistos.add(k)
    return true
  })
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

/**
 * Huella de lo que la fila enseña en «Qué asegura», para decidir si dos filas
 * del volcado son la misma. `null` = el volcado no lo informa o viene cifrado
 * — y entonces la fila NO se agrupa con nadie: no se funde lo que no se puede
 * distinguir (regla «agrupar por IDENTIDAD, nunca por la etiqueta»).
 */
export function huellaBien(p: PolizaFicha): string | null {
  if (p.matricula && p.matricula.trim() !== '') return `mat:${p.matricula.trim().toUpperCase()}`
  const o = p.objeto
  if (o === null || o.estado === 'no_informado' || o.estado === 'cifrado') return null
  if (o.estado === 'sin_objeto') return 'sin_objeto'
  const huella = [o.titulo ?? '', o.detalle ?? '', (o.coberturas ?? []).join('|')].join('§')
  return huella.replace(/§/g, '').trim() === '' ? null : huella
}

/**
 * «Esto que ves dos veces son dos filas del volcado», dicho en la propia fila.
 * No se esconde ninguna: cada una enlaza a su póliza, y la prima de cada una va
 * en la celda de al lado.
 */
function FilasIguales({ grupo }: { grupo: GrupoHistorica<PolizaFicha & { bien: string | null }> }) {
  if (grupo.filas.length < 2) return null
  return (
    <div
      style={{ ...sub, marginTop: 4 }}
      title="El volcado de junio de 2026 trae estas filas con el mismo ramo, bien, compañía, estado y vencimiento, cambiando solo la prima. No se ha borrado ninguna: se enseñan juntas."
    >
      🔁 {grupo.filas.length} filas del volcado:{' '}
      {grupo.filas.map((f, i) => (
        <span key={f.id}>
          {i > 0 && ' · '}
          <Link href={`/correduria/poliza/${f.id}`}>{i + 1}</Link>
        </span>
      ))}
    </div>
  )
}

/**
 * La prima del grupo. Con varias filas se enseñan TODAS las primas distintas:
 * quedarse con una sería decidir cuál estuvo contratada, que es justo lo que no
 * se sabe. `sin dato` nunca se pinta como 0€.
 */
function PrimaGrupo({ grupo }: { grupo: GrupoHistorica<PolizaFicha & { bien: string | null }> }) {
  if (grupo.primas.length === 0) {
    return <span style={{ color: 'var(--muted)' }} title="La compañía no informa la prima">sin dato</span>
  }
  // Una prima por línea cuando hay varias (hasta 3 en la cartera real): en una
  // sola fila `nowrap` ensancharía la columna y, con ella, la tabla entera.
  return (
    <>
      {grupo.primas.map((n, i) => (
        <div key={i} style={i > 0 ? { marginTop: 2 } : undefined}>{eur(n)}</div>
      ))}
      {grupo.algunaSinPrima && (
        <div style={sub} title="Alguna de las filas del grupo no trae prima informada">+ alguna sin dato</div>
      )}
    </>
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
  // RC/comercio/otros: el objeto se describe por coberturas contratadas, que
  // pueden ser muchas — la celda enseña el TIPO (cuántas) y el desglose entero
  // va detrás de un clic, en vez de volcar la lista entera en la tabla.
  if (p.objeto.coberturas && p.objeto.coberturas.length > 1) {
    return (
      <details title={p.objeto.nota ?? undefined}>
        <summary style={{ cursor: 'pointer' }}>{p.objeto.coberturas.length} coberturas contratadas</summary>
        <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 12, color: 'var(--muted)' }}>
          {p.objeto.coberturas.map((c, i) => <li key={i}>{c}</li>)}
        </ul>
      </details>
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
        <div style={{ ...sub, color: 'var(--warning)' }} title={`${eur(recargo.sumaRecibos)} en ${recargo.recibos} recibos frente a ${eur(recargo.primaAnual)} de prima anual`}>
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
    <div style={{ ...sub, color: v.enPlazo ? 'var(--warning)' : 'var(--muted)' }} title="Contrato anual: solo se anula al vencimiento, con 30 días de preaviso">
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
  if (r.devueltos > 0) return <span style={{ color: 'var(--negative)' }}>🔴 {r.devueltos} devuelto(s)</span>
  if (r.pendientes > 0) return <span style={{ color: 'var(--warning)' }} title="Emitido por la compañía y aún sin cargar en cuenta. No es un impago.">🟡 {r.pendientes} al cobro</span>
  // 🚨 Todos anulados (20 de 109 vivas) se pintaba «🟢 0 cobrado(s)»: cero
  // cobros no es estar al día — es una póliza cancelada o sustituida.
  if (r.cobrados === 0 && r.anulados > 0) {
    return <span style={{ color: 'var(--muted)' }} title="Todos los recibos están anulados: la póliza se canceló o se sustituyó. No hay cobro.">⚪ {r.anulados} anulado(s)</span>
  }
  return (
    <span style={{ color: 'var(--muted)' }}>
      🟢 {r.cobrados} cobrado(s)
      {r.cobradoEur !== null && <div style={sub}>{eur(r.cobradoEur)}</div>}
      {r.ilegibles > 0 && <div style={{ ...sub, color: 'var(--warning)' }}>{r.ilegibles} importe(s) sin poder leer</div>}
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

/**
 * Pólizas que el cliente ha APORTADO desde el portal: NO son de la
 * correduría (casi siempre son de otra compañía), así que van en su propio
 * bloque y con «No la gestionamos» en cada fila — el mismo chip que ya usa
 * el portal del cliente, para que el corredor no las confunda con una viva.
 *
 * 🚨 `null` ≠ `[]`: `null` es «no se ha podido leer si aportó algo» (falló
 * `portal_vinculo` o la tabla), `[]` es «se ha mirado y no ha aportado
 * ninguna». Colapsarlos en el mismo hueco mudo diría «no hay nada» sobre un
 * fallo de lectura — la regla NULL≠0 del CLAUDE.md raíz.
 */
export function PolizasDeclaradas({ declaradas }: { declaradas: PolizaDeclaradaFicha[] | null }) {
  if (declaradas === null) {
    return (
      <Tarjeta titulo="📥 Aportadas desde el portal">
        <p style={{ color: 'var(--muted)', fontSize: 12, margin: 0 }}>
          ⚠️ No se han podido leer. No significa que no haya aportado ninguna.
        </p>
      </Tarjeta>
    )
  }
  if (declaradas.length === 0) return null
  return (
    <Tarjeta titulo={`📥 Aportadas desde el portal (${declaradas.length})`}>
      <p style={{ color: 'var(--muted)', fontSize: 12, marginTop: 0 }}>
        Las ha subido el propio cliente en su portal. No las gestiona Grupo ASegura: sirven para
        saber con quién tiene el seguro y cuándo le vence, de cara a ofrecerle cambiarse.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
          <thead>
            <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
              <th style={th}>Ramo</th>
              <th style={th}>Compañía</th>
              <th style={th}>Vence</th>
              <th style={{ ...th, textAlign: 'right' }}>Prima</th>
              <th style={th} />
            </tr>
          </thead>
          <tbody>
            {declaradas.map(d => (
              <tr key={d.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={td}>{TIPOS[d.ramo ?? ''] ?? d.ramo ?? 'sin ramo'}</td>
                <td style={td}>
                  {d.compania ?? <span style={{ color: 'var(--muted)' }}>sin compañía</span>}
                  {/* El BIEN identifica la póliza (marca/modelo/matrícula en auto, la
                      dirección en hogar) — el nº de póliza nadie se lo sabe de memoria,
                      así que va detrás y solo como referencia. `null` = la IA no lo leyó
                      del documento subido, no que la póliza no tenga esos datos. */}
                  {(d.bien.cosa || d.bien.ubicacion) && (
                    <div style={sub}>{[d.bien.cosa, d.bien.ubicacion, ...d.bien.detalles].filter(Boolean).join(' · ')}</div>
                  )}
                  <div style={sub}>{d.numeroPoliza ? `nº ${d.numeroPoliza}` : 'sin número'}{d.matricula && !d.bien.cosa ? ` · ${d.matricula}` : ''}</div>
                  {/* La declaró de su EMPRESA, no a título personal — cotejarla contra esta
                      ficha personal sería el cruce equivocado (ver `yaEnCartera` más abajo). */}
                  {d.titularTipo === 'empresa' && (
                    <div style={sub} title="El cliente dijo que esta póliza es de su empresa, no personal">
                      a nombre de {d.titularEmpresaNombre ?? 'su empresa'}
                    </div>
                  )}
                </td>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  {d.fechaVencimiento
                    ? fmt(d.fechaVencimiento)
                    : <span style={{ color: 'var(--muted)' }} title="No consta el vencimiento">sin fecha</span>}
                </td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {d.primaAnual === null ? <span style={{ color: 'var(--muted)' }}>sin dato</span> : eur(d.primaAnual)}
                </td>
                <td style={td}>
                  {d.yaEnCartera === true ? (
                    <Badge tono="info" title="Ya tiene una póliza con este número en su cartera: no es una oportunidad, es la misma póliza subida dos veces">
                      Ya la tienes con ella
                    </Badge>
                  ) : (
                    <Badge tono="neutral">No la gestionamos</Badge>
                  )}
                  {!d.confirmadaPorUsuario && (
                    <div style={sub} title="Datos leídos automáticamente del documento subido: revísalos antes de fiarte de ellos">
                      sin revisar
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  )
}

// ── Cosillas ────────────────────────────────────────────────────────────────

// Panel del portal del cliente (24/09/2026): blanco, radio de marca y la sombra en capas, que ya
// trae su propio filete de 1 px — por eso no lleva borde.
export const tarjeta: React.CSSProperties = { background: 'var(--surface)', borderRadius: 'var(--radius)', padding: 16, boxShadow: 'var(--shadow)' }
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
