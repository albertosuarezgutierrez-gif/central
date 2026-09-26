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
 */
import { ETIQUETA_TIPO_SINIESTRO, type TipoSiniestro } from './tipo-siniestro.ts'
import { escaparHtml } from './sugerencia.ts'

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
  const lineas = [
    `${d.hayHeridos === true ? '🚑 CON HERIDOS · ' : ''}📋 Parte nuevo en el portal: ${quien}`,
    `${tipo} · ${fecha} · ${poliza}`,
    `Heridos: ${triestado(d.hayHeridos)} · Terceros: ${triestado(d.hayTerceros)}`,
    `Parte ${d.parteId.slice(0, 8)} — míralo en /correduria`,
  ]
  return lineas.join('\n')
}
