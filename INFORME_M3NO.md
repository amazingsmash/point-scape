# Informe técnico: estructura de datos M3NO

**Fecha:** 28 de septiembre de 2026  
**Ámbito:** M3NO publicado por Hermann, Krämer, Dorra y Kuijper, y la variante implementada en PointScape.

## 1. Resumen y alcance

M3NO significa *Min–Max Modifiable Nested Octree*. Combina una jerarquía espacial de octrees anidados, niveles de detalle (LoD) y resúmenes de atributos por subárbol. Su objetivo original es incorporar puntos LiDAR a medida que llegan y consultar tanto su posición como rangos de atributos sin esperar a una conversión completa. Los puntos de los nodos superiores forman una vista poco densa; los niveles inferiores agregan detalle. El índice de atributos permite descartar subárboles antes de leer sus puntos.

**Distinción esencial:** el artículo de 2025 describe M3NO dentro de *Lidarserv*, con varias raíces creadas dinámicamente, índices configurables para atributos arbitrarios, consultas continuas y un servidor. PointScape implementa una **variante para archivos LAS locales**: una raíz por archivo con extensión conocida, rejilla de 32³ celdas por nodo, resúmenes de altitud y clasificación, datos temporales en IndexedDB y selección de LoD en el navegador. PointScape no implementa las consultas arbitrarias ni la captura LiDAR en vivo de Lidarserv. Las cifras del artículo **no son mediciones de PointScape**. [Artículo original](https://doi.org/10.1016/j.cag.2025.104254), [arquitectura de PointScape](ARCHITECTURE.md).

## 2. Modo de funcionamiento

### Construcción e inserción

1. Se define un volumen raíz y se subdivide por la mitad en X, Y y Z. Cada nodo espacial tiene hasta ocho octantes; solo se materializan los ocupados.
2. Dentro de cada nodo hay una rejilla regular. Cada celda guarda como representante el punto más cercano al centro. Los puntos que compiten por la misma celda, incluido el representante desplazado si llega uno mejor, continúan hacia el octante hijo. Un punto aparece como muestra en **un único nivel**.
3. Así se obtiene una distribución progresiva: los nodos superiores cubren el espacio de manera gruesa y los inferiores aportan densidad. Los puntos de resolución completa se conservan para consultas o visualización final.
4. En el M3NO del artículo, cada nueva observación actualiza además los índices de atributos de los nodos que contienen su subárbol: intervalos mínimo–máximo o listas de intervalos ocupados. La consulta clasifica cada nodo como imposible, totalmente válido o parcialmente válido; solo en el tercer caso hay que filtrar sus puntos uno a uno.

El sistema publicado puede crear nuevas raíces en una retícula espacial fija conforme el escáner alcanza zonas nuevas. Usa por defecto rejillas de 256³ **posiciones posibles** por nodo, almacenadas de forma dispersa, y una caché de nodos con expulsión LRU al disco. La selección de representante y las consultas se detallan en las secciones 3–5 del [artículo](https://doi.org/10.1016/j.cag.2025.104254).

**PointScape:** toma los límites del encabezado LAS y crea una raíz por archivo. Su rejilla es de 32 × 32 × 32, por lo que hay como máximo **32.768 muestras por nodo**, aunque normalmente muchas celdas están vacías. La subdivisión espacial tiene profundidad configurada máxima de 8 y deja de ser necesaria cuando la diagonal baja a 100 m. Para limitar cada hoja a un máximo que varía entre 50.000 y 200.000 puntos según el dispositivo, puede seguir dividiendo grandes particiones por orden de entrada cuando llega al límite geométrico; esos hijos ya no representan octantes más pequeños. Las hojas guardan todos los puntos válidos. La construcción se hace por amplitud, con lecturas y escrituras acotadas y vista preliminar progresiva. [Constructor](pointscape-octree-builder.js), [arquitectura](ARCHITECTURE.md).

### Índices de atributos

| Índice del M3NO publicado | Qué guarda por subárbol | Cuándo ayuda | Coste o límite |
|---|---|---|---|
| Rango mínimo–máximo | Los extremos de un atributo numérico | Valores relativamente continuos y agrupados espacialmente | Produce falsos positivos si hay grandes huecos entre extremos. |
| Lista de bins ocupados | Hasta un número acotado de intervalos adaptativos | Clasificación, tiempo GPS u otros valores discontinuos | Más memoria y mantenimiento; comprobar los bins cuesta más que comparar dos extremos. |

En la evaluación del artículo, la lista de bins mejoró consultas de clasificación, pero tuvo un coste de inserción de aproximadamente **4,7 %** respecto al índice de rango en la prueba indicada. La conveniencia depende de la distribución del atributo; el índice de rango se recomienda allí para la mayoría de los atributos. En PointScape se serializan un rango de altitud y un conjunto de clases, pero el selector de LoD actual **no los usa como predicado de consulta**. [Constructor](pointscape-octree-builder.js), [selector](pointscape-lod-system.js), [artículo](https://doi.org/10.1016/j.cag.2025.104254).

## 3. Propiedades geométricas y computacionales

### Geometría

- Cada nodo espacial tiene una caja alineada con los ejes. Tras `l` subdivisiones espaciales, las longitudes de sus lados son las de la raíz divididas por `2^l`; su diagonal euclídea también se reduce por `2^l`. Esta propiedad no se aplica a la subdivisión ordinal usada por PointScape para limitar hojas densas.
- La profundidad refleja resolución espacial y densidad de muestras; no representa una superficie continua ni crea una malla. Una nube concentrada sobre terreno o fachadas suele ocupar pocas celdas del volumen 3D.
- En una celda de lados `sx`, `sy`, `sz`, dos puntos cualesquiera pueden separarse hasta `√(sx²+sy²+sz²)`. Por tanto, si una celda ocupada conserva un representante, esa diagonal es una **cota geométrica local gruesa** para sustituir puntos de la misma celda. No es una cota de error de color, clase, intensidad, normales ni silueta, y no garantiza calidad perceptiva uniforme.
- La elección del punto más cercano al centro da una muestra espacial estable ante distintos órdenes de llegada, salvo empates. Puede omitir elementos delgados o clases poco frecuentes dentro de una celda. La densidad 3D real puede variar mucho entre nodos.

### Cómputo y almacenamiento

- La ruta de un punto visita como máximo un nodo por nivel; con profundidad efectiva `L`, el coste de inserción y actualización de resúmenes es del orden de **O(L)** por punto y **O(NL)** para `N` puntos, suponiendo búsqueda esperada constante de celda. Con `L` acotado, escala aproximadamente de forma lineal con la entrada. I/O, compresión, distribución espacial y atributos pueden dominar el tiempo real.
- Una consulta espacial o por atributo puede podar subárboles enteros. Su coste depende de cuántos nodos y puntos sobreviven a esa poda; en el peor caso se acerca a recorrer y filtrar toda la nube. Los atributos distribuidos uniformemente en casi todos los nodos reducen mucho la ventaja.
- El LoD acumulativo mantiene muestras de antepasados mientras añade descendientes. Esto evita huecos durante la transición, pero exige un presupuesto de puntos y memoria. En PointScape, las hojas guardan además todos los puntos originales; esa copia completa aumenta el almacenamiento temporal. Al dibujar una hoja completa pueden coincidir visualmente puntos originales con muestras de antepasados.
- El artículo informa **5,24 millones de puntos/s** en Lille y **2,29 millones de puntos/s** en AHN4 para su implementación y equipo de pruebas. PotreeConverter 2.0 fue entre **20 % y 211 % más rápido** al convertir esos conjuntos fuera de línea. Son resultados del experimento publicado, no garantías generales ni tasas del navegador. El índice de atributos de AHN4 ocupó unos **327 MiB** para 3,2 millones de nodos; este componente vive en RAM y limita el tamaño práctico. [Resultados y límites](https://doi.org/10.1016/j.cag.2025.104254).

## 4. Ventajas y desventajas frente a alternativas

| Alternativa | Ventaja de M3NO | Cuándo conviene más la alternativa |
|---|---|---|
| Octree o Potree convertido fuera de línea | Inserción incremental y, en la versión publicada, filtrado por atributos integrado durante la captura. | Si el conjunto ya está cerrado y prima la velocidad de conversión o un formato de visor consolidado. PotreeConverter genera un octree con LoD para streaming; el artículo midió mayor velocidad de conversión en sus pruebas. [PotreeConverter](https://github.com/potree/PotreeConverter). |
| Quadtree 2D con altura como atributo | El octree 3D separa mejor pisos, puentes, túneles, fachadas y vuelos superpuestos en XY. | Para un terreno casi 2,5D puede tener menor profundidad y menos nodos: cuatro hijos por división horizontal frente a ocho espaciales. En PointScape, el modo QuadTree ofrece esa alternativa. |
| COPC | M3NO publicado añade índices de atributos y actualizaciones durante la adquisición. | Para intercambiar, archivar y servir nubes ya procesadas: COPC es un LAZ 1.4 de archivo único, comprimido y con octree accesible por rangos. [Especificación COPC](https://copc.io/). |
| 3D Tiles | M3NO responde bien a captura y consulta LiDAR especializada. | Para interoperabilidad de escenas geoespaciales heterogéneas y distribución web; 3D Tiles define teselas, refinamiento y error geométrico. No equivale por sí solo a un índice de atributos arbitrarios de M3NO. [Especificación de teselado implícito](https://github.com/CesiumGS/3d-tiles/blob/main/specification/ImplicitTiling/README.adoc). |
| Índice de base de datos por parches, como pgPointcloud | La jerarquía integra LoD y poda espacial para visualización continua; el artículo midió inserción más rápida que pgPointcloud en su banco. | Si importan consultas SQL, integración transaccional y gestión en una base de datos ya operativa. El resultado de rendimiento depende de esquema, hardware y consultas. [Artículo](https://doi.org/10.1016/j.cag.2025.104254). |

**Desventajas propias:** mantener muestras, jerarquía e índices añade complejidad y memoria; los nodos de gran volumen pueden cargar falsos positivos de atributos; la estructura puede desequilibrarse con zonas muy densas; el M3NO publicado solo admite añadir puntos, no modificar los ya indexados sin reconstruir el índice. Si la tasa de captura supera la de indexación durante suficiente tiempo, las colas en RAM de Lidarserv pueden crecer hasta agotar memoria. Ninguna de estas ventajas funcionales del M3NO publicado debe extrapolarse sin más a PointScape. [Secciones 7.3 y 8 del artículo](https://doi.org/10.1016/j.cag.2025.104254).

## 5. Cuándo se recomienda

**M3NO publicado:** captura móvil o aérea que requiere control de calidad mientras se escanea; exploración inmediata de conjuntos masivos; consultas combinadas de volumen, clase, tiempo, intensidad u otros atributos; varios visores que consultan un servidor y solo reciben el detalle visible. Resulta especialmente atractivo cuando los valores filtrados se agrupan espacialmente o dejan subárboles completos fuera de la consulta.

**Variante PointScape:** inspección interactiva local de LAS grandes, con edificios u otras estructuras en varias alturas y necesidad de acercarse progresivamente sin cargar toda la nube en GPU. El modo QuadTree puede ser preferible para datos casi planos y cuando interesa reducir la complejidad vertical. PointScape no admite directamente LAZ comprimido y usa almacenamiento temporal del navegador, así que no es el formato de archivo recomendado para intercambio o preservación. [README](README.md), [arquitectura](ARCHITECTURE.md).

**No es la primera elección** si se necesita editar puntos ya indexados, minimizar al máximo el tamaño de un conjunto estático, consultar continuamente atributos que aparecen en casi todos los nodos, o distribuir un archivo interoperable mediante lecturas HTTP por rango: allí conviene evaluar soluciones de base de datos, Potree o COPC según el objetivo.

## 6. Visualización interactiva y LoD

La visualización natural es una cámara 3D que navega la nube y solicita una jerarquía de detalle. En el artículo, Lidarserv recibe consultas continuas por frustum y filtra también atributos; su LoD objetivo se expresa mediante **separación proyectada máxima entre puntos en píxeles**. El visor puede colorear por atributo, aplicar cortes espaciales y cambiar predicados sin volver a construir el árbol. [Secciones 5–6 del artículo](https://doi.org/10.1016/j.cag.2025.104254).

En PointScape, la vista es un mapa georreferenciado con nube WebGL, color por clase, iluminación de bordes (*EDL*), controles de tamaño de punto y un inspector 3D de nodos. El inspector permite examinar un nodo y su rejilla sin cargar todos sus descendientes. Un modo de cajas de nodos ayuda a ver qué volumen y nivel están activos. Estas funciones sirven para validar densidad, huecos y transiciones de LoD. [Arquitectura](ARCHITECTURE.md), [inspector](node-inspector.js).

**LoD mínimo necesario para M3NO:** muestra gruesa por nodo; frustum o prueba de visibilidad; métrica en pantalla para decidir expansión; presupuesto global de puntos; prioridad de carga; histéresis de expansión y visibilidad; conservación de cobertura mientras llega detalle; y, si hace falta fidelidad exacta, nivel completo de hoja. El LoD **acumulativo** suma hijos al padre. Por eso el coste de una expansión es el de los puntos hijos admitidos, mientras que en un LoD por sustitución los hijos reemplazan el coste del padre.

PointScape implementa este esquema con umbral inicial equivalente a **15°** de diagonal proyectada y colapso con 10 % de histéresis, es decir, alrededor de **13,5°**. Con la matriz de MapLibre disponible, compara la diagonal de la caja proyectada en píxeles contra el umbral angular convertido a píxeles; usa el ángulo geométrico como alternativa. Su límite inicial es **1.500.000 puntos visibles**, configurable. Selecciona operaciones por prioridad visual global, admite hijos M3NO de uno en uno y ofrece niveles intermedios de densidad en hojas antes de usar todos sus puntos. Una rejilla de 32³ fija no sustituye a este selector: las muestras jerárquicas necesitan decidirse según cámara y presupuesto. [Configuración](script.js), [LoD](pointscape-lod-system.js), [selección](tile-selection.js).

## 7. Política de carga y descarga

| Etapa | Política actual de PointScape |
|---|---|
| Indexación | Un Web Worker lee el LAS por bloques de 4–16 MiB, crea particiones temporales en IndexedDB y publica primero la raíz. Hay contrapresión: como máximo una tanda de teselas se confirma mientras se prepara otra. Los metadatos finales quedan en memoria. |
| Admisión | Se descartan cajas fuera de seis planos de cámara mediante una prueba conservadora. La entrada usa 5 % de margen, la salida 18 % y se mantiene al menos 220 ms de residencia visible. El selector gasta el presupuesto global donde la diagonal proyectada promete más detalle. |
| Lectura | Primero se establece la cobertura raíz. Después se lee una representación elegible cada vez desde IndexedDB, en orden de prioridad, y se cede entre subidas a GPU. Las muestras y los puntos completos de hoja se almacenan por separado. Una lectura terminada solo se incorpora si la cámara actual todavía la necesita. |
| Transición | Se mantienen muestras de antepasados y hasta 220 ms la última imagen completa mientras llegan sucesores, siempre dentro del presupuesto de dibujo. M3NO muestra cada hijo listo de forma individual. |
| Descarga | Una muestra o representación completa que ya no figura en el plan ni en la transición se retira de la caché de trabajo; los buffers WebGL que salen del conjunto dibujado se destruyen. Cambiar de nube reinicia la época y rechaza lecturas antiguas. Los datos de IndexedDB son temporales y pueden releerse sin reindexar el LAS. |

Además del límite exacto de puntos dibujados, el cargador reserva una asignación contabilizada de `máx(128 MiB, presupuesto de puntos × 96 bytes)` para caché empaquetada, dibujo y preparación de la siguiente lectura. **No mide toda la RAM del navegador ni la VRAM.** Si una carga indivisible no cabe, conserva la muestra disponible. La política y sus pruebas están en [streaming](pointscape-lod-streaming.js), [selección](tile-selection.js) y [arquitectura](ARCHITECTURE.md).

El documento [M3NO_LOD_DOCUMENTATION.md](M3NO_LOD_DOCUMENTATION.md) conserva la descripción de una versión anterior. Sus afirmaciones sobre ausencia de presupuesto global, visibilidad solo detrás de cámara, previsualización desactivada y almacenamiento conjunto de muestra/hoja **ya no describen la ruta actual**.

## Fuentes y método

- Hermann, P., Krämer, M., Dorra, T. y Kuijper, A. (2025). [*Real-time indexing and visualization of LiDAR point clouds with arbitrary attributes using the M3NO data structure*](https://doi.org/10.1016/j.cag.2025.104254), *Computers & Graphics*, 130, 104254. Se consultó también la [copia PDF incluida en el repositorio](Real-time%20indexing%20and%20visualization%20of%20LiDAR%20point%20clouds%20with%20arbitrary.pdf).
- Código y documentación local de PointScape: [constructor](pointscape-octree-builder.js), [selección](tile-selection.js), [sistema LoD](pointscape-lod-system.js), [streaming](pointscape-lod-streaming.js), [arquitectura](ARCHITECTURE.md).
- Fuentes primarias de las alternativas: [PotreeConverter](https://github.com/potree/PotreeConverter), [COPC 1.0](https://copc.io/), [3D Tiles, teselado implícito](https://github.com/CesiumGS/3d-tiles/blob/main/specification/ImplicitTiling/README.adoc).

Las cotas geométricas y los órdenes de complejidad indicados son deducciones a partir de la estructura y del algoritmo; los valores medidos proceden exclusivamente del artículo. No se ejecutó una comparación experimental entre PointScape y las alternativas.
