// Test de regresión del fast-lane del BRAIN (reconocerPatron).
// Ejecuta: npx tsx scripts/test-brain-patron.ts
//
// 100% determinista: construye un MenuCache sintético en memoria y NO toca BD ni red.
// brain-patron solo importa tipos de brain-cache/@types (se borran en compilación),
// así que este test no arrastra Supabase.
//
// Cubre: comanda por zona, formato, plural→singular, código directo, marchar, 86,
// nota explícita y vino por familia; y los casos que DEBEN escalar al LLM (null):
// nota implícita, mensaje a cocina, recomendación de vino, nombre/sección al inicio,
// y producto desconocido.

import { reconocerPatron } from '../src/lib/brain-patron'
import type { MenuCache, ProductoCacheItem, ZonaCacheItem, PersonalCacheItem, SeccionCacheItem } from '../src/lib/brain-cache'

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
}

// ── MenuCache sintético ────────────────────────────────────────────────────────
const productos: ProductoCacheItem[] = [
  { id: 'pr-bravas', nombre: 'Patatas Bravas', aliases: ['Patatas Bravas', 'bravas'],
    precio: 6.5, seccion: 'cocina', familia: null,
    formatos: [
      { id: 'f-tapa', nombre: 'tapa', precio: 4 },
      { id: 'f-media', nombre: 'media', precio: 6 },
      { id: 'f-racion', nombre: 'racion', precio: 9 },
    ] },
  { id: 'pr-cana', nombre: 'Cerveza Caña', aliases: ['Cerveza Caña', 'caña', 'cañas'],
    precio: 2.5, seccion: 'barra', familia: 'cerveza', formatos: [] },
  { id: 'pr-croq', nombre: 'Croquetas', aliases: ['Croquetas', 'croqueta'],
    precio: 7, seccion: 'cocina', familia: null, formatos: [] },
  { id: 'pr-manchado', nombre: 'Manchado', aliases: ['Manchado'],
    precio: 1.5, seccion: 'barra', familia: 'cafe', formatos: [] },
  { id: 'pr-rioja', nombre: 'Rioja Crianza', aliases: ['Rioja Crianza', 'tinto'],
    precio: 18, seccion: 'bodega', familia: 'vino_tinto', formatos: [] },
]

const zonas: ZonaCacheItem[] = [
  { prefijo: 'T', nombre: 'Terraza', tipo: 'terraza' },
  { prefijo: 'S', nombre: 'Salón', tipo: 'salon' },
  { prefijo: 'B', nombre: 'Barra', tipo: 'barra' },
]

const personal: PersonalCacheItem[] = [
  { id: 'p-pablo', nombre: 'Pablo', nombre_norm: 'pablo', rol: 'camarero' },
]

const secciones: SeccionCacheItem[] = [
  { id: 'sec-cocina', nombre: 'Cocina', nombre_norm: 'cocina', impresora_id: null },
]

const byAlias = new Map<string, ProductoCacheItem>()
for (const p of productos) for (const a of p.aliases) byAlias.set(norm(a), p)

const byPrefijo = new Map<string, ZonaCacheItem>()
for (const z of zonas) byPrefijo.set(z.prefijo, z)

const byNombre = new Map<string, PersonalCacheItem>()
for (const p of personal) { byNombre.set(p.nombre_norm, p); byNombre.set(norm(p.nombre), p) }

const bySeccion = new Map<string, SeccionCacheItem>()
for (const s of secciones) {
  bySeccion.set(s.nombre_norm, s)
  const primer = s.nombre_norm.split(' ')[0]
  if (primer.length >= 4 && !bySeccion.has(primer)) bySeccion.set(primer, s)
}

const cache: MenuCache = { productos, zonas, personal, secciones, byAlias, byPrefijo, byNombre, bySeccion }

// ── Runner ───────────────────────────────────────────────────────────────────
let fallos = 0
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}`)
  if (!cond) fallos++
}

// ── Casos que el patron SÍ resuelve ─────────────────────────────────────────
{
  const r = reconocerPatron('terraza dos, dos cañas', cache)
  check(!!r && r.tipo === 'comanda' && r.mesa === 'T2'
    && r.items.length === 1 && r.items[0].nombre === 'Cerveza Caña' && r.items[0].cantidad === 2,
    'comanda por zona: "terraza dos, dos cañas" → T2 · 2x Cerveza Caña')
}
{
  const r = reconocerPatron('una tapa de bravas a la T1', cache)
  check(!!r && r.tipo === 'comanda' && r.mesa === 'T1'
    && r.items.length === 1 && r.items[0].nombre === 'Patatas Bravas' && r.items[0].formato === 'tapa',
    'formato: "una tapa de bravas a la T1" → T1 · Patatas Bravas (tapa)')
}
{
  const r = reconocerPatron('barra uno, dos manchados', cache)
  check(!!r && r.tipo === 'comanda' && r.mesa === 'B1'
    && r.items.length === 1 && r.items[0].nombre === 'Manchado' && r.items[0].cantidad === 2,
    'plural→singular: "dos manchados" → 2x Manchado')
}
{
  const r = reconocerPatron('B1 la cuenta', cache)
  check(!!r && r.tipo === 'cuenta' && r.mesa === 'B1' && r.items.length === 0,
    'código directo: "B1 la cuenta" → cuenta B1')
}
{
  const r = reconocerPatron('marcha croquetas S1', cache)
  check(!!r && r.tipo === 'marchar' && r.mesa === 'S1'
    && r.items.length === 1 && r.items[0].nombre === 'Croquetas',
    'marchar con producto: "marcha croquetas S1" → marchar S1 · Croquetas')
}
{
  const r = reconocerPatron('croquetas agotadas', cache)
  check(!!r && r.tipo === '86'
    && r.items.length === 1 && r.items[0].nombre === 'Croquetas',
    '86: "croquetas agotadas" → 86 · Croquetas')
}
{
  const r = reconocerPatron('dos cañas a la mesa uno nota sin sal', cache)
  check(!!r && r.tipo === 'comanda' && r.mesa === 'T1'
    && r.items.length === 1 && r.items[0].nombre === 'Cerveza Caña' && r.items[0].cantidad === 2
    && r.nota_general === 'sin sal',
    'nota explícita: "... nota sin sal" → T1 · 2x Cerveza Caña · nota="sin sal"')
}
{
  const r = reconocerPatron('un tinto a la mesa dos', cache)
  check(!!r && r.tipo === 'comanda' && r.mesa === 'T2'
    && r.items.length === 1 && r.items[0].nombre === 'Rioja Crianza',
    'vino por alias: "un tinto a la mesa dos" → T2 · Rioja Crianza')
}

// ── Casos que DEBEN escalar al LLM (reconocerPatron === null) ────────────────
{
  const r = reconocerPatron('dos entrecot muy hecho mesa tres', cache)
  check(r === null, 'nota implícita ("muy hecho") sin keyword "nota" → null (escala)')
}
{
  const r = reconocerPatron('mensaje a cocina S1 tiene prisa', cache)
  check(r === null, 'mensaje a cocina → null (escala)')
}
{
  const r = reconocerPatron('qué vino va con el solomillo', cache)
  check(r === null, 'recomendación de vino → null (escala)')
}
{
  const r = reconocerPatron('Pablo T4 esperando el segundo', cache)
  check(r === null, 'nombre propio al inicio ("Pablo") → null (escala)')
}
{
  const r = reconocerPatron('cocina, S1 tiene prisa', cache)
  check(r === null, 'sección al inicio ("cocina") → null (escala)')
}
{
  const r = reconocerPatron('tres dinosaurios a la mesa dos', cache)
  check(r === null, 'producto desconocido → null (escala)')
}

// ── Resultado ──────────────────────────────────────────────────────────────
console.log(`\n${fallos === 0 ? '✅ TODO VERDE' : `❌ ${fallos} fallo(s)`}`)
process.exit(fallos === 0 ? 0 : 1)
