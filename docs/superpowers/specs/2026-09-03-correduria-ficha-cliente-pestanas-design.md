# Ficha de cliente de la correduría: cabecera + pestañas

> Dictado por Alberto el 03/09/2026: «no lo veo práctico, veo mejor cómo tenemos mi pantalla:
> arriba datos de él y ya en pestañas — contactos, pólizas, recibos, etc.», con la captura de su
> CRM anterior. Sustituye al principio de diseño del 02/09 («sin pestañas, todo en una pantalla»),
> que él mismo había pedido y que la práctica ha desmentido: son ~12 tarjetas apiladas y el scroll
> se ha comido la pantalla.

## 1. El problema que resuelve, y el que NO puede crear

Resuelve: la ficha (`/correduria/cliente/[id]`, 688 líneas en un archivo) apila cabecera, KPIs,
personas, edición, relaciones, cuatro tablas de pólizas, siniestros, documentos e historial. Para
ver un siniestro hay que pasar por delante de todo lo demás.

**El riesgo que NO se puede crear** es el que tiene el CRM antiguo, y es el motivo de que necesite
chapitas rojas en las pestañas: *lo que no está en la pestaña abierta no existe*. Un recibo devuelto
o un siniestro abierto escondido tras un clic es un recibo que no se reclama. Por eso:

**Regla de esta pantalla: lo que exige una llamada vive en la CABECERA, fuera de las pestañas.**

## 2. Anatomía

### Cabecera (idéntica en las 7 pestañas)
1. `← Correduría` · nombre · estado derivado con su motivo · contacto efectivo (con «de quién es el
   número») · cónyuge · acción «Subir póliza o documento».
2. **Cinco tiles**: pólizas vivas · recibos devueltos · recibos al cobro · siniestros abiertos ·
   **próximo vencimiento accionable** (nuevo). Cada uno con sus tres estados: `—` = no se ha podido
   mirar · `0` = mirado y no hay · `n` = el dato.

El quinto tile es contenido nuevo, no decoración: hoy la fecha en que aún se puede oponer a la
prórroga (vencimiento − 30 días, LCS art. 22) está enterrada dentro de una celda de la tabla, y es
la única fecha de la ficha sobre la que se puede actuar.

### Pestañas

| Pestaña | Contenido | Contador |
|---|---|---|
| **Resumen** (por defecto) | Pólizas vivas · emitidas pendientes de CIMA · lo que pide acción hoy | — |
| **Pólizas** | Vivas · pendientes de CIMA · canceladas (plegado) · volcado histórico (plegado) | nº de vivas |
| **Recibos** | Una fila por póliza: estado de cobro + último recibo → enlace a la póliza | 🔴 devueltos |
| **Siniestros** | El bloque `Siniestros` actual, sin tocar | 🟠 abiertos |
| **Contactos** | Datos del cliente (editar) + personas en sus pólizas + relaciones y autorizaciones | nº de personas |
| **Documentos** | El bloque `Documentos` actual, sin tocar | 🟠 pedidos sin recibir |
| **Historial** | Las anotaciones | — |

Un contador `null` (no se pudo leer) **no se pinta**, no se pinta como 0.

## 3. Mecanismo

`?tab=recibos` por URL, con el patrón que ya existe en la app (`app/(usuario)/banca/SegTabs.tsx`:
subrayado, `lucide-react`, `role="tablist"`). La página sigue siendo un Server Component y **solo
renderiza la pestaña activa**.

- **Ventaja real:** enlazable (un aviso puede apuntar directo a sus recibos) y no se monta el DOM de
  los 12 bloques de golpe (regla de rendimiento de `CLAUDE.md`).
- **Lo que NO ahorra, y hay que decirlo:** `fichaAsegura(id)` trae la ficha ENTERA en una sola
  petición al puerto de asegura; cambiar de pestaña la repite. Se ahorra DOM y ruido visual, no
  latencia. Trocear el puerto es otro trabajo y no entra aquí.
- `prefetch={false}` en los enlaces de pestaña: con `dynamic = 'force-dynamic'`, prefetchear siete
  pestañas serían siete llamadas al puerto —y a la BD— por pasar el ratón.
- Un `tab` desconocido cae a `Resumen` sin fallar.

## 4. Colores: de dónde salen

De `app.grupoasegura.com` (la app que hizo Manuel, repo `albertosuarezgutierrez-gif/asegura`),
leídos de su `src/app/globals.css` y convertidos de oklch a hex, **no a ojo**:

| | Grupo ASegura | plataforma hoy |
|---|---|---|
| Primario | `#3364ee` (claro) · `#497cfd` (oscuro) | `#4f46e5` · `#818cf8` |
| Superficie acento | `#e0efff` sobre `#16307a` | `--primary-light: #eef2ff` |
| Éxito · error | `#118659` · `#e7000b` | `#059669` · `#dc2626` |
| Fuente · radio | Inter + Fraunces · 16px | Inter · 14px |

⚠️ **La captura verde que se pasó en la conversación NO es la app de Manuel**: es otro programa
anterior. Aplicarle su verde a esta pantalla habría sido pintar con los colores del equivocado.

**Aplicación acotada:** un bloque `.correduria` en `app/globals.css` redefine los tokens
(`--primary`, `--primary-light`, `--primary-hover`) para esa sección, y un `layout.tsx` en
`/correduria` lo cuelga. Los componentes siguen usando `var(--primary)` — ningún hex suelto, que es
la regla del propio `globals.css`. El resto de plataforma no cambia: es el cuadro de mando de TODOS
los negocios, no de la correduría.

## 5. Reparto de archivos

```
app/(usuario)/correduria/
  layout.tsx                      NUEVO  · envuelve la sección en .correduria
  cliente/[id]/
    page.tsx                      · cabecera + despacho de pestaña (queda ~150 líneas)
    Cabecera.tsx                  NUEVO  · identidad, contacto y los 5 tiles
    FichaTabs.tsx                 NUEVO  · la barra, con contadores
    TabResumen.tsx                NUEVO
    TabPolizas.tsx                NUEVO
    TabRecibos.tsx                NUEVO
    TabContactos.tsx              NUEVO
    piezas.tsx                    NUEVO  · tabla de pólizas y celdas compartidas
packages/module-seguros/src/
  ficha-resumen.ts + .test.ts     NUEVO  · clasificación y contadores, PUROS
```

`Siniestros`, `Documentos`, `Historial`, `Relaciones` y `EditarCliente` se reusan tal cual: cambia
dónde se montan, no lo que hacen.

## 6. Qué se comprueba

- `packages/module-seguros/src/ficha-resumen.test.ts`: las cuatro clases de póliza, `null` vs `0` en
  recibos/siniestros/documentos, y el próximo vencimiento con `hoy` fijo.
- Typecheck de `apps/plataforma` y `pnpm test` de la raíz.
- Móvil a 390 px: la barra de pestañas scrollea **dentro de sí misma**; la página no. Se mide sobre
  el scroller de `LayoutShell`, no sobre `body` (que miente, `CLAUDE.md`).

## 7. Fuera de alcance (dicho, no olvidado)

- **Extracto real de recibos.** El puerto solo manda contadores por póliza + el último recibo; la
  lista completa vive en el endpoint de la póliza. La pestaña «Recibos» es por tanto una fila por
  póliza con enlace, no un extracto. Para el extracto hay que tocar `apps/asegura`.
- La ficha de PÓLIZA (`/correduria/poliza/[id]`, 603 líneas) se queda como está.
