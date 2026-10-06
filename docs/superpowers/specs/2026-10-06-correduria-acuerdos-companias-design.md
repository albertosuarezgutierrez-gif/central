# Acuerdos con compañías y productividad por compañía — spec de diseño (06/10/2026)

> Modo arquitectura: solo diseño. Nada implementado, nada migrado. Medido contra la BD real
> (`wswbehlcuxqxyinousql`) y el código de `main` en `616f54543`.
> Contexto leído: `docs/CORREDURIA-CRM-VISION.md`, `CLAUDE.md` raíz, `apps/asegura/CLAUDE.md` (puerto),
> `apps/plataforma/CLAUDE.md` (libro de comisiones, secciones).
> PRs abiertos: ninguno toca compañías, comisiones ni productividad (el #4183, de duplicados vivos, no se
> cruza con esto).
> ⚠️ El grafo propio (`grafo_*`) **no existe en este proyecto Supabase**: solo están
> `grafo_embed_textos`/`grafo_guardar_clave`. La localización se ha hecho con grep acotado.
>
> 🔁 **Revisión del 06/10/2026, tarde (aprobado por Alberto, fase 1 implementada).** Tres cambios:
> 1. **UI: NO hay pestaña nueva.** Todo lo de compañías (contactos, claves, acuerdos y productividad)
>    se unifica en el bloque/página de compañías que ya existe (`Companias.tsx` y `/correduria/companias`).
>    §4 y §6 reescritos.
> 2. **El análisis de §0.2 se hizo sobre una copia local atrasada.** En `main` ya estaba el PR #3903
>    (28/09/2026): `seguros.comision_pactada` SÍ tiene SQL en el repo
>    (`apps/asegura/prisma/sql/2026-09-28c_comision_pactada.sql`) y consumidor (`lineasComision()` en
>    `packages/module-seguros/src/comision-pactada.ts`, puerto `GET /api/operador/comisiones-pactadas`,
>    bloque `ComisionesPactadas.tsx` en «Datos»). §0.2, §1 y §6 corregidos: el modelo nuevo es el
>    SUPERCONJUNTO de esa tabla y la absorbe por fases, sin dejar dos fuentes de verdad para siempre.
> 3. **El PDF de APROMES es de uso privado para asociados y prohíbe divulgarlo: sus cifras NO entran en
>    el repo.** Se cargan con `scripts/cargar-acuerdos.mts --apromes` desde un JSON FUERA del repo (§5).

---

## 0. Lo que hay que saber antes de leer el resto (hallazgos que cambian el diseño)

1. **La «pestaña Compañías» no existe todavía.** Hoy hay dos cosas:
   - el bloque `Companias.tsx`, montado dentro de la sección **Datos** de `CorreduriaClient.tsx` (línea ~583);
   - la página `/correduria/companias` (`companias/page.tsx`), que es solo un directorio de contactos.

   `SECCIONES` (`secciones.ts`) son `hoy · actividad · clientes · cartera · comisiones · datos · ingesta ·
   redes`. ~~Hay que crear la pestaña, no rellenarla.~~ **Decisión de Alberto (06/10/2026): no se crea
   pestaña; todo se unifica en `Companias.tsx` + `/correduria/companias`** (§4).
2. **Ya existe `seguros.comision_pactada` (PR #3903, 28/09/2026), con 7 filas y consumidor.**
   ~~Sin consumidor en el repo~~ (corregido: el primer análisis leyó una copia atrasada).
   - SQL: `apps/asegura/prisma/sql/2026-09-28c_comision_pactada.sql`. Clave de cruce: `producto` =
     `polizas.datos_especificos.producto.ramoEntidad` (Allianz 1434 = RC PYME), `modalidad`, `acuerdo`
     (`'directo'` o nombre de la asociación), `pct_nueva`/`pct_cartera` **NOT NULL**, `vigente_desde`.
   - Consumidor: `lineasComision()`/`pctRecibo()`/`TOLERANCIA_PUNTOS` (0,5 puntos) en
     `packages/module-seguros/src/comision-pactada.ts`; puerto `GET /api/operador/comisiones-pactadas`
     (`apps/asegura/lib/comisiones-pactadas.ts`); bloque «Comisiones por compañía»
     (`ComisionesPactadas.tsx`) en la sección Datos.
   - Que `crm_seguros` tenga DML sobre ella **no prueba que el CRM de Manuel la use**: se lo dan los
     *default privileges* del schema `seguros` a TODA tabla nueva (medido: `prisma_seguros=arwd`,
     `crm_seguros=arwd`, `backup_seguros=r`). Por eso la migración nueva lo REVOCA en sus tablas.
   - Lo que le falta frente a la forma del dato de APROMES: ramo canónico, % desconocido (NULL), clave
     por la que se produce, objetivos/rappels, requisitos, letra pequeña y el estado «sin cotejar». El
     modelo nuevo (§2) es su superconjunto; la absorción va en §6 (F2).
3. **Cada póliza de CIMA trae la CLAVE con la que se produjo:** `polizas.datos_especificos->'mediador'->>'codigoInterno'`,
   y casi todos los recibos también la llevan en `datos_extra->'mediador'`. Medido sobre la cartera en vigor:

   | Compañía | Códigos que manda CIMA |
   |---|---|
   | Mapfre | `5239640` |
   | Allianz | `209-A/0018638/0000`, `209-C/…`, `209-E/…` (3 pólizas sin código) |
   | Occident | `M00171` y `8-92361` |
   | Generali | `65792` (en la póliza; sus 23 recibos de 2026 no traen el código) |
   | Reale | `38605` |

   **Esta es la pieza que hace posible medir la productividad POR ACUERDO.** Un acuerdo de APROMES
   paga por lo que se produce con la clave de APROMES, no por lo que ya tenía con su clave directa.
   Por eso el modelo gira alrededor de la clave, no solo de la compañía.
4. **CIMA ya trae la comisión APLICADA en cada recibo** (`poliza_recibos.comision_bruta` y `prima_neta`,
   en TEXT). Las tasas reales son limpias y estables. Medido sobre los recibos cobrados desde el 01/10/2025:

   | Compañía | Tasas reales |
   |---|---|
   | Mapfre | auto 10,0 % · hogar entre 15 y 20 % · RC 18,5 % |
   | Generali | auto 12 % · hogar 25 % · decesos 5 % |
   | Allianz | auto NP 12-14 % · auto cartera 10-13 % |
   | Occident | hogar 22-25 % · RC 11-15 % |
   | Reale | auto NP 12,5 % |

   Esto permite conciliar **recibo a recibo** lo pactado contra lo aplicado. Es más útil que el cuadre
   agregado, porque dice qué ramo está mal pagado.
5. **Allianz: 14 de sus 16 pólizas en vigor tienen `prima_anual`/`prima_bruta` a 0 o NULL**, pero sus
   recibos sí traen `prima_neta`. **La producción se mide sobre RECIBOS, no sobre la prima de la póliza.**
6. **`companias_dgs` es un catálogo GLOBAL (sin `correduria_id`) y aun así guarda `clave_mediador`,** que
   es un dato del tenant. Además, la clave de **Pelayo es `28823484E`, que tiene forma de NIF**, cuando el
   encargo dice que con Pelayo no hay clave. No se migra como clave: se marca para que Alberto lo revise.
7. **El libro de comisiones vive en `public` de plataforma** (`comisiones_devengo` y `comisiones_cobertura`,
   con `cuenta_id`). Lo alimenta el cron `cima-liq` desde el puerto `/api/operador/comisiones`. Tiene
   tres ejes: devengado según CIMA, liquidado y banco. **Lo nuevo añade un eje ANTES: lo pactado.** No
   sustituye a ninguno.
8. Cifras de la cartera en vigor medidas hoy (`sqlCarteraEnVigor`): **107 pólizas en 5 compañías**.

   | Compañía | Pólizas | Clientes | Prima | NP 2026 |
   |---|---|---|---|---|
   | Occident | 47 | 34 | 18.308,03€ | 4 |
   | Mapfre | 29 | 27 | 17.429,47€ | 2 |
   | Allianz | 16 | 13 | 742,68€ (14 sin prima) | 6 |
   | Generali | 13 | 13 | 10.920,54€ | 0 |
   | Reale | 2 | 2 | 494,20€ | 1 |

   El volumen es pequeño: la pantalla tiene que ser útil con 13 nuevas producciones al año, no con miles.

---

## 1. Lo que ya existe y se reutiliza

| Pieza | Dónde | Uso en este diseño |
|---|---|---|
| Catálogo de compañías | `seguros.companias_dgs` (15 filas; PK `codigo_dgs`) · modelo `CompaniaDgs` en `apps/asegura/prisma/asegura.prisma:635` | FK de todo lo nuevo. Se queda como catálogo global |
| Contactos por compañía | `seguros.compania_contactos` (35) · `GET /api/operador/companias` · `lib/companias-asegura.ts` · `useCompanias.ts` · `ContactoAcciones.tsx` · `TarjetaContacto` de `companias/page.tsx` | Contactos de la ficha. Se añade solo la columna `fuente` (ver §2) |
| Cuadro de comisiones pactado (PR #3903) | `seguros.comision_pactada` (7) · `comision-pactada.ts` (`lineasComision`, `pctRecibo`, `TOLERANCIA_PUNTOS`) · `GET /api/operador/comisiones-pactadas` · `ComisionesPactadas.tsx` | Sus 7 filas van al seed directo (cepo de igualdad). En F2 el lector pasa a las tablas nuevas y la tabla se retira; F4 reutiliza `pctRecibo` y `TOLERANCIA_PUNTOS` en vez de otra tolerancia |
| Recibos con comisión aplicada | `seguros.poliza_recibos` (464): `clase_recibo` NP/CA/SU, `situacion`, `prima_neta`, `comision_bruta`, `fecha_efecto_actual`, `datos_extra.mediador` | Base de la producción y de la conciliación |
| Clave por póliza | `polizas.datos_especificos.mediador.codigoInterno` | Atribuye la producción a una clave y, por tanto, a un acuerdo |
| Lectura de importes EIAC | `importeEiac` / `sumarImportesEiac` de `@central/module-seguros` | Para leer importes. Un importe ilegible se cuenta aparte, nunca como 0 |
| Cartera viva y en vigor | `sqlCarteraViva` / `sqlCarteraEnVigor` en `packages/module-seguros/src/cartera-viva.ts` | Ver §3.1 para cuál se usa en cada cifra |
| Ramos | enum `seguros.tipo_seguro` + `RAMOS`/`etiquetaRamo` de `filtro-cartera.ts` | Ramo canónico de cada línea del acuerdo |
| Libro de comisiones | `public.comisiones_devengo` y `public.comisiones_cobertura` · `CuadreComisiones.tsx` · `lib/correduria/cuadre.ts` · `/api/correduria/comisiones` | La ficha de compañía enlaza a su fila del libro. No se duplica el cuadre devengado → liquidado → banco |
| Correduría única | `correduriaUnica()` en `apps/asegura/lib/cartera.ts:434` | `correduriaId` de cada lectura y escritura del puerto |
| Clasificador de errores del puerto | `apps/asegura/lib/error-cartera.ts` | Todo `error` lleva su causa |
| Rastro de cambios no ligados a un cliente | `seguros.operational_events` (`event_name`, `payload`, `correduria_id`) | Rastro de la edición de acuerdos. `historial_interno` exige `cliente_id NOT NULL` y aquí no sirve |
| Armazón de la pantalla | `secciones.ts` / `Secciones.tsx` / `Bloque.tsx` / `onContador` / `eur()` | El bloque `Companias.tsx` y la ficha de compañía (sin pestaña nueva, §4) |
| Autorización del corredor | `exigirCorreduria()` de plataforma · `operadorAutorizado()` de asegura | Sin cambios |

---

## 2. Modelo de datos

### 2.1 Principios

- Todo en el schema **`seguros`**. Escribe **solo `apps/asegura`** (`prisma_seguros`). Plataforma lee y
  escribe por el puerto, como el resto de la correduría.
- **Todas las tablas nuevas llevan `correduria_id NOT NULL`**, aunque hoy haya una sola correduría. Con
  BYPASSRLS el aislamiento lo da el código: cada consulta filtra por `correduriaUnica().id`.
- **Grants:** DML para `prisma_seguros`; `SELECT` para `backup_seguros`.
  - **Nada para `crm_seguros`**: el CRM de Manuel no tiene por qué ver los acuerdos comerciales de
    Alberto. Dárselo sería ampliar la superficie sin consumidor.
  - **Nada para `prisma_asegura_portal`.**
  - RLS activado y sin políticas, como `comision_pactada`: corta PostgREST y no afecta a `prisma_seguros`.
- **Un porcentaje NULL significa «el acuerdo no lo dice o no se extrajo».** Nunca 0 %. Un 0 explícito es
  un dato: «este ramo no comisiona».

### 2.2 Tablas

```
seguros.claves_mediador                       ← la clave es del TENANT, no de la compañía
  id uuid PK
  correduria_id uuid NOT NULL
  compania_codigo_dgs varchar(16) NOT NULL → companias_dgs
  estado text NOT NULL  CHECK in ('activa','solicitada','sin_clave','baja')
  canal  text NOT NULL  CHECK in ('directo','asociacion','colaboracion')
  asociacion text NULL                        -- 'APROMES' cuando canal = asociacion
  codigos_cima text[] NOT NULL DEFAULT '{}'   -- tal como los manda CIMA: '209-C/0018638/0000', 'M00171'…
  etiqueta text NULL                          -- '18638', 'M00171' (lo que Alberto reconoce)
  fecha_alta date NULL, fecha_baja date NULL  -- NULL = no consta (≠ «hoy»)
  notas text NULL
  created_at, updated_at
  UNIQUE (correduria_id, compania_codigo_dgs, etiqueta)
  -- Un mismo código CIMA no puede estar en dos claves del mismo tenant. Se
  -- garantiza en código, porque un EXCLUDE sobre text[] cuesta más que lo que aporta.

seguros.acuerdos_compania                     ← cabecera: una por compañía × fuente × vigencia
  id uuid PK
  correduria_id uuid NOT NULL
  compania_codigo_dgs varchar(16) NOT NULL
  fuente text NOT NULL CHECK in ('apromes','directo','otra_asociacion')
  fuente_nombre text NULL                     -- nombre de la otra asociación
  clave_id uuid NULL → claves_mediador        -- por qué clave paga. NULL = clave aún no abierta / sin decidir
  vigencia_desde date NOT NULL
  vigencia_hasta date NULL                    -- NULL = el documento no da fin (se pinta «sin fecha de fin»)
  requisitos_apertura text NULL
  letra_pequena text NULL
  documento_fuente text NOT NULL              -- 'Condiciones_2026_Aseguradoras_mayo.pdf, p. 14'
  revisado_at timestamptz NULL                -- NULL = extracto sin cotejar con el PDF (§5)
  created_at, updated_at
  UNIQUE (correduria_id, compania_codigo_dgs, fuente, vigencia_desde)

seguros.acuerdo_comisiones                    ← líneas: ramo × % NP × % cartera
  id uuid PK
  acuerdo_id uuid NOT NULL → acuerdos_compania ON DELETE CASCADE
  ramo seguros.tipo_seguro NULL               -- NULL = no se ha podido mapear: se pinta, no se usa para calcular
  ramo_texto text NOT NULL                    -- literal del acuerdo: 'Hogar Plus', 'Auto 1ª cat.'
  producto text NULL, modalidad text NULL     -- afinan cuando hay varias líneas del mismo ramo (RC PYME)
  pct_np numeric(5,2) NULL
  pct_cartera numeric(5,2) NULL
  notas text NULL

seguros.acuerdo_objetivos                     ← rappel, mantener la clave y requisito de apertura, una sola forma
  id uuid PK
  acuerdo_id uuid NOT NULL → acuerdos_compania ON DELETE CASCADE
  tipo text NOT NULL CHECK in ('rappel','mantener_clave','apertura')
  ambito text NOT NULL CHECK in ('individual','colectivo')  -- colectivo = cuenta toda APROMES
  base text NOT NULL CHECK in ('primas_np','primas_cartera','primas_total',
                               'polizas_np','crecimiento_pct','otra')
  criterio_cobro text NULL CHECK in ('cobradas','emitidas')  -- NULL = el doc no lo dice
  ramos seguros.tipo_seguro[] NOT NULL DEFAULT '{}'  -- vacío = todos (Prisma no admite listas NULL)
  periodo_desde date NOT NULL, periodo_hasta date NOT NULL
  tramos jsonb NOT NULL                       -- [{desde, hasta|null, pct|null, importe|null}]
  siniestralidad_max_pct numeric(5,2) NULL
  condiciones text NULL                       -- lo que no cabe en lo estructurado
```

Además:

- **`seguros.compania_contactos`**: añadir `fuente text NULL` (`'apromes'`, `'correo'`…). Es una columna
  nullable: no rompe a ningún lector y conserva los 35 contactos que ya hay.
- **Colaboradas** (fase 6, tabla aparte): `seguros.produccion_colaborada`.
  - Columnas: `correduria_id`, `compania_codigo_dgs`, `correduria_colaboradora`, `cliente_id NULL`,
    `numero_poliza`, `ramo`, `fecha_efecto`, `prima_neta`, `pct_cesion`, `cuenta_para_objetivos boolean NULL`,
    `clave_id NULL`, `notas`.
  - **No se meten en `polizas`, y es a propósito.** Una fila manual en `polizas` nace con
    `import_ref IS NULL`, y `esCarteraViva()` la contaría como cliente de CIMA. Es la trampa más cara del
    diseño.
  - `cuenta_para_objetivos NULL` significa que no cuenta y que se dice así.

### 2.3 Por qué tramos en jsonb y no en tabla hija

Son 1-5 tramos por objetivo, nunca se consultan por separado y siempre se leen con su objetivo.
Lo que asegura la forma es un validador puro, `leerTramos()` en `@central/module-seguros`, con test:

- un tramo mal formado hace el objetivo **no calculable**; no se ignora;
- un `pct` NULL es «no consta»;
- los tramos tienen que estar ordenados y no solaparse.

### 2.4 Dónde vive cada cosa

| Capa | Pieza |
|---|---|
| BD | Migración `apps/asegura/prisma/sql/2026-10-XX_acuerdos_companias.sql` (tablas, checks, índices `(correduria_id, compania_codigo_dgs)`, grants, RLS) + modelos en `apps/asegura/prisma/asegura.prisma` |
| Reglas puras | `packages/module-seguros/src/acuerdos.ts` (+ `.test.ts`): tipos, `leerTramos`, `atribuirClave`, `lineaAplicable`, `esperadoRecibo`, `medirObjetivo`, `semaforoObjetivo`, `proyectar` |
| Lectura y cálculo | `apps/asegura/lib/acuerdos.ts`: lee los acuerdos y los recibos y llama al módulo. **El cálculo se hace en asegura**, que es quien tiene los recibos; los recibos no cruzan el puerto en bruto |
| Puerto | `GET /api/operador/companias/acuerdos` (acuerdos, líneas, objetivos y claves) · `GET /api/operador/companias/productividad?compania=&desde=&hasta=` (cifras y semáforos ya calculados, más la lista de discrepancias paginada) · `POST/PATCH/DELETE /api/operador/companias/acuerdo` (fase 5) |
| Plataforma | `lib/acuerdos-asegura.ts` (interpretar + red, mismo patrón que `companias-asegura.ts`) · proxy `app/api/correduria/companias/acuerdos/route.ts` y `…/productividad/route.ts` · sección nueva · ficha `app/(usuario)/correduria/companias/[codigo]/page.tsx` |

**El puerto conserva los tres estados en cada respuesta:** `sin_configurar` / `error` con su `causa` / `ok`.
Dentro de `ok`, cada cifra trae su propio estado (§3.4).

---

## 3. Cálculo de la productividad

### 3.1 Universo de recibos y por qué no es `esCarteraEnVigor`

- **La producción de un periodo** se mide sobre **recibos** cuya póliza es **cartera viva por origen**
  (`sqlCarteraViva`), no sobre la cartera en vigor.
  - El motivo es que la producción pregunta **qué se produjo**. Una póliza nueva de marzo que se canceló
    en septiembre produjo en marzo, y la compañía la cuenta (con su extorno). Filtrar por «en vigor hoy»
    reescribiría el pasado.
  - Es el mismo criterio que ya usan gemelas y siniestros: lo que pregunta por el origen va por
    `esCarteraViva()`.
- **La cartera de hoy** (pólizas en vigor por compañía y su prima anual, y la base de la proyección de
  renovaciones) sí usa `sqlCarteraEnVigor`, que es quien decide quién es cliente hoy.
- Se excluyen los recibos de pólizas del volcado: ya los saca `sqlCarteraViva`.

### 3.2 Atribución recibo → clave → acuerdo (`atribuirClave`, `lineaAplicable`)

1. Se toma el código del recibo, `datos_extra.mediador.codigoInterno`. Si no lo trae, el de la póliza,
   `datos_especificos.mediador.codigoInterno`. Si tampoco, el recibo queda **`sin_clave`**.
2. El código se busca en `claves_mediador.codigos_cima` del tenant. Si no aparece, queda en
   **`codigo_sin_asignar`** (calidad del dato, ver §4.4).
3. Se buscan los acuerdos de esa clave vigentes en `fecha_efecto_actual` del recibo:
   `vigencia_desde ≤ efecto` y (`vigencia_hasta` NULL o `≥ efecto`).
4. La línea aplicable se busca **por PRODUCTO primero y por RAMO después** (implementado en
   `lineaAplicable`, mismo criterio de cruce que `lineasComision`):
   - `producto` es el **código** de producto de la compañía (`datos_especificos.producto.ramoEntidad`).
     Una línea con producto casa SOLO con ese producto, aunque su `ramo` no esté mapeado.
   - Si ninguna línea nombra el producto del recibo, valen las genéricas: sin producto y con
     `ramo = polizas.tipo`. Una línea ceñida a un producto con nombre comercial (lo habitual en la
     extracción de APROMES) no se aplica a todo el ramo: queda pendiente hasta que se le asigne el código.
   - Luego se afina por modalidad (exacta; si no, las que no la nombran).
   - Sin acuerdo vigente de esa clave: **`sin_acuerdo`**; con acuerdo vigente de la compañía pero sin
     clave asignada: **`acuerdo_sin_clave`** (productividad pendiente); acuerdo sin línea que case:
     **`sin_linea`**.
   - Más de una y no se pueden desempatar: **`ambiguo`**. Nunca se escoge la primera. Es el caso de las
     7 de RC PYME de Allianz, que dependen de la modalidad.
5. El porcentaje sale de la clase del recibo:
   - `clase_recibo = 'NP'` → `pct_np`;
   - `'CA'` → `pct_cartera`;
   - `'SU'` (suplementos) → fuera de la conciliación en v1, contados aparte como «suplementos, sin
     regla».
   - Si el porcentaje es NULL → **`pct_no_consta`**.

### 3.3 Fórmulas

Todas las sumas son `Σ importeEiac(...)`. Un importe ilegible se cuenta en `ilegibles`, nunca suma 0.

| Cifra | Fórmula | Periodo por |
|---|---|---|
| Producción NP | Σ `prima_neta` de recibos `NP`, situación `cobrado` | `fecha_efecto_actual` dentro del periodo del objetivo |
| Producción NP pendiente | Igual con situación `pendiente` (se pinta aparte, «en cobro») | idem |
| Producción cartera | Σ `prima_neta` de recibos `CA` cobrados | idem |
| Pólizas NP | nº de pólizas distintas con recibo `NP` cobrado | idem |
| Extornos | Σ `prima_neta` de recibos anulados tras cobro, si CIMA los distingue. Si no, se declara «extornos no medidos» | idem |
| Comisión pactada (esperada) | Σ `prima_neta × pct / 100` de los recibos cobrados con línea aplicable | idem |
| Comisión aplicada (CIMA) | Σ `comision_bruta` de esos MISMOS recibos | idem |
| Δ pactado − aplicado | Por recibo: `cuadra` si \|Δ\| ≤ 0,02€; si no, `paga_menos` o `paga_mas` | — |
| Rappel estimado | Tramo alcanzado por la base medida × (`pct` × base, o `importe`) | `periodo_desde..periodo_hasta` del objetivo |
| Falta para el tramo siguiente | `tramo_siguiente.desde − base_medida`, y el rappel extra que daría | idem |
| Proyección a fin de periodo | NP: lineal, `base × días_periodo / días_transcurridos`, rotulada «a este ritmo». Cartera: cobrado + recibos `CA` pendientes + prima anual de las pólizas en vigor cuyo vencimiento cae en lo que queda de periodo | idem |
| Lo que debería entrar | Comisión pactada (o la aplicada si no hay acuerdo, rotulada así) + rappel estimado si se alcanza tramo, rotulado «se liquida al cierre» | — |

Sobre las fechas y los criterios:

- **La fecha de corte de la producción es el EFECTO**, no la de cobro que usa el libro (`fecha_situacion`
  en `comisiones_cartera`). Son preguntas distintas: el libro pregunta cuándo nace la obligación de
  liquidar; el rappel, qué se produjo en el periodo.
- Si `criterio_cobro = 'emitidas'`, la base suma también las pendientes.
- Si `criterio_cobro` es NULL, se mide `cobradas` (lo conservador) y la pantalla lo dice: «el acuerdo no
  aclara si cuenta emitidas o cobradas; contamos solo cobradas».

### 3.4 Qué se pinta cuando falta el dato

Cada cifra viaja como `{ estado: 'ok', valor, parcial: {excluidos, porMotivo} } | { estado: 'pendiente', motivo }`.
**Nunca `0` por ausencia.**

| Situación | Se pinta |
|---|---|
| Acuerdo con `clave_id` NULL (AXA, Pelayo o clave por decidir) | «Sin clave asignada: no hay producción que medir». Semáforo ⚪ |
| `base = 'otra'`, tramos ilegibles o `siniestralidad_max_pct` informada | ⚪ «No calculable automáticamente», con el texto de `condiciones`. **CIMA no manda el importe de los siniestros**: la siniestralidad nunca se puede afirmar |
| `ambito = 'colectivo'` | «Tu aportación: X €». Semáforo ⚪ «depende de la producción de toda APROMES». Nunca 🟢 |
| Recibos `sin_clave`, `codigo_sin_asignar`, `ambiguo` o `pct_no_consta` | La cifra sale con «parcial: N de M recibos» y el desglose por motivo. El semáforo no puede ser 🟢 si los excluidos podrían cambiar el tramo |
| `crecimiento_pct` sin recibos del periodo anterior | ⚪ «CIMA trae recibos de esta compañía desde dd/mm/aaaa». Sale de `comisiones_cobertura.desde_recibos` o del primer recibo |
| `revisado_at` NULL | Todo el acuerdo lleva la etiqueta «según extracto sin cotejar con el PDF». El semáforo se calcula, pero el 🟢 se pinta como 🟡 hasta que se coteja |
| Puerto caído o error | «No se ha podido comprobar. No significa que no haya acuerdo», con su causa |
| Compañía sin ningún acuerdo cargado | «Sin acuerdo cargado». La comisión aplicada de CIMA se enseña tal cual, sin Δ |

### 3.5 Semáforos (`semaforoObjetivo`, puro)

| Color | Cuándo |
|---|---|
| 🟢 Alcanzado | Base medida ≥ umbral del tramo objetivo, cálculo completo y acuerdo revisado |
| 🟡 En camino | La proyección llega al umbral, o está alcanzado pero sin revisar o con datos parciales que no lo tumban |
| 🟠 Por debajo del ritmo | La proyección no llega y quedan más de 90 días |
| 🔴 No llega | La proyección no llega y quedan 90 días o menos. En `mantener_clave` se rotula **«riesgo de perder la clave»** |
| ⚪ Pendiente | Cualquier fila de §3.4 que impida calcular |

El objetivo de rappel es el **primer tramo con pago**; los siguientes se enseñan como «siguiente
escalón». El umbral de 90 días es configurable en el módulo y queda testeado.

---

## 4. UI — todo en el bloque/página de compañías que ya existe (revisado 06/10/2026)

**Decisión de Alberto: no hay pestaña nueva.** Contactos, claves, acuerdos y productividad viven en un
solo sitio: el bloque `Companias.tsx` (sección «Datos» de `/correduria`) como resumen, y la página
`/correduria/companias` (`companias/page.tsx`, a la que ya se llega desde el `+` de la cabecera) como
directorio completo con su ficha por compañía. El bloque «Comisiones por compañía»
(`ComisionesPactadas.tsx`) se FUNDE en esto: dos bloques sobre la misma compañía en la misma sección
eran dos sitios donde mirar.

### 4.1 Bloque `Companias.tsx` (resumen dentro de «Datos»)

- Una fila por compañía activa, en tarjeta en móvil y en tabla compacta desde 768 px:
  nombre · chips de claves (`Directo 18638` · `APROMES`, con su estado) · contacto principal con
  `ContactoAcciones` · **dos semáforos** (rappel y clave, con texto, nunca solo color) · enlace «Ver ficha».
- Arriba, en una línea: «N compañías con acuerdo · M sin clave · K con objetivo en riesgo».
- Las compañías **con acuerdo y sin clave** (AXA, Pelayo…) salen en su propio grupo, sin semáforo de
  producción: requisito de apertura en una línea y el contacto.
- **Contador:** el bloque sigue SIN `onContador` en F2 (solo pinta acuerdos). Desde F3, reporta a
  «Datos» el nº de objetivos 🔴 (`null` → `!` si la productividad no se puede leer; lo ⚪ no cuenta).
- Estados del puerto como hoy: cargando → nada; `sin_configurar`/`error` → «No se ha podido
  comprobar. No significa que no haya acuerdos», con la causa.

### 4.2 Página `/correduria/companias` + ficha `/correduria/companias/[codigo]`

La página índice conserva sus tarjetas de contacto y añade en cada tarjeta los chips de clave/acuerdo
y el enlace a la ficha. La ficha (ruta nueva) lleva, en `<Bloque>` y en este orden:

1. **Cabecera.** Nombre, claves (etiqueta, códigos CIMA, canal, estado, alta), aviso «extracto sin
   cotejar» si algún acuerdo lo está, enlace al libro de comisiones de esa compañía.
2. **Comisiones por ramo/producto.** Una columna por acuerdo vigente (APROMES frente a directo), con
   % NP y % cartera pactados (**`—` = no consta, nunca `0 %`**), y al lado la tasa real media de CIMA
   con su nº de recibos (lo que hoy hace `ComisionesPactadas.tsx`, absorbido aquí). Las líneas
   «lectura probable» llevan su marca.
3. **Objetivos** (F3). Barra de progreso (medido, proyectado, marcas de tramo), «faltan X € para el
   tramo n (+W € de rappel)», periodo, base, criterio y ámbito. Hasta F5 los objetivos de APROMES son
   TEXTO (letra pequeña): se pintan como texto y semáforo ⚪ «sin estructurar».
4. **Conciliación** (F4). Pactado / aplicado / Δ por ramo, desglose por motivo (`sin_acuerdo`,
   `acuerdo_sin_clave`, `ambiguo`, `pct_no_consta`…) y recibos con Δ fuera de `TOLERANCIA_PUNTOS`,
   enlazados a su póliza, 50 filas + «Ver más».
5. **Requisitos y letra pequeña**, tal cual, con `documento_fuente` (página del PDF).
6. **Contactos** (`TarjetaContacto` existente).

### 4.3 Móvil (≥320 px)

Tarjetas apiladas; en la ficha, una tarjeta por ramo (`NP 14 % · Cartera 12 % · real 13,0 %`); barras
a ancho completo; chips con texto; botones ≥44 px; grids con `gridTemplateColumns: 'minmax(0, 1fr)'`.
**Se mide sobre el scroller `LayoutShell`, no sobre `body`**, a 320/360/1024 con Playwright.

### 4.4 Lo que la pantalla NO hace

No afirma «esta compañía paga mal» con datos parciales; no proyecta con estacionalidad (lineal,
rotulado); no calcula siniestralidad; no envía nada a compañías ni a APROMES.

## 5. Carga de los acuerdos — seed directo versionado + script para lo privado (revisado 06/10/2026)

🔒 **El PDF de APROMES es de uso privado para asociados y prohíbe divulgarlo.** Sus cifras no pueden
acabar en el repo (ni en un JSON, ni en un `.sql`, ni en un test): un commit es una divulgación que no
se deshace (queda en la historia de git). De ahí el reparto:

| Qué | Dónde vive | Cómo entra |
|---|---|---|
| Acuerdos **directos** de Alberto (hoy: las 7 líneas de Allianz RC PYME de `comision_pactada`) | `apps/asegura/prisma/seed/acuerdos-2026-directo.json` (versionado, formato `leerSeedAcuerdos`) | `node scripts/cargar-acuerdos.mts --seed <json> --correduria-id <uuid> --salida <fuera-del-repo.sql>` |
| Acuerdos de **APROMES** (218 registros extraídos del PDF) | Un JSON **fuera del repo** (hoy en el scratchpad de la sesión) | `node scripts/cargar-acuerdos.mts --apromes <json> --vigencia-desde YYYY-MM-DD [--vigencia-hasta …] [--mapa nombre→DGS.json] --correduria-id <uuid> --salida <fuera.sql>` |

Reglas del script (`scripts/cargar-acuerdos.mts`, probado en un Postgres 16 local con la migración):
- **No toca la BD**: genera un `.sql` que se revisa y se ejecuta a mano tras aplicar la migración. Con
  `--apromes`, **se niega** si la entrada o la salida están dentro del repo.
- **Todo nace sin cotejar** (`revisado_at` NULL). Lo `lectura: "probable"` queda señalado en las notas
  de su línea («⚠️ LECTURA PROBABLE — no confirmada en el PDF») y en la letra pequeña del acuerdo.
- **NULL ≠ 0**: un % que la extracción no trae va NULL.
- **Ramo**: solo coincidencia exacta (`ramoDesdeTexto`); lo dudoso («Transportes», «Defensa jurídica»…)
  va NULL: se pinta, no calcula.
- **Objetivos y contactos** de la extracción son texto libre: van a la letra pequeña; no se inventan
  tipo/ámbito/base/fechas para meterlos en `acuerdo_objetivos`. Se estructuran desde la pantalla (F5).
- **`clave_id` NULL** (decisión por defecto (a), §7).
- **Compañía** resuelta EN LA BD contra `companias_dgs` por nombre normalizado o `--mapa`; la que no
  está en el catálogo **no se carga** y sale en el informe final. Medido con la extracción del
  06/10/2026: **8 compañías casan** (Allianz, AXA, Generali, Helvetia, Mapfre, Occident, Pelayo, Reale) y
  **15 no están en el catálogo** (Zurich, Surne, Mutua Propietarios, Preventiva, Santalucía, ARAG,
  Hiscox, Ocaso, Aegon, CGPA, Stoïk, Admiral, Avanza, Markel, Solunion). Para cargarlas, antes hay que
  darlas de alta en `companias_dgs` con su código DGS **verificado**, no supuesto.
- **Nunca pisa**: un acuerdo existente (correduría, compañía, fuente, vigencia) se deja como está —sus
  líneas, su clave y su cotejo—; para recargarlo se borra a mano. El informe lo dice («ya existía»).
- `correduria_id` **explícito** por argumento, y el SQL aborta si no existe.

Y el **formulario** en la ficha (F5) para cotejar («Coincide con el PDF» sella `revisado_at`), corregir
líneas, estructurar objetivos, gestionar claves y asignar códigos CIMA, con rastro en
`operational_events`.

## 6. Plan por fases (PRs pequeños) — revisado 06/10/2026

> Toda migración se aplica preview → prod con OK de Alberto. Typecheck de asegura con sus DOS schemas.

### F1 — Modelo + reglas puras + carga (HECHA en la rama `claude/youthful-fermat-gn8tzg`, sin aplicar)

- `apps/asegura/prisma/sql/2026-10-06_seguros_acuerdos_companias.sql`: `claves_mediador`,
  `acuerdos_compania`, `acuerdo_comisiones`, `acuerdo_objetivos` (todas con `correduria_id` directo o
  por cabecera; CHECKs de listas cerradas; % NULLABLE sin default; `ramos` NOT NULL DEFAULT `'{}'` =
  todos, porque Prisma no admite listas NULL), `compania_contactos.fuente`, RLS activado sin
  políticas, `revoke all … from crm_seguros`, DML a `prisma_seguros`, SELECT a `backup_seguros`.
- Modelos `ClaveMediador`, `AcuerdoCompania`, `AcuerdoComision`, `AcuerdoObjetivo` en
  `apps/asegura/prisma/asegura.prisma` (cliente de la cartera). **`compania_contactos.fuente` NO se
  declara aún en `CompaniaContacto`**: si el código se desplegara antes que la migración,
  `GET /api/operador/companias` (que hace `include: { contactos }`) pediría una columna inexistente.
- `packages/module-seguros/src/acuerdos.ts` (+ 37 tests): listas cerradas, `leerPct`, `leerTramos`,
  `normalizarCodigoCima`, `atribuirClave`, `conflictosCodigos`, `lineaAplicable` (incluido el ambiguo
  de RC PYME de Allianz), `ramoDesdeTexto`, `leerSeedAcuerdos`.
- `apps/asegura/lib/acuerdos.ts` + `GET /api/operador/companias/acuerdos` (Bearer del operador,
  `correduriaUnica()`, `error` con causa; sin migración aplicada responde `esquema`).
- Seed directo + `scripts/cargar-acuerdos.mts` (§5) + `test/regression-carga-acuerdos.test.ts`.
- **Orden de despliegue:** aplicar la migración ANTES de cargar; el puerto nuevo sin migración da
  `error: esquema` (correcto), y el directorio existente no se ve afectado.

### F2 — Pintar acuerdos y claves en `Companias.tsx` / `/correduria/companias` y absorber `comision_pactada`

- `apps/plataforma/lib/companias-asegura.ts`: tipos e `interpretarAcuerdos` (tres estados, `null` ≠ `[]`,
  `Cerrado<T>` con valor desconocido declarado) + `acuerdosAsegura()`; proxy
  `app/api/correduria/companias/acuerdos/route.ts`; hook (en `useCompanias.ts` o uno hermano).
- `Companias.tsx` (§4.1), `companias/page.tsx` (chips + enlace) y ficha nueva
  `companias/[codigo]/page.tsx` (§4.2: cabecera, comisiones por ramo/producto con tasa real, requisitos,
  letra pequeña, contactos).
- **Absorción de `comision_pactada`:** `apps/asegura/lib/comisiones-pactadas.ts` pasa a leer de
  `acuerdo_comisiones` (líneas con `producto`, acuerdos con clave o sin ella) manteniendo la forma de
  `lineasComision`, y `ComisionesPactadas.tsx` se funde en la ficha. Con eso `comision_pactada` queda
  sin lector y se retira en un PR aparte (con su recuento antes/después). **Hasta entonces hay dos
  copias de las 7 líneas de Allianz**; el cepo de igualdad del seed impide que diverjan.
- Cepos (vistos fallar): `pct` NULL no se pinta `0 %`; `sin_configurar`/`error` no se pinta «sin
  acuerdos»; el grupo «sin clave» existe. Responsive medido sobre `LayoutShell`.
- Riesgo: `Companias.tsx` comparte hook con `Siniestros.tsx`; no cambiar la forma de `useCompanias`.

### F3 — Productividad y semáforos

`medirObjetivo`, `proyectar`, `semaforoObjetivo` (+ tests de todos los estados de §3.4 y los 90 días);
lectura de recibos con `sqlCarteraViva` en `apps/asegura/lib/acuerdos.ts` (techo + `truncado`);
`GET /api/operador/companias/productividad`; bloque «Objetivos» de la ficha y semáforos/contador en
`Companias.tsx`. Cepos: el SQL usa `sqlCarteraViva` (lee el fuente), importe ilegible no suma 0, ⚪
nunca 🟢, sin cotejar nunca 🟢. Verificación contra la BD real (NP 2026 por compañía a mano).

### F4 — Conciliación recibo a recibo

`atribuirClave` + `lineaAplicable` por recibo, `pctRecibo` y `TOLERANCIA_PUNTOS` de
`comision-pactada.ts` (no una tolerancia nueva), con un caso real fijado (Mapfre auto CA al 10,00 %,
26 recibos). Bloque «Conciliación» de la ficha. `ambiguo`/`sin_acuerdo`/`acuerdo_sin_clave` no entran en Δ.

### F5 — Edición desde la ficha

Cotejar, corregir líneas, estructurar objetivos (de la letra pequeña a `acuerdo_objetivos`), claves y
códigos CIMA (también el código de producto de las líneas de APROMES con nombre comercial).
Rutas `POST/PATCH/DELETE` en asegura con `auditado()` y `operational_events`.

### F6 — Colaboradas

Tabla `produccion_colaborada`, alta manual, **no cuentan para objetivos** salvo marca explícita
(decisión por defecto (c)). Cepo: ninguna escritura de colaboradas toca `polizas`.

### Fuera de alcance, anotado

- Cron `cima-liq` elige cuenta con `SELECT id FROM cuentas LIMIT 1`.
- `companias_dgs.clave_mediador` es dato del tenant en un catálogo global; se retirará a favor de
  `claves_mediador` tras F5.
- **Pendiente de Alberto (no se toca):** la «clave» de Pelayo en `companias_dgs.clave_mediador` es
  `28823484E`, con forma de NIF. No se ha traído como clave.

## 7. Decisiones (tomadas por defecto el 06/10/2026; reversibles)

1. **(a) Clave por compañía: sin decidir.** La producción se atribuye por los códigos de CIMA; los
   acuerdos de APROMES entran con `clave_id` NULL y su productividad sale «pendiente»
   (`acuerdo_sin_clave`) hasta que Alberto diga, compañía a compañía, si produce con clave nueva de
   APROMES, con su clave traspasada (`cambio_clave`) o en directo.
2. **(b) Lo extraído del PDF entra «sin cotejar»** y ningún semáforo se pone verde hasta cotejarlo
   («Coincide con el PDF», F5).
3. **(c) Las colaboradas NO cuentan para objetivos** (F6), salvo marca explícita póliza a póliza.

Pendiente aparte: la clave de Pelayo = NIF (`28823484E`), sin tocar (§6, fuera de alcance).
