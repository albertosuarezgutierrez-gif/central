import Link from 'next/link'
import { NECESARIOS_EMISION_AUTO, contactoEfectivo, etiquetaFraccionamiento, etiquetaRol, ventanaAnulacion } from '@central/module-seguros'
import Documentos from '../../Documentos'
import EditarCliente from '../../EditarCliente'
import {
  fichaAsegura, urlRetarificar, urlSubirPoliza,
  type IntervinienteFicha, type PolizaFicha, type RecibosPoliza,
} from '@/lib/ficha-asegura'
import { eur } from '@/lib/dinero'
import type { ContactosCliente } from '@/lib/cliente-edicion-asegura'
import { rotuloRetarificar } from '../../rotulo-retarificar'
import { PageHeader, BtnLink } from '@/components/ui'

export const dynamic = 'force-dynamic'

/**
 * La ficha del cliente de la correduría, DENTRO del cuadro de mando.
 *
 * Alberto usa una sola pantalla —esta— para todos sus negocios: la correduría
 * es uno más. `apps/asegura` es el back (tiene la BD de la cartera y el botón
 * que gasta 0,50€ al retarificar); aquí se ve todo y desde aquí se salta allí
 * solo para lo que cuesta dinero.
 *
 * El principio de la pantalla es el que pidió: se pincha un nombre y está todo.
 * Sin pestañas, sin volver a buscar, sin «ver detalle» que abre otra pantalla
 * que hay que cerrar.
 */
export default async function FichaCorreduriaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await fichaAsegura(id)

  if (r.estado !== 'ok') return <NoSePudo estado={r} />

  const { ficha } = r
  // 🚨 «Viva» = entra por CIMA; pero 42 de las 109 CIMA están CANCELADAS
  // (medido 02/09/2026). Mezclarlas con las activas infla «pólizas vivas» y
  // pone un «Retarificar» en un seguro que ya no existe.
  const vivas = ficha.polizas.filter(p => p.viva && p.estado !== 'cancelada')
  const canceladas = ficha.polizas.filter(p => p.viva && p.estado === 'cancelada')
  const historicas = ficha.polizas.filter(p => !p.viva)
  const abiertos = ficha.siniestros.filter(s => s.abierto)

  // `minmax(0, 1fr)` NO es decorativo: sin él, la pista implícita de este grid se dimensiona con
  // el contenido más ancho —la tabla de pólizas, que declara `minWidth: 880`— y arrastra la página
  // entera a 910 px en un móvil de 390. El `overflowX: 'auto'` de la tabla queda anulado, porque
  // para cuando actúa su contenedor ya ha crecido. Y el desbordamiento NO se ve en `body`: como
  // `LayoutShell` declara `overflowY: 'auto'`, CSS le activa también el eje X y es él quien
  // scrollea. Medido en Chromium el 02/09/2026: 910 → 390 px solo con esta línea.
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16 }}>
      <div>
        <Link href="/correduria" style={{ fontSize: 13, color: 'var(--muted)' }}>← Correduría</Link>
        <PageHeader
          titulo={ficha.nombre}
          sub={<span style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {/* CIMA engancha pólizas por DNI a una ficha que puede seguir `lead`:
                con pólizas vivas ES cliente, diga lo que diga el enum. */}
            <span>{ficha.tipo === 'cliente' || vivas.length > 0 ? '✅ Cliente (CIMA)' : '🕐 Lead'}</span>
            <Contacto c={ficha.contacto} intervinientes={ficha.intervinientes} piiClave={ficha.piiClave} contactos={ficha.contactos} />
          </span>}
        />
      </div>

      <Acciones />

      <Titulares polizas={ficha.polizas} vivas={vivas.length} abiertos={abiertos.length} />

      {/* Editar: contactos (libres), dirección (libre) e identidad (solo con DNI recibido). */}
      <Tarjeta titulo="✏️ Datos del cliente">
        <EditarCliente
          clienteId={ficha.id}
          contactos={ficha.contactos}
          identidad={ficha.identidad}
          contacto={ficha.contacto}
          documentos={ficha.documentos}
        />
      </Tarjeta>

      <Polizas titulo="Pólizas vivas" polizas={vivas} vacio="Ninguna póliza activa entra hoy por CIMA." intervinientes={ficha.intervinientes} />

      {canceladas.length > 0 && (
        <Polizas
          titulo={`Canceladas en CIMA (${canceladas.length})`}
          nota="La compañía las manda por CIMA con estado «cancelada»: ya no aseguran nada. Sirven para saber qué tuvo y cuánto pagaba."
          polizas={canceladas}
          vacio=""
          plegado
          intervinientes={ficha.intervinientes}
        />
      )}

      <Siniestros lista={ficha.siniestros} />

      {/* Documentos: los del cliente y los de sus pólizas/siniestros, con «pedido» */}
      <Tarjeta titulo="📎 Documentos">
        <Documentos clienteId={ficha.id} inicial={ficha.documentos} sugeridos={NECESARIOS_EMISION_AUTO} />
      </Tarjeta>

      {historicas.length > 0 && (
        <Polizas
          titulo={`Volcado histórico (${historicas.length})`}
          nota="Del volcado de junio de 2026, con vencimientos antiguos. Sirven para saber qué tuvo contratado, no para renovar."
          polizas={historicas}
          vacio=""
          plegado
          intervinientes={ficha.intervinientes}
        />
      )}
    </div>
  )
}

// ── Titulares ───────────────────────────────────────────────────────────────
// Lo que hay que saber ANTES de descolgar el teléfono. Cada número lleva su
// estado: un contador que no distingue «cero» de «no informado» es justo el que
// hace decir «está todo al día» sobre lo que no se ha mirado.

function Titulares({ polizas, vivas, abiertos }: { polizas: PolizaFicha[]; vivas: number; abiertos: number }) {
  const conRecibos = polizas.filter(p => p.recibos !== null)
  const sinInformar = polizas.length - conRecibos.length
  const devueltos = conRecibos.reduce((s, p) => s + (p.recibos?.devueltos ?? 0), 0)
  const pendientes = conRecibos.reduce((s, p) => s + (p.recibos?.pendientes ?? 0), 0)
  const sinRecibo = conRecibos.filter(p => (p.recibos?.total ?? 0) === 0).length

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
      <Kpi label="Pólizas vivas" valor={String(vivas)} sub={`${polizas.length} en total`} />
      <Kpi
        label="Recibos devueltos"
        valor={sinInformar === polizas.length ? '—' : String(devueltos)}
        color={devueltos > 0 ? '#d66' : undefined}
        sub={
          sinInformar === polizas.length
            ? 'asegura aún no manda recibos'
            : devueltos > 0 ? 'hay que reclamar el cobro' : 'ninguno devuelto'
        }
      />
      <Kpi
        label="Recibos al cobro"
        valor={sinInformar === polizas.length ? '—' : String(pendientes)}
        color={pendientes > 0 ? '#c96' : undefined}
        sub={sinRecibo > 0 ? `${sinRecibo} póliza(s) sin recibos informados` : pendientes > 0 ? 'emitidos y aún sin cargar: no es deuda' : 'sobre los recibos informados'}
      />
      <Kpi
        label="Siniestros abiertos"
        valor={String(abiertos)}
        color={abiertos > 0 ? '#c96' : undefined}
        sub={abiertos > 0 ? 'en tramitación' : 'ninguno abierto'}
      />
    </div>
  )
}

function Kpi({ label, valor, sub, color }: { label: string; valor: string; sub?: string; color?: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color ?? 'var(--text)' }}>{valor}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{sub}</div>}
    </div>
  )
}

// ── Acciones ────────────────────────────────────────────────────────────────
// Lo que se puede HACER desde la ficha, además de mirar. Subir un documento es
// gratis (el agente lo lee; el precio se pide aparte) y vive en asegura porque
// comparte pantalla con la cotización que sale de lo leído.

function Acciones() {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
      <BtnLink href={urlSubirPoliza()} variante="secundario" nuevaPestana>
        📄 Subir póliza o documento ↗
      </BtnLink>
      <span style={{ color: 'var(--muted)' }} title="Hoy el agente lee pólizas de AUTO (PDF o foto): vehículo, antigüedad, siniestralidad. El fichero NO se guarda todavía: falta decidir dónde y cuánto tiempo conservar documentos con DNI y matrícula dentro.">
        el agente la lee y enseña lo que ha encontrado · hoy solo auto · el fichero no se guarda aún
      </span>
    </div>
  )
}

// ── Contacto ────────────────────────────────────────────────────────────────
// 🚨 «Sin teléfono» en la ficha del TOMADOR no es «no hay a quién llamar».
// Esquiansa (empresa) no tiene teléfono; su conductor habitual —dueño del
// coche— sí, en su propia ficha enlazada por CIMA. `contactoEfectivo` mira
// primero al tomador y luego a los intervinientes, y dice DE QUIÉN es el número.

// «cifrado» a secas no dice dónde tocar. asegura manda por qué no abre la clave
// (02/09/2026: Alberto copió variables en Vercel tres veces a ciegas porque
// «sin clave», «mal pegada» y «clave distinta» se veían idénticas).
const CAUSA_PII: Record<string, string> = {
  sin_clave: 'central-asegura no tiene PII_ENCRYPTION_KEY, o no se ha redesplegado tras añadirla',
  mal_formada: 'PII_ENCRYPTION_KEY en central-asegura no son 64 caracteres hexadecimales: se pegó mal',
  no_abre: 'PII_ENCRYPTION_KEY en central-asegura no es la misma que la del proyecto asegura',
  sin_muestra: 'no hay ningún dato cifrado con el que probar la clave',
}

function Contacto({ c, intervinientes, piiClave, contactos }: {
  c: { telefono: string | null; email: string | null; telefonoIlegible: boolean; emailIlegible: boolean; ciudad: string | null; provincia: string | null }
  intervinientes: IntervinienteFicha[] | null
  piiClave: string | null
  /** Todos los teléfonos/emails; `null` = asegura no manda el bloque (no se afirma «solo uno»). */
  contactos: ContactosCliente | null
}) {
  // «(+N)» = hay más aparte del principal; se ven y editan en ✏️ Datos del cliente.
  const masTel = contactos && contactos.telefonos.length > 1 ? contactos.telefonos.length - 1 : 0
  const masEmail = contactos && contactos.emails.length > 1 ? contactos.emails.length - 1 : 0
  const mas = (n: number) => n > 0 ? <span style={{ fontSize: 11, color: 'var(--muted)' }} title={`${n} más en la ficha (✏️ Datos del cliente)`}> (+{n})</span> : null
  const causaPii = piiClave === null ? 'la clave no abre este dato (asegura no dice por qué: versión anterior)' : CAUSA_PII[piiClave] ?? `estado de clave desconocido: ${piiClave}`
  const sitio = [c.ciudad, c.provincia].filter(Boolean).join(', ')
  const ef = contactoEfectivo({ telefono: c.telefono, email: c.email }, intervinientes)
  const quien = ef.quien
    ? `${ef.quien.nombre ?? 'sin nombre legible'}, ${etiquetaRol(ef.quien.rol)}`
    : null
  const deOtro = (via: 'tomador' | 'interviniente' | null) =>
    via === 'interviniente' && quien ? (
      <span style={{ fontSize: 11 }}>
        {' '}({ef.quien?.fichaId ? <Link href={`/correduria/cliente/${ef.quien.fichaId}`}>{quien}</Link> : quien})
      </span>
    ) : null
  // Sin intervinientes que mirar, «sin teléfono» solo habla del tomador.
  const coletilla = ef.intervinientesSinMirar ? ' · intervinientes sin comprobar' : ''
  return (
    <>
      {ef.telefono ? (
        <span>
          <a href={`tel:${ef.telefono.replace(/\s/g, '')}`}>📞 {ef.telefono}</a>
          {deOtro(ef.viaTelefono)}
          {mas(masTel)}
        </span>
      ) : (
        // Cifrado-que-no-abre y sin-teléfono son cosas distintas y se arreglan
        // en sitios distintos (la clave PII vs. pedírselo al cliente).
        <span title={c.telefonoIlegible ? `Está guardado pero no se puede descifrar: ${causaPii}` : `No consta teléfono en su ficha${ef.intervinientesSinMirar ? '' : ' ni en la de ninguno de sus intervinientes'}`}>
          📞 {c.telefonoIlegible ? `cifrado · ${causaPii}` : `sin teléfono${coletilla}`}
        </span>
      )}
      {ef.email ? (
        <span>
          <a href={`mailto:${ef.email}`}>✉️ {ef.email}</a>
          {deOtro(ef.viaEmail)}
          {mas(masEmail)}
        </span>
      ) : (
        <span title={c.emailIlegible ? `Está guardado pero no se puede descifrar: ${causaPii}` : 'No consta email'}>
          ✉️ {c.emailIlegible ? `cifrado · ${causaPii}` : 'sin email'}
        </span>
      )}
      {sitio && <span>📍 {sitio}</span>}
    </>
  )
}

// ── Pólizas ─────────────────────────────────────────────────────────────────

const TIPOS: Record<string, string> = {
  auto: '🚗 Auto', moto: '🏍️ Moto', hogar: '🏠 Hogar', vida: '🧬 Vida', salud: '🩺 Salud',
  decesos: '⚱️ Decesos', responsabilidad_civil: '⚖️ R. Civil', comercio: '🏪 Comercio',
  comunidades: '🏢 Comunidad', otros: '📄 Otros',
}

function Polizas({ titulo, nota, polizas, vacio, plegado, intervinientes }: {
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
function CeldaRecibos({ r }: { r: RecibosPoliza | null }) {
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

// ── Siniestros ──────────────────────────────────────────────────────────────

function Siniestros({ lista }: { lista: { id: string; estado: string; tipo: string | null; referencia: string | null; fecha: string | null; reserva: number | null; indemnizacion: number | null; tramitador: string | null; abierto: boolean }[] }) {
  if (lista.length === 0) {
    return (
      <Tarjeta titulo="Siniestros">
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0 }}>
          Ninguno registrado. Ojo: solo constan los que han llegado por CIMA o se han dado de alta
          aquí — un parte que el cliente diera directamente a la compañía puede no aparecer.
        </p>
      </Tarjeta>
    )
  }
  return (
    <Tarjeta titulo={`Siniestros (${lista.length})`}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 620 }}>
          <thead>
            <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
              <th style={th}>Fecha</th>
              <th style={th}>Estado</th>
              <th style={th}>Tipo</th>
              <th style={th}>Referencia</th>
              <th style={th}>Tramitador</th>
              <th style={{ ...th, textAlign: 'right' }}>Reserva</th>
            </tr>
          </thead>
          <tbody>
            {lista.map(s => (
              <tr key={s.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ ...td, whiteSpace: 'nowrap' }}>
                  {s.fecha ? fmt(s.fecha) : <span style={{ color: 'var(--muted)' }}>sin fecha</span>}
                </td>
                <td style={{ ...td, color: s.abierto ? '#c96' : 'var(--muted)', whiteSpace: 'nowrap' }}>
                  {s.abierto ? '🟠' : '⚪'} {s.estado.replace(/_/g, ' ')}
                </td>
                <td style={td}>{s.tipo ?? <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                <td style={td}>{s.referencia ?? <span style={{ color: 'var(--muted)' }}>—</span>}</td>
                <td style={td}>
                  {s.tramitador ?? (
                    <span style={{ color: 'var(--muted)' }} title="La compañía no ha informado quién lo lleva">sin asignar en CIMA</span>
                  )}
                </td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  {/* Reserva e indemnización están hoy al 0% de cobertura: NULL
                      es «la compañía no lo informa», no «cero euros de daño». */}
                  {s.reserva === null
                    ? <span style={{ color: 'var(--muted)' }} title="La compañía no informa la reserva">sin dato</span>
                    : eur(s.reserva)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Tarjeta>
  )
}

// ── Fallos ──────────────────────────────────────────────────────────────────

const MOTIVOS: Record<string, string> = {
  secreto_rechazado: 'asegura rechaza el secreto (ASEGURA_OPERADOR_SECRET no coincide entre los dos proyectos).',
  asegura_error: 'asegura respondió, pero no pudo leer su base de datos.',
  respuesta_ilegible: 'la respuesta no tenía la forma esperada.',
  red: 'no se pudo llegar a asegura (timeout, DNS o TLS).',
}

function NoSePudo({ estado }: { estado: { estado: 'sin_configurar' } | { estado: 'error'; motivo: string } | { estado: 'no_encontrado' } }) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <Link href="/correduria" style={{ fontSize: 13, color: 'var(--muted)' }}>← Correduría</Link>
      <div style={tarjeta}>
        {estado.estado === 'no_encontrado' ? (
          <>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>Esa ficha no está en la cartera</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
              Se ha consultado y no existe (o está fusionada con otra). Esto sí es una ausencia
              comprobada, no un fallo de conexión.
            </p>
          </>
        ) : estado.estado === 'sin_configurar' ? (
          <>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>⏳ El puerto con asegura no está conectado</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
              Falta <code>ASEGURA_OPERADOR_SECRET</code> en este proyecto. No significa que el
              cliente no exista: significa que desde aquí no se puede mirar.
            </p>
          </>
        ) : (
          <>
            <h2 style={{ marginTop: 0, fontSize: 16 }}>⚠️ No se ha podido leer la ficha</h2>
            <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
              {MOTIVOS[estado.motivo] ?? 'motivo desconocido.'} No lo leas como «este cliente no
              tiene nada».
            </p>
          </>
        )}
      </div>
    </div>
  )
}

// ── Cosillas ────────────────────────────────────────────────────────────────

const tarjeta: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 12, padding: 14 }
const th: React.CSSProperties = { padding: '6px 8px', fontWeight: 600 }
const td: React.CSSProperties = { padding: '8px' }
const sub: React.CSSProperties = { fontSize: 11, color: 'var(--muted)' }

function Tarjeta({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={tarjeta}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>{titulo}</div>
      {children}
    </div>
  )
}

/** Fecha siempre en español: "2026-06-03" → "03/06/2026". */
function fmt(iso: string): string {
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}
