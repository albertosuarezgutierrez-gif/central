'use client'
import Link from 'next/link'
import { eur } from '@/lib/dinero'
import { TablaScroll, Badge, type Tono } from '@/components/ui'
import { esAccionable } from './secciones'

/**
 * Las pólizas que vencen: la máquina comercial de una correduría.
 *
 * ─── Por qué vive en su propio fichero (03/09/2026) ──────────────────────────
 * Estaba DENTRO de `CarteraViva`, después de sus tres `return` tempranos. O sea:
 * el día que el puerto de central-asegura fallaba, la tabla de renovaciones
 * desaparecía en silencio y su propio manejo de error —que existe, ahí abajo—
 * era código muerto. Es exactamente el fallo por el que `BuscadorCartera` y
 * `Duplicadas` ya se habían sacado fuera; a esta se le había pasado.
 *
 * Ahora es hermana, no hija: la pinta la pantalla, y lee su estado de las props.
 * Quien hace el fetch es `CorreduriaClient` (UNA vez), porque la misma lista
 * alimenta dos secciones —«Hoy» y «Cartera»— y montarla dos veces serían dos
 * llamadas al puerto para los mismos datos.
 *
 * El orden lo marca la LCS art. 22: dentro del mes de preaviso el tomador ya no
 * puede oponerse a la prórroga, así que «quedan 9 días» y «quedan 70» son
 * trabajos distintos y la lista lo dice.
 */

import type { MotivoError } from './estado-puerto'
import { MOTIVOS } from './estado-puerto'
import { describirCausaAsegura } from '@/lib/correduria-puerto'

// El estado se lee por la FORMA de la píldora, no por un emoji: los círculos de
// colores se pintan distinto en cada sistema operativo y 🟠 y 🟡 son
// indistinguibles a 12px, que es justo donde estaba la diferencia entre «aún
// puedes moverla» y «ya se prorroga sola».
const URGENCIAS: Record<string, { label: string; tono: Tono }> = {
  vencida: { label: 'Vencida', tono: 'negativo' },
  prorroga_inevitable: { label: 'Se prorroga (fuera de plazo)', tono: 'negativo' },
  ultima_llamada: { label: 'Última llamada', tono: 'aviso' },
  a_tiempo: { label: 'A tiempo', tono: 'neutral' },
}

const TIPOS: Record<string, string> = {
  auto: 'Auto', moto: 'Moto', hogar: 'Hogar', vida: 'Vida', salud: 'Salud',
  decesos: 'Decesos', responsabilidad_civil: 'R. Civil', comercio: 'Comercio',
  comunidad: 'Comunidad', accidentes: 'Accidentes',
}

export type ObjetoAsegurado = {
  estado: 'conocido' | 'no_informado' | 'cifrado' | 'sin_objeto'
  titulo: string | null; detalle: string | null; nota: string | null
}

export type Vencimiento = {
  id: string
  /** `null` = la versión desplegada de asegura aún no manda el id del tomador.
   *  Entonces el nombre NO es un enlace y se dice por qué, en vez de romper. */
  clienteId: string | null
  cliente: string; tipo: string; aseguradora: string
  numeroPoliza: string | null; fechaVencimiento: string; dias: number
  urgencia: string; prima: number | null; fraccionamiento: string | null
  objeto: ObjetoAsegurado | null
}

export type RespVencimientos =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo?: MotivoError; causa?: string }
  | { estado: 'ok'; dias: number; polizas: Vencimiento[] }

// Fecha siempre en formato español día/mes/año: "2026-06-03" → "03/06/2026".
function fmtFecha(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return d && m && y ? `${d}/${m}/${y}` : iso
}

/**
 * Qué asegura la póliza. Sin esto, «Auto · Mapfre · 431,85€» no dice CUÁL de
 * los tres coches del cliente es, y la llamada empieza preguntando.
 *
 * Cinco casos, y ninguno se pinta como los demás — un hueco vacío diría «no hay
 * nada que asegurar», que es justo lo contrario de lo que se sabe:
 *   objeto null → el puerto (central-asegura) aún no manda el campo.
 *   no_informado → la compañía no lo ha mandado: está pendiente de reclamar.
 *   cifrado      → el dato existe pero llega cifrado y aquí no hay clave.
 *   sin_objeto   → seguro de personas: no hay bien. Ausencia definitiva.
 */
function CeldaObjeto({ objeto }: { objeto: ObjetoAsegurado | null }) {
  if (objeto === null) {
    return (
      <span
        style={{ color: 'var(--muted)' }}
        title="La versión desplegada de central-asegura todavía no informa qué asegura cada póliza. No es que no se sepa: es que aún no llega por el puerto."
      >—</span>
    )
  }
  if (objeto.estado === 'no_informado' || (objeto.titulo === null && objeto.detalle === null)) {
    return (
      <span style={{ color: 'var(--muted)', fontStyle: 'italic' }} title={objeto.nota ?? undefined}>
        {objeto.estado === 'cifrado' ? 'dato cifrado' : 'sin informar'}
      </span>
    )
  }
  return (
    <span title={objeto.nota ?? undefined}>
      <span style={{ color: objeto.estado === 'sin_objeto' ? 'var(--muted)' : 'var(--text)' }}>
        {objeto.titulo}
      </span>
      {objeto.detalle && (
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>{objeto.detalle}</div>
      )}
    </span>
  )
}

/**
 * @param filtro  `accionables` = solo lo que caduca (secciones «Hoy»);
 *                `todas` = la ventana entera que devolvió el puerto («Cartera»).
 */
export default function Renovaciones({ datos, filtro }: {
  datos: RespVencimientos | null
  filtro: 'accionables' | 'todas'
}) {
  if (datos === null) {
    return <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>Cargando renovaciones…</p>
  }

  // «Sin configurar» no es «no vence nada»: el puerto no está puesto todavía.
  if (datos.estado === 'sin_configurar') {
    return (
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
        Las renovaciones no se pueden leer: falta conectar el puerto con central-asegura. No
        significa que no venza nada.
      </p>
    )
  }

  if (datos.estado === 'error') {
    return (
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
        Las renovaciones <strong>no se han podido leer</strong> — {MOTIVOS[datos.motivo ?? 'respuesta_ilegible']}
        {describirCausaAsegura(datos.causa) ? ` Causa que declara asegura: ${describirCausaAsegura(datos.causa)}.` : ''}
        {' '}No hay que entenderlo como «no vence nada».
      </p>
    )
  }

  const polizas = filtro === 'accionables'
    ? datos.polizas.filter(p => esAccionable(p.urgencia))
    : datos.polizas

  if (polizas.length === 0) {
    return (
      <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
        {filtro === 'accionables'
          ? 'Ninguna renovación entra hoy en la ventana de preaviso (LCS art. 22).'
          : `Ninguna póliza vigente vence en los próximos ${datos.dias} días.`}
      </p>
    )
  }

  // Primas conocidas y desconocidas, separadas: la compañía no siempre informa
  // la prima (medido con Allianz por EIAC) y un total a secas la daría por 0.
  const conPrima = polizas.filter(p => p.prima !== null)
  const total = conPrima.reduce((s, p) => s + (p.prima ?? 0), 0)
  const sinPrima = polizas.length - conPrima.length

  return (
    <>
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>
        Cartera en juego: {eur(total)}{sinPrima > 0 && ` · ${sinPrima} sin prima informada`}
      </p>

      <TablaScroll>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
          <thead>
            <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
              <th style={{ padding: '6px 8px', fontWeight: 600 }}>Vence</th>
              <th style={{ padding: '6px 8px', fontWeight: 600 }}>Cliente</th>
              <th style={{ padding: '6px 8px', fontWeight: 600 }}>Ramo</th>
              <th style={{ padding: '6px 8px', fontWeight: 600 }}>Qué asegura</th>
              <th style={{ padding: '6px 8px', fontWeight: 600 }}>Compañía</th>
              <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Prima</th>
              <th style={{ padding: '6px 8px', fontWeight: 600 }}>Estado</th>
            </tr>
          </thead>
          <tbody>
            {polizas.map(p => {
              const u = URGENCIAS[p.urgencia] ?? URGENCIAS.a_tiempo
              return (
                <tr key={p.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                    {fmtFecha(p.fechaVencimiento)}
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {p.dias === 0 ? 'hoy' : `en ${p.dias} días`}
                    </div>
                  </td>
                  <td style={{ padding: '8px' }}>
                    {/* El acceso directo: un clic y está la ficha entera del
                        cliente (pólizas, recibos, siniestros). Sin volver a
                        buscarlo por su nombre, que es lo que había antes. */}
                    {p.clienteId ? (
                      <Link href={`/correduria/cliente/${p.clienteId}`} style={{ fontWeight: 600 }}>
                        {p.cliente}
                      </Link>
                    ) : (
                      <span title="La versión desplegada de asegura todavía no manda el id del cliente, así que no se puede enlazar su ficha">
                        {p.cliente}
                      </span>
                    )}
                    {p.numeroPoliza && (
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>nº {p.numeroPoliza}</div>
                    )}
                  </td>
                  <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>{TIPOS[p.tipo] ?? p.tipo}</td>
                  <td style={{ padding: '8px', minWidth: 150 }}><CeldaObjeto objeto={p.objeto} /></td>
                  <td style={{ padding: '8px' }}>{p.aseguradora}</td>
                  <td style={{ padding: '8px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {p.prima === null
                      ? <span style={{ color: 'var(--muted)' }} title="La compañía no informa la prima">sin dato</span>
                      : eur(p.prima)}
                  </td>
                  <td style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                    <Badge tono={u.tono}>{u.label}</Badge>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TablaScroll>

      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '8px 0 0' }}>
        El tomador puede oponerse a la prórroga hasta un mes antes del vencimiento (LCS art. 22): pasada esa
        fecha la póliza se renueva sola. Las pólizas sin fecha de vencimiento no salen aquí — no es que no
        venzan, es que la compañía no ha informado la fecha.
      </p>
    </>
  )
}
