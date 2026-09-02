# El CRM de la correduría — visión, estado real y orden de trabajo (02/09/2026)

> Dictado de Alberto (02/09/2026, tras probar la edición de la ficha): «Básicamente lo que estamos
> hablando es un CRM. Me meto en correduría, tengo mi buscador, José Suárez, me aparecen las pólizas
> que encima están confirmadas que existen; pincho en la póliza y se me abre la pantalla de esa
> póliza: datos, siniestros, recibos, todo estructurado, muy simple, con información básica; si
> quieres más, pinchando. Esa pantalla limpia será la que vea el cliente final en su intranet. Con
> los leads igual: me llama un cliente, por la web, por agente o por WhatsApp, y automáticamente se
> crea la ficha con su teléfono y su nombre, y a partir de ahí lo mismo. Todas las modificaciones hay
> que guardarlas. Y lo importante siempre son las dos bases de datos que saben de seguros más que
> nosotros: CIMA y Codeoscopic. Cuando emita por Codeoscopic y luego CIMA me mande esa póliza, que
> compaginen las dos informaciones, que no haya campos sueltos, para que en una consulta se vea toda
> la información: coberturas, vencimiento, cuándo viene el recibo, los siniestros, por qué ha subido
> la póliza.»

Este documento es la referencia. Las sesiones futuras lo leen ANTES de tocar la correduría (lo enruta
la skill `correduria-crm`). Lo que aquí es «pendiente» se marca así; lo que está hecho lleva PR.

---

## 1. Qué es y qué NO es

Es **un CRM de correduría con dos caras sobre la misma cartera**, y la distinción manda sobre todo lo demás:

| Cara | Quién | Dónde | Qué puede hacer |
|---|---|---|---|
| **Corredor** | Alberto (y quien trabaje con él) | `apps/plataforma` → `/correduria` | Todo: buscar, editar, relacionar, autorizar, pedir documentos, retarificar (0,50 €), ver historial |
| **Cliente** | El asegurado y sus autorizados | `apps/asegura-portal` | Solo lectura de lo suyo y de lo que le han autorizado; subir documentos; consentimientos |

**No son la misma pantalla con permisos.** Se parecen (mismo orden: pólizas → recibos → siniestros →
coberturas), pero la del corredor lleva DNI, historial y botones que gastan dinero; la del cliente
vive en una app aparte con **rol de BD sin `BYPASSRLS`** y secreto de sesión propio, y su aislamiento
lo vigila `test/regression-portal-aislamiento.test.ts`. Un error de permisos en una pantalla compartida
es el fallo más caro del sistema; por eso son dos.

`apps/asegura` es la **trastienda** (BD de la cartera, puerto `/api/operador/*`, la única que gasta
dinero al tarificar). Alberto no entra ahí (dictado 01/09/2026).

## 2. Principios (permanentes)

1. **CIMA y Codeoscopic saben más que nosotros.** No inventamos un modelo de póliza: guardamos lo que
   ellas mandan, con su nombre, y lo enseñamos. Lo nuestro es enlazarlas y explicar.
2. **Lo confirmado manda.** «Cliente» es quien tiene póliza viva entrada por CIMA (`polizas.import_ref IS NULL`);
   el resto son leads (regla de Alberto, 01/09/2026). Una póliza emitida por nosotros es «pendiente
   de confirmar» hasta que CIMA la trae.
3. **Todo cambio deja rastro.** `historial_interno` por ficha (quién, cuándo, qué; nunca el valor de
   un dato de identidad), `cliente_merge_log`/`poliza_merge_log` para fusiones, `operational_events`
   para la ingesta. Un CRM sin historial es una hoja de cálculo.
4. **Limpio arriba, detalle al pinchar.** Cada pantalla enseña lo básico y enlaza al detalle; nunca
   una tabla de 40 columnas. Es la misma forma que verá el cliente.
5. **«No lo sé» ≠ «no hay»** (regla raíz del monorepo): recibos `null` no es «al corriente»,
   documentos `null` no es «sin documentos», relaciones `null` no es «sin familia».
6. **Nada sale al cliente sin OK de Alberto** (emails, WhatsApp, avisos): borradores siempre.
7. **La identidad se cambia documentada.** DNI, nombre, apellidos y fecha de nacimiento solo con un
   DNI recibido en la ficha (dictado 02/09/2026). El contacto y la dirección, libres.

## 3. El recorrido (lo que Alberto describe, paso a paso)

```
/correduria ──buscar──▶ ficha cliente ──pinchar póliza──▶ ficha póliza
                         │ pólizas vivas (CIMA)             │ datos · coberturas · pago
                         │ contacto (varios tlf/mail)       │ recibos (al cobro / devuelto / cobrado)
                         │ relaciones + autorizaciones      │ siniestros
                         │ documentos (pedido/recibido)     │ intervinientes · documentos
                         │ historial                        │ «por qué ha subido» (pendiente)
                         ▼
   lead (web · WhatsApp · agente · teléfono) ──alta con tlf+nombre──▶ misma ficha, estado «lead»
        └─▶ presupuesto (Codeoscopic) ─▶ emisión ─▶ CIMA la confirma ─▶ «cliente»
```

### Estados del cliente (derivados, no una columna nueva)

Alberto pide tres: **con póliza · sin póliza · con presupuesto**. Los enums del CRM ya existen y no
se tocan (`tipo_cliente` cliente/lead/beneficiario · `segmento_cliente` cliente/ex_cliente/prospecto
· `lead_estado` nuevo/contactado/cualificado/propuesta/ganado/perdido). El estado que se PINTA se
**deriva** de los hechos, no se guarda, para que no se desincronice:

| Se pinta | Regla |
|---|---|
| ✅ Cliente (CIMA) | tiene alguna póliza **confirmada por CIMA** (`import_ref IS NULL` y `id_poliza_entidad` informado), no cancelada — `estadoCliente()` |
| 📝 Con presupuesto | sin póliza confirmada y con una póliza **emitida pendiente de CIMA**, o una cotización pendiente/enviada de los últimos 60 días — hecho |
| 🕐 Lead | ninguna de las dos |
| ⚫ Ex-cliente | tuvo pólizas (canceladas en CIMA o del volcado histórico) y ninguna viva — hecho |

## 4. Lo que existe hoy (medido 02/09/2026) y lo que falta

| Pieza | Estado | Dónde |
|---|---|---|
| Buscador de todo (nombre, matrícula, nº póliza, DNI/tlf/email por índice ciego, CP, riesgo) | ✅ | `BuscadorCartera.tsx`, `cartera-busqueda.ts` |
| Ficha de cliente: pólizas vivas/canceladas/históricas, recibos, siniestros, intervinientes, pago | ✅ PR #1962… | `cliente/[id]/page.tsx`, `cartera-ficha.ts` |
| Ficha de póliza: coberturas, recibos, siniestros, gemela, documentos | ✅ | `poliza/[id]/page.tsx`, `cartera-poliza.ts` |
| Editar contacto (varios tlf/mail, principal), dirección; identidad con documento; alta sin duplicar | ✅ PR #2093 | `EditarCliente.tsx`, `cartera-edicion.ts` |
| Relaciones y autorización direccional | ✅ PR #2098 | `Relaciones.tsx`, `cartera-relaciones.ts` |
| Documentos (pedido/recibido/revisado), pedir DNI | ✅ | `Documentos.tsx`, `cartera-documentos.ts` |
| Historial de cambios | ✅ se escribe y se pinta (tarjeta plegada, 50 filas) | `cartera-historial.ts` |
| Cola de retención (recibos devueltos, art. 15 LCS) | ✅ | `Retencion.tsx`, `cartera-impagados.ts` |
| Retarificar auto/hogar (Codeoscopic, 0,50 €) | ✅ solo tarifica | `lib/codeoscopic/*` |
| **Emitir por Codeoscopic** | ❌ vive en el repo legacy, tras un flag nunca encendido, sandbox | `/home/user/asegura/.../mint-poliza-on-emit.ts` |
| **Conciliación emitida ↔ CIMA** | 🟡 diseño hecho (`docs/superpowers/specs/2026-09-02-emision-conciliacion-cima-design.md`), pendiente de OK; la ficha ya distingue «pendiente de CIMA» y hay guardián de duplicadas | — |
| Alta automática de leads (web, WhatsApp, agente) | ❌ solo alta manual; tablas `conversaciones`/`mensajes`/`oportunidades` vacías y sin escritor | — |
| Estado «con presupuesto» / «ex-cliente» | ✅ derivado (`estadoCliente`, module-seguros) | `estado-cliente.ts` |
| Portal del cliente leyendo la cartera | ❌ hoy solo bóveda de pólizas que el usuario declara; sin FK a `clientes` | `apps/asegura-portal` |
| Autorizados en el portal | ❌ regla escrita (`clientesVisiblesPara`), sin grant ni UI | `module-seguros/relaciones.ts` |
| Apertura/seguimiento de siniestro desde la ficha | ❌ solo lectura de lo que trae CIMA | — |
| «Por qué ha subido la prima» | ❌ | — |

## 5. La pieza crítica: conciliar Codeoscopic ↔ CIMA

Es lo que Alberto pide explícitamente y es **lo que hay que resolver antes de vender**, porque el
primer cliente nuevo la va a pisar. Hechos medidos en el código (02/09/2026):

- **Al emitir** (`mint-poliza-on-emit.ts`, legacy, apagado) se escribe en `polizas` solo:
  `numero_poliza`, `aseguradora`, `tipo`, `prima_anual`, `fecha_inicio` (= emisión) y `fecha_vencimiento`
  (= +1 año, «interinas»). **No** escribe `id_poliza_entidad`, `codigo_entidad_dgs`, `datos_especificos`
  ni `import_ref` (queda NULL, igual que una de CIMA); `origen` cae al default `gestionada_correduria`,
  el mismo que pone CIMA. **Hoy no hay ningún campo que diga «esta la emitimos nosotros».**
- **CIMA** (`poliza-matching.ts`) empareja por (1) `numero_poliza` normalizado + `aseguradora` EXACTA;
  (2) si no, `cliente_id` + `aseguradora` + `fecha_inicio`; (3) si no, inserta. `import_ref` **no
  interviene**. Si casa, `update` reescribe la fila, **incluido `cliente_id`**.

Lo que pasará sin cambiar nada, en orden de probabilidad:

1. **Duplicado.** El nombre de compañía de Codeoscopic («Allianz Seguros y Reaseguros») no coincide
   letra a letra con el de CIMA, o Codeoscopic aún no conoce el número definitivo → no casa → CIMA
   inserta otra póliza. La ficha enseña dos: una «viva» (CIMA) y una nuestra con fechas inventadas.
2. **Pisado.** Si casa, CIMA sobreescribe; lo nuestro que no esté en CIMA (riesgo tal como se tarificó,
   proyecto Codeoscopic, prima ofertada) se pierde o queda huérfano en `codeoscopic_projects.poliza_id`.

**Regla que se propone** (decisión pendiente de Alberto, diseño antes de código):

1. La **emisión se trae a central** (`apps/asegura`), no se reactiva en el legacy. Al emitir se guarda
   `origen = 'emitida_codeoscopic'` (o marcador equivalente), `codigo_entidad_dgs` del catálogo, el
   número que dé Codeoscopic (aunque sea provisional), `datos_especificos` con el riesgo tarificado y el
   `codeoscopic_projects.poliza_id`.
2. CIMA empareja por **número normalizado + `codigo_entidad_dgs`** (código, no nombre), y como
   respaldo por cliente (hash DNI) + código + ventana de ±15 días sobre `fecha_inicio`.
3. Cuando casa con una emitida nuestra: **CIMA manda en lo suyo** (estado, vencimiento, recibos,
   número definitivo, coberturas EIAC) y **rellena huecos, no pisa** lo nuestro (`COALESCE`), con fila
   en `poliza_merge_log`. El `cliente_id` no se cambia si el DNI coincide.
4. Guardián nocturno en la auditoría: **dos pólizas vivas con el mismo número y compañía = aviso**.
5. Hasta que exista esto, la ficha ya distingue «viva (CIMA)» de lo demás; una emitida sin confirmar
   se enseñará como **«pendiente de confirmación por CIMA»**, nunca como viva.

## 6. Leads: cómo entran y cómo se convierten

- **Nace** con nombre + teléfono (o email o DNI: sin uno de los tres no se crea, para que se pueda
  volver a encontrar), `tipo = lead`, `segmento = prospecto`, `fuente_origen` según canal,
  `lead_estado = nuevo`. El puerto ya existe: `POST /api/operador/cliente` busca antes por hash y
  devuelve las coincidencias (PR #2093). **Cualquier canal nuevo pasa por ese mismo puerto.**
- **Canales** (todos pendientes; ninguno crea fichas hoy): formulario web · WhatsApp (no hay WABA) ·
  agente IA · teléfono (alta manual, ya). Cada contacto deja `historial_interno` tipo `contacto`.
- **Convierte** cuando Codeoscopic emite y CIMA confirma (§5). No se toca `tipo` a mano: lo deriva
  la pantalla (§3).

## 7. El portal del cliente (lo que «verá el cliente final»)

Hoy: identidad por código de un solo uso sobre email/consola, y una **bóveda de pólizas declaradas**
por el propio usuario. **No lee la cartera.** 🚨 Medido el 02/09/2026: **sus tablas `portal_*` NO existen en
la BD** (la DDL `apps/asegura-portal/prisma/sql/2026-09-01_portal_fase1.sql` no está aplicada; las únicas
`portal_*` de la base son `public.portal_rates/portal_overrides`, de SIVRA). El portal es hoy código sin
base: antes de leer la cartera hay que aplicarla. Para que enseñe «sus seguros»:

1. Enlazar `portal_identidad` ↔ `clientes` por el índice ciego del email/teléfono (misma HMAC,
   `PII_LOOKUP_KEY`), y cuando el DNI se verifique, por el hash del DNI.
2. Grant de lectura a `prisma_asegura_portal` sobre `polizas`, `recibos`, `siniestros`,
   `poliza_coberturas` y `cliente_relaciones`, **sin BYPASSRLS**; el aislamiento en código, con test.
3. Enseñar lo propio + lo autorizado (`clientesVisiblesPara`), con los niveles de
   `camposVisibles` de `module-seguros-portal/acceso.ts` (el dato de la COSA antes que el de la PERSONA).
4. Misma forma que la ficha del corredor, sin DNI, sin historial, sin retarificar.

## 8. Qué hace un corredor de seguros (para contrastar las pantallas)

Marco: Ley de Distribución de Seguros (RD-ley 3/2020, transposición de la IDD), Ley de Contrato de
Seguro (LCS 50/1980), RGPD. Alberto: DGSFP CS-F/0170. Funciones y su reflejo en el sistema:

| Función del corredor | Norma | En el CRM |
|---|---|---|
| Asesoramiento **independiente** basado en análisis objetivo (comparar suficientes contratos) | RDL 3/2020 art. 155 y ss. | Retarificar en varias compañías (Codeoscopic) ✅ · presupuesto comparado ❌ |
| Información precontractual: documento de información (IPID/DIP), condiciones, comisiones | RDL 3/2020 arts. 173-178 | Documentos por póliza ✅ · plantillas/entrega y prueba ❌ |
| Mediación en la contratación y **emisión** | — | ❌ (§5) |
| Gestión durante la vigencia: modificaciones, agravación del riesgo, cambios de tomador/vehículo | LCS arts. 11-13 | Editar contacto ✅ · cambios de riesgo por compañía ❌ |
| **Cobro y seguimiento de recibos**; impago → suspensión al mes, extinción a los 6 meses | LCS art. 15 | Cola de retención ✅ · aviso al cliente ❌ |
| **Renovación y vencimiento**: preaviso del tomador 1 mes, del asegurador 2 meses | LCS art. 22 | Vencimientos y ventana de anulación ✅ · campaña de renovación ❌ |
| **Siniestros**: comunicar en 7 días, asistir, seguir la tramitación e indemnización | LCS art. 16 | Ver siniestros de CIMA ✅ · abrir/seguir desde la ficha ❌ |
| Conservación de la cartera: retención, mejora de precio, cross-selling (hogar del cliente de auto) | — | Hogar desde Catastro ✅ · propuesta proactiva ❌ |
| Libro registro de la actividad, cuentas separadas de primas, RC profesional, formación continua | RDL 3/2020 | Historial ✅ (sin pintar) · libro de comisiones ✅ (`comisiones_devengo`) |
| Protección de datos: consentimientos, acceso de terceros (familia) documentado, minimización | RGPD | Autorización direccional con rastro ✅ · consentimiento firmado adjunto ❌ · encargado de tratamiento (Codeoscopic/CIMA) pendiente |

Lo que esta tabla dice: **lo que hay cubre la LECTURA y el cuidado de la cartera; lo que falta es
la VENTA (emisión) y la comunicación con el cliente**, que son exactamente las dos cosas que Alberto
tiene vetadas hasta decidirlo (nada sale sin su OK; emisión en sandbox).

## 9. Orden de trabajo (por dependencia, no por apetencia)

1. **Emisión en central + conciliación CIMA (§5).** Sin esto, el primer cliente vendido duplica su
   póliza. Diseño primero (spec en `docs/superpowers/specs/`), OK de Alberto, luego código.
2. **Historial visible en la ficha** (ya se escribe): plegado, montaje perezoso, 50 filas.
3. **Estado derivado «con presupuesto» / «ex-cliente»** en la ficha y en el buscador.
4. **Leads por canal**: primero el formulario web de la correduría (existe la landing de plataforma),
   después agente/WhatsApp cuando haya WABA. Todos por `POST /api/operador/cliente`.
5. **Portal lee la cartera + autorizados (§7).**
6. **Siniestros desde la ficha** (apertura, seguimiento, documentos del parte).
7. **«Por qué ha subido»**: comparar la prima de dos anualidades con los siniestros del ciclo y el
   recargo por fraccionar; helper puro con tres estados (sube por siniestros / sube sin siniestro →
   retarificar / no se puede saber porque CIMA no manda la anualidad anterior).

## 10. Reglas para las sesiones que toquen esto

- Lee este documento y `apps/asegura/CLAUDE.md` (secciones «puerto» y «Codeoscopic») antes de escribir.
- Toda escritura sobre la cartera va por el puerto de asegura con `correduriaId` explícito y deja
  `historial_interno`. Reglas puras en `@central/module-seguros`, con test.
- Nueva pantalla = en `apps/plataforma/(usuario)/correduria`, nunca en asegura.
- Ningún cambio de emisión/CIMA sin spec y OK de Alberto (§5).
- Al cerrar un pendiente de la tabla del §4, actualiza este documento en el mismo PR.
