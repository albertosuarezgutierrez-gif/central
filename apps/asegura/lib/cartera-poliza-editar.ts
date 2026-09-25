// Anotar a mano lo que la compañía NO manda por CIMA sobre
// `polizas.datos_especificos`: la MODALIDAD de una RC (09-12/09/2026) y la
// DIRECCIÓN DEL RIESGO de un inmueble (19/09/2026). Dos operaciones acotadas,
// no un editor genérico de la póliza.
//
// ─── Reglas ──────────────────────────────────────────────────────────────────
// - Solo sobre pólizas de ramo `responsabilidad_civil` de ESTA correduría
//   (comprobado ANTES de escribir: con BYPASSRLS un id ajeno no falla, escribe
//   en otra correduría).
// - Se guarda `rcModalidad` (el id del catálogo) Y `rcModalidadTitulo` (el
//   texto ya compuesto) dentro del MISMO `datos_especificos` JSON, sin tocar
//   el resto de claves que ya traiga (fusión, no sustitución) — ese campo
//   puede llevar la dirección cifrada del riesgo y otros datos de la ingesta.
// - Si en algún momento CIMA manda coberturas reales para esta póliza,
//   `objetoAsegurado()` las antepone siempre: lo manual nunca pisa lo oficial.
// - Deja fila en `historial_interno` del cliente titular.

import { esCarteraViva, admiteDireccionRiesgo, validarDireccionRiesgo, validarModalidadRc, tituloModalidadRc } from '@central/module-seguros'
import { encryptField } from '@central/module-seguros-pii'
import { prismaAsegura, aseguraConfigurada } from './asegura-db'
import { anotarCambio } from './auditoria'
import { catastroPorReferencia, motivoCatastro } from './codeoscopic/catastro-referencia'

export type ResultadoModalidadRc =
  | { ok: true; estado: 'ok'; status: 200; titulo: string }
  | { ok: false; estado: 'invalido' | 'no_encontrado' | 'sin_configurar' | 'error'; motivo: string; status: 400 | 404 | 422 | 503 | 500 }

export async function establecerModalidadRc(
  correduriaId: string,
  polizaId: string,
  entrada: { modalidad?: unknown; nota?: unknown; actor: string },
): Promise<ResultadoModalidadRc> {
  if (!aseguraConfigurada()) {
    return { ok: false, estado: 'sin_configurar', motivo: 'La conexión a la cartera no está configurada.', status: 503 }
  }
  if (polizaId.trim() === '') {
    return { ok: false, estado: 'invalido', motivo: 'Falta el id de la póliza.', status: 422 }
  }
  const v = validarModalidadRc(entrada.modalidad, entrada.nota)
  if (!v.ok) return { ok: false, estado: 'invalido', motivo: v.motivo, status: 422 }
  const titulo = tituloModalidadRc(v.id, v.nota)
  if (titulo === null) return { ok: false, estado: 'invalido', motivo: 'Modalidad sin etiqueta conocida.', status: 422 }

  try {
    const db = prismaAsegura()
    const poliza = await db.poliza.findFirst({
      where: { id: polizaId, correduriaId },
      select: { id: true, tipo: true, clienteId: true, datosEspecificos: true },
    })
    if (!poliza) {
      return { ok: false, estado: 'no_encontrado', motivo: 'Esa póliza no está en la cartera de esta correduría.', status: 404 }
    }
    if (String(poliza.tipo) !== 'responsabilidad_civil') {
      return { ok: false, estado: 'invalido', motivo: 'Solo se anota modalidad en pólizas de Responsabilidad Civil.', status: 422 }
    }

    const previos = poliza.datosEspecificos && typeof poliza.datosEspecificos === 'object' && !Array.isArray(poliza.datosEspecificos)
      ? (poliza.datosEspecificos as Record<string, unknown>)
      : {}
    const fusionado = { ...previos, rcModalidad: v.id, rcModalidadTitulo: titulo, rcModalidadNota: v.nota }

    await db.poliza.update({ where: { id: poliza.id }, data: { datosEspecificos: fusionado } })
    anotarCambio({ entidad: 'poliza', id: poliza.id, campo: 'modalidad_rc', despues: v.id })
    await anotar(correduriaId, poliza.clienteId, `Modalidad de RC anotada a mano (${titulo}) por ${entrada.actor}`)
    return { ok: true, estado: 'ok', status: 200, titulo }
  } catch (e) {
    return { ok: false, estado: 'error', motivo: e instanceof Error ? e.message : String(e), status: 500 }
  }
}

// ─── Dirección del riesgo (19/09/2026) ───────────────────────────────────────
//
// CIMA NO manda los datos del riesgo de hogar/comunidades: una póliza
// que solo ha entrado por CIMA y no tiene gemela en el volcado no tiene
// dirección en ninguna parte, y el portal la titula «Occident · Hogar» dos
// veces seguidas. Medido el 19/09/2026 sobre la cartera viva: 32 hogar
// solo-CIMA, 2 con dirección. Este es el camino para que el corredor la anote.
//
// - Solo ramos de inmueble (`admiteDireccionRiesgo`), de ESTA correduría.
// - Se guarda con LAS MISMAS CLAVES que el volcado (`direccion`, `cp`,
//   `localidad`) para que `describirBien()` del portal y `objetoAsegurado()`
//   de la ficha la lean sin una rama nueva; y `direccion` va CIFRADA con
//   `encryptField` (sobre `v1:`), igual que la trae el volcado — el portal ya
//   la descifra. `cp` y `localidad` en claro, como allí.
// - Fusión, no sustitución: el resto de claves de `datos_especificos` se queda.
// - Lo anotado a mano NO pisa lo que traiga la fila: si la póliza YA tiene
//   dirección (`direccion` presente), se rechaza — corregir un dato que vino de
//   la compañía es otra operación, con otra trazabilidad.
// - Deja fila en `historial_interno` del tomador.

export type ResultadoDireccionRiesgo =
  | { ok: true; estado: 'ok'; status: 200 }
  | { ok: false; estado: 'invalido' | 'no_encontrado' | 'ya_informada' | 'sin_configurar' | 'error'; motivo: string; status: 404 | 409 | 422 | 503 | 500 }

export async function establecerDireccionRiesgo(
  correduriaId: string,
  polizaId: string,
  entrada: { direccion?: unknown; cp?: unknown; localidad?: unknown; actor: string },
): Promise<ResultadoDireccionRiesgo> {
  if (!aseguraConfigurada()) {
    return { ok: false, estado: 'sin_configurar', motivo: 'La conexión a la cartera no está configurada.', status: 503 }
  }
  if (polizaId.trim() === '') {
    return { ok: false, estado: 'invalido', motivo: 'Falta el id de la póliza.', status: 422 }
  }
  const v = validarDireccionRiesgo(entrada)
  if (!v.ok) return { ok: false, estado: 'invalido', motivo: v.motivo, status: 422 }

  try {
    const db = prismaAsegura()
    const poliza = await db.poliza.findFirst({
      where: { id: polizaId, correduriaId },
      select: { id: true, tipo: true, clienteId: true, datosEspecificos: true },
    })
    if (!poliza) {
      return { ok: false, estado: 'no_encontrado', motivo: 'Esa póliza no está en la cartera de esta correduría.', status: 404 }
    }
    if (!admiteDireccionRiesgo(String(poliza.tipo))) {
      return { ok: false, estado: 'invalido', motivo: 'Solo se anota dirección del riesgo en pólizas de hogar o comunidades.', status: 422 }
    }

    const previos = poliza.datosEspecificos && typeof poliza.datosEspecificos === 'object' && !Array.isArray(poliza.datosEspecificos)
      ? (poliza.datosEspecificos as Record<string, unknown>)
      : {}
    if (typeof previos.direccion === 'string' && previos.direccion.trim() !== '') {
      return { ok: false, estado: 'ya_informada', motivo: 'Esta póliza ya tiene dirección del riesgo; no se pisa desde aquí.', status: 409 }
    }

    const fusionado = {
      ...previos,
      direccion: encryptField(v.valor.direccion),
      ...(v.valor.cp !== null ? { cp: v.valor.cp } : {}),
      ...(v.valor.localidad !== null ? { localidad: v.valor.localidad } : {}),
      direccionOrigen: 'manual',
    }

    await db.poliza.update({ where: { id: poliza.id }, data: { datosEspecificos: fusionado } })
    anotarCambio({ entidad: 'poliza', id: poliza.id, campo: 'direccion_riesgo' })
    const resumen = [v.valor.cp, v.valor.localidad].filter(Boolean).join(' ')
    await anotar(correduriaId, poliza.clienteId, `Dirección del riesgo anotada a mano${resumen ? ` (${resumen})` : ''} por ${entrada.actor}`)
    return { ok: true, estado: 'ok', status: 200 }
  } catch (e) {
    return { ok: false, estado: 'error', motivo: e instanceof Error ? e.message : String(e), status: 500 }
  }
}

// ─── Referencia catastral del piso (23/09/2026) ──────────────────────────────
//
// 22 de las 28 pólizas de hogar vivas no traen m², año ni CP. El corredor
// elige el piso en el Catastro al retarificar; guardarla aquí evita elegirlo
// cada vez y hace que la póliza pase a retarificable (`fuente: 'catastro'`).
//
// - Solo hogar, de ESTA correduría.
// - Se comprueba contra el Catastro ANTES de escribir: no se guarda una
//   referencia que no existe (ni la de 14, que es el edificio).
// - Se guarda SOLO la referencia, no los m²/año/CP: esos se consultan al
//   tarificar y salen marcados «del Catastro», nunca como dato de la compañía.
// - Es dato nuestro, no de CIMA: cambiarla sí se permite (otro piso), y el
//   historial dice de cuál a cuál. La ingesta de CIMA fusiona con `||`, así
//   que no la borra.

export type ResultadoReferenciaCatastral =
  | { ok: true; estado: 'ok'; status: 200; referencia: string }
  | { ok: false; estado: 'invalido' | 'no_encontrado' | 'sin_configurar' | 'error'; motivo: string; status: 404 | 422 | 503 | 500 }

export async function establecerReferenciaCatastral(
  correduriaId: string,
  polizaId: string,
  entrada: { referencia?: unknown; actor: string },
): Promise<ResultadoReferenciaCatastral> {
  if (!aseguraConfigurada()) {
    return { ok: false, estado: 'sin_configurar', motivo: 'La conexión a la cartera no está configurada.', status: 503 }
  }
  if (polizaId.trim() === '' || typeof entrada.referencia !== 'string') {
    return { ok: false, estado: 'invalido', motivo: 'Faltan el id de la póliza o la referencia.', status: 422 }
  }

  try {
    const db = prismaAsegura()
    const poliza = await db.poliza.findFirst({
      where: { id: polizaId, correduriaId },
      select: { id: true, tipo: true, clienteId: true, datosEspecificos: true },
    })
    if (!poliza) {
      return { ok: false, estado: 'no_encontrado', motivo: 'Esa póliza no está en la cartera de esta correduría.', status: 404 }
    }
    if (String(poliza.tipo) !== 'hogar') {
      return { ok: false, estado: 'invalido', motivo: 'La referencia catastral solo se guarda en pólizas de hogar.', status: 422 }
    }

    const c = await catastroPorReferencia(entrada.referencia)
    if (c.estado !== 'ok') {
      return { ok: false, estado: c.estado === 'error' ? 'error' : 'invalido', motivo: motivoCatastro(c), status: c.estado === 'error' ? 503 : 422 }
    }

    const previos = poliza.datosEspecificos && typeof poliza.datosEspecificos === 'object' && !Array.isArray(poliza.datosEspecificos)
      ? (poliza.datosEspecificos as Record<string, unknown>)
      : {}
    const anterior = typeof previos.referenciaCatastral === 'string' ? previos.referenciaCatastral : null
    if (anterior === c.referencia) return { ok: true, estado: 'ok', status: 200, referencia: c.referencia }

    const fusionado = { ...previos, referenciaCatastral: c.referencia, referenciaCatastralOrigen: 'manual' }
    await db.poliza.update({ where: { id: poliza.id }, data: { datosEspecificos: fusionado } })
    anotarCambio({ entidad: 'poliza', id: poliza.id, campo: 'referencia_catastral', despues: c.referencia })
    await anotar(
      correduriaId,
      poliza.clienteId,
      anterior
        ? `Referencia catastral de la póliza cambiada (${anterior} → ${c.referencia}) por ${entrada.actor}`
        : `Referencia catastral guardada en la póliza (${c.referencia}) por ${entrada.actor}`,
    )
    return { ok: true, estado: 'ok', status: 200, referencia: c.referencia }
  } catch (e) {
    return { ok: false, estado: 'error', motivo: e instanceof Error ? e.message : String(e), status: 500 }
  }
}

/** Best-effort: que el historial falle no deshace la anotación, pero se grita. */
// ─── Quitar de «Oportunidades» una póliza del volcado histórico (25/09/2026) ──
//
// La ficha propone como oportunidad la póliza histórica más reciente de cada
// ramo. Si está duplicada o ya no vale, el corredor la quita (con motivo) y se
// puede recuperar. Solo sobre el VOLCADO: una póliza de la cartera viva no es
// un lead, y se rechaza en vez de marcarla.
export type ResultadoLeadDescartado =
  | { ok: true; estado: 'ok'; status: 200 }
  | { ok: false; estado: 'invalido' | 'no_encontrado' | 'sin_configurar' | 'error'; motivo: string; status: 404 | 422 | 503 | 500 }

/** Estados en los que la ficha pinta una póliza viva en «Oportunidades» (plataforma, `seguros-cliente.ts`). */
const ESTADOS_EN_COMPETENCIA = new Set<string>(['cancelada', 'vencida', 'competencia'])

export async function marcarLeadDescartado(
  correduriaId: string,
  polizaId: string,
  entrada: { descartar?: unknown; motivo?: unknown; actor: string },
): Promise<ResultadoLeadDescartado> {
  if (!aseguraConfigurada()) {
    return { ok: false, estado: 'sin_configurar', motivo: 'La conexión a la cartera no está configurada.', status: 503 }
  }
  if (typeof entrada.descartar !== 'boolean') {
    return { ok: false, estado: 'invalido', motivo: 'Falta `descartar` (true = quitar, false = recuperar).', status: 422 }
  }
  const motivo = typeof entrada.motivo === 'string' ? entrada.motivo.trim().slice(0, 300) : ''
  if (entrada.descartar && motivo === '') {
    return { ok: false, estado: 'invalido', motivo: 'Di por qué se quita (duplicada, ya no lo tiene…).', status: 422 }
  }
  try {
    const db = prismaAsegura()
    const poliza = await db.poliza.findFirst({
      where: { id: polizaId, correduriaId },
      select: { id: true, clienteId: true, importRef: true, eiacXmlHash: true, numeroPoliza: true, estado: true },
    })
    if (!poliza) {
      return { ok: false, estado: 'no_encontrado', motivo: 'Esa póliza no está en la cartera de esta correduría.', status: 404 }
    }
    // De la cartera viva solo se quita de Oportunidades la que se fue a otra compañía
    // (la ficha la pinta ahí): una en vigor no es una oportunidad y no se esconde.
    const viva = esCarteraViva(poliza)
    if (viva && !ESTADOS_EN_COMPETENCIA.has(poliza.estado)) {
      return { ok: false, estado: 'invalido', motivo: 'Es una póliza de la cartera viva que no está cancelada ni vencida: no se quita de Oportunidades.', status: 422 }
    }
    await db.poliza.update({
      where: { id: poliza.id },
      data: entrada.descartar
        ? { leadDescartadoAt: new Date(), leadDescartadoMotivo: motivo }
        : { leadDescartadoAt: null, leadDescartadoMotivo: null },
      select: { id: true },
    })
    anotarCambio({ entidad: 'poliza', id: poliza.id, campo: 'lead_descartado' })
    const clase = viva ? 'póliza' : 'póliza histórica'
    const cual = poliza.numeroPoliza ? `la ${clase} nº ${poliza.numeroPoliza}` : `una ${clase}`
    await anotar(correduriaId, poliza.clienteId, entrada.descartar
      ? `Quitada de oportunidades ${cual} («${motivo}») por ${entrada.actor}`
      : `Recuperada como oportunidad ${cual} por ${entrada.actor}`)
    return { ok: true, estado: 'ok', status: 200 }
  } catch (e) {
    return { ok: false, estado: 'error', motivo: e instanceof Error ? e.message : String(e), status: 500 }
  }
}

async function anotar(correduriaId: string, clienteId: string, texto: string): Promise<void> {
  try {
    await prismaAsegura().$executeRaw`
      insert into historial_interno (correduria_id, cliente_id, tipo, texto)
      values (${correduriaId}::uuid, ${clienteId}::uuid, cast('gestion' as tipo_historial_interno), ${texto})`
  } catch (e) {
    console.error('[cartera-poliza-editar] historial_interno no se pudo anotar:', e instanceof Error ? e.message : e)
  }
}
