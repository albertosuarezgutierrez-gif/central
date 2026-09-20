'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { FileKey } from 'lucide-react'
import { Badge, btnStyle } from '@/components/ui'
import Bloque from './Bloque'
import {
  apartadosIncompletos,
  contadorExport,
  identidadValida,
  interpretarExport,
  nombreFicheroExport,
  textoMotivoExport,
  type PaqueteExport,
  type RespuestaExport,
} from '@/lib/export-rgpd-asegura'

/**
 * El paquete del **derecho de acceso (art. 15 RGPD)** y de **portabilidad
 * (art. 20)** de una persona.
 *
 * 🚨 Este bloque existe porque el puerto estaba construido y NO LO LLAMABA
 * NADIE: `apps/asegura` sirve el export desde que se escribió, pero en
 * plataforma no había ni lib, ni ruta, ni botón. O sea, el derecho de acceso
 * **no lo podía ejercer nadie**, porque Alberto no tenía dónde atenderlo — un
 * plazo legal de un mes (art. 12.3) sin ninguna pantalla detrás.
 *
 * ─── Lo que este bloque NO es ───────────────────────────────────────────────
 * 1. **No es autoservicio del cliente.** El portal no tiene ni puede tener una
 *    ruta de export: su identidad es un código de un solo uso a un correo, sin
 *    segundo factor, así que un export en autoservicio convertiría el secuestro
 *    de una sesión en una fuga completa. Lo genera Alberto, comprueba quién lo
 *    pide y lo entrega él.
 * 2. **No es una cola.** No hay nada que listar: la petición llega por correo o
 *    por teléfono, no por una tabla. Por eso el bloque se pinta SIEMPRE (es una
 *    herramienta) y no reporta contador hasta que se genera un paquete.
 * 3. **Un paquete INCOMPLETO no se entrega.** Si una categoría no se pudo
 *    consultar, el documento dice «no consta» sobre algo que sí puede constar.
 *    `completo: false` se pinta en rojo y el botón de descarga lo avisa: no se
 *    esconde la descarga —a veces hay que mandar lo que hay y completarlo
 *    después—, pero no puede salir sin que se sepa.
 *
 * Contador (tres desenlaces, ver `contadorExport`): `undefined` mientras no se
 * ha pedido nada · `null` si se pidió y no hay paquete · el número de apartados
 * que no se pudieron consultar. Un `0` solo aparece sobre un paquete que SÍ se
 * generó entero, que es una afirmación comprobada.
 */
type Mensaje = { tono: 'ok' | 'error'; texto: string }

/** El uuid puede venir pegado dentro de una frase o de una URL. */
const UUID_SUELTO = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
function identidadDe(texto: string): string {
  const t = texto.trim()
  if (identidadValida(t)) return t
  return UUID_SUELTO.exec(t)?.[0] ?? t
}

function porqueNoSeLee(r: RespuestaExport): string {
  if (r.estado === 'sin_configurar') return 'el puerto con asegura no está conectado en este proyecto'
  if (r.estado === 'no_encontrado') return 'asegura no tiene ninguna identidad con ese identificador'
  return r.estado === 'error' ? textoMotivoExport(r.motivo) : ''
}

export default function ExportRgpd({ onContador }: {
  /**
   * Apartados que el último paquete no pudo consultar. `null` = se pidió y no
   * hay paquete; nunca 0 en ese caso. Ver `contadorExport`.
   */
  onContador?: (n: number | null) => void
}) {
  const [texto, setTexto] = useState('')
  const [ocupado, setOcupado] = useState(false)
  // `null` = todavía no se ha pedido nada. Después guarda SIEMPRE la última
  // lectura: si una falla, se conserva lo último bueno y se avisa del fallo en
  // vez de dejar la pantalla como si nunca se hubiera generado nada.
  const [lectura, setLectura] = useState<RespuestaExport | null>(null)
  const [paquete, setPaquete] = useState<PaqueteExport | null>(null)
  const [generadoPor, setGeneradoPor] = useState<string | null>(null)
  const [mensaje, setMensaje] = useState<Mensaje | null>(null)

  // La lambda del padre cambia de identidad en cada render suyo: en una
  // dependencia relanzaría el efecto en bucle.
  const avisar = useRef(onContador)
  useEffect(() => { avisar.current = onContador }, [onContador])

  const generar = useCallback(async () => {
    const identidad = identidadDe(texto)
    if (!identidadValida(identidad)) {
      setMensaje({
        tono: 'error',
        texto: 'Eso no es un identificador de acceso al portal. Pega el identificador de la persona (el uuid de su acceso), no su nombre ni su DNI.',
      })
      return
    }
    setOcupado(true)
    setMensaje(null)
    let r: RespuestaExport
    let quien: string | null = null
    try {
      const res = await fetch('/api/correduria/export-rgpd', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identidad }),
      })
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null
      r = interpretarExport(res.status, json)
      quien = typeof json?.generadoPor === 'string' ? json.generadoPor : null
    } catch {
      r = { estado: 'error', motivo: 'red' }
    }

    setLectura(r)
    if (r.estado === 'ok') {
      setPaquete(r.paquete)
      setGeneradoPor(quien)
      const huecos = apartadosIncompletos(r.paquete).length
      setMensaje(
        huecos === 0
          ? { tono: 'ok', texto: 'Paquete generado y completo.' }
          : {
              tono: 'error',
              texto: `Paquete generado, pero INCOMPLETO: ${huecos} apartado${huecos === 1 ? '' : 's'} no se ha podido consultar.`,
            },
      )
    } else {
      // El paquete anterior NO se borra: si había uno bueno en pantalla, sigue
      // descargable. Lo que cambia es que se dice que este intento falló.
      setMensaje({ tono: 'error', texto: `No se ha generado: ${porqueNoSeLee(r)}.` })
    }
    avisar.current?.(contadorExport(r))
    setOcupado(false)
  }, [texto])

  function descargar() {
    if (!paquete) return
    const blob = new Blob([JSON.stringify(paquete, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nombreFicheroExport(identidadDe(texto), paquete.generadoEn)
    a.click()
    URL.revokeObjectURL(url)
  }

  const huecos = paquete ? apartadosIncompletos(paquete) : []

  return (
    <Bloque
      Icono={FileKey}
      titulo="Derecho de acceso y portabilidad (RGPD)"
      accion={
        paquete
          ? huecos.length > 0
            ? <Badge tono="negativo">Último paquete: incompleto</Badge>
            : <Badge tono="positivo">Último paquete: completo</Badge>
          : undefined
      }
      sub={
        <>
          Cuando alguien pide «todos los datos que tenéis de mí», hay <strong>un mes para
          contestar</strong> (art. 12.3 RGPD). El paquete se genera aquí, se comprueba quién lo
          pide y <strong>lo entregas tú</strong>: el portal del cliente no lo sirve a propósito —
          se entra con un código a un correo, sin segundo factor.
        </>
      }
    >
      <div style={{ display: 'grid', gap: 8, maxWidth: '52ch' }}>
        <label style={{ fontSize: 12, fontWeight: 600 }}>
          Identificador de acceso al portal de la persona
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !ocupado) generar() }}
            placeholder="00000000-0000-0000-0000-000000000000"
            inputMode="text"
            autoComplete="off"
            spellCheck={false}
            style={{
              display: 'block', width: '100%', boxSizing: 'border-box',
              marginTop: 4, minHeight: 44, fontSize: 14,
            }}
          />
        </label>
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: 0 }}>
          Es el identificador de su ACCESO al portal, no el de su ficha de cliente: una misma
          persona puede tener varias fichas enlazadas y el paquete las recorre todas. Si no lo
          tienes a mano, sale de su solicitud en asegura. Puedes pegar el texto entero: se busca
          el identificador dentro.
        </p>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            style={{ ...btnStyle('primario'), opacity: ocupado || texto.trim() === '' ? 0.5 : 1 }}
            disabled={ocupado || texto.trim() === ''}
            onClick={generar}
          >
            {ocupado ? 'Generando…' : 'Generar el paquete'}
          </button>
          {paquete && (
            <button type="button" style={btnStyle('secundario')} onClick={descargar}>
              Descargar JSON{huecos.length > 0 ? ' (incompleto)' : ''}
            </button>
          )}
        </div>
      </div>

      {mensaje && (
        <p style={{
          fontSize: 13, fontWeight: 600, margin: '10px 0 0',
          color: mensaje.tono === 'ok' ? 'var(--positive)' : 'var(--negative)',
        }}>{mensaje.texto}</p>
      )}

      {lectura !== null && lectura.estado !== 'ok' && (
        // 🚨 Nunca silencio: un fallo de generación y «esta persona no tiene
        // datos» son la misma imagen, y una de las dos deja un plazo legal
        // corriendo sobre una respuesta que no se ha dado.
        <p style={{ fontSize: 12, color: 'var(--muted)', margin: '6px 0 0', maxWidth: '72ch' }}>
          <strong>Esto NO significa que no haya datos de esa persona.</strong> Si sigue así,
          míralo en asegura: el plazo del art. 12.3 corre aunque esta pantalla no pueda generar
          el paquete.
        </p>
      )}

      {paquete && (
        <div style={{ marginTop: 12 }}>
          {huecos.length > 0 && (
            <p style={{
              fontSize: 13, margin: '0 0 10px', padding: 10, borderRadius: 10,
              background: 'var(--negative-bg)', color: 'var(--negative)',
            }}>
              <strong>No lo entregues así sin decirlo.</strong> {huecos.length} apartado
              {huecos.length === 1 ? '' : 's'} no se ha{huecos.length === 1 ? '' : 'n'} podido
              consultar ({huecos.map((a) => a.titulo).join(', ')}), así que el documento diría
              «no consta» sobre datos que sí pueden constar. Vuelve a generarlo en un rato.
            </p>
          )}

          <p style={{ fontSize: 12, color: 'var(--muted)', margin: '0 0 8px' }}>
            Generado el {new Date(paquete.generadoEn).toLocaleString('es-ES')}
            {generadoPor ? ` por ${generadoPor}` : ''} · textos legales {paquete.versionTextosLegales}
          </p>

          <details>
            <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              Qué lleva el paquete ({paquete.apartados.length} apartados)
            </summary>
            {/* Montaje perezoso: el detalle solo se construye al abrir. */}
            <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0 }}>
              {paquete.apartados.map((a) => (
                <li key={a.categoria} style={{ borderTop: '1px solid var(--border)', padding: '8px 0' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: 13 }}>{a.titulo}</strong>
                    {a.incluida
                      ? <Badge tono="neutral">{a.filas?.length ?? 0} registro{(a.filas?.length ?? 0) === 1 ? '' : 's'}</Badge>
                      : huecos.includes(a)
                        ? <Badge tono="negativo">No se ha podido consultar</Badge>
                        : <Badge tono="neutral">Sin datos</Badge>}
                    {a.portable && <Badge tono="info">Portable (art. 20)</Badge>}
                  </div>
                  {!a.incluida && a.motivo && (
                    <p style={{ fontSize: 12, color: 'var(--muted)', margin: '4px 0 0' }}>{a.motivo}</p>
                  )}
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </Bloque>
  )
}
