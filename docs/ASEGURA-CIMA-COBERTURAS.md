# Coberturas que vuelca CIMA — inventario y semántica (medido el 02/09/2026)

> Sobre `seguros.poliza_coberturas` de central: **1.425 coberturas en 110 pólizas, 182 códigos distintos**.
> Los códigos son **de cada compañía** (el `00000006` de Mapfre no existe en Occident): no hay catálogo
> común y no se inventa uno. La ficha de póliza en plataforma (`/correduria/poliza/[id]`) los pinta con
> descripción, código y modalidad; el catálogo vivo se saca con la consulta del final, no de este doc.

| Compañía | Ramo | Pólizas | Códigos | Filas |
|---|---|---|---|---|
| Mapfre | auto | 53 | 39 | 598 |
| Occident | hogar | 10 | 71 | 522 |
| Mapfre | hogar | 9 | 28 | 194 |
| Allianz | auto | 26 | 12 | 47 |
| Occident | responsabilidad civil | 7 | 17 | 29 |
| Occident | auto / moto | 2 | 12 | 24 |
| Reale | auto | 1 | 7 | 7 |
| Mapfre | responsabilidad civil | 2 | 3 | 4 |

## Qué significa cada campo (y las tres trampas)

- **`capital_asegurado` es TEXTO del EIAC**, y solo 385 de 1.425 filas son un importe. Las otras:
  **`0` (618 filas)** = la garantía no lleva capital propio (RC obligatoria, asistencia, defensa jurídica,
  riesgos extraordinarios…) — **pintarlo como «0 €» es mentir**, el cliente está cubierto;
  **`INF` (38, Allianz)** = ilimitado; **NULL (384)** = no informado. `interpretarCapital()` de
  `@central/module-seguros` devuelve los cuatro casos y la ficha los distingue.
- **`descripcion_capital`** (47 filas, Allianz): repite la descripción de la garantía; no aporta.
- **`modalidad_valoracion`**: `VP` (713), `VT` (83), `VE` (47), NULL (582, Occident y Reale). Código EIAC de
  la compañía; se muestra tal cual («val. VP») porque la tabla oficial no está en el repo. ⚠️ No traducir
  a ojo: `VT` coincide con las garantías con capital numérico de Mapfre (seguro del conductor, fallecimiento,
  invalidez), pero eso es correlación, no definición.
- **`datos_extra`** (35 filas) es donde está lo que acota de verdad la garantía: `DatosLimitesAsegurados.Limite`
  (clase `PS`/`NI`, mínimo, máximo, «Por siniestro»), `DatosFranquicias.Franquicia` (porcentaje, mínimo,
  máximo) y `DatosImportes` (prima neta y total **de esa cobertura**). `extraerDetalleCobertura()` lo lee y el
  puerto lo manda como `detalle`; la ficha añade las columnas Límite y Prima solo cuando alguna fila lo trae.
- **`franquicia`** (columna plana): 0 filas. Las franquicias reales viven en `datos_extra`.
- **`fecha_inicio` / `fecha_fin`**: la anualidad en curso de la garantía (Mapfre las manda; Occident no).

## Patrones por compañía

- **Mapfre auto** manda un bloque fijo de 12-16 garantías por póliza (RC obligatoria, suplementaria,
  defensa, asistencia, lunas, robo, incendio, riesgos extraordinarios, seguro del conductor) con capital
  `0` salvo el seguro del conductor, y **dos numeraciones** conviven: `0000000N` (pólizas antiguas) y
  `000N0000`/`000N0M0P` jerárquica (las nuevas, con sub-garantías «Indemn. …»).
- **Occident hogar** manda 40-55 garantías por póliza, muy granulares (goteras, cerraduras, ocupación
  ilegal, plagas…), casi todas sin capital: el capital está en el continente/contenido de la póliza, no en
  la garantía. Es la que más límites lleva en `datos_extra`.
- **Allianz auto**: 1-2 garantías con capital `INF`; el paquete «BASICO» es una sola línea.
- **Reale auto**: 7 garantías, sin modalidad ni fechas.

## Consulta para regenerar el catálogo

```sql
SELECT p.aseguradora, p.tipo::text AS ramo, c.codigo, c.descripcion,
       count(*) AS filas, count(DISTINCT c.poliza_id) AS polizas,
       count(*) FILTER (WHERE c.capital_asegurado ~ '^[0-9]+(\.[0-9]+)?$' AND c.capital_asegurado::numeric <> 0) AS con_capital,
       string_agg(DISTINCT coalesce(c.modalidad_valoracion,'-'), '/') AS modalidades
FROM seguros.poliza_coberturas c JOIN seguros.polizas p ON p.id = c.poliza_id
GROUP BY 1,2,3,4 ORDER BY 1,2,3;
```
