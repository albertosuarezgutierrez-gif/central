'use client'
import { useState } from 'react'
import { Antenna, TriangleAlert } from 'lucide-react'
import { Badge, Pendiente, TablaScroll } from '@/components/ui'
import { eur } from '@/lib/dinero'
import type { GrupoHuerfanas, SaludIngesta } from '@central/module-seguros'
import {
  hayQueEnsenar, senalesIngesta, tituloIngesta, veredictoIngesta,
  type VistaIngesta,
} from '@/lib/correduria/ingesta-pantalla'
import Bloque from './Bloque'
import { MOTIVOS, type MotivoError } from './estado-puerto'

/**
 * La salud de la INGESTA de CIMA, en la pantalla que Alberto abre.
 *
 * El dato existía desde el 01/09/2026 (cron `correduria-ingesta` + Telegram) y
 * el panel equivalente vive en `app.grupoasegura.com`, el CRM de origen — una
 * app en la que él no entra. Un aviso que sale por un canal que la persona no
 * abre es un aviso que no existe, así que aquí está, en `/correduria`.
 *
 * Dos vistas del MISMO dato (una sola lectura, que hace la pantalla padre):
 *
 *   · `AvisoIngesta` en «Hoy» — **solo se pinta cuando hay algo que decir.**
 *     Con la ingesta al día no ocupa ni un píxel, que es literalmente lo que
 *     pidió Alberto: «que solo salgan errores y poder controlar».
 *   · `PanelIngesta` en su sección — el detalle: qué hay atascado, de quién, qué
 *     pólizas hay que pedir y a qué clave de mediador, quién ha dejado de mandar.
 *
 * 🚨 La regla que gobierna las dos: **no poder mirar NO es estar bien.** Si el
 * puerto con asegura no responde, la pantalla lo dice con su motivo; jamás se
 * pinta un verde que nadie ha comprobado.
 */

/** El motivo del puerto, en cristiano. Uno desconocido se enseña crudo. */
function textoMotivo(motivo: string): string {
  return MOTIVOS[motivo as MotivoError] ?? `motivo no reconocido: ${motivo}`
}

function BadgeEstado({ datos }: { datos: VistaIngesta | null }) {
  const v = veredictoIngesta(datos)
  if (v === null) return <Badge>Comprobando…</Badge>
  if (v === 'ok') return <Badge tono="positivo">Al día</Badge>
  if (v === 'incidencia') return <Badge tono="negativo">Se pierden datos</Badge>
  return <Badge tono="aviso">Sin comprobar</Badge>
}

// ── La tarjeta de «Hoy» ─────────────────────────────────────────────────────

export function AvisoIngesta({ datos }: { datos: VistaIngesta | null }) {
  // Silencio COMPROBADO: se ha mirado, se ha mirado todo, y no hay nada.
  if (!hayQueEnsenar(datos) || datos === null) return null

  const incidencia = veredictoIngesta(datos) === 'incidencia'
  const senales = datos.estado === 'ok' ? senalesIngesta(datos.salud) : []
  const perdidas = senales.filter(s => s.tipo === 'perdida')

  return (
    <Bloque
      destacado
      tono={incidencia ? 'malo' : 'aviso'}
      Icono={incidencia ? TriangleAlert : Antenna}
      titulo={tituloIngesta(datos)}
      accion={<BadgeEstado datos={datos} />}
      sub={
        incidencia
          ? 'Un recibo o un siniestro que no entra no aparece en ninguna pantalla, y su comisión tampoco.'
          : 'Esto NO significa que la ingesta vaya bien: significa que hoy no se ha podido mirar entera.'
      }
    >
      {datos.estado !== 'ok' ? (
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
          {datos.estado === 'sin_configurar'
            ? 'Falta ASEGURA_OPERADOR_SECRET en este proyecto: sin él no se puede preguntar por la ingesta.'
            : textoMotivo(datos.motivo)}
        </p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6 }}>
          {(perdidas.length > 0 ? perdidas : senales).map((s, i) => (
            <li key={`${s.clave}-${s.tipo}-${i}`} style={{ fontSize: 13, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
              <strong>{s.titulo}</strong>
              <span style={{ color: 'var(--muted)' }}> · {s.detalle}</span>
            </li>
          ))}
        </ul>
      )}
      <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--muted)' }}>
        El detalle —qué ficheros, de qué compañía y qué pólizas pedir— está en la sección «Ingesta».
      </p>
    </Bloque>
  )
}

// ── El detalle ──────────────────────────────────────────────────────────────

export default function PanelIngesta({ datos }: { datos: VistaIngesta | null }) {
  if (datos === null) {
    return (
      <Bloque primero titulo="Ingesta de CIMA" Icono={Antenna} accion={<BadgeEstado datos={datos} />}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>Preguntando a central-asegura…</p>
      </Bloque>
    )
  }

  if (datos.estado !== 'ok') {
    return (
      <Bloque
        primero
        destacado
        tono="aviso"
        Icono={Antenna}
        titulo="No se ha podido comprobar la ingesta de CIMA"
        accion={<BadgeEstado datos={datos} />}
        sub="No significa que los datos de las compañías estén entrando: significa que hoy no se ha podido mirar."
      >
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
          {datos.estado === 'sin_configurar'
            ? 'Falta ASEGURA_OPERADOR_SECRET en este proyecto: sin él no se puede preguntar por la ingesta.'
            : textoMotivo(datos.motivo)}
        </p>
      </Bloque>
    )
  }

  const s = datos.salud
  return (
    <>
      <Estado salud={s} datos={datos} />
      <Cuarentena salud={s} />
      <Huerfanas salud={s} truncadas={datos.huerfanasTruncadas} sinAmbito={datos.huerfanasSinAmbito} />
      <Rechazos salud={s} />
      <Companias salud={s} />
    </>
  )
}

function Estado({ salud, datos }: { salud: SaludIngesta; datos: VistaIngesta }) {
  const senales = senalesIngesta(salud)
  return (
    <Bloque
      primero
      titulo={tituloIngesta(datos)}
      Icono={Antenna}
      accion={<BadgeEstado datos={datos} />}
      sub="Lo que las compañías mandan por CIMA y no ha llegado a la cartera. Lo mide el mismo lector que el aviso diario de Telegram, así que pantalla y aviso no pueden discrepar."
    >
      {senales.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          Se ha comprobado todo: nada atascado, ninguna póliza huérfana, ningún envío rechazado y
          ninguna compañía callada.
        </p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 8 }}>
          {senales.map((x, i) => (
            <li key={`${x.clave}-${x.tipo}-${i}`} style={{ fontSize: 13, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
              <strong style={{ color: x.tipo === 'perdida' ? 'var(--negative)' : 'var(--text)' }}>
                {x.titulo}
              </strong>
              {x.tipo === 'hueco' && (
                <>{' '}<Badge tono="aviso">Sin comprobar</Badge></>
              )}
              <span style={{ color: 'var(--muted)' }}> · {x.detalle}</span>
            </li>
          ))}
        </ul>
      )}
      {salud.primaPerdida !== null && salud.primaPerdida > 0 && (
        <p style={{ margin: '10px 0 0', fontSize: 13 }}>
          💶 Prima en los recibos que no se han podido guardar:{' '}
          <strong style={{ color: 'var(--negative)' }}>{eur(salud.primaPerdida)}</strong>
        </p>
      )}
    </Bloque>
  )
}

function Cuarentena({ salud }: { salud: SaludIngesta }) {
  return (
    <Bloque
      titulo="Ficheros sin procesar"
      Icono={Antenna}
      sub="Repartidos por CLAVE DE MEDIADOR y no solo por compañía: Occident manda por tres claves distintas y el atasco puede estar en una sola. «Clave no legible» = el nombre del fichero no la trae, que no es lo mismo que no tenerla."
      accion={
        <Badge tono={salud.recientes > 0 ? 'negativo' : 'neutral'}>
          {salud.total} en total · {salud.recientes} recientes
        </Badge>
      }
    >
      {salud.porClave.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          Se ha mirado y no hay ningún fichero atascado.
        </p>
      ) : (
        <TablaScroll>
          <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 360 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={celdaCab}>Compañía</th>
                <th style={celdaCab}>Clave de mediador</th>
                <th style={{ ...celdaCab, textAlign: 'right' }}>Ficheros</th>
              </tr>
            </thead>
            <tbody>
              {salud.porClave.map(f => (
                <tr key={`${f.entidad}|${f.clave ?? ''}`}>
                  <td style={celda}>{f.entidad}</td>
                  <td style={celda}>
                    {f.clave ?? <Pendiente texto="Clave no legible" definitivo donde="el nombre del fichero EIAC" />}
                  </td>
                  <td style={{ ...celda, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{f.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaScroll>
      )}
    </Bloque>
  )
}

function Huerfanas({ salud, truncadas, sinAmbito }: {
  salud: SaludIngesta
  truncadas: boolean
  sinAmbito: number | null
}) {
  const r = salud.huerfanasReparto
  return (
    <Bloque
      titulo="Pólizas que CIMA nombra y no tenemos"
      Icono={Antenna}
      tono={salud.huerfanas !== null && salud.huerfanas > 0 ? 'aviso' : 'neutral'}
      sub="Recibos y siniestros que llegaron sin una póliza donde colgarse. Las que NO están en la cartera se le piden a la compañía (el número de póliza es lo que va en el correo); las que SÍ están llegaron antes que su póliza y se arreglan reprocesando el fichero en la ingesta de origen — eso no se puede hacer desde aquí, porque central no guarda el XML."
      accion={
        salud.huerfanas === null
          ? <Pendiente texto="Sin contar" donde="el puerto de asegura" />
          : <Badge tono={salud.huerfanas > 0 ? 'aviso' : 'neutral'}>{salud.huerfanas} pólizas</Badge>
      }
    >
      {r === null ? (
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
          <Pendiente texto="Lista no disponible" donde="el puerto /api/operador/huerfanas de asegura" />{' '}
          {salud.huerfanas !== null && salud.huerfanas > 0
            ? 'Se sabe cuántas son, no cuáles: sin la lista no se le puede pedir nada a la compañía.'
            : 'No se ha podido listar. No significa que no haya ninguna.'}
        </p>
      ) : r.pedir.length + r.reprocesar.length + r.revisarFusion.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          Se ha mirado y no hay ninguna póliza huérfana.
        </p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 14 }}>
          <GruposHuerfanas
            titulo="Hay que pedírselas a la compañía"
            nota="No están en la cartera: CIMA solo manda la póliza en altas y modificaciones, así que falta la carga inicial de esa clave de mediador."
            grupos={r.pedir}
          />
          <GruposHuerfanas
            titulo="Se arreglan reprocesando"
            nota="Ya están en la cartera: el recibo o el siniestro llegó antes que ellas. El fichero vive en la ingesta de origen, no aquí."
            grupos={r.reprocesar}
          />
          <GruposHuerfanas
            titulo="Revisar la fusión antes de pedirlas"
            nota="Solo constan como fila fusionada (lápida): pedirlas sería pedir dos veces lo que ya está."
            grupos={r.revisarFusion}
          />
        </div>
      )}

      {truncadas && (
        <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--warning)' }}>
          ⚠️ El listado venía recortado: los recuentos por clave son un mínimo, no el total.
        </p>
      )}
      {sinAmbito === null ? (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)' }}>
          No consta cuántos eventos de huérfana se han quedado sin atribuir a la correduría.
        </p>
      ) : sinAmbito > 0 ? (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--warning)' }}>
          ⚠️ Hay {sinAmbito} evento(s) de huérfana que no se han podido atribuir a la correduría: no
          salen en esta lista.
        </p>
      ) : null}
    </Bloque>
  )
}

/** Cuántos números de póliza se pintan de golpe (regla de rendimiento del repo). */
const POR_PAGINA = 50

function GruposHuerfanas({ titulo, nota, grupos }: {
  titulo: string
  nota: string
  grupos: GrupoHuerfanas[]
}) {
  if (grupos.length === 0) return null
  const n = grupos.reduce((t, g) => t + g.n, 0)
  return (
    <div>
      <h3 style={{ margin: '0 0 2px', fontSize: 13, fontWeight: 700 }}>{titulo} · {n}</h3>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--muted)', maxWidth: '72ch' }}>{nota}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 10 }}>
        {grupos.map(g => <Grupo key={`${g.entidad}|${g.clave ?? ''}`} g={g} />)}
      </div>
    </div>
  )
}

function Grupo({ g }: { g: GrupoHuerfanas }) {
  const [pagina, setPagina] = useState(1)
  const [copiado, setCopiado] = useState(false)
  const visibles = g.polizas.slice(0, pagina * POR_PAGINA)

  // Un portapapeles bloqueado (o inexistente: `navigator.clipboard` no existe
  // fuera de HTTPS) NO puede quedarse en «copiado» — el usuario se iría a pegar
  // una lista que no tiene. Los números siguen a la vista para copiarlos a mano.
  const copiar = () => {
    const texto = g.polizas.join('\n')
    Promise.resolve(navigator.clipboard?.writeText(texto) ?? Promise.reject(new Error('sin portapapeles')))
      .then(() => setCopiado(true), () => setCopiado(false))
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline' }}>
        <strong style={{ fontSize: 13 }}>
          {g.entidadNombre ? `${g.entidadNombre} (${g.entidad})` : g.entidad}
        </strong>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>
          {g.clave ? `clave ${g.clave}` : 'clave no legible en el nombre'} · {g.n} póliza(s) ·{' '}
          {g.recibos} recibo(s) · {g.siniestros} siniestro(s) ·{' '}
          {g.prima === null
            ? 'ningún recibo traía prima'
            : `prima ${eur(g.prima)}`}
        </span>
        <button
          type="button"
          onClick={copiar}
          style={{
            marginLeft: 'auto', minHeight: 44, padding: '0 12px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
            font: 'inherit', fontSize: 13, cursor: 'pointer',
          }}
        >
          {copiado ? 'Copiadas ✓' : 'Copiar los números'}
        </button>
      </div>
      <ul
        style={{
          margin: '8px 0 0', paddingLeft: 18, display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)', gap: 2,
        }}
      >
        {visibles.map(p => (
          <li key={p} style={{ fontSize: 13, overflowWrap: 'anywhere', fontVariantNumeric: 'tabular-nums' }}>{p}</li>
        ))}
      </ul>
      {visibles.length < g.polizas.length && (
        <button
          type="button"
          onClick={() => setPagina(p => p + 1)}
          style={{
            marginTop: 8, minHeight: 44, padding: '0 12px', borderRadius: 8,
            border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)',
            font: 'inherit', fontSize: 13, cursor: 'pointer',
          }}
        >
          Ver más ({g.polizas.length - visibles.length} restantes)
        </button>
      )}
    </div>
  )
}

function Rechazos({ salud }: { salud: SaludIngesta }) {
  return (
    <Bloque
      titulo="Envíos que nos mandan y rechazamos"
      Icono={Antenna}
      sub="La misma pérdida por otra puerta: un dato que llega y se tira se pierde igual que uno que no llega. Caso fundacional (04/09/2026): Codeoscopic mandando un webhook cada 30 minutos, autenticado, y tirándolo entero por una diferencia de forma."
      accion={
        salud.rechazos === null
          ? <Pendiente texto="Sin comprobar" donde="el puerto de asegura" />
          : <Badge tono={salud.rechazos.length > 0 ? 'aviso' : 'neutral'}>{salud.rechazos.length}</Badge>
      }
    >
      {salud.rechazos === null ? (
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
          Esta lectura no ha podido mirar la puerta de los rechazos. No significa que no haya
          ninguno.
        </p>
      ) : salud.rechazos.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          Se ha mirado y no hay ningún envío rechazado.
        </p>
      ) : (
        <TablaScroll>
          <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 420 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={celdaCab}>Evento</th>
                <th style={celdaCab}>Origen</th>
                <th style={{ ...celdaCab, textAlign: 'right' }}>Cuántos</th>
                <th style={{ ...celdaCab, textAlign: 'right' }}>Último</th>
              </tr>
            </thead>
            <tbody>
              {salud.rechazos.map(r => (
                <tr key={`${r.evento}|${r.origen ?? ''}`}>
                  <td style={{ ...celda, overflowWrap: 'anywhere' }}>{r.evento}</td>
                  <td style={celda}>
                    {r.origen ?? <Pendiente texto="No informado" definitivo />}
                  </td>
                  <td style={{ ...celda, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.n}</td>
                  <td style={{ ...celda, textAlign: 'right' }}>
                    {r.horasDesdeUltimo === null
                      ? <Pendiente texto="Sin fecha" />
                      : `hace ${Math.round(r.horasDesdeUltimo)} h`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TablaScroll>
      )}
    </Bloque>
  )
}

const VEREDICTO: Record<string, { texto: string; tono: 'neutral' | 'aviso' | 'negativo' }> = {
  ok: { texto: 'Manda a su ritmo', tono: 'neutral' },
  silencio: { texto: 'Ha dejado de mandar', tono: 'negativo' },
  sin_base: { texto: 'Sin histórico para juzgar', tono: 'aviso' },
  nunca: { texto: 'No ha mandado nunca', tono: 'aviso' },
  sin_datos: { texto: 'Sin comprobar', tono: 'aviso' },
}

function Companias({ salud }: { salud: SaludIngesta }) {
  return (
    <Bloque
      titulo="Quién manda y quién ha dejado de mandar"
      Icono={Antenna}
      sub="La avería que no deja rastro: sin fichero no hay cuarentena, ni huérfana, ni rechazo. El baremo es el ritmo de CADA compañía, no un número fijo — Mapfre estuvo 74 días callada cuando su mayor hueco eran dos."
      accion={
        salud.silencio === null
          ? <Pendiente texto="Sin comprobar" donde="el puerto de asegura" />
          : <Badge tono="neutral">{salud.silencio.length} compañías</Badge>
      }
    >
      {salud.silencio === null ? (
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>
          No se ha podido comprobar si alguna compañía ha dejado de mandar. Eso NO es «todas mandan».
        </p>
      ) : salud.silencio.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: 'var(--muted)' }}>
          El puerto no informa de ninguna compañía en esta lectura.
        </p>
      ) : (
        <TablaScroll>
          <table style={{ borderCollapse: 'collapse', fontSize: 13, minWidth: 520 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--muted)' }}>
                <th style={celdaCab}>Compañía</th>
                <th style={celdaCab}>Estado</th>
                <th style={{ ...celdaCab, textAlign: 'right' }}>Días callada</th>
                <th style={{ ...celdaCab, textAlign: 'right' }}>Su mayor hueco</th>
                <th style={{ ...celdaCab, textAlign: 'right' }}>Pólizas vivas</th>
                <th style={{ ...celdaCab, textAlign: 'right' }}>Renov. perdidas</th>
              </tr>
            </thead>
            <tbody>
              {salud.silencio.map(e => {
                const v = VEREDICTO[e.veredicto] ?? { texto: e.veredicto, tono: 'aviso' as const }
                return (
                  <tr key={e.entidad} title={e.motivos.join(' · ') || undefined}>
                    <td style={celda}>{e.entidad}</td>
                    <td style={celda}><Badge tono={v.tono}>{v.texto}</Badge></td>
                    <td style={{ ...celda, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {e.diasSinFichero === null ? <Pendiente texto="Ninguno" definitivo /> : e.diasSinFichero}
                    </td>
                    <td style={{ ...celda, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {e.huecoMaximo === null ? <Pendiente texto="Sin base" /> : e.huecoMaximo}
                    </td>
                    <td style={{ ...celda, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {e.vivas === null ? <Pendiente texto="Sin contar" /> : e.vivas}
                    </td>
                    <td style={{ ...celda, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {e.vencidasEnSilencio === null ? <Pendiente texto="Sin comprobar" /> : e.vencidasEnSilencio}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </TablaScroll>
      )}
    </Bloque>
  )
}

const celdaCab: React.CSSProperties = {
  padding: '6px 10px 6px 0', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap',
  borderBottom: '1px solid var(--border)',
}

const celda: React.CSSProperties = {
  padding: '8px 10px 8px 0', borderBottom: '1px solid var(--border)', verticalAlign: 'top',
}
