// El EXPEDIENTE de un agente: todo lo que el panel sabe de él, en texto, para poder preguntárselo.
//
// POR QUÉ (02/09/2026). Alberto: «unifica los agentes en una página… por si tengo consulta de algo».
// La página ya existía (/operador/agentes, 29 autónomos + 53 asistentes); lo que no había era dónde
// PREGUNTAR. Y no se puede «hablar con el agente»: 28 de los 29 son crons o sesiones efímeras, no
// hay un proceso al otro lado. Lo que sí existe es su rastro, y de eso sí se puede responder.
//
// 🚨 La regla que gobierna este archivo es la del CLAUDE.md: **dato que NO hay ≠ dato que NO se ha
// mirado**. Un agente sin latido no es un agente parado: es un agente del que no sabemos nada. Por
// eso cada hueco se escribe como «no consta» diciendo DÓNDE se sabría, nunca como un cero ni como
// un silencio — y el system prompt se lo prohíbe explícitamente al modelo.

/** Lo que el catálogo declara de un agente (subconjunto de `AgenteInfo`, para no acoplar). */
export type FichaAgente = {
  id: string
  nombre: string
  funcion: string
  cadencia: string
  disparo: string
  entrega: string
  telegram: boolean
  archivo: string
  vertical: string
  estado: string
}

/** Lo que el semáforo de la pantalla dice hoy. `estado: 'gris'` = sin telemetría, NO «parado». */
export type SaludExpediente = {
  estado: 'verde' | 'ambar' | 'rojo' | 'gris'
  detalle: string
  ultima: string | null
  horas: number | null
} | null

/** Una fila real de `agente_latidos`: la huella que deja el agente al pasar. */
export type LatidoExpediente = {
  agente: string
  ultimo_at: string | null
  ultimo_ok_at: string | null
  ok: boolean | null
  detalle: string | null
}

/** El veredicto persistido del vigía (`agente_veredicto`), si lo hay. */
export type VigiaExpediente = {
  evaluado_at: string | null
  alerta: boolean | null
  horas: number | null
  max_horas: number | null
  motivo: string | null
  nota: string | null
  sonda_error: string | null
} | null

export type Expediente = {
  ficha: FichaAgente
  salud: SaludExpediente
  latidos: LatidoExpediente[]
  /** Ids de latido que este agente DEBERÍA tener según el mapa (para distinguir «no hay» de «no aplica»). */
  latidosEsperados: string[]
  vigia: VigiaExpediente
}

const ESTADO_TXT: Record<NonNullable<SaludExpediente>['estado'], string> = {
  verde: 'al día',
  ambar: 'con retraso',
  rojo: 'parado o sin poder comprobarse',
  gris: 'SIN TELEMETRÍA (no se sabe; no significa que esté parado)',
}

function fecha(v: string | null | undefined): string {
  if (!v) return 'no consta'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? String(v) : d.toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}

/**
 * El expediente en texto plano, tal cual lo lee el modelo. Puro a propósito: la decisión de qué
 * se sabe y qué no es lo que hay que poder testear, no la consulta a la BD.
 */
export function formatearExpediente(e: Expediente): string {
  const f = e.ficha
  const partes: string[] = []

  partes.push(`# Agente: ${f.nombre}  (id \`${f.id}\`)
- Qué hace: ${f.funcion}
- Cadencia declarada: ${f.cadencia}
- Cómo se dispara: ${f.disparo}
- Qué entrega: ${f.entrega}${f.telegram ? ' · avisa por Telegram' : ' · NO avisa por Telegram'}
- Vertical: ${f.vertical}
- Estado declarado en el catálogo: ${f.estado}
- Implementado en: ${f.archivo}`)

  // ── Semáforo ────────────────────────────────────────────────────────────────────────────────
  if (!e.salud) {
    partes.push(`# Semáforo de la pantalla
No consta: este agente no tiene fila de salud. Es un «no lo sé», no un «está parado».`)
  } else {
    partes.push(`# Semáforo de la pantalla
- Estado: ${e.salud.estado.toUpperCase()} — ${ESTADO_TXT[e.salud.estado]}
- Detalle: ${e.salud.detalle}
- Última señal: ${fecha(e.salud.ultima)}${e.salud.horas != null ? ` (hace ${Math.round(e.salud.horas)} h)` : ''}`)
  }

  // ── Latidos ─────────────────────────────────────────────────────────────────────────────────
  if (e.latidos.length) {
    partes.push(`# Huella de sus pasadas (tabla agente_latidos)
${e.latidos.map(l => `- \`${l.agente}\`: última pasada ${fecha(l.ultimo_at)}; última pasada BUENA ${fecha(l.ultimo_ok_at)}; `
  + `resultado de la última: ${l.ok === true ? 'ok' : l.ok === false ? 'FALLÓ' : 'no consta'}. `
  + `Lo que dejó dicho: ${l.detalle ? `«${l.detalle}»` : 'nada'}`).join('\n')}`)
  } else if (e.latidosEsperados.length) {
    partes.push(`# Huella de sus pasadas (tabla agente_latidos)
Debería dejar huella en ${e.latidosEsperados.map(i => `\`${i}\``).join(', ')} y NO hay ninguna fila.
Eso significa que no ha latido nunca o que no ha podido escribir — no que no tuviera trabajo.`)
  } else {
    partes.push(`# Huella de sus pasadas (tabla agente_latidos)
Este agente no tiene latido declarado, así que aquí no hay nada que mirar. Su rastro, si lo deja,
está en las tablas de su propio trabajo (ver «Implementado en»).`)
  }

  // ── Vigía ───────────────────────────────────────────────────────────────────────────────────
  if (e.vigia) {
    const v = e.vigia
    partes.push(`# Último veredicto del vigía (tabla agente_veredicto)
- Evaluado: ${fecha(v.evaluado_at)}
- ¿Alerta?: ${v.alerta === true ? 'SÍ' : v.alerta === false ? 'no' : 'no consta'}
- Desfase medido: ${v.horas != null ? `${Math.round(v.horas)} h` : 'no consta'} (umbral ${v.max_horas ?? 'no consta'} h)
- Motivo: ${v.motivo || 'no consta'}
- Nota: ${v.nota || '(ninguna)'}
- ¿Falló la propia comprobación?: ${v.sonda_error ? `SÍ — ${v.sonda_error}` : 'no'}`)
  } else {
    partes.push(`# Último veredicto del vigía (tabla agente_veredicto)
No consta: el vigía no vigila a este agente, o todavía no ha pasado por él.`)
  }

  return partes.join('\n\n')
}

/**
 * Lo que puede y no puede hacer el modelo. Deliberadamente estrecho: responde SOBRE el agente
 * leyendo su expediente, no ES el agente ni puede lanzarlo.
 */
export const SYSTEM_CONSULTA = `Respondes preguntas de Alberto sobre UN agente concreto de su monorepo, leyendo el expediente que se te da.

NO eres ese agente: es un cron o una sesión programada, no hay nadie al otro lado. Eres quien ha leído su ficha y su rastro. No prometas ejecutarlo, pausarlo ni cambiarlo.

Reglas, en orden de importancia:
1. Responde SOLO con lo que está en el expediente. Si un dato no está, di «no consta» y di DÓNDE se sabría (el archivo que lo implementa, su Telegram, su tabla).
2. «Sin telemetría» / «no consta» NO es «no ha pasado nada» ni «está parado»: es que no se sabe. No lo conviertas en un cero, ni en un verde, ni en una tranquilidad. Es la diferencia entre «no hubo facturas» y «el buzón lleva un mes caído».
3. Si el expediente dice que la propia comprobación falló (sonda_error), eso manda sobre cualquier otra lectura: lo que sabemos es que NO se pudo comprobar.
4. Español, directo, sin preámbulos. Tres o cuatro frases salvo que Alberto pida detalle.
5. Si te pregunta algo que el expediente no cubre (por ejemplo qué encontró en una pasada concreta hace un mes), dilo claro y apunta dónde mirar, en vez de reconstruirlo.`
