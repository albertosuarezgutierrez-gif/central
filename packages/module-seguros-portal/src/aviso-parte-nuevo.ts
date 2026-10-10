/**
 * El aviso por Telegram a Alberto en el MISMO momento en que un cliente da un
 * parte desde el portal.
 *
 * Hasta el 26/09/2026 lo único que avisaba de un parte nuevo era el resumen
 * diario de las 06:55 (`/api/cron/correduria-partes` de plataforma): un parte
 * dado a las 07:00 esperaba casi un día entero de los siete del art. 16 LCS.
 * Aquel cron se queda como red de seguridad (repite lo que nadie ha abierto);
 * esto es el aviso inmediato.
 *
 * Puro: la ruta lo compone y lo manda con `tgSend`. Lleva lo justo para
 * decidir si hay que llamar YA —tipo, fecha, heridos, terceros— y NO el relato
 * ni matrículas: eso está en `/correduria`, y un chat no es donde debe vivir.
 * Con heridos va delante, porque es lo que cambia la prioridad.
 *
 * Desde el 03/10/2026 (Alberto) también lleva a QUIÉN es la póliza (cliente
 * titular), quién lo da si no es el titular (un autorizado), compañía, número
 * de póliza, ramo y el ENLACE a la ficha en plataforma, para no tener que
 * buscarlo. Todo opcional: `null` = no lo sabemos y la línea lo calla; nunca se
 * rellena con otro dato. El aviso va SOLO a Alberto (chat interno).
 */
import { ETIQUETA_TIPO_SINIESTRO, type TipoSiniestro } from './tipo-siniestro.ts'
import { escaparHtml } from './sugerencia.ts'
import { etiquetaRamo } from './poliza-leida.ts'
import { datosClaveParte } from './parte-ramo.ts'

export type DatosAvisoParteNuevo = {
  parteId: string
  /** Nombre de la identidad del portal, si lo tenemos. */
  nombre: string | null
  tipoSiniestro: TipoSiniestro | null
  /** `AAAA-MM-DD`, tal como se guardó. */
  fechaHecho: string
  hayHeridos: boolean | null
  hayTerceros: boolean | null
  /** `true` si la póliza es una declarada por el cliente (no de nuestra cartera). */
  polizaDeclarada: boolean
  /** Sin póliza elegida («No sé cuál»). */
  sinPoliza: boolean
  /** El TITULAR de la póliza (la ficha), si se sabe. Distinto de `nombre` cuando lo da un autorizado. */
  cliente?: string | null
  /** `true` si quien lo da NO es el titular (autorizado o figura en la póliza). */
  loDaOtro?: boolean
  compania?: string | null
  numeroPoliza?: string | null
  /** Código de ramo (`hogar`, `auto`…); se pinta con su etiqueta. */
  ramo?: string | null
  /** URL absoluta a la ficha en plataforma (`/correduria/...`). `null` = no hay base configurada. */
  enlace?: string | null
  /**
   * `datos_ramo` del parte (03/10/2026). Del aviso salen 2-3 datos CLAVE
   * (`datosClaveParte`): respuestas sueltas y recuentos de listas, NUNCA
   * nombres ni teléfonos de terceros.
   */
  datosRamo?: unknown
}

function triestado(v: boolean | null): string {
  return v === null ? 'no lo sabe' : v ? 'sí' : 'no'
}

export function textoAvisoParteNuevo(d: DatosAvisoParteNuevo): string {
  const quien = d.nombre?.trim() ? escaparHtml(d.nombre.trim()) : 'Un cliente'
  const tipo = d.tipoSiniestro ? ETIQUETA_TIPO_SINIESTRO[d.tipoSiniestro] : 'sin tipo'
  const [a, m, dd] = d.fechaHecho.split('-')
  const fecha = a && m && dd ? `${dd}/${m}/${a}` : escaparHtml(d.fechaHecho)
  const poliza = d.sinPoliza ? 'no sabe qué póliza' : d.polizaDeclarada ? 'póliza de otra correduría' : 'póliza de cartera'
  const cliente = d.cliente?.trim() ? escaparHtml(d.cliente.trim()) : null
  // Quién es el cliente va en la cabecera; si lo da otro, se dice quién.
  const cabecera =
    cliente !== null && d.loDaOtro === true
      ? `${cliente} (lo da ${quien}, que no es el titular)`
      : cliente ?? quien
  const ramo = etiquetaRamo(d.ramo)
  const datosPoliza = [
    d.compania?.trim() ? escaparHtml(d.compania.trim()) : null,
    ramo ? escaparHtml(ramo) : null,
    d.numeroPoliza?.trim() ? `nº ${escaparHtml(d.numeroPoliza.trim())}` : null,
  ].filter((x): x is string => x !== null)
  const enlace =
    d.enlace && /^https:\/\//.test(d.enlace)
      ? `<a href="${escaparHtml(d.enlace).replace(/"/g, '&quot;')}">Abrir en /correduria</a>`
      : 'míralo en /correduria'
  const clave = datosClaveParte(d.datosRamo ?? null)
  const lineas = [
    `${d.hayHeridos === true ? '🚑 CON HERIDOS · ' : ''}📋 Parte nuevo en el portal: ${cabecera}`,
    ...(datosPoliza.length > 0 ? [datosPoliza.join(' · ')] : []),
    `${tipo} · ${fecha} · ${poliza}`,
    `Heridos: ${triestado(d.hayHeridos)} · Terceros: ${triestado(d.hayTerceros)}`,
    ...(clave.length > 0 ? [escaparHtml(clave.join(' · '))] : []),
    `Parte ${d.parteId.slice(0, 8)} — ${enlace}`,
  ]
  return lineas.join('\n')
}
