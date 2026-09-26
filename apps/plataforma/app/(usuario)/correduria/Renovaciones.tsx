'use client'
import { useState } from 'react'
import Link from 'next/link'
import { descripcionDias, enCooldownRenovacion, textoAvisoRenovacionWhatsapp, textoPlazoOposicion, DIAS_PREAVISO_TOMADOR, type Retarificabilidad } from '@central/module-seguros'
import { eur } from '@/lib/dinero'
import { TablaScroll, Badge, BtnLink, btnStyle, type Tono } from '@/components/ui'
import { esAccionable, textoListaTruncada, textoVencidasAntiguas } from './secciones'
import AccionesContacto from './AccionesContacto'
import { urlRetarificar } from '@/lib/ficha-asegura'
import { rotuloRetarificar } from './rotulo-retarificar'
import { ordenarRenovaciones, resumenSinRecibir, textoCompaniaSinRecibir } from './renovacion-sin-recibir'

const POR_PAGINA = 50

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
 *
 * ─── Y la ventana EMPIEZA EN EL PASADO (20/09/2026) ──────────────────────────
 * `URGENCIAS.vencida` existía desde el primer día y NO SE PODÍA PINTAR NUNCA:
 * el puerto de asegura filtraba `fechaVencimiento >= hoy`, así que una póliza
 * que venció ayer sin gestionar desaparecía de esta tabla, del contador de
 * «Hoy» y del aviso de Telegram. Medido ese día: 9 pólizas de Mapfre vencidas
 * hace 41-107 días, 4.377,51 € de prima, invisibles en la única pantalla que
 * Alberto abre. Un badge que no puede renderizarse es indistinguible de uno que
 * funciona — es el mismo fallo que la regla del cepo verde persigue.
 *
 * Consecuencias en este fichero: los días pueden ser NEGATIVOS (se dicen «hace
 * N días», nunca «en -N días»), la fila vencida se separa del resto con su
 * propio fondo, y el pie declara la ventana real y lo que queda FUERA de ella.
 */

import type { Contacto } from '@/lib/correduria-puerto'
import type { MotivoError } from './estado-puerto'
import { MOTIVOS } from './estado-puerto'
import { describirCausaAsegura } from '@/lib/correduria-puerto'

// El estado se lee por la FORMA de la píldora, no por un emoji: los círculos de
// colores se pintan distinto en cada sistema operativo y 🟠 y 🟡 son
// indistinguibles a 12px, que es justo donde estaba la diferencia entre «aún
// puedes moverla» y «ya se prorroga sola».
const URGENCIAS: Record<string, { label: string; tono: Tono }> = {
  // No es «vencida»: figura vigente con la fecha pasada porque la compañía no
  // ha mandado la renovación (ver `renovacion-sin-recibir.ts`).
  vencida: { label: 'Renovación sin recibir', tono: 'aviso' },
  prorroga_inevitable: { label: 'Se prorroga (fuera de plazo)', tono: 'negativo' },
  ultima_llamada: { label: 'Última llamada', tono: 'aviso' },
  a_tiempo: { label: 'A tiempo', tono: 'neutral' },
}

const TIPOS: Record<string, string> = {
  auto: 'Auto', moto: 'Moto', hogar: 'Hogar', vida: 'Vida', salud: 'Salud',
  decesos: 'Decesos', responsabilidad_civil: 'R. Civil', comercio: 'Comercio',
  comunidad: 'Comunidad', accidentes: 'Accidentes',
}

/** Minúsculas para que case dentro de una frase («tu seguro de auto vence…»):
 *  `TIPOS` está pensado para una celda de tabla («Auto»), no para prosa. */
function ramoEnFrase(tipo: string): string {
  return (TIPOS[tipo] ?? tipo.replace(/_/g, ' ')).toLowerCase()
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
  /** `null` = la versión desplegada de asegura todavía no manda el veredicto:
   *  entonces no se ofrece el botón en vez de suponer que sí se puede. */
  retarificacion: Retarificabilidad | null
  /** `null` = asegura no manda el bloque de contacto (versión anterior o
   *  consulta caída). NO es «no hay forma de llamarle»: por eso no se pinta
   *  nada en vez de un icono apagado o un «sin teléfono». */
  contacto: Contacto | null
  /** `YYYY-MM-DD` del último fichero de CIMA de su compañía; `null` = no se sabe. */
  ultimoFicheroCompania?: string | null
  /** ISO `yyyy-mm-dd` de la última vez que se abrió el WhatsApp de renovación
   *  de ESTA póliza, o `null` si nunca se registró uno (o asegura todavía no
   *  manda el campo — los dos casos se tratan igual: sin badge, sin cooldown). */
  ultimoContactoEn: string | null
}

export type RespVencimientos =
  | { estado: 'sin_configurar' }
  | { estado: 'error'; motivo?: MotivoError; causa?: string }
  | {
      estado: 'ok'
      dias: number
      polizas: Vencimiento[]
      /** Cuántos días hacia ATRÁS mira la ventana. `undefined` = la versión
       *  desplegada de asegura no lo dice todavía; entonces no se afirma cuál
       *  es (se dice el horizonte hacia delante y nada más). */
      diasAtras?: number
      /**
       * Vigentes con vencimiento anterior a esa ventana (más de una anualidad):
       * dato a depurar, no llamadas de hoy. TRES estados y ninguno se colapsa:
       *   `undefined` = la versión desplegada de asegura no lo informa.
       *   `null`      = se intentó contar y no se pudo.
       *   número      = las que hay (0 incluido, y ahí 0 SÍ significa cero).
       */
      vencidasAntiguas?: number | null
      /**
       * La criba de asegura tocó su techo: hay MÁS pólizas que renovar en la
       * ventana de las que trae esta lista. TRES estados, igual que el de
       * arriba y por el mismo motivo:
       *   `undefined`/`null` = asegura no lo informa → **no se puede afirmar
       *                        que la lista esté completa**.
       *   `false`            = se comprobó: están todas.
       *   `true`             = falta lista, y se dice.
       */
      truncado?: boolean | null
    }

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
 * Lo que queda FUERA de la ventana por el lado del pasado: vigentes con un
 * vencimiento anterior a una anualidad (medido 20/09/2026: 8 filas de 2013-2019
 * con prima 0). No son trabajo de hoy —meterlas en la cola enterraría las 9
 * recuperables— pero tampoco se esconden.
 *
 * TRES estados y ninguno se colapsa, porque se arreglan en sitios distintos:
 *   undefined → la versión desplegada de asegura no manda el recuento.
 *   null      → se intentó contar y no se pudo. NUNCA se pinta como «ninguna».
 *   número    → las que hay; aquí un 0 SÍ es una afirmación comprobada.
 */
/**
 * El techo de la lista. Va ARRIBA, no al pie: si la lista viene recortada, el
 * total de «cartera en juego» y el recuento de vencidas que se leen justo
 * debajo salen más bajos que la realidad, y eso hay que saberlo ANTES de
 * mirarlos. Silencio cuando asegura confirma que no recortó.
 */
function AvisoTruncado({ truncado }: { truncado: boolean | null | undefined }) {
  const texto = textoListaTruncada(truncado, 'renovaciones')
  if (texto === null) return null
  return (
    <p
      style={{
        fontSize: 12,
        lineHeight: 1.5,
        margin: '0 0 10px',
        color: truncado === true ? 'var(--warning)' : 'var(--muted)',
      }}
    >
      {truncado === true ? '⚠️ ' : ''}{texto}
    </p>
  )
}

function PieAntiguas({ n }: { n: number | null | undefined }) {
  return (
    <p style={{ fontSize: 11, color: 'var(--muted)', margin: '4px 0 0' }}>
      {textoVencidasAntiguas(n)}
    </p>
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
  // Hook antes de cualquier `return`: los tres estados de carga/error de más
  // abajo son early returns, y React exige que los hooks se llamen siempre en
  // el mismo orden.
  const [ocultarContactadas, setOcultarContactadas] = useState(true)
  // La ventana entera (90 días + una anualidad hacia atrás) puede traer cientos
  // de filas: se pintan de 50 en 50 (regla de rendimiento UI del repo).
  const [ver, setVer] = useState(POR_PAGINA)

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

  const polizasVentana = filtro === 'accionables'
    ? datos.polizas.filter(p => esAccionable(p.urgencia))
    : datos.polizas

  if (polizasVentana.length === 0) {
    return (
      <>
        {/* 🚨 Aquí es donde MÁS importa: «ninguna vence» sobre una lista
            recortada es la frase tranquilizadora que no se ha comprobado. */}
        <AvisoTruncado truncado={datos.truncado} />
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          {filtro === 'accionables'
            ? 'Ninguna renovación está vencida ni entra hoy en la ventana de preaviso (LCS art. 22).'
            : `Ninguna póliza vigente vence en los próximos ${datos.dias} días${
                datos.diasAtras ? `, ni ha vencido en los ${datos.diasAtras} anteriores` : ''
              }.`}
        </p>
        {/* 🚨 Es JUSTO aquí donde más importa declararlas: una lista vacía
            invita a leer «no hay nada», y puede haber 8 filas fuera de ventana. */}
        {filtro === 'todas' && <PieAntiguas n={datos.vencidasAntiguas} />}
      </>
    )
  }

  // «Ocultar contactadas» filtra sobre lo que YA se ve, nunca sobre el techo
  // de la petición: es una comodidad de pantalla, no una segunda ventana.
  const hoy = new Date()
  const polizas = ocultarContactadas
    ? polizasVentana.filter(p => !enCooldownRenovacion(
        p.ultimoContactoEn ? { creadoAt: new Date(`${p.ultimoContactoEn}T00:00:00Z`) } : null, hoy,
      ))
    : polizasVentana
  const ocultasPorContacto = polizasVentana.length - polizas.length

  const checkboxContactadas = (
    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>
      <input
        type="checkbox"
        checked={ocultarContactadas}
        onChange={(e) => setOcultarContactadas(e.target.checked)}
      />
      Ocultar contactadas por WhatsApp en los últimos 14 días
    </label>
  )

  if (polizas.length === 0) {
    return (
      <>
        <AvisoTruncado truncado={datos.truncado} />
        {checkboxContactadas}
        <p style={{ fontSize: 13, color: 'var(--muted)', margin: 0 }}>
          Las {polizasVentana.length} que vencen ya se contactaron por WhatsApp en los últimos 14 días —
          no es que no quede ninguna, es que el filtro de arriba las está ocultando.
        </p>
        {filtro === 'todas' && <PieAntiguas n={datos.vencidasAntiguas} />}
      </>
    )
  }

  // Lo que figura vigente con la fecha pasada NO está «en juego»: la compañía
  // no ha mandado la renovación y lo normal es que se haya prorrogado sola. Se
  // cuenta aparte y va al final (23/09/2026, 10 de Mapfre que salían en rojo).
  const sinRecibir = resumenSinRecibir(polizas)
  const enJuego = polizas.filter(p => p.dias >= 0)
  const conPrima = enJuego.filter(p => p.prima !== null)
  const total = conPrima.reduce((s, p) => s + (p.prima ?? 0), 0)
  const sinPrima = enJuego.length - conPrima.length
  const ordenadas = ordenarRenovaciones(polizas)

  return (
    <>
      <AvisoTruncado truncado={datos.truncado} />
      {checkboxContactadas}
      {ocultasPorContacto > 0 && (
        <p style={{ fontSize: 11, color: 'var(--muted)', margin: '-6px 0 10px' }}>
          {ocultasPorContacto === 1 ? '1 oculta' : `${ocultasPorContacto} ocultas`} por haberse contactado hace menos de 14 días.
        </p>
      )}
      <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 10px' }}>
        Cartera en juego: {eur(total)}{sinPrima > 0 && ` · ${sinPrima} sin prima informada`}
      </p>

      {sinRecibir && (
        <div
          style={{
            fontSize: 12, lineHeight: 1.5, color: 'var(--text)', background: 'var(--warning-bg)',
            border: '1px solid var(--warning)', borderRadius: 6, margin: '0 0 10px', padding: '8px 10px',
          }}
        >
          <strong>
            {sinRecibir.n === 1 ? '1 póliza con la renovación sin recibir' : `${sinRecibir.n} pólizas con la renovación sin recibir`}
            {sinRecibir.prima > 0 && ` · ${eur(sinRecibir.prima)}`}
            {sinRecibir.sinPrima > 0 && ` · ${sinRecibir.sinPrima} sin prima informada`}
          </strong>
          {' — '}figuran vigentes con la fecha pasada: la compañía no ha mandado por CIMA ni la anualidad
          nueva ni una anulación. Salvo que alguien la anulara, se prorrogan solas (LCS art. 22), así que
          lo normal es que sigan en vigor. Compruébalas en el portal de la compañía. Van al final de la lista.
          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
            {sinRecibir.companias.map(c => <li key={c.aseguradora}>{textoCompaniaSinRecibir(c)}</li>)}
          </ul>
        </div>
      )}

      <TablaScroll>
        {/* `tabla-polizas`: en móvil cada fila se apila como tarjeta con su
            rótulo (`data-label`), igual que las pólizas de la ficha del cliente. */}
        <table className="tabla-polizas" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 720 }}>
          <thead>
            <tr style={{ color: 'var(--muted)', textAlign: 'left' }}>
              <th style={{ padding: '6px 8px', fontWeight: 600 }}>Vence</th>
              <th style={{ padding: '6px 8px', fontWeight: 600 }}>Cliente</th>
              <th style={{ padding: '6px 8px', fontWeight: 600 }}>Ramo</th>
              <th style={{ padding: '6px 8px', fontWeight: 600 }}>Qué asegura</th>
              <th style={{ padding: '6px 8px', fontWeight: 600 }}>Compañía</th>
              <th style={{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Prima</th>
              <th style={{ padding: '6px 8px', fontWeight: 600 }}>Estado</th>
              <th style={{ padding: '6px 8px', fontWeight: 600 }} />
            </tr>
          </thead>
          <tbody>
            {ordenadas.slice(0, ver).map(p => {
              const u = URGENCIAS[p.urgencia] ?? URGENCIAS.a_tiempo
              // Una renovación sin recibir no puede parecer una que vence dentro
              // de 40 días: además del badge, la fila va sobre fondo de aviso.
              const vencida = p.dias < 0
              return (
                <tr
                  key={p.id}
                  style={{
                    borderTop: '1px solid var(--border)',
                    ...(vencida ? { background: 'var(--warning-bg)' } : {}),
                  }}
                >
                  <td data-label="Vence" style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                    {fmtFecha(p.fechaVencimiento)}
                    <div
                      style={{
                        fontSize: 11,
                        color: vencida ? 'var(--warning)' : 'var(--muted)',
                        fontWeight: vencida ? 600 : undefined,
                      }}
                    >
                      {/* `descripcionDias` es la que sabe del signo: sin ella
                          una vencida se anunciaba como «en -41 días». */}
                      {descripcionDias(p.dias)}
                    </div>
                    {/* Hasta qué día puede pedir la baja (LCS art. 22). Un cambio de compañía
                        tiene que llegar antes: Pablo Guzmán llegó con el plazo pasado (26/09/2026). */}
                    {textoPlazoOposicion(p.fechaVencimiento, p.dias) && (
                      <div style={{ fontSize: 11, color: p.dias > DIAS_PREAVISO_TOMADOR ? 'var(--muted)' : 'var(--negative)' }}>
                        {textoPlazoOposicion(p.fechaVencimiento, p.dias)}
                      </div>
                    )}
                  </td>
                  <td data-rol="cabeza" style={{ padding: '8px' }}>
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
                    {/* Llamar · WhatsApp · escribir sin salir de la lista: esta
                        tabla es la cola de trabajo comercial, y hasta ahora
                        había que abrir la ficha solo para copiar el teléfono.
                        El WhatsApp lleva el aviso de renovación YA ESCRITO
                        (compañía, ramo y fecha) y, al abrirse, registra el
                        contacto — es lo que alimenta el checkbox de arriba. */}
                    {p.contacto && (
                      <>
                        {' '}
                        <AccionesContacto
                          telefono={p.contacto.telefono}
                          email={p.contacto.email}
                          ilegible={p.contacto.telefonoIlegible && p.contacto.emailIlegible}
                          quien={p.cliente}
                          mensaje={textoAvisoRenovacionWhatsapp({
                            nombre: p.cliente,
                            ramoLegible: ramoEnFrase(p.tipo),
                            aseguradora: p.aseguradora,
                            fechaVencimiento: p.fechaVencimiento,
                          })}
                          onWhatsapp={() => {
                            if (!p.clienteId) return
                            fetch('/api/correduria/renovaciones/contacto', {
                              method: 'POST',
                              headers: { 'content-type': 'application/json' },
                              body: JSON.stringify({
                                clienteId: p.clienteId, polizaId: p.id,
                                mensaje: textoAvisoRenovacionWhatsapp({
                                  nombre: p.cliente, ramoLegible: ramoEnFrase(p.tipo),
                                  aseguradora: p.aseguradora, fechaVencimiento: p.fechaVencimiento,
                                }),
                              }),
                            }).catch(() => {})
                          }}
                        />
                      </>
                    )}
                    {p.ultimoContactoEn && (
                      <div style={{ marginTop: 2 }}>
                        <Badge tono="neutral">contactada {fmtFecha(p.ultimoContactoEn)}</Badge>
                      </div>
                    )}
                    {p.numeroPoliza && (
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>nº {p.numeroPoliza}</div>
                    )}
                  </td>
                  <td data-label="Ramo" style={{ padding: '8px', whiteSpace: 'nowrap' }}>{TIPOS[p.tipo] ?? p.tipo}</td>
                  <td data-label="Qué asegura" style={{ padding: '8px', minWidth: 150 }}><CeldaObjeto objeto={p.objeto} /></td>
                  <td data-label="Compañía" style={{ padding: '8px' }}>{p.aseguradora}</td>
                  <td data-label="Prima" style={{ padding: '8px', textAlign: 'right', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {p.prima === null
                      ? <span style={{ color: 'var(--muted)' }} title="La compañía no informa la prima">sin dato</span>
                      : eur(p.prima)}
                  </td>
                  <td data-label="Estado" style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                    <Badge tono={u.tono}>{u.label}</Badge>
                  </td>
                  <td data-rol="accion" style={{ padding: '8px', whiteSpace: 'nowrap' }}>
                    {/* El botón que Alberto pedía sin tener que entrar en la
                        ficha del cliente: retarificar gasta 0,50€ reales, así
                        que sigue habiendo pantalla de confirmación detrás —
                        aquí solo se ahorra el salto a la ficha. `null` = la
                        versión desplegada de asegura no manda el veredicto
                        todavía: no se ofrece un botón que podría prometer algo
                        que no se puede cumplir. */}
                    {p.retarificacion?.retarificable && (
                      <BtnLink
                        href={urlRetarificar(p.id)}
                        variante="secundario"
                        tam="sm"
                        nuevaPestana={p.retarificacion.ramo === 'hogar'}
                      >
                        {rotuloRetarificar(p.retarificacion)}
                      </BtnLink>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </TablaScroll>
      {ordenadas.length > ver && (
        <button
          type="button"
          onClick={() => setVer(v => v + POR_PAGINA)}
          style={{ ...btnStyle('secundario', 'sm'), minHeight: 44, marginTop: 10 }}
        >
          Ver {Math.min(POR_PAGINA, ordenadas.length - ver)} más ({ordenadas.length - ver} sin mostrar)
        </button>
      )}

      <p style={{ fontSize: 11, color: 'var(--muted)', margin: '8px 0 0' }}>
        El tomador puede oponerse a la prórroga hasta un mes antes del vencimiento (LCS art. 22): pasada esa
        fecha la póliza se renueva sola. Las pólizas sin fecha de vencimiento no salen aquí — no es que no
        venzan, es que la compañía no ha informado la fecha.
        {datos.diasAtras
          ? ` La ventana mira ${datos.dias} días hacia delante y ${datos.diasAtras} hacia atrás, para que una vencida sin gestionar no desaparezca.`
          : ' La versión desplegada de asegura no dice cuántos días hacia atrás mira la ventana.'}
      </p>

      {filtro === 'todas' && <PieAntiguas n={datos.vencidasAntiguas} />}
    </>
  )
}
