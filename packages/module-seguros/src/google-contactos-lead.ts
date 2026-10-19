// Lead que entra por CORREO (hola@grupoasegura.es) → Google Contacts AL MOMENTO (19/10/2026, decisión de
// Alberto: amplía el «alcance cerrado» de la skill `google-contactos`). Lógica PURA.
//
// El endpoint de asegura (`POST /api/operador/google-contactos/lead`) arma EL MISMO plan que el cron
// (`planificarSync`: selección entera + las fichas pedidas, agenda completa, vínculos, fusiones y titulares)
// y aquí se queda SOLO con lo que toca a esas fichas: crear su contacto, adoptarlo/vincularlo si ya estaba
// en la agenda (E.164 + nombre, mismas reglas) o encolar la duda en `google_contactos_revision`. Nada de lo
// que el plan diga de OTRAS fichas (retirar, desvincular, actualizar, propuestas de lead) se ejecuta: eso
// es del cron horario. Así el alta de un lead no puede tocar el resto de la agenda.
//
// Para que el cron no lo duplique ni lo borre después, la selección del cron incluye los leads de correo
// que YA tienen vínculo (como los ⚪ ex-clientes: sin vínculo no entran solos; ver `contactos-google.ts`).

import {
  camposDeCrm, fechaEs,
  type ContactoGoogle, type Escritura, type Actualizacion, type Plan, type Revision, type Vinculo,
} from './google-contactos.ts'

/** Estados de la respuesta del endpoint (sin PII: nunca nombre, teléfono ni correo). */
export const ESTADOS_CONTACTO_LEAD = ['anadido', 'ya_estaba', 'revision', 'no_activada', 'sin_conexion', 'error'] as const
export type EstadoContactoLead = (typeof ESTADOS_CONTACTO_LEAD)[number]
/** Lo que puede pasarle a UNA ficha (los otros tres estados son de la conexión, no de la ficha). */
export type EstadoFichaContacto = Extract<EstadoContactoLead, 'anadido' | 'ya_estaba' | 'revision' | 'error'>

/**
 * Por qué, en códigos fijos (van a Telegram y al registro de auditoría: nunca texto libre de Google).
 */
export const MOTIVOS_CONTACTO_LEAD = [
  // anadido
  'creado',
  // ya_estaba
  'adoptado', 'vinculado', 'ya_vinculado', 'numero_compartido',
  // revision (la duda va a la cola de Google Contactos)
  'nombre_distinto', 'telefono_compartido', 'mismo_email', 'mismo_nombre', 'varios_candidatos', 'telefono_titular', 'telefono_muchas_fichas', 'en_cola',
  // error de la ficha
  'fuera_de_alcance', 'sacado_del_grupo', 'ilegible', 'fallo_google',
  // de la conexión / globales
  'sin_conexion', 'revocada', 'pendiente_activar', 'pii_no_descifra', 'limite', 'red', 'sin_configurar', 'fallo',
] as const
export type MotivoContactoLead = (typeof MOTIVOS_CONTACTO_LEAD)[number]

export type ResultadoFichaContacto = { estado: EstadoFichaContacto; motivo: MotivoContactoLead }

/** Tope de fichas por llamada (la del relleno incluida): un lote de escritura de Google y holgura de tiempo. */
export const MAX_FICHAS_CONTACTO_LEAD = 50

/** El bloque de la nota de un lead de correo: de dónde vino y cuándo. Sin datos personales. */
export function notaLeadCorreo(alta: string | null): string {
  return alta && /^\d{4}-\d{2}-\d{2}/.test(alta) ? `Lead por correo (hola@): ${fechaEs(alta)}` : 'Lead por correo (hola@)'
}

const MOTIVOS_REVISION = new Set<string>(['nombre_distinto', 'telefono_compartido', 'mismo_email', 'mismo_nombre', 'varios_candidatos', 'telefono_titular', 'telefono_muchas_fichas'])

function motivoRevision(r: Revision): MotivoContactoLead {
  const m = r.tipo === 'duplicado_ambiguo' ? (r.motivo ?? '') : r.tipo
  return MOTIVOS_REVISION.has(m) ? (m as MotivoContactoLead) : 'en_cola'
}

/**
 * Del plan COMPLETO, solo lo de las fichas pedidas (`objetivos`). Regla por ficha, en este orden:
 *   1. Ya tiene vínculo → `ya_estaba` (`ya_vinculado`) sin escribir nada: la mantiene el cron. Si Alberto
 *      la sacó de la etiqueta (`fuera_del_grupo`) → `error` (`sacado_del_grupo`): no se le vuelve a meter.
 *   2. No está en la selección (ni cartera, ni lead de Vencimientos, ni lead de correo activo) →
 *      `error` (`fuera_de_alcance`): el cron no la mantendría y la borraría la hora siguiente.
 *   3. Su dato no se pudo descifrar → `error` (`ilegible`): no se escribe un contacto a medias.
 *   4. El plan la CREA → `anadido`; la VINCULA/ADOPTA (ya estaba en la agenda) → `ya_estaba`.
 *      Sus revisiones (cumpleaños distinto, «añadir a la ficha») se encolan también.
 *   5. Solo revisiones (teléfono con otro nombre, varios candidatos, número compartido sin titular…) →
 *      `revision`: nada se crea, la duda va a la cola.
 *   6. Nada → su número ya va en el contacto de otra ficha («un número, un contacto») → `ya_estaba`.
 */
export function accionesParaFichas(p: {
  plan: Plan
  objetivos: readonly string[]
  vinculos: readonly Vinculo[]
  seleccion: readonly ContactoGoogle[]
}): { crear: Escritura[]; actualizar: Actualizacion[]; revisiones: Revision[]; resultados: Map<string, ResultadoFichaContacto> } {
  const crear: Escritura[] = []
  const actualizar: Actualizacion[] = []
  const revisiones: Revision[] = []
  const resultados = new Map<string, ResultadoFichaContacto>()
  const vinculoDe = new Map(p.vinculos.map((v) => [v.clienteId, v]))
  const enSeleccion = new Map(p.seleccion.map((c) => [c.clienteId, c]))
  const huellas = new Set<string>()
  for (const t of new Set(p.objetivos)) {
    const v = vinculoDe.get(t)
    if (v) {
      resultados.set(t, v.estado === 'fuera_del_grupo' ? { estado: 'error', motivo: 'sacado_del_grupo' } : { estado: 'ya_estaba', motivo: 'ya_vinculado' })
      continue
    }
    const c = enSeleccion.get(t)
    if (!c) {
      resultados.set(t, { estado: 'error', motivo: 'fuera_de_alcance' })
      continue
    }
    if (camposDeCrm(c) === null) {
      resultados.set(t, { estado: 'error', motivo: 'ilegible' })
      continue
    }
    const cr = p.plan.crear.filter((x) => x.clienteId === t)
    const ac = p.plan.actualizar.filter((x) => x.clienteId === t)
    const rs = p.plan.revisiones.filter((r) => r.clienteId === t || (r.clienteId === null && (r.candidatos ?? []).includes(t)))
    crear.push(...cr)
    actualizar.push(...ac)
    for (const r of rs) {
      if (huellas.has(r.huella)) continue
      huellas.add(r.huella)
      revisiones.push(r)
    }
    if (cr.length > 0) resultados.set(t, { estado: 'anadido', motivo: 'creado' })
    else if (ac.length > 0) resultados.set(t, { estado: 'ya_estaba', motivo: ac[0].origen === 'adoptado' ? 'adoptado' : 'vinculado' })
    else if (rs.length > 0) resultados.set(t, { estado: 'revision', motivo: motivoRevision(rs[0]) })
    else resultados.set(t, { estado: 'ya_estaba', motivo: 'numero_compartido' })
  }
  return { crear, actualizar, revisiones, resultados }
}
