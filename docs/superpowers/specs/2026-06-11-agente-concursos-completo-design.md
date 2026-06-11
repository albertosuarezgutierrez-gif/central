# Diseño — Agente de concursos públicos (completo)

> **Spec norte.** Captura la visión end-to-end del agente de concursos
> (`packages/module-concursos`) y la descompone en fases F2–F7. Cada fase es un PR
> aislado con sus tests; este documento es el contrato que las une. El **v1**
> (análisis de pliego + Go/No-Go, PR #116) ya está en `main`; aquí se diseña todo
> lo que falta para pasar de *"analiza"* a *"prepara y presenta"*.

Fecha: 2026-06-11 · Rama: `claude/public-tender-agent-module-mid0hu` · Módulo: `packages/module-concursos`

---

## 1. Principio invariante (heredado del v1)

El módulo es **TS puro y portable**: no conoce ninguna BD, ningún proveedor de IA
ni secretos. Cualquier vertical (limpieza, catering, fontanería…) lo consume para
que su cliente, de **cualquier sector**, se presente a concursos públicos (LCSP,
Ley 9/2017). Todo I/O sale de la app por **tres puertos**; el módulo nunca los importa:

| Puerto | Quién lo respalda | Para qué |
|---|---|---|
| `AiRunner = (system, user) => Promise<string>` | `core-ai` (ya existe) | Extracción y redacción por LLM |
| **fetch PLACSP** | la app (HTTP) | Radar de concursos nuevos (F7) |
| **OCR + Storage** | la app (Storage de Supabase + OCR) | Texto de PDFs escaneados y ficheros de la biblioteca |

La app (ialimp como **integración de referencia**) persiste las salidas del módulo
scopeadas por `empresa_id`, hace la I/O y renderiza la UI. Cada fase deja sus tests
`node --test` en verde, igual que los 28 del v1.

## 2. Estructura del módulo (cómo crece)

Cada subsistema es **un archivo puro con una frontera clara** dentro de `src/`.
Estado actual + lo que añade cada fase:

```
packages/module-concursos/src/
  types.ts        ✅ v1   (+ tipos nuevos por fase: Biblioteca, DEUC, Memoria, Oferta, Radar)
  agent.ts        ✅ v1   analizarPliego / analizarConcurso (LLM por puerto)
  prompts.ts      ✅ v1
  parsing.ts      ✅ v1
  checklist.ts    ✅ v1   derivarChecklist
  redflags.ts     ✅ v1   evaluarGoNoGo
  scoring.ts      ✅ v1   garantías, baja temeraria, puntuación económica
  biblioteca.ts   ▢ F2   autocompletado del checklist desde la biblioteca
  deuc.ts         ▢ F3   sobre administrativo + DEUC (datos)
  memoria.ts      ▢ F4   plan + redacción + autoevaluación de la memoria técnica
  oferta.ts       ▢ F5   oferta óptima + margen (cruza module-contabilidad)
  presentacion.ts ▢ F6   estado de los sobres + plazos/subsanación
  radar.ts        ▢ F7   matching de licitaciones contra el perfil
```

`index.ts` re-exporta cada API nueva. Las funciones puras nuevas no rompen las
existentes (solo añaden).

---

## 3. Fases

### F2 — Biblioteca de empresa *(piedra angular)*

Repositorio reutilizable de los datos y documentos del licitador. Convierte el v1
(*analiza*) en un agente que *prepara*: subes tus papeles **una vez** y cada concurso
se autocompleta. F3, F4 y F6 leen de aquí.

**Puro (`biblioteca.ts` + tipos):**
```ts
type TipoDocumentoBiblioteca =
  | 'escritura_constitucion' | 'poderes' | 'cif'
  | 'certificado_aeat' | 'certificado_ss'          // estar al corriente
  | 'cuentas_anuales' | 'seguro_rc'
  | 'clasificacion_empresarial' | 'certificado_iso'
  | 'declaracion_responsable' | 'deuc' | 'otro'

interface DocumentoBiblioteca {
  tipo: TipoDocumentoBiblioteca
  nombre: string
  vigencia_hasta?: string        // ISO YYYY-MM-DD, si caduca
  datos?: Record<string, unknown> // metadatos estructurados (p.ej. nº póliza)
  // la app guarda aparte el storage_key del fichero
}
type Biblioteca = DocumentoBiblioteca[]

// marca hecho=true los ítems del checklist que la biblioteca cubre (match por tipo)
autocompletarChecklist(checklist: ItemChecklist[], biblioteca: Biblioteca): ItemChecklist[]
// qué documentos del concurso no cubre la biblioteca todavía
documentosFaltantes(ficha: FichaConcurso, biblioteca: Biblioteca): DocumentoRequerido[]
// documentos caducados o que caducan antes del fin de plazo
documentosCaducados(biblioteca: Biblioteca, hoy: string, limite?: string): DocumentoBiblioteca[]
```
El **mapeo documento-requerido → tipo de biblioteca** es una tabla pura (heurística
por nombre/palabras clave del `DocumentoRequerido.nombre`), auditada por tests.

**App (ialimp ref):** tabla `biblioteca_documentos` (`empresa_id`, `tipo`,
`storage_key`, `vigencia_hasta`, `datos` jsonb) + bucket de Storage; página
"Mi biblioteca" (subir/listar/avisar caducidades); en `/admin/concursos` el checklist
llega ya autocompletado y marca lo que falta.

### F3 — Sobre administrativo + DEUC

Genera el **Sobre 1** (administrativo) tirando de la biblioteca, incluido el **DEUC**
(Documento Europeo Único de Contratación) y la declaración responsable.

**Puro (`deuc.ts`):**
```ts
// lista ordenada del Sobre 1, indicando qué doc de biblioteca cubre cada requisito
documentosSobreAdministrativo(ficha, biblioteca): { requerido: DocumentoRequerido;
                                                    cubiertoPor?: DocumentoBiblioteca }[]
// estructura de datos del DEUC rellena desde el perfil + la ficha (Partes I–VI)
construirDEUC(perfil: PerfilEmpresa, ficha: FichaConcurso): DEUC
// declaración responsable (art. 140 LCSP) como datos
construirDeclaracionResponsable(perfil, ficha): DeclaracionResponsable
```
El módulo produce **datos**; la app los renderiza al formato oficial (PDF/XML CODICE)
y empaqueta el sobre.

### F4 — Memoria técnica que puntúa

Redacta la memoria técnica (Sobre 2) **orientada a los criterios de juicio de valor**
del pliego para maximizar puntos.

**Puro (`memoria.ts`):**
```ts
// de los criterios tipo 'juicio_valor' deriva el guion: secciones con su peso en puntos
planMemoriaTecnica(ficha: FichaConcurso): SeccionMemoria[]
// borrador de una sección vía LLM (puerto), con el contexto/diferenciales de la empresa
redactarSeccion(runner: AiRunner, seccion: SeccionMemoria, contexto: ContextoEmpresa): Promise<string>
// autoevaluación: puntuación estimada por sección + huecos detectados
evaluarMemoria(runner: AiRunner, texto: string, criterios: CriterioValoracion[]): Promise<EvaluacionMemoria>
```
**App:** persiste borradores por sección, permite editar y exporta a documento.

### F5 — Oferta económica + rentabilidad *(cruza `module-contabilidad`)*

Propone el **precio óptimo**: el que maximiza la puntuación económica **sin caer en
baja temeraria y manteniendo margen**. Reutiliza `umbralBajaTemeraria` y
`calcularPuntuacionEconomica` del v1.

**Puro (`oferta.ts`):**
```ts
interface Costes { directos: number; indirectos: number } // vienen de module-contabilidad
margenOferta(precio: number, costes: Costes): { margen: number; margen_pct: number }
// barre el rango [coste, presupuestoBase] y devuelve el precio que maximiza
// puntosEconomicos respetando umbral temeraria y margen_min
ofertaOptima(args: {
  presupuestoBase: number; costes: Costes; formula: FormulaEconomica
  puntosMax: number; ofertasEsperadas?: number[]; margenMinPct?: number
}): { precio: number; puntos: number; margen_pct: number; avisos: string[] }
```
El cruce con `module-contabilidad` lo hace la **app** (le pasa los costes ya calculados);
el módulo de concursos no importa al de contabilidad — ambos puros, unidos en la app.

### F6 — Presentación + plazos/subsanación

Empaqueta los tres sobres y vigila el calendario.

**Puro (`presentacion.ts`):**
```ts
// % completado por sobre + lista de bloqueantes que impiden presentar
estadoPresentacion(checklist: ItemChecklist[], sobres: EstadoSobre[]): ResumenPresentacion
// cuenta atrás y alertas a partir de los plazos de la ficha
proximosHitos(plazos: PlazosConcurso, hoy: string): Hito[]
// ítems que, si faltan, son subsanables vs. excluyentes
itemsSubsanables(checklist: ItemChecklist[]): { subsanables: ItemChecklist[]; excluyentes: ItemChecklist[] }
```
**App + sinergia:** los avisos de plazo se emiten por el **módulo de comunicación
multinegocio** (F0 recién mergeado): *fin de plazo de un concurso → notificación a la
persona/rol del negocio responsable*.

### F7 — Radar PLACSP + OCR

Descubre concursos nuevos relevantes para el perfil y digiere pliegos escaneados.

**Puro (`radar.ts`):**
```ts
interface Licitacion { id: string; objeto: string; cpv: string[]; importe?: number; ambito?: string; url: string }
interface PerfilRadar { cpv: string[]; importe_min?: number; importe_max?: number; ambitos?: string[] }
// puntúa/filtra las licitaciones del feed según el perfil (match CPV + importe + ámbito)
filtrarRelevantes(licitaciones: Licitacion[], perfil: PerfilRadar): { licitacion: Licitacion; score: number }[]
```
**App:** lee el feed de **sindicación de datos abiertos de PLACSP**, normaliza a
`Licitacion[]`, persiste y alerta (cron + módulo de comunicación). El **OCR** para PDFs
escaneados vive en la app (el módulo sigue recibiendo texto plano, sin cambios en el v1).

---

## 4. Datos y persistencia (lado app, ialimp ref)

- Existe ya: tabla `concursos` (jsonb `ficha`/`checklist`/`go_no_go`/`garantias`).
- F2: tabla `biblioteca_documentos` + bucket Storage.
- F3–F6: ampliar `concursos` con columnas jsonb `sobre_administrativo`, `deuc`,
  `memoria` (borradores), `oferta`, `presentacion`.
- F7: tabla `licitaciones_radar` (feed PLACSP cacheado) + `perfil_radar` por empresa.

Todas scopeadas por `empresa_id`. Migraciones como `prisma/migrations/*.sql`
(se aplican a mano en la BD compartida, como el v1).

## 5. Errores y casos límite

- **Extracción incompleta:** el LLM puede no encontrar un campo → el módulo lo deja
  `undefined` y añade a `avisos`; nunca inventa. Ya es el contrato del v1.
- **Biblioteca sin cobertura:** `documentosFaltantes` siempre devuelve lo no cubierto;
  el checklist nunca se marca `hecho` por inferencia dudosa (match conservador).
- **Caducidades:** `documentosCaducados` compara contra `fin_presentacion`, no contra hoy,
  para avisar de lo que caducará *antes* de presentar.
- **Oferta:** si `coste > presupuestoBase` o no hay margen posible, `ofertaOptima`
  devuelve el mínimo viable con un aviso "sin margen / revisar Go-No-Go".
- **Radar:** feed PLACSP caído o vacío → la app degrada a "sin novedades"; el módulo
  con `[]` devuelve `[]`.

## 6. Testing

Cada fase añade su bloque a `test/concursos.test.ts` (o un archivo por fase) con
`node --test`, sin red ni BD: funciones puras con fixtures. El `AiRunner` se mockea
(función que devuelve un JSON fijo), igual que en el v1. Criterio de cierre por fase:
build de ialimp en verde + tests del módulo en verde + integración de referencia
navegable.

## 7. Orden de implementación

**F2 → F3 → F4 → F5 → F6 → F7.** F2 desbloquea F3/F4/F6. Cada fase es un PR borrador
aislado. Este spec es el norte; cada fase tendrá su plan de implementación propio
(skill `writing-plans`) cuando se arranque.

## 8. Fuera de alcance (YAGNI por ahora)

- Firma electrónica / presentación telemática real en PLACSP (la app solo deja el
  paquete *listo para subir*; subirlo lo hace la persona).
- Portales autonómicos distintos de PLACSP (se contempla en el matching de F7 vía
  `ambito`, pero el feed concreto es trabajo futuro).
- Multi-idioma de la memoria técnica (castellano primero).
