// «Inicio» = SOLO lo pendiente (26/10/2026, decisión de Alberto): vencimientos, recibos pendientes, siniestros abiertos
// (avisos y huecos de protección se suman en la pantalla). Calculado PURO, sin BD ni sesión, para probarlo con `node --test`.
// La lectura vive en `lib/inicio.ts`; la pantalla en `app/(portal)/inicio/page.tsx`.
//
// 🚨 Tres estados, también aquí. Una fuente que NO se pudo leer llega como `null` y se declara en `sinComprobar`:
// jamás se lee como «no tienes nada». Sin pendientes de verdad (todo leído y vacío) = estado vacío amable en la pantalla.
// 🚨 Solo cuentas, fechas y la etiqueta del bien: ni importes ni nº de póliza (el nº no identifica una póliza al cliente).
import { diasHastaVencimientoPortal, enVentanaVencimientos } from '@central/module-seguros-portal'

/** Una póliza reducida a lo que Inicio mira. */
export type PolizaPendiente = {
  id: string
  /** «Hogar · Mapfre · C/ Socorro…»: la etiqueta ya compuesta (el bien, no el nº de póliza). */
  etiqueta: string
  /** Suya (vs. la que le dejan ver): el recibo de una ajena lo paga su titular. */
  propia: boolean
  enVigor: boolean
  /** `YYYY-MM-DD` o `null` (no consta). */
  vence: string | null
  /** Recibos devueltos. `null` = no se sabe. */
  devueltos: number | null
  /** Vencimiento (`YYYY-MM-DD`) del próximo recibo al cobro. `null` = no consta o ninguno. */
  proximoRecibo: string | null
  /** Siniestros abiertos. `null` = no se pudo leer (≠ ninguno). */
  siniestrosAbiertos: number | null
}

/** Una póliza que el cliente APORTÓ (de otra correduría): solo se mira cuándo vence. */
export type DeclaradaPendiente = { id: string; etiqueta: string; enVigor: boolean; vence: string | null }

export type ItemPendiente = {
  clave: string
  titulo: string
  detalle: string | null
  href: string
  /** Pide atención ya (recibo devuelto, siniestro abierto): lleva el aviso en rojo; el texto lo dice también. */
  urgente: boolean
}

export type FuentePendiente = 'vencimientos' | 'recibos' | 'siniestros'

export type PendienteInicio = {
  vencimientos: ItemPendiente[]
  recibos: ItemPendiente[]
  siniestros: ItemPendiente[]
  /** Fuentes que no se pudieron leer (se dicen; nunca «nada pendiente»). */
  sinComprobar: FuentePendiente[]
}

/** Los recibos al cobro se avisan con esta antelación (días): un recibo a 5 meses no es pendiente. */
export const DIAS_RECIBO_PROXIMO = 30

const fechaEs = (iso: string) => iso.split('-').reverse().join('/')

function cuando(dias: number | null, iso: string): string {
  if (dias === 0) return 'hoy'
  if (dias === 1) return 'mañana'
  return `el ${fechaEs(iso)}`
}

export function pendienteInicio(e: {
  /** La cartera. `null` = no se pudo leer. */
  polizas: PolizaPendiente[] | null
  /** Las aportadas. `null` = no se pudieron leer. */
  declaradas?: DeclaradaPendiente[] | null
  /**
   * Pólizas con una baja EN MARCHA (`polizasConBajaEnMarcha(firmas, { conConfirmadas: true })`, la misma regla que la lista
   * «Tus vencimientos» de la bóveda): una póliza que se da de baja no «renueva», así que no sale en Vencimientos.
   * `null`/ausente = no se pudo saber: no se excluye nada (el servidor rechazaría igualmente pedir cambios sobre ella).
   */
  conBaja?: ReadonlySet<string> | null
  /** «Ya lo pediste»: peticiones de mejorar el precio abiertas (`peticionesPrecio`). `null`/ausente = no se sabe: no se dice nada. */
  peticiones?: readonly { polizaId: string; pedidoEl: string }[] | null
  hoy: string
}): PendienteInicio {
  if (e.polizas === null) {
    return { vencimientos: [], recibos: [], siniestros: [], sinComprobar: ['vencimientos', 'recibos', 'siniestros'] }
  }
  const vencimientos: Array<{ dias: number; item: ItemPendiente }> = []
  const recibos: ItemPendiente[] = []
  const siniestros: ItemPendiente[] = []
  const sinComprobar = new Set<FuentePendiente>()
  const pedidas = new Map(e.peticiones ? e.peticiones.map((x) => [x.polizaId, x.pedidoEl] as const) : [])

  for (const p of e.polizas) {
    const href = `/boveda/poliza/${p.id}`

    // Vencimientos: en vigor, con fecha, de hoy a la ventana de 60 días. Sin fecha no se inventa nada.
    if (p.enVigor && p.vence !== null && !(e.conBaja?.has(p.id) ?? false)) {
      const dias = diasHastaVencimientoPortal(p.vence, e.hoy)
      if (dias !== null && enVentanaVencimientos(dias)) {
        // «Ya lo pediste» (solo en las SUYAS: la petición es de su tomador).
        const pedido = p.propia ? pedidas.get(p.id) : undefined
        const detalle = `Vence ${cuando(dias, p.vence)}${pedido ? ` · Nos pediste que lo miremos el ${fechaEs(pedido)}` : ''}`
        vencimientos.push({
          dias,
          item: { clave: `vence:${p.id}`, titulo: p.etiqueta, detalle, href, urgente: false },
        })
      }
    }

    // Recibos: solo los de pólizas SUYAS (el de una ajena lo paga su titular).
    if (p.propia) {
      if (p.devueltos === null) sinComprobar.add('recibos')
      else if (p.devueltos > 0) {
        recibos.push({
          clave: `devuelto:${p.id}`,
          titulo: p.devueltos === 1 ? `Un recibo devuelto: ${p.etiqueta}` : `${p.devueltos} recibos devueltos: ${p.etiqueta}`,
          detalle: 'Si no se paga, la cobertura puede suspenderse. Mira cómo pagarlo en la póliza.',
          href,
          urgente: true,
        })
      }
      if (p.proximoRecibo !== null) {
        const dias = diasHastaVencimientoPortal(p.proximoRecibo, e.hoy)
        if (dias !== null && dias >= 0 && dias <= DIAS_RECIBO_PROXIMO) {
          recibos.push({
            clave: `cobro:${p.id}`,
            titulo: `Recibo a cobrar ${cuando(dias, p.proximoRecibo)}: ${p.etiqueta}`,
            detalle: null,
            href: '/boveda?vista=recibos',
            urgente: false,
          })
        }
      }
    }

    // Siniestros abiertos: de cualquier póliza que vea. `null` = no se pudo leer, no «ninguno»; en una AJENA, `null` es
    // también «no visible en tu nivel» (no es un fallo nuestro: no se dice).
    if (p.siniestrosAbiertos === null) {
      if (p.propia) sinComprobar.add('siniestros')
    }
    else if (p.siniestrosAbiertos > 0) {
      siniestros.push({
        clave: `siniestro:${p.id}`,
        titulo: p.siniestrosAbiertos === 1 ? `Un siniestro abierto: ${p.etiqueta}` : `${p.siniestrosAbiertos} siniestros abiertos: ${p.etiqueta}`,
        detalle: null,
        href: '/boveda?vista=siniestro',
        urgente: true,
      })
    }
  }

  // Las aportadas que vencen en la ventana: aviso informativo (comparar es un botón de su ficha, no se pide desde aquí).
  if (e.declaradas === null) sinComprobar.add('vencimientos')
  else if (e.declaradas !== undefined) {
    for (const d of e.declaradas) {
      if (!d.enVigor || d.vence === null) continue
      const dias = diasHastaVencimientoPortal(d.vence, e.hoy)
      if (dias !== null && enVentanaVencimientos(dias)) {
        vencimientos.push({
          dias,
          item: { clave: `vence-aportada:${d.id}`, titulo: d.etiqueta, detalle: `Aportada por ti · vence ${cuando(dias, d.vence)}`, href: `/boveda/anadida/${d.id}`, urgente: false },
        })
      }
    }
  }

  vencimientos.sort((a, b) => a.dias - b.dias)
  return {
    vencimientos: vencimientos.map((v) => v.item),
    recibos: recibos.sort((a, b) => Number(b.urgente) - Number(a.urgente)),
    siniestros,
    sinComprobar: [...sinComprobar],
  }
}

/** ¿Hay algo que enseñar? (sin contar avisos ni huecos, que la pantalla suma). */
export function hayPendiente(p: PendienteInicio): boolean {
  return p.vencimientos.length + p.recibos.length + p.siniestros.length > 0
}
