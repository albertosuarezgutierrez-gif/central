// F0.2 · Capa de acceso del sistema de comunicación multi-negocio.
// Todo scoped por `cuenta_id` (el dueño). Lee/escribe las tablas `comunicacion_*`
// (ver apps/plataforma/prisma/sql/2026-06-11_comunicacion_f0.sql) con Prisma $queryRaw,
// como hace lib/financiero.ts (esas tablas no están en el modelo Prisma a propósito).
// Diseño: docs/COMUNICACION-MULTINEGOCIO.md
import { prisma } from './db'

// ── Tipos ────────────────────────────────────────────────────────────────
export type Categoria = { id: string; nombre: string; color: string | null; orden: number }
export type Grupo = { id: string; negocioId: string | null; nombre: string; tipo: 'estatico' | 'dinamico'; origenRef: string | null }
export type Regla = { id: string; origenNodoId: string; destinoNodoId: string; puedeMensajear: boolean; puedeEncargar: boolean }
export type Mensaje = { id: string; conversacionId: string; autorNodoId: string | null; cuerpo: string; createdAt: string }
export type Conversacion = { id: string; categoriaId: string | null; titulo: string | null; estado: string; createdAt: string }

/** Descriptor de un destinatario/autor antes de resolverlo a un nodo. */
export type NodoDescriptor =
  | { tipo: 'cuenta' }
  | { tipo: 'negocio'; negocioId: string; nombre?: string }
  | { tipo: 'grupo'; grupoId: string; nombre?: string }
  | { tipo: 'persona'; negocioId: string; refPersona: string; rol?: string; nombre?: string }

// ── Categorías (libres, las define el dueño) ─────────────────────────────
export async function listarCategorias(cuentaId: string): Promise<Categoria[]> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT id, nombre, color, orden FROM public.comunicacion_categorias
    WHERE cuenta_id = ${cuentaId}::uuid ORDER BY orden, nombre`
  return rows as Categoria[]
}
export async function crearCategoria(cuentaId: string, nombre: string, color: string | null, orden: number): Promise<Categoria> {
  const rows = await prisma.$queryRaw<any[]>`
    INSERT INTO public.comunicacion_categorias (cuenta_id, nombre, color, orden)
    VALUES (${cuentaId}::uuid, ${nombre}, ${color}, ${orden})
    RETURNING id, nombre, color, orden`
  return rows[0] as Categoria
}

// ── Grupos (estáticos o dinámicos) ───────────────────────────────────────
export async function listarGrupos(cuentaId: string): Promise<Grupo[]> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT id, negocio_id AS "negocioId", nombre, tipo, origen_ref AS "origenRef"
    FROM public.comunicacion_grupos WHERE cuenta_id = ${cuentaId}::uuid ORDER BY nombre`
  return rows as Grupo[]
}
export async function crearGrupo(cuentaId: string, g: { negocioId: string | null; nombre: string; tipo: 'estatico' | 'dinamico'; origenRef: string | null }): Promise<Grupo> {
  const rows = await prisma.$queryRaw<any[]>`
    INSERT INTO public.comunicacion_grupos (cuenta_id, negocio_id, nombre, tipo, origen_ref)
    VALUES (${cuentaId}::uuid, ${g.negocioId}::uuid, ${g.nombre}, ${g.tipo}, ${g.origenRef})
    RETURNING id, negocio_id AS "negocioId", nombre, tipo, origen_ref AS "origenRef"`
  return rows[0] as Grupo
}

// ── Reglas (matriz: el dueño autoriza quién habla con quién) ──────────────
export async function listarReglas(cuentaId: string): Promise<Regla[]> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT id, origen_nodo_id AS "origenNodoId", destino_nodo_id AS "destinoNodoId",
           puede_mensajear AS "puedeMensajear", puede_encargar AS "puedeEncargar"
    FROM public.comunicacion_reglas WHERE cuenta_id = ${cuentaId}::uuid`
  return rows as Regla[]
}
export async function crearRegla(cuentaId: string, r: { origenNodoId: string; destinoNodoId: string; puedeMensajear: boolean; puedeEncargar: boolean }): Promise<Regla> {
  const rows = await prisma.$queryRaw<any[]>`
    INSERT INTO public.comunicacion_reglas (cuenta_id, origen_nodo_id, destino_nodo_id, puede_mensajear, puede_encargar)
    VALUES (${cuentaId}::uuid, ${r.origenNodoId}::uuid, ${r.destinoNodoId}::uuid, ${r.puedeMensajear}, ${r.puedeEncargar})
    RETURNING id, origen_nodo_id AS "origenNodoId", destino_nodo_id AS "destinoNodoId",
              puede_mensajear AS "puedeMensajear", puede_encargar AS "puedeEncargar"`
  return rows[0] as Regla
}

// ── Nodos (resolución idempotente de destinatarios/autor) ────────────────
/** Devuelve el id del nodo para el descriptor dado, creándolo si no existe. */
export async function ensureNodo(cuentaId: string, d: NodoDescriptor): Promise<string> {
  let existing: any[] = []
  if (d.tipo === 'cuenta') {
    existing = await prisma.$queryRaw<any[]>`
      SELECT id FROM public.comunicacion_nodos
      WHERE cuenta_id = ${cuentaId}::uuid AND tipo = 'cuenta' LIMIT 1`
  } else if (d.tipo === 'negocio') {
    existing = await prisma.$queryRaw<any[]>`
      SELECT id FROM public.comunicacion_nodos
      WHERE cuenta_id = ${cuentaId}::uuid AND tipo = 'negocio' AND negocio_id = ${d.negocioId}::uuid LIMIT 1`
  } else if (d.tipo === 'grupo') {
    existing = await prisma.$queryRaw<any[]>`
      SELECT id FROM public.comunicacion_nodos
      WHERE cuenta_id = ${cuentaId}::uuid AND tipo = 'grupo' AND grupo_id = ${d.grupoId}::uuid LIMIT 1`
  } else {
    existing = await prisma.$queryRaw<any[]>`
      SELECT id FROM public.comunicacion_nodos
      WHERE cuenta_id = ${cuentaId}::uuid AND tipo = 'persona'
        AND negocio_id = ${d.negocioId}::uuid AND ref_persona = ${d.refPersona} LIMIT 1`
  }
  if (existing[0]?.id) return existing[0].id as string

  const nombre = d.tipo === 'cuenta' ? 'Dueño'
    : ('nombre' in d && d.nombre) ? d.nombre
    : d.tipo
  const negocioId = d.tipo === 'negocio' || d.tipo === 'persona' ? (d as any).negocioId : null
  const grupoId = d.tipo === 'grupo' ? d.grupoId : null
  const refPersona = d.tipo === 'persona' ? d.refPersona : null
  const rol = d.tipo === 'persona' ? (d.rol ?? null) : null

  const rows = await prisma.$queryRaw<any[]>`
    INSERT INTO public.comunicacion_nodos (cuenta_id, tipo, negocio_id, grupo_id, ref_persona, rol, nombre)
    VALUES (${cuentaId}::uuid, ${d.tipo}, ${negocioId}::uuid, ${grupoId}::uuid, ${refPersona}, ${rol}, ${nombre})
    RETURNING id`
  return rows[0].id as string
}

// ── Autorización (el dueño es la autoridad) ──────────────────────────────
/** ¿Puede el nodo origen mensajear al nodo destino? El dueño (cuenta) siempre puede;
 *  el resto requiere una regla explícita con puede_mensajear = true. */
export async function puedeMensajear(cuentaId: string, origenNodoId: string, destinoNodoId: string): Promise<boolean> {
  const origen = await prisma.$queryRaw<any[]>`
    SELECT tipo FROM public.comunicacion_nodos
    WHERE id = ${origenNodoId}::uuid AND cuenta_id = ${cuentaId}::uuid LIMIT 1`
  if (origen[0]?.tipo === 'cuenta') return true
  const regla = await prisma.$queryRaw<any[]>`
    SELECT 1 FROM public.comunicacion_reglas
    WHERE cuenta_id = ${cuentaId}::uuid AND origen_nodo_id = ${origenNodoId}::uuid
      AND destino_nodo_id = ${destinoNodoId}::uuid AND puede_mensajear = true LIMIT 1`
  return regla.length > 0
}

// ── Conversaciones y mensajes ────────────────────────────────────────────
/** Crea una conversación: resuelve autor + destinatarios a nodos, valida reglas,
 *  inserta participantes y el primer mensaje. Devuelve la conversación. */
export async function crearConversacion(cuentaId: string, input: {
  autor: NodoDescriptor
  destinatarios: NodoDescriptor[]
  categoriaId?: string | null
  titulo?: string | null
  cuerpo: string
}): Promise<Conversacion> {
  const autorNodoId = await ensureNodo(cuentaId, input.autor)
  const destinoIds: string[] = []
  for (const d of input.destinatarios) {
    const id = await ensureNodo(cuentaId, d)
    if (!(await puedeMensajear(cuentaId, autorNodoId, id))) {
      throw new Error('No autorizado a comunicar con un destinatario')
    }
    destinoIds.push(id)
  }

  const conv = (await prisma.$queryRaw<any[]>`
    INSERT INTO public.comunicacion_conversaciones (cuenta_id, categoria_id, titulo, creado_por_nodo_id)
    VALUES (${cuentaId}::uuid, ${input.categoriaId ?? null}::uuid, ${input.titulo ?? null}, ${autorNodoId}::uuid)
    RETURNING id, categoria_id AS "categoriaId", titulo, estado, created_at AS "createdAt"`)[0] as Conversacion

  for (const nodoId of [autorNodoId, ...destinoIds]) {
    await prisma.$executeRaw`
      INSERT INTO public.comunicacion_conversacion_participantes (conversacion_id, nodo_id)
      VALUES (${conv.id}::uuid, ${nodoId}::uuid) ON CONFLICT DO NOTHING`
  }
  await prisma.$executeRaw`
    INSERT INTO public.comunicacion_mensajes (conversacion_id, autor_nodo_id, cuerpo)
    VALUES (${conv.id}::uuid, ${autorNodoId}::uuid, ${input.cuerpo})`
  return conv
}

/** Lista las conversaciones de la cuenta (bandeja del dueño). */
export async function listarConversaciones(cuentaId: string): Promise<Conversacion[]> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT id, categoria_id AS "categoriaId", titulo, estado, created_at AS "createdAt"
    FROM public.comunicacion_conversaciones
    WHERE cuenta_id = ${cuentaId}::uuid ORDER BY created_at DESC LIMIT 200`
  return rows as Conversacion[]
}

/** Detalle de una conversación con sus mensajes (scoped por cuenta). */
export async function getConversacion(cuentaId: string, conversacionId: string): Promise<{ conversacion: Conversacion; mensajes: Mensaje[] } | null> {
  const conv = await prisma.$queryRaw<any[]>`
    SELECT id, categoria_id AS "categoriaId", titulo, estado, created_at AS "createdAt"
    FROM public.comunicacion_conversaciones
    WHERE id = ${conversacionId}::uuid AND cuenta_id = ${cuentaId}::uuid LIMIT 1`
  if (!conv[0]) return null
  const mensajes = await prisma.$queryRaw<any[]>`
    SELECT id, conversacion_id AS "conversacionId", autor_nodo_id AS "autorNodoId", cuerpo, created_at AS "createdAt"
    FROM public.comunicacion_mensajes
    WHERE conversacion_id = ${conversacionId}::uuid ORDER BY created_at`
  return { conversacion: conv[0] as Conversacion, mensajes: mensajes as Mensaje[] }
}

/** Añade un mensaje a una conversación existente (autor = el dueño, nodo cuenta). */
export async function enviarMensaje(cuentaId: string, conversacionId: string, cuerpo: string): Promise<Mensaje | null> {
  const conv = await prisma.$queryRaw<any[]>`
    SELECT id FROM public.comunicacion_conversaciones
    WHERE id = ${conversacionId}::uuid AND cuenta_id = ${cuentaId}::uuid LIMIT 1`
  if (!conv[0]) return null
  const autorNodoId = await ensureNodo(cuentaId, { tipo: 'cuenta' })
  const rows = await prisma.$queryRaw<any[]>`
    INSERT INTO public.comunicacion_mensajes (conversacion_id, autor_nodo_id, cuerpo)
    VALUES (${conversacionId}::uuid, ${autorNodoId}::uuid, ${cuerpo})
    RETURNING id, conversacion_id AS "conversacionId", autor_nodo_id AS "autorNodoId", cuerpo, created_at AS "createdAt"`
  return rows[0] as Mensaje
}
