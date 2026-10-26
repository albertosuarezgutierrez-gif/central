// Reglas PURAS del Inicio del responsable (`/admin`, 26/10/2026): de los contadores de pendientes a las tarjetas que se
// pintan. 🚨 `null` = «no se ha podido comprobar» (la consulta falló), NUNCA «0 pendientes»: una pantalla que dice
// «todo al día» porque una consulta falló es peor que no decir nada.

export type DatosInicio = {
  solicitudes: { total: number; recientes: { id: string; empleado: string; tipo: string }[] } | null
  firmas: { pendientes: number; esperandoEmpresa: number; sinAbrir: number; masAntiguaDias: number | null } | null
  /** Avisos al empleado (firma, recordatorios) cuyo correo falló en los últimos 7 días. */
  avisosFallidos: number | null
  /** Fallos de correo anotados para el responsable (`avisos_admin`, 7 días, sin ver). */
  correosFallidos: number | null
  /** Fichajes sin salida de las últimas 24 h; `undefined` = la empresa no usa fichaje. */
  fichajesAbiertos: number | null | undefined
}

export type TonoTarjeta = 'alerta' | 'aviso' | 'ok' | 'neutro'
export type Tarjeta = { id: string; tono: TonoTarjeta; titulo: string; texto: string; href: string; enlace: string; urgente: boolean }

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

export function tarjetasInicio(d: DatosInicio): Tarjeta[] {
  const t: Tarjeta[] = []
  const noSe = (id: string, titulo: string, href: string, enlace: string): Tarjeta =>
    ({ id, tono: 'neutro', titulo, texto: 'No se ha podido comprobar ahora mismo. Inténtalo de nuevo en un momento.', href, enlace, urgente: false })

  if (d.solicitudes === null) t.push(noSe('solicitudes', 'Solicitudes por aprobar', '/admin/solicitudes', 'Abrir solicitudes'))
  else t.push({
    id: 'solicitudes', tono: d.solicitudes.total > 0 ? 'aviso' : 'ok', urgente: d.solicitudes.total > 0,
    titulo: 'Solicitudes por aprobar',
    texto: d.solicitudes.total > 0
      ? `${plural(d.solicitudes.total, 'solicitud espera', 'solicitudes esperan')} tu respuesta${d.solicitudes.recientes.length ? `: ${d.solicitudes.recientes.map(r => r.empleado).join(', ')}${d.solicitudes.total > d.solicitudes.recientes.length ? '…' : ''}` : ''}.`
      : 'No hay solicitudes pendientes.',
    href: '/admin/solicitudes', enlace: d.solicitudes.total > 0 ? 'Revisar solicitudes' : 'Ver solicitudes',
  })

  if (d.firmas === null) t.push(noSe('firmas', 'Firmas pendientes', '/admin/firmas', 'Abrir firmas'))
  else {
    const f = d.firmas
    const partes = [
      f.esperandoEmpresa > 0 ? `${plural(f.esperandoEmpresa, 'espera', 'esperan')} tu firma` : '',
      f.pendientes > 0 ? `${plural(f.pendientes, 'espera', 'esperan')} la firma del empleado${f.sinAbrir > 0 ? ` (${plural(f.sinAbrir, 'sin abrir', 'sin abrir')})` : ''}` : '',
    ].filter(Boolean)
    const hay = f.pendientes + f.esperandoEmpresa > 0
    t.push({
      id: 'firmas', tono: f.esperandoEmpresa > 0 ? 'aviso' : hay ? 'neutro' : 'ok', urgente: f.esperandoEmpresa > 0,
      titulo: 'Firmas pendientes',
      texto: hay ? `${partes.join('; ')}${f.masAntiguaDias != null && f.masAntiguaDias > 0 ? `. La más antigua, de hace ${plural(f.masAntiguaDias, 'día', 'días')}` : ''}.` : 'No hay firmas pendientes.',
      href: '/admin/firmas', enlace: hay ? 'Ver firmas pendientes' : 'Ver firmas',
    })
  }

  const fallos = (d.correosFallidos ?? 0) + (d.avisosFallidos ?? 0)
  // 🚨 Tres estados: si CUALQUIERA de las dos fuentes no se ha podido leer, no se sabe → nunca el verde «todo bien»
  // (ni un recuento parcial: la fuente caída podría tener los fallos).
  if (d.correosFallidos === null || d.avisosFallidos === null) t.push(noSe('correos', 'Avisos y correos', '/admin/firmas', 'Abrir firmas'))
  else t.push({
    id: 'correos', tono: fallos > 0 ? 'alerta' : 'ok', urgente: fallos > 0,
    titulo: 'Avisos y correos',
    texto: fallos > 0
      ? `${plural(fallos, 'correo no ha podido enviarse', 'correos no han podido enviarse')} en los últimos 7 días. Avisa a esas personas por otra vía.`
      : 'Todos los avisos y correos recientes han salido bien.',
    href: '/admin/firmas', enlace: 'Ver avisos',
  })

  if (d.fichajesAbiertos !== undefined) {
    if (d.fichajesAbiertos === null) t.push(noSe('fichajes', 'Fichajes abiertos', '/admin/fichajes', 'Abrir fichajes'))
    else t.push({
      id: 'fichajes', tono: 'neutro', urgente: false, titulo: 'Fichajes abiertos',
      texto: d.fichajesAbiertos > 0 ? `${plural(d.fichajesAbiertos, 'persona está', 'personas están')} en jornada ahora mismo.` : 'Nadie en jornada ahora mismo.',
      href: '/admin/fichajes', enlace: 'Ver fichajes',
    })
  }
  // Lo que pide acción, primero.
  return t.sort((a, b) => Number(b.urgente) - Number(a.urgente))
}
