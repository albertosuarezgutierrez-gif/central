# Concursos — Buscador de pliegos (oportunidades por sector) · Design

> Fecha: 2026-06-11 · Estado: aprobado por Alberto ("genial empieza").
> Evolución natural del Radar (F7): de "push" (alertas) a "pull" (buscar a demanda).
> Hermano del radar: misma fuente y motor, distinta forma de consumo.

## Objetivo

Que el cliente entre y **busque/explore las licitaciones abiertas de su sector** a demanda,
con filtros, en vez de esperar a que el radar le avise. "Concursos para mí, ahora mismo."

## Por qué (decisión de arquitectura)

PLACSP **no tiene API de búsqueda**: solo publica el feed ATOM completo. El Radar funciona
porque solo mira lo *nuevo/reciente* y lo filtra contra criterios guardados. Para un buscador
on-demand hace falta **un índice propio**: una tabla-corpus con todas las licitaciones vigentes,
que un cron rellena, y sobre la que se busca con SQL/full-text.

**Esto unifica el sistema:** una sola ingestión alimenta dos consumidores —el **buscador** (pull)
y el **radar/alertas** (push)— que pasan a ser dos vistas del mismo corpus. Una búsqueda guardada
*es* un criterio de radar.

Todo es **dato público y gratis** (sin claves). Fuente del MVP: **PLACSP** (la más completa; ya
tenemos el parser). El **BOE** (también público, XML diario más ligero) queda como **fuente
complementaria de fase 2** (su propio parser, mismo corpus).

## Filtros (estudiados sobre los buscadores oficiales PLACSP/BOE)

Es un buscador de **oportunidades para licitar** (no de adjudicaciones pasadas), así que se prioriza
lo que sirve para decidir si presentarse. Todos los campos del MVP están en el dato abierto.

**Imprescindibles (MVP):**
1. **Sector / CPV** (el filtro rey): por prefijo de familia + selección múltiple.
2. **Texto libre** sobre objeto/título (full-text de Postgres).
3. **Estado = en plazo** (por defecto): solo lo que aún se puede presentar (`fin_presentacion >= hoy`).
4. **Lugar de ejecución / provincia**.
5. **Presupuesto** (rango min–max).
6. **Fecha fin de presentación** (sobre todo como **orden**: "cierran antes").

**Orden:** *relevancia* (CPV+texto vía `coincideRadar`), *cierran antes* (urgencia), *mayor presupuesto*.

**Secundarios (fase 2):** tipo de contrato, procedimiento, órgano/Administración, financiación UE.
**Descartados** (son de análisis post-adjudicación): adjudicatario, baja, competencia.

**Puente con el radar:** botón **"Guardar esta búsqueda como alerta"** → vuelca los filtros a los
criterios del radar existente (`radar_*` de `concursos_perfil_empresa`).

## Arquitectura

```
cron ingesta ──► parsearAtomPlacsp (ampliado) ──► upsert a concursos_licitaciones (corpus compartido)
                                                          │
                         ┌────────────────────────────────┴───────────────┐
                   Buscador (pull)                                   Radar (push, ya existe)
            GET /radar/buscar  (filtros + FTS + orden)        cron alertas sobre criterios guardados
```

- **Corpus** = tabla `concursos_licitaciones` (NO por empresa; es el catálogo público). Upsert por
  `dedupe_key` (idempotente). Se filtra "en plazo" en la consulta; opcional purga de vencidos.
- **Parser**: se amplía `parsearAtomPlacsp` para extraer, además de lo actual, **lugar/provincia,
  estado, fin_presentacion y tipo_contrato** (campos CODICE). Sigue **puro y testeable**.
- **Buscador**: endpoint que traduce filtros → SQL (`$queryRaw` con `Prisma.sql` componible) +
  `to_tsvector/plainto_tsquery` para el texto; ordena según el modo elegido.
- El **radar actual no se toca** en este MVP (sigue con su cron y su tabla de matches). Unificar
  radar↔corpus es una mejora posterior; ahora se añade el corpus + buscador de forma aditiva.

## Datos (migración — la aplica Alberto)

`apps/ialimp/prisma/migrations/add_concursos_licitaciones.sql`:
```sql
create table if not exists concursos_licitaciones (
  id uuid primary key default gen_random_uuid(),
  dedupe_key text not null unique,
  titulo text not null,
  objeto text,
  cpv text[] not null default '{}',
  presupuesto numeric,
  organo text,
  provincia text,
  tipo_contrato text,
  estado text,
  fin_presentacion date,
  url text,
  fuente text not null default 'placsp',
  fts tsvector,
  actualizado_en timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_lic_fin on concursos_licitaciones (fin_presentacion);
create index if not exists idx_lic_cpv on concursos_licitaciones using gin (cpv);
create index if not exists idx_lic_fts on concursos_licitaciones using gin (fts);
```
El `fts` se rellena en el upsert con `to_tsvector('spanish', titulo || ' ' || coalesce(objeto,''))`.

## Endpoints

- `GET /api/admin/concursos/radar/buscar` — params: `cpv` (csv, por prefijo), `q` (texto),
  `en_plazo` (1 por defecto), `provincia`, `presupuesto_min/max`, `orden` (`relevancia|cierre|presupuesto`),
  `page`. Devuelve `{ resultados, total }`. Auth `requireEmpresaId` (logueado; el corpus es común).
- `GET /api/cron/concursos-ingesta` — cron: descarga ATOM (paginado, tope), `parsearAtomPlacsp`,
  upsert masivo al corpus (`ON CONFLICT (dedupe_key) DO UPDATE`). Sin secreto (Vercel cron). En
  `vercel.json`, cada 6 h (desfasado del cron de radar). `maxDuration` holgado.
- (Reutiliza) `PUT /api/admin/concursos/radar/criterios` para "guardar como alerta" desde el buscador.

## UI

Sub-página/sección **"🔎 Buscar concursos"** en `/admin/concursos` (white-label `var(--brand-*)`):
- Barra de búsqueda (texto) + filtros: CPV (chips), provincia (select), presupuesto min/max,
  toggle "Solo en plazo" (on por defecto), selector de orden.
- Resultados: tarjeta por licitación (título, órgano, provincia, presupuesto, días para cierre,
  CPV, enlace al anuncio). Paginación.
- Botón **"Guardar esta búsqueda como alerta"** → PUT a criterios del radar con los filtros actuales.

## Tests (lo puro/testeable, `node --test`)

- `parsearAtomPlacsp` ampliado: el fixture pasa a incluir `provincia`, `estado`,
  `fin_presentacion`, `tipo_contrato`; tests que comprueban su extracción (y tolerancia a ausencia).
- (El endpoint/cron/UI se validan con build + preview, como en el radar.)

## Fuera de alcance (fase 2)

- **BOE** como fuente adicional (parser de su XML diario → mismo corpus).
- Unificar el radar para que lea del corpus (búsquedas guardadas en vez de su cron propio).
- Filtros secundarios (tipo contrato, procedimiento, órgano, financiación UE).
- Purga programada de licitaciones vencidas.

## Pendiente de Alberto (ops)

- Aplicar `add_concursos_licitaciones.sql` en Supabase.
- (Opcional) `PLACSP_FEED_URL` ya existe del radar; el cron de ingesta reutiliza la misma fuente.
