# Portal: «Inicio», enlace inmueble ↔ póliza y motor de oportunidades del patrimonio — diseño

> Fecha: 24/10/2026 · Estado: **propuesta para Alberto** (las preguntas del §6 llevan el default que se asume).
> Base: `docs/superpowers/specs/2026-10-22-asegura-portal-patrimonio-design.md` y su plan
> `docs/superpowers/plans/2026-10-22-asegura-portal-patrimonio-fase-1.md` (pasos 1-9 hechos; esta spec reordena 10-14).
> Reglas del portal: `apps/asegura-portal/CLAUDE.md` (aislamiento por CÓDIGO, tres estados, 404 nunca 403).

## 0. La decisión y lo que cambia

Alberto (24/10/2026): *el objetivo es vender seguros; las herramientas existen para que el cliente use la app y
nosotros controlemos las oportunidades. Cada patrimonio tiene un seguro y ese seguro es una oportunidad.* Se traduce en
tres piezas:

1. **Una pantalla «Inicio»** delante de todo: primero los seguros (personales / patrimoniales / de empresa), después
   las herramientas (Patrimonio, Flota, Calendario…). Hoy `/` lleva directo a `/boveda`.
2. **Enlace inmueble ↔ póliza** con tres estados (sin mirar / sin seguro / con seguro). La tabla
   `seguros.portal_patrimonio_inmueble_poliza` **ya existe en BD** (paso 3, 22/10) y **nadie la usa todavía**
   (comprobado: ningún `portalPatrimonioInmueblePoliza` en el código) → se puede cambiar AHORA sin romper nada.
3. **Motor de señales** en `apps/asegura` que convierte el estado del patrimonio en oportunidades visibles en
   `plataforma` → `/correduria`, deduplicadas por ficha (NIF) + inmueble, y que **nunca contacta a nadie**.

Hallazgo que corrige el plan: el paso 11 decía «CTA Pedir precio → lead declarada (`lead-declarada.ts`)». Es el
módulo equivocado: `lead-declarada.ts` modela pólizas **aportadas** con vencimiento; un inmueble sin seguro no tiene
declarada. El «Pedir precio» del patrimonio va por PUENTE a `apps/asegura` y crea una fila en `seguros.oportunidades`,
como hoy `mejorar-precio` (`apps/asegura/lib/mejorar-precio-portal.ts`: candado, `info_riesgo.origen`, gestión, historial).

## 1. Página «Inicio»

### 1.1 Ruta y encaje
- **Ruta nueva `/inicio`** en `app/(portal)/inicio/page.tsx`. `/boveda` NO cambia (es «Seguros»): la usan los enlaces
  de push (`api/cron/avisos-push`), invitaciones, `EliminarPoliza`, `vista-previa` y los marcadores de la gente.
  Redirigir `/boveda` → `/inicio` rompería 7 sitios y todos los `?vista=`.
- `app/page.tsx`: con sesión, `redirect('/inicio')` (antes `/boveda`). `api/acceso/verificar` y `Entrada.tsx`: destino
  tras el canje = `/inicio`. Los demás `'/boveda'` se quedan (son enlaces profundos a seguros).
- `pestanasPortal()` gana `{ vista: null, etiqueta: 'Inicio', href: '/inicio' }` la PRIMERA. Comprobar el cepo de
  sinónimos de `vista-portal.test.ts` («Inicio» ≠ «Mi resumen», que es el resumen anual para la renta).
- **Barra inferior (móvil):** `Inicio · Seguros · Siniestros · WhatsApp · Más`. Sale «Recibos» (sigue en el cajón y
  en cada tarjeta de seguro). Cinco huecos es el máximo a 320 px (44 px cada uno). → pregunta 3.
- El monograma/logo de la cabecera enlaza a `/inicio`.
- Modo corredor (`/corredor/[token]`): Inicio se ve igual; los botones que hacen POST ya los veta `middleware.ts`.

### 1.2 Qué ve el cliente, en este orden
1. **`<h1>Inicio</h1>`** + saludo corto (nombre de pila si consta; si no, nada — nunca «Hola, cliente»).
2. **Tus seguros** (`<section aria-labelledby>`), tarjetas por FAMILIA:
   - **Personales** — vida, salud, accidentes, decesos, viaje, mascotas.
   - **Patrimoniales** — hogar, comercio, comunidades, impago de alquiler, RC, decenal, auto, moto, embarcaciones
     (sublíneas «Inmuebles» y «Vehículos» dentro de la tarjeta). → pregunta 4.
   - **De tu empresa** — toda póliza cuyo titular es persona jurídica (`empresasDeFichas()` / titular `juridica`),
     sea del ramo que sea (una salud colectiva es «de empresa»). Solo sale si hay alguna empresa a la vista.
   - **Otros** — ramo `otros`/`null`: solo si existe; no se esconde ni se mete a la fuerza en otra familia.
   Cada tarjeta = UN enlace a `/boveda` (filtrado si se añade `?familia=`; fase 1 basta `/boveda`) con: nº de
   pólizas (cartera viva + aportadas vigentes, por separado: «2 con nosotros · 1 aportada»), próxima fecha útil
   («renueva el 03/12/2026») y, si existe, un chip «1 cosa pendiente» (de `pendientesDeTi`).
   Debajo, **una sola** tarjeta comercial discreta y cerrable: la de `HuecosProteccion` (ya existe, 90 días cerrada).
   Máximo UNA sugerencia comercial por pantalla: Inicio no es un escaparate.
3. **Tus herramientas**, tarjetas en este orden:
   - **Patrimonio** (si `accesosPatrimonio` no vacío): «3 inmuebles · 1 sin seguro que nos conste · 1 sin revisar»
     (§2.3). La cifra que vende es la que el cliente ve con su propio dato, no un banner.
   - **Flota** (si `accesosFlota()` no vacío): vehículos y la próxima ITV.
   - **Calendario**: las 3 próximas fechas de `portal_obligacion` + recordatorios propios + (fase 2) patrimonio.
   - **Mi QR**, **Mi resumen**.
   - **Más herramientas** → `/herramientas` (catálogo: RRHH, …).
4. **Pie**: «Llamar a tu corredor» (ya en el cajón; aquí también en escritorio).

### 1.3 Estados vacíos (tres estados, nunca «no tienes»)
| Situación | Tarjeta de familia dice | CTA |
|---|---|---|
| Sin vínculo (`sin_ficha`) | «Aún no vemos pólizas tuyas con nosotros.» | «Añadir una póliza» (sube PDF) |
| `ambiguo` | «Estamos comprobando qué pólizas son tuyas.» (NUNCA «no hemos encontrado») | «Llamar» |
| `sin_clave` / error de lectura | «Ahora no hemos podido comprobar tus seguros.» → fuente `sinComprobar` | reintentar |
| Vinculado, 0 en esa familia | «No nos consta ningún seguro personal. ¿Tienes alguno con otra compañía?» | «Añádelo» |
| Patrimonio sin inmuebles | «Lleva aquí tus pisos y locales: gastos, contratos y sus seguros.» | «Añadir inmueble» |
| Patrimonio no disponible (sin ficha) | «Disponible para clientes de Grupo ASegura.» | «Aporta tu primera póliza» → pregunta 2 |

Lectura: `lib/inicio.ts` → `resumenInicio(identidadId)` con `Promise.allSettled`, una fuente por tarjeta, cada una
`{estado:'ok',…} | {estado:'sin_comprobar'}`. Solo cuentas y la próxima fecha: **no** reutiliza el cargador entero de
`boveda/page.tsx` (decenas de lecturas). **Leer no escribe**: Inicio no llama a `sincronizarObligacionesDeIdentidad`.
Familia por ramo: función pura `familiaSeguro(ramo, titularEsEmpresa)` en `module-seguros-portal` con test.

### 1.4 Wireframes

**320-767 px** (una columna; el scroller es `.portal-contenido`; `gridTemplateColumns: 'minmax(0, 1fr)'`)
```
┌ Grupo ASegura ─────────── 🔔 ☾ ┐
│ Inicio                         │  h1 Quicksand 700
│ Hola, Marta                    │
│ TUS SEGUROS                    │  h2
│ ┌────────────────────────────┐ │
│ │ Personales              ›  │ │  tarjeta = 1 enlace, ≥44 px
│ │ 2 con nosotros · 1 aportada│ │
│ │ Renueva el 03/12/2026      │ │
│ │ [1 cosa pendiente]         │ │  chip con texto, no solo color
│ └────────────────────────────┘ │
│ ┌ Patrimoniales ──────────›──┐ │
│ │ Inmuebles 3 · Vehículos 1  │ │
│ └────────────────────────────┘ │
│ ┌ De tu empresa ──────────›──┐ │  solo si hay empresa
│ └────────────────────────────┘ │
│ ┌ No nos consta seguro de   ×┐ │  1 sugerencia, cerrable
│ │ salud. [Hablar de ello]    │ │
│ └────────────────────────────┘ │
│ TUS HERRAMIENTAS               │
│ ┌ Patrimonio ─────────────›──┐ │
│ │ 3 inmuebles                │ │
│ │ ⚠ 1 sin seguro que nos     │ │  icono + texto
│ │   conste · 1 sin revisar   │ │
│ └────────────────────────────┘ │
│ ┌ Flota ─┐ ┌ Calendario ─┐     │  2 col solo si ≥360 px; si no, 1
│ ┌ Mi QR ─┐ ┌ Mi resumen ─┐     │
│ Más herramientas ›             │
├────────────────────────────────┤
│ Inicio Seguros Siniestros 🟢 Más│ tabbar
└────────────────────────────────┘
```
**768-1023 px**: seguros en 2 columnas (`repeat(auto-fit, minmax(280px, 1fr))`), herramientas en 2-3; tabbar sigue.
**≥1024 px**: lateral `.portal-nav` a la izquierda (sin tabbar); contenido con máx. ~1080 px:
```
│ Nav     │ Inicio                                         │
│ Inicio• │ TUS SEGUROS                                    │
│ Seguros │ [Personales] [Patrimoniales] [De tu empresa]   │
│ …       │ [sugerencia ×                              ]   │
│         │ TUS HERRAMIENTAS                               │
│         │ [Patrimonio (ancho 2)        ] [Flota]         │
│         │ [Calendario] [Mi QR] [Mi resumen]              │
```

### 1.5 Marca y accesibilidad
- Quicksand 600-700 en h1/h2/títulos de tarjeta y botones; Nunito Sans en cuerpo; sin cursivas; cobalto `#3364ee`
  solo en acción/enlace (contraste ≈4,9:1 sobre blanco, vale para texto); los tokens de tema oscuro ya existen
  (`globals.css`); «Grupo ASegura» con su guardián.
- Un `h1`, `h2` por bloque, tarjeta = un `<a>` con nombre accesible completo («Seguros personales: 2 con nosotros,
  1 aportada; renueva el 3 de diciembre de 2026»). Nada se comunica solo con color (⚠ + texto). Foco visible,
  `prefers-reduced-motion`, objetivos ≥44 px, cifras con `eur()` si las hay (Inicio no enseña primas).
- Cepo: test de fuente que veta en `inicio/` cualquier «0 pólizas»/«no tienes» y exige `sinComprobar` por fuente.

## 2. Enlace inmueble ↔ póliza

### 2.1 Modelo: la tabla puente existente, ampliada (no columna)
Una columna `inmueble.poliza_id` no sirve: un inmueble tiene continente + impago + comunidad, y una póliza puede cubrir
varios inmuebles (multirriesgo de una sociedad). Se mantiene `portal_patrimonio_inmueble_poliza`
(`poliza_id` de cartera **XOR** `poliza_declarada_id`, CHECK `num_nonnulls=1`, dos únicos parciales) y se le añade:
- `estado` `confirmado | rechazado`: un «no es este» queda escrito para que la propuesta no reaparezca.
- `origen` `manual | propuesta_refcat | propuesta_direccion`: para medir cuánto acierta el match.
Y al inmueble, la declaración explícita de «no tiene seguro» (el segundo estado no puede ser una ausencia de filas).

### 2.2 SQL propuesto (NO aplicar; va en el paso P10, mismo despliegue que lo usa; GRANT antes que schema)
`apps/asegura-portal/prisma/sql/2026-10-2X_portal_patrimonio_enlace_seguro.sql`:
```sql
BEGIN;
-- Enlace: estado de la decisión del cliente y de dónde salió.
ALTER TABLE seguros.portal_patrimonio_inmueble_poliza
  ADD COLUMN IF NOT EXISTS estado text NOT NULL DEFAULT 'confirmado'
    CHECK (estado IN ('confirmado', 'rechazado')),
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'manual'
    CHECK (origen IN ('manual', 'propuesta_refcat', 'propuesta_direccion'));
-- Los dos únicos parciales existentes (inmueble, poliza[_declarada]) WHERE archivado_en IS NULL se mantienen:
-- una sola decisión viva por par. Cambiar de opinión = archivar y crear otra (el rol solo UPDATE archivado_en).

-- Inmueble: «he revisado y no tiene seguro». NULL = no lo ha dicho (≠ no tiene).
ALTER TABLE seguros.portal_patrimonio_inmueble
  ADD COLUMN IF NOT EXISTS sin_seguro_declarado_en timestamptz,
  ADD COLUMN IF NOT EXISTS sin_seguro_declarado_por_identidad_id uuid
    REFERENCES seguros.portal_identidad (id) ON DELETE SET NULL;
ALTER TABLE seguros.portal_patrimonio_inmueble
  DROP CONSTRAINT IF EXISTS portal_patrimonio_inmueble_sin_seguro_coherente,
  ADD CONSTRAINT portal_patrimonio_inmueble_sin_seguro_coherente
    CHECK (sin_seguro_declarado_en IS NOT NULL OR sin_seguro_declarado_por_identidad_id IS NULL);

-- GRANT por columnas (espejo exacto en schema.prisma DESPUÉS de aplicar esto).
GRANT SELECT (estado, origen) ON seguros.portal_patrimonio_inmueble_poliza TO prisma_asegura_portal;
GRANT INSERT (estado, origen) ON seguros.portal_patrimonio_inmueble_poliza TO prisma_asegura_portal;
GRANT SELECT (sin_seguro_declarado_en, sin_seguro_declarado_por_identidad_id)
  ON seguros.portal_patrimonio_inmueble TO prisma_asegura_portal;
GRANT UPDATE (sin_seguro_declarado_en, sin_seguro_declarado_por_identidad_id)
  ON seguros.portal_patrimonio_inmueble TO prisma_asegura_portal;

-- Consentimientos nuevos (el de encargo lo pedía ya el paso 13). Verificar el nombre real con \d antes.
ALTER TABLE seguros.portal_consentimiento DROP CONSTRAINT IF EXISTS portal_consentimiento_tipo_check;
ALTER TABLE seguros.portal_consentimiento ADD CONSTRAINT portal_consentimiento_tipo_check
  CHECK (tipo IN ('avisos', 'comercial', 'lds_art19', 'encargo_patrimonio', 'comercial_patrimonio'));
COMMIT;
```
(`TIPOS_CONSENTIMIENTO` de `module-seguros-portal/src/consentimiento.ts` se amplía en el mismo PR.)

### 2.3 Tres estados (función pura `estadoSeguroInmueble` en `module-patrimonio`, con test y rojo)
| Estado | Regla | Qué dice la ficha del inmueble |
|---|---|---|
| `con_seguro` | ≥1 enlace `confirmado`, no archivado, cuya póliza está viva (`esCarteraViva`, sin fusionar —se sigue `merged_into_poliza_id`—) o es declarada no eliminada y no vencida | «Asegurado con …» (detalle según §2.5) |
| `con_seguro_no_vigente` (derivado) | hay enlaces confirmados pero ninguno vigente | «El seguro que enlazaste ya no está en vigor» |
| `sin_seguro` | sin enlaces confirmados vigentes **y** `sin_seguro_declarado_en` no nulo | «Nos dijiste que no tiene seguro (el 12/10/2026)» |
| `sin_mirar` | todo lo demás (también si la cartera no se pudo leer) | «¿Tiene seguro? Revísalo» |
Un enlace confirmado gana a la declaración (si la hay, la UI ofrece quitarla). Propiedad horizontal: el continente
suele estar en la póliza de la comunidad; `en_comunidad=true` sin póliza de comunidad enlazada → el infraseguro dice
«no lo sabemos» (ya en el spec del 22/10), y `sin_seguro` habla del **contenido/RC del propietario**, no del edificio.

### 2.4 Match automático propuesto (nunca escrito sin el cliente)
Pura `proponerEnlaces(inmueble, candidatas, decisiones)` en `module-patrimonio`:
- Candidatas = solo pólizas de ramo de inmueble (hogar, comercio, comunidades, impago_alquiler, RC, decenal,
  empresas) de la **cartera que la identidad VE** (`carteraDeIdentidad`) + sus declaradas no eliminadas.
- **Alta**: referencia catastral idéntica (normalizada a 20 caracteres) — en declaradas existe `referencia_catastral`.
- **Media**: mismo CP **y** misma vía normalizada **y** mismo número, usando solo lo que `describirBien().ubicacion`
  devuelve a ESE nivel. Con nivel `tarjeta` la dirección es `null` → no hay match por dirección (casar con un campo
  que el cliente no puede ver sería filtrarlo).
- Nunca por municipio solo, ni por nombre de compañía. Excluye pares ya enlazados o `rechazado`.
- UI en la ficha del inmueble: «¿Este seguro es de *Piso Socorro*? [Sí, es este] [No es este]» → INSERT con
  `estado` y `origen`. Sin propuestas: «Enlazar un seguro» (selector de lo que ve) / «Añadir póliza» / «No tiene seguro».

### 2.5 Aislamiento (lo da el código)
- `POST /api/patrimonio/inmuebles/[id]/seguros {polizaId | declaradaId, estado}`: el inmueble se busca dentro de
  `accesosPatrimonio(identidadId)` con nivel ≥ `gestion` (`puede(nivel,'enlazar_seguro')`, nueva acción en la tabla de
  §4 del spec del 22/10); la póliza se busca DENTRO de `carteraDeIdentidad` (nunca `findUnique` por el id del body);
  la declarada, propia (`identidadId`) o con `duenaDeDeclarada`. Cualquier fallo → 404.
- Lectura: el enlace cuenta para el ESTADO de todos los que ven el inmueble, pero el DETALLE (compañía, nº, prima,
  capital) solo se pinta si quien mira también ve esa póliza en su cartera. Si no: «Seguro enlazado por otra persona
  con acceso» sin datos. Así un gestor con Gestión sobre la sociedad no lee, vía inmueble, la póliza personal del Dueño.
- Cepos: ampliar `test/regression-portal-patrimonio-aislamiento.test.ts` (ningún `portalPatrimonioInmueblePoliza`
  sin pasar por `accesosPatrimonio` + cartera) y un test de ruta: póliza ajena → 404, nivel `tarjeta` → sin match por
  dirección.

## 3. Motor de oportunidades

### 3.1 Dos cosas distintas
- **Señal** = hecho calculado («inmueble X de la ficha F no tiene seguro»). La genera un cron de `apps/asegura`, vive en
  su tabla, la ve solo Alberto. **No es una oportunidad ni autoriza contacto.**
- **Oportunidad** = fila de `seguros.oportunidades` (el embudo de siempre: gestiones, historial, presupuesto). Nace
  (a) cuando Alberto PROMUEVE una señal, o (b) cuando el cliente pulsa «Pedir precio» en el portal.
Por qué no crear oportunidades directamente: cada inmueble de cada cliente llenaría el embudo de filas que nadie pidió,
con candados por cliente+ramo (`crearOportunidad`) que chocan entre inmuebles, y mezclaría lo pedido con lo inferido.

### 3.2 Catálogo de señales (pura `senalesDeInmueble` en `module-patrimonio`; `hoy` inyectado)
| Tipo | Condición | Ramo | Prioridad |
|---|---|---|---|
| `inmueble_sin_seguro` | estado `sin_seguro` | hogar (vivienda) / comercio (local, oficina, nave) | alta |
| `seguro_no_vigente` | estado `con_seguro_no_vigente` | el de la póliza | alta |
| `infraseguro` | `alertaInfraseguro` = `infraseguro` (capital leído < 80 % del valor estimado); `sin_dato` no genera | hogar/comercio | alta |
| `alquiler_sin_impago` | contrato vigente (sin `terminado_en`, prórroga LAU incluida) y sin enlace `impago_alquiler` | impago_alquiler | media |
| `inmueble_sin_mirar` | `sin_mirar` > 14 días desde el alta | hogar/comercio | baja («pídele que lo revise») |
| `comunidad_sin_poliza` | `en_comunidad=true` sin enlace `comunidades` | comunidades | baja; ver pregunta 5 |
**No son señales**, a propósito: (1) declarada enlazada que vence → ya es lead en «Leads del portal»/«Declaradas por
vencer»; la señal solo AÑADE el contexto «inmueble: *alias*» a esa fila (sin duplicar). (2) Seguro exigido al
inquilino sin recibo → es un recordatorio del propietario (calendario), **nunca un lead sobre el inquilino**.
(3) Póliza nuestra que renueva → es cartera, no venta nueva.

### 3.3 Dónde se crea: siempre en `apps/asegura`
- Tabla nueva `seguros.portal_patrimonio_senal` (SQL en `apps/asegura/prisma/sql/`; prefijo `portal_` para que la
  coja `test/regression-portal-sin-crm.test.ts`). **Sin GRANT al portal** (el cliente ve su estado en vivo, no la
  señal) y `REVOKE ALL … FROM crm_seguros` (el CRM de Manuel no lee patrimonio).
```sql
CREATE TABLE IF NOT EXISTS seguros.portal_patrimonio_senal (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  correduria_id  uuid NOT NULL REFERENCES seguros.corredurias (id),
  cliente_id     uuid NOT NULL REFERENCES seguros.clientes (id),   -- ficha del TITULAR (su NIF); fusionada → se sigue
  titular_id     uuid NOT NULL REFERENCES seguros.portal_patrimonio_titular (id),
  inmueble_id    uuid NOT NULL REFERENCES seguros.portal_patrimonio_inmueble (id),
  contrato_id    uuid REFERENCES seguros.portal_patrimonio_contrato (id),
  tipo           text NOT NULL CHECK (tipo IN ('inmueble_sin_seguro', 'seguro_no_vigente', 'infraseguro',
                   'alquiler_sin_impago', 'inmueble_sin_mirar', 'comunidad_sin_poliza')),
  ramo           seguros.tipo_seguro NOT NULL,
  objeto         text NOT NULL,       -- 'rc:<ref. catastral>' si consta; si no 'inm:<inmueble_id>'
  clave          text NOT NULL,       -- '<cliente_id>:<objeto>:<tipo>'
  datos          jsonb NOT NULL DEFAULT '{}'::jsonb,  -- solo cifras del riesgo (m², valor, capital, ratio); sin PII ni rentas
  estado         text NOT NULL DEFAULT 'abierta'
                   CHECK (estado IN ('abierta', 'promovida', 'descartada', 'resuelta', 'retirada')),
  oportunidad_id uuid REFERENCES seguros.oportunidades (id),
  primera_vez_en timestamptz NOT NULL DEFAULT now(),
  ultima_vez_en  timestamptz NOT NULL DEFAULT now(),
  cerrada_en     timestamptz,
  cerrada_por    text,
  motivo         text,
  CONSTRAINT portal_patrimonio_senal_promovida CHECK (estado <> 'promovida' OR oportunidad_id IS NOT NULL),
  CONSTRAINT portal_patrimonio_senal_cierre CHECK ((estado IN ('abierta', 'promovida')) = (cerrada_en IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_portal_patrimonio_senal_viva
  ON seguros.portal_patrimonio_senal (correduria_id, clave) WHERE estado IN ('abierta', 'promovida');
CREATE INDEX IF NOT EXISTS idx_portal_patrimonio_senal_cliente
  ON seguros.portal_patrimonio_senal (correduria_id, cliente_id) WHERE estado IN ('abierta', 'promovida');
ALTER TABLE seguros.portal_patrimonio_senal DISABLE ROW LEVEL SECURITY;
REVOKE ALL ON seguros.portal_patrimonio_senal FROM crm_seguros;
REVOKE ALL ON seguros.portal_patrimonio_senal FROM prisma_asegura_portal;
```
- Cron diario `apps/asegura/app/api/cron/senales-patrimonio` (`CRON_SECRET`, `vercel.json`): lee patrimonio + cartera +
  declaradas con `prisma_seguros`, calcula con la MISMA pura del portal, y por clave: inserta (ON CONFLICT DO NOTHING
  sobre el único parcial), refresca `ultima_vez_en`/`datos`, o cierra como `resuelta` (la condición ya no se da) o
  `retirada` (oposición, inmueble archivado, supresión). Una `descartada` por Alberto no se recrea en 180 días
  (pregunta 8). No lee **ninguna** tabla de inquilino (cepo de fuente) ni filas de importación sin confirmar.
- **Deduplicación por identidad**: la clave es la ficha del titular (= su NIF), nunca el nombre; fichas fusionadas se
  resuelven a la final; dos fichas con NIF distinto (dos copropietarios del mismo piso) son dos señales y JAMÁS se funden:
  `/correduria` solo pinta el aviso «mismo inmueble (ref. catastral) que la señal de otra ficha».
- **«Pedir precio» del cliente** (portal → PUENTE, nunca prisma desde el portal a `oportunidades`):
  `POST /api/patrimonio/inmuebles/[id]/pedir-precio` → `POST apps/asegura /api/portal/patrimonio/pedir-precio
  {identidadId, inmuebleId, tipo}` (secreto `ASEGURA_PORTAL_PUENTE_SECRET`, sin `clienteId` en el cuerpo: lo
  recalcula desde el inmueble y vuelve a comprobar el acceso, como el puente del inquilino). Candado
  `pg_advisory_xact_lock('portal:patrimonio:<cliente>:<objeto>:<ramo>')`; reutiliza la abierta del mismo objeto
  (`info_riesgo.origen='portal:patrimonio'`, `info_riesgo.inmuebleId`); si no, crea oportunidad `fuente='portal'`,
  gestión `llamada` prioridad alta, `oportunidad_historial` `creada_portal` y marca la señal `promovida`. Telegram a
  Alberto (solo ids, como `textoAvisoAmbiguo`). Solo el titular o nivel `total`; **nunca el inquilino**.

### 3.4 Nunca se contacta sin OK de Alberto; consentimiento comercial
- El motor y la promoción **no envían nada**. La oportunidad entra en el flujo normal; el contacto lo decide Alberto
  envío a envío (regla de la casa; borrador por defecto).
- Base legal (propuesta; la valida Alberto/asesor → pregunta 1):
  - **Calcular** señales sobre los inmuebles del cliente (no de los inquilinos) = interés legítimo (Cdo. 47 RGPD),
    **informado** en la política de privacidad (`VERSION_TEXTOS_LEGALES` +1) y **oponible**.
  - **Contactar** para proponer: solo si (a) el cliente lo pidió («Pedir precio»: petición expresa), o (b) consta
    `portal_consentimiento` tipo `comercial_patrimonio` = `true`. Correo a cliente con póliza en vigor sobre producto
    similar cabe en el art. 21.2 LSSI con baja fácil, pero las llamadas comerciales necesitan consentimiento o base
    clara (art. 66 LGTel 11/2022): por eso el default es (a)/(b).
  - `comercial_patrimonio = false` = **oposición**: no se calcula y las señales vivas pasan a `retirada`.
  - Texto propuesto (casilla nunca premarcada, en Patrimonio y en Configuración, retirar igual de fácil):
    «Quiero que Grupo ASegura revise los seguros de los inmuebles que llevo aquí y me proponga, sin compromiso, cubrir
    lo que falte. Puedo retirarlo cuando quiera.»
  - El consentimiento es por IDENTIDAD y la señal por FICHA: para una ficha manda la identidad que la opera como propia
    (`portal_vinculo` no `corredor`); para una sociedad, la del Dueño. Varias identidades → gana la más restrictiva
    (una oposición basta). Lo resuelve una pura `permisoContacto(...)` → `pedido | consentido | sin_permiso | opuesto`.
- Los datos que el propietario mete de su **comunidad/administrador** no se usan para prospectar al administrador: solo
  si el propietario pulsa «Presentadnos» (fase 2).

### 3.5 Cómo lo ve Alberto en `/correduria`
- **Hoy → cola «Patrimonio»** (`apps/plataforma/app/(usuario)/correduria/OportunidadesPatrimonio.tsx`,
  `apps/plataforma/lib/patrimonio-asegura.ts`, puerto `GET/POST apps/asegura /api/operador/oportunidades-patrimonio`):
  agrupada por cliente (identidad), ~50 + «Ver más». Fila: tipo en lenguaje llano, inmueble (alias + municipio), ramo,
  cifra (p. ej. «capital al 62 % del valor estimado»), badge de permiso (**Lo ha pedido** / **Consiente** /
  **Sin permiso: solo si te llama o en su renovación**; los `opuesto` no salen), antigüedad.
  Acciones: **Abrir oportunidad** (promueve con `crearOportunidad`, `fuente='portal'`,
  `info_riesgo {origen:'portal:patrimonio:<tipo>', senalId, inmuebleId, refCatastral, m2, valorEstimadoCent}` — sin
  datos de inquilino), **Descartar** (motivo), **Ver ficha**. Las «Lo ha pedido» arriba y con Telegram inmediato.
- **Ficha del cliente → bloque «Patrimonio»**: sus inmuebles con el estado de seguro y las señales vivas.
- Contadores para medir el objetivo: señales abiertas, promovidas, ganadas (vía `poliza_ganada_id`), por tipo.

## 4. Pasos pendientes, reordenados

| Nuevo | Qué entra | Depende de | Agente |
|---|---|---|---|
| **P10** Puro + SQL del enlace | `estadoSeguroInmueble`, `proponerEnlaces`, `senalesDeInmueble`, `permisoContacto` (module-patrimonio), `familiaSeguro` (module-seguros-portal); SQL §2.2 aplicado + schema; tests y rojo | — | agente-architect |
| **P11** Enlace en la ficha del inmueble | `api/patrimonio/inmuebles/[id]/seguros`, propuestas Sí/No, «No tiene seguro», cepos §2.5 | P10 | general-purpose sonnet + revisión architect |
| **P12** Inicio | `/inicio`, `lib/inicio.ts`, redirecciones, `pestanasPortal`, tabbar, estados §1.3 | P10 (`familiaSeguro`, estado); en paralelo con P11 si no comparten archivos | general-purpose sonnet |
| **P13** Calendario y avisos (antiguo 10) | igual que el plan; añade «inmueble sin revisar» a «Pendiente de ti» | P11 | sonnet |
| **P14** Rentabilidad + infraseguro + Pedir precio (antiguo 11, corregido) | infraseguro con el capital de la póliza ENLAZADA; CTA → puente `pedir-precio` (no `lead-declarada`) | P11 | sonnet (puente: architect) |
| **P15** Legal y alta (antiguo 13, ampliado) | encargo, `comercial_patrimonio`, párrafo de privacidad del perfilado, `VERSION_TEXTOS_LEGALES`+1, gate | P10 | architect + Alberto |
| **P16** Motor de señales y cola en `/correduria` | §3.3 SQL + cron + puerto operador + `OportunidadesPatrimonio.tsx` + bloque en ficha | P14, **P15 desplegado** (no se calcula nada antes de informar) | architect |
| **P17** Inquilino por enlace (antiguo 12) | sin cambios; consentimiento propio del inquilino | P15 (encargo) | architect |
| **P18** Importación (antiguo 14) | sin cambios; lo importado entra `sin_mirar` y genera señales solo tras confirmar | P11, P16 | architect |
Prerrequisito suelto: el SQL del paso 8 (`2026-10-22_portal_patrimonio_documento.sql`) sigue sin aplicar.

## 5. Riesgos
- **Fuga entre clientes por el enlace** (detalle de una póliza ajena vía inmueble; match con campos ocultos) → §2.5.
- **Señal ≠ permiso**: que alguien use la cola para llamar en frío. Badge de permiso visible y `opuesto` fuera; la
  promoción no envía nada.
- **Duplicados en el CRM** con «Leads del portal», «Seguros que no nos constan» y «mejorar precio»: clave por
  ficha+objeto+tipo, reutilización de la abierta, vencimientos de declaradas sin señal propia.
- **Falsos «sin seguro»** en propiedad horizontal y con cartera ilegible → `sin_mirar`, nunca `sin_seguro` inferido.
- **Presión comercial** que espante al cliente de la herramienta: una sola sugerencia por pantalla, cerrable.
- **Rendimiento de Inicio**: solo cuentas con `allSettled`; si una fuente cae, su tarjeta dice «no hemos podido
  comprobarlo» y las demás se pintan.
- **Hábito del cliente**: la barra cambia (sale «Recibos»); los enlaces profundos no cambian.

## 6. Preguntas para Alberto (default entre paréntesis)
1. Base legal: ¿calcular señales por interés legítimo informado y contactar solo con petición o consentimiento?
   (sí; alternativa conservadora: no calcular nada sin `comercial_patrimonio=true`).
2. ¿Patrimonio para quien aún no es cliente (sin ficha)? Exigiría crear ficha de lead por el puente. Choca con el gate
   del paso 13 «gratis solo con póliza en vigor». (Fase 1: no; tarjeta «Aporta tu primera póliza».)
3. Barra inferior: ¿Inicio sustituye a Recibos? (sí).
4. Familias: ¿auto/moto dentro de «Patrimoniales» o tarjeta propia «Vehículos»? (dentro, como sublínea).
5. ¿Señal de comunidad sin póliza (oportunidad con el administrador solo si el propietario os presenta)? (sí, baja).
6. Seguro del inquilino: confirmar que NUNCA es lead salvo consentimiento propio del inquilino en su página (sí).
7. ¿Unificar la tarjeta «Gestión de alquileres» del catálogo (`modulos.ts`) con Patrimonio? (sí: es la misma herramienta).
8. Una señal descartada, ¿vuelve a los 180 días si sigue igual? (sí).
