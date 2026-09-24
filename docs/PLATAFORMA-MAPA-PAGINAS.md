# 🗺️ Mapa de las páginas de `apps/plataforma` — inventario del 02/09/2026

> Alberto, tras el rediseño del Inicio: **«aprovecha y revisa todas las páginas. creo q tb están mal
> organizado.»** Esto es el inventario medido que respondió a eso, y el plan de lo que queda.
> **Cifras de la foto del 02/09/2026** (`main` en `7759bfcb`). Al releerlo, cuenta otra vez: este
> documento envejece con cada PR.

## La forma del problema

| Medida | Valor |
|---|---|
| `page.tsx` en `apps/plataforma/app/` | **76** |
| Entradas del menú (`UserSidebar.tsx`) | **51** |
| Rutas FUERA del menú | **25** |
| Rutas que no se podían alcanzar pulsando en ningún sitio | **7** |
| Entradas de menú rotas | **0** ✅ |

**El panel no estaba mal ordenado: estaba sin podar.** Cada capacidad nueva añadió su entrada y nunca
se quitó ninguna. El único intento de arreglarlo —la «Fase 4 de des-duplicación», iniciada el
10/07/2026— se paró a mitad y dejó **las pantallas viejas Y las nuevas**; sus pendientes llevaban dos
meses escritos en `apps/plataforma/CLAUDE.md` sin ejecutar.

## ✅ Hecho el 02/09/2026

**Podadas** (el redirect se queda: salva los marcadores viejos; lo que se va es el cuerpo):

| Ruta | Qué era | Por qué |
|---|---|---|
| `/sivra/inversion` | 616 líneas, **3.ª pantalla más grande de la app** | Sustituida por `/subastas` (PR #1117, 28/07). Su propio mensaje de commit decía que el lector llevaba «parado desde mayo». Ninguna cron la alimentaba; solo su página consumía su API. → redirige a `/subastas` |
| `/finanzas/proyeccion` | 19 + 310 líneas | Duplicada por el segmento Fiscal de `/banca`, **mismo motor** `calcularEstadoDeclaracion`. → redirige a `/banca?tab=fiscal` |
| `RadiografiaClient.tsx` | 270 líneas | Cero consumidores desde que su página pasó a solo redirigir |

**Reagrupado:** «Mi negocio» se parte en **Mi negocio** (gestionar) + **🔭 Oportunidades** (buscar:
Concursos · Subastas · Analizar compra · Empresas · Inversión · Patrimonio).

**Enlazado:** `/sivra/partes/establecimientos` entra al menú — el cron `ses-latido` avisaba por
Telegram de que «no hay ningún establecimiento dado de alta» **ahí**, y no había forma de abrirlo.

## ⏳ Lo que queda, por orden de valor

### 1. Duplicados reales (es lo que de verdad baja de 76)
- **`/finanzas?tab=categorias` y el segmento Personal de `/banca` montan LITERALMENTE el mismo
  componente** (`finanzas/CategoriasTab.tsx`). Dos URLs, una pantalla. Y `/banca` enlaza de vuelta a
  `/finanzas?tab=categorias`, así que se puede dar vueltas en círculo.
- **Dos hubs financieros coexisten**: `/finanzas` (fuera del menú, con sus pestañas) y `/banca`.
- **Seis pantallas de dinero de pisos** (Ingresos · Gastos · Gastos fijos · Facturas · Fiscal IRPF ·
  Resultado pisos) contra las cuatro pestañas de `/banca`.
- **Cuatro pantallas de pricing** (Pricing Lab · Pricing auto · Motor vs PL · Competencia) para un
  motor que decide solo.

### 2. Huérfanas que quedan vivas a propósito
- **`/finanzas/tarjeta-credito`** (102 líneas): **no está duplicada**, es la vista de liquidaciones de
  tarjeta. Sigue sin enlace. El `CLAUDE.md` dice «absorber en Personal» — sin hacer. No se podó porque
  borrar una función que Alberto nunca ha podido ver no es podar, es perderla.
- **`/dashboard`** y **`/admin`**: solo redirigen y nadie las enlaza, **pero NO son borrables**.
  `/dashboard` es el `start_url` de la PWA (`public/manifest.json`) y el destino de 17
  `redirect('/dashboard')` de operador; además `banca/NegociosResumen.tsx` importa de `dashboard/`.

### 3. Operador: 20 de 51 entradas (39 % del menú)
Es la administración del SaaS que Alberto **vende a otros** (ia-rest, ialimp, RR.HH.), no sus
negocios. Compite por espacio con su banca todos los días para algo que abre una vez al mes. No se
tocó: mover eso es una decisión suya, no una limpieza.

## ⚠️ Lo que este inventario NO comprobó

Se levantó leyendo el código, sin ejecutar nada. Honestamente:

1. **«Huérfana» = sin enlace en el código, NO «sin visitas».** Puede haber marcadores del navegador.
2. **No se comprobó que las huérfanas renderizaran sin error.** Nadie podía abrirlas para notarlo.
3. **No se auditaron sistemáticamente los constructores de URL de `lib/`** (Telegram, emails): alguna
   ruta llamada huérfana podría recibir visitas desde un aviso. Para `/sivra/inversion` sí se descartó
   (cero apariciones en todo el repo); para el resto, no exhaustivamente.
4. **El peso por pantalla es un proxy sesgado**: se contó `page.tsx`, y casi todas delegan en un
   `*Client.tsx` hermano que no se midió. `/sivra/domotica` tiene 7 líneas y no es una pantalla pequeña.
5. **No se leyó `middleware.ts` entero** ni se buscaron `rewrites`: podría haber URLs vivas fuera de
   esta lista.
