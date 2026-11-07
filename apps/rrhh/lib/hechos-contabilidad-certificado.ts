// Certificado anual de retenciones del EMPLEADO (portal /e). PURO.
// Cadena idéntica a la de contabilidad: nómina confirmada → `hechoDeNomina` (lo que se envía al puerto) → `retencionDeNomina` (lo que
// contabilidad lee para el 111/190) → `calcularCertificadoRetenciones` (filas del 190 de ese NIF). Así las cifras del certificado son las
// del 190 de la empresa para ese perceptor, siempre que contabilidad tenga esas mismas nóminas (estado `enviado`).
import { calcularCertificadoRetenciones, retencionDeNomina, type CertificadoRetenciones, type RetencionTrabajo } from '@central/module-contabilidad'
import { hechoDeNomina, type DatosCertificado } from '@/lib/hechos-contabilidad'

export type ResultadoCertificado =
  | { ok: true; certificado: CertificadoRetenciones; empresa: DatosCertificado['empresa']; nominasIncluidas: number; noIncluidas: { periodo: string; motivo: string }[] }
  | { ok: false; motivo: 'sin_dni' | 'sin_nominas' }

export function certificadoDeNominas(datos: DatosCertificado, anio: number): ResultadoCertificado {
  // Mismo criterio que el emisor: sin NIF válido la nómina viaja sin NIF y el 190 no la puede incluir.
  const dni = (datos.empleado.dni ?? '').toUpperCase().replace(/[\s.-]/g, '')
  if (!/^[A-Z0-9]{8,10}$/.test(dni)) return { ok: false, motivo: 'sin_dni' }
  const rs: RetencionTrabajo[] = []
  const noIncluidas: { periodo: string; motivo: string }[] = []
  for (const n of datos.nominas) {
    const h = hechoDeNomina(n)
    if (!h.ok) { noIncluidas.push({ periodo: n.periodo, motivo: h.motivo }); continue }
    const l = retencionDeNomina({ ref: h.hecho.ref, fecha: h.hecho.fecha, payload: h.hecho })
    if (!l.ok) { noIncluidas.push({ periodo: n.periodo, motivo: l.motivo }); continue }
    rs.push(l.retencion)
  }
  if (rs.length === 0 && noIncluidas.length === 0) return { ok: false, motivo: 'sin_nominas' }
  const certificado = calcularCertificadoRetenciones(rs, anio, dni)
  if (noIncluidas.length) certificado.avisos.push(`${noIncluidas.length} nómina(s) del año no se han podido incluir: consulta con RR.HH.`)
  return { ok: true, certificado, empresa: datos.empresa, nominasIncluidas: certificado.lineas.reduce((t, l) => t + l.refs.length, 0), noIncluidas }
}

/** Dinero en formato español: 2.162,49 € → «2.162,49€» (puntos de miles también en 4 cifras). */
export function eurosEs(centimos: number): string {
  const neg = centimos < 0
  const abs = Math.abs(centimos)
  const ent = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${neg ? '-' : ''}${ent},${String(abs % 100).padStart(2, '0')}€`
}

/** Año pedido en la query: entero entre 2020 y el año en curso; por defecto, el anterior (el que se certifica en enero). */
export function anioPedido(valor: string | null, hoy: Date): number | null {
  const actual = hoy.getUTCFullYear()
  if (valor === null || valor === '') return actual - 1
  if (!/^\d{4}$/.test(valor)) return null
  const a = Number(valor)
  return a >= 2020 && a <= actual ? a : null
}
