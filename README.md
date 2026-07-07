# PointScape

PointScape es una aplicacion web para visualizar nubes de puntos LiDAR en formato LAS sobre un mapa interactivo centrado en Las Palmas de Gran Canaria. El proyecto combina cartografia web, terreno 3D, controles de camara y un visor WebGL propio para cargar, clasificar, indexar y explorar puntos directamente en el navegador.

El objetivo del proyecto es servir como demostrador tecnico y academico de visualizacion e indexacion en tiempo real de nubes de puntos, con una interfaz ligera que no requiere backend de procesamiento: los ficheros LAS se seleccionan localmente y el trabajo pesado se realiza en el cliente.

## Autoria

Desarrollado por **Jose Miguel Santana Nunez** en 2026.

Proyecto vinculado a la **Universidad de Las Palmas de Gran Canaria (ULPGC)** y a la **Escuela de Ingenieria Informatica (EII)**.

Repositorio: <https://github.com/amazingsmash/point-scape>

## Caracteristicas principales

- Mapa interactivo con MapLibre GL JS.
- Vista base con imagen satelital y mapa de calles.
- Soporte de terreno, sombreado y exageracion vertical.
- Carga local de uno o varios ficheros `.las`.
- Visualizacion WebGL de puntos sobre el mapa.
- Colores por clasificacion LAS.
- Control de tamano de punto, desplazamiento vertical y ventaja de profundidad.
- Modo de indexacion seleccionable: QuadTree o M3NO.
- Carga adaptativa por nivel de detalle.
- Visualizacion opcional de limites de nodos cargados y etiquetas de teselas.
- Estadisticas de la nube de puntos cargada.
- Boton para volar automaticamente hasta la nube de puntos.
- Pantalla de presentacion corporativa al arrancar.
- Acceso directo al repositorio de GitHub desde la interfaz.

## Requisitos

- Node.js.
- Un navegador moderno con soporte WebGL.
- Conexion a Internet para descargar librerias y teselas externas.

No hay dependencias npm instalables en este repositorio. El servidor local usa modulos nativos de Node.js y las librerias del visor se cargan desde CDN.

## Puesta en marcha

Desde la raiz del proyecto:

```bash
npm start
```

La aplicacion queda disponible en:

```text
http://127.0.0.1:5173/
```

Tambien se puede cambiar el host o el puerto mediante variables de entorno:

```bash
HOST=127.0.0.1 PORT=5173 npm start
```

En Windows, el repositorio incluye tambien `lanzar.cmd` y `lanzar.ps1` como accesos comodos para iniciar la aplicacion.

## Uso basico

1. Abre la aplicacion en el navegador.
2. Espera a que desaparezca la pantalla de presentacion.
3. Usa el panel lateral para elegir mapa base, terreno, camara y parametros de LOD.
4. Arrastra ficheros `.las` al area de carga o pulsa para seleccionarlos.
5. Revisa las estadisticas de carga y usa `Fly To Point Cloud` para centrar la camara en los datos.

Los ficheros LAS se procesan localmente en el navegador. No se suben a ningun servidor.

## Estructura del proyecto

```text
.
|-- index.html               # Estructura de la interfaz
|-- styles.css               # Estilos visuales y layout responsive
|-- script.js                # Logica principal de mapa, visor LAS y UI
|-- las-index.worker.js      # Worker para indexacion/procesamiento LAS
|-- server.js                # Servidor estatico local en Node.js
|-- package.json             # Script de arranque
|-- lanzar.cmd               # Lanzador para Windows
|-- lanzar.ps1               # Lanzador para PowerShell
`-- Real-time indexing...pdf # Documento academico relacionado
```

## Arquitectura tecnica

La aplicacion es deliberadamente sencilla en despliegue: `server.js` sirve los archivos estaticos y el navegador ejecuta toda la logica interactiva.

El flujo principal es:

1. `index.html` carga la interfaz y los estilos.
2. `script.js` descarga MapLibre GL JS y Proj4 cuando hacen falta.
3. El mapa se inicializa centrado en Las Palmas de Gran Canaria.
4. Al cargar LAS, el worker procesa puntos, clasificaciones, limites y metadatos.
5. Los datos se organizan por teselas/nodos para decidir que puntos mostrar segun camara, distancia y umbrales de LOD.
6. Una capa WebGL personalizada dibuja la nube de puntos encima del mapa.

La aplicacion usa una base IndexedDB volatil (`pointscape-volatile-tiles`) para gestionar teselas durante la sesion. Esa informacion se considera temporal y se reconstruye al volver a cargar datos.

## Datos y privacidad

PointScape esta pensado para trabajar con ficheros LAS locales. El navegador lee los archivos seleccionados por el usuario y los procesa en la propia maquina.

Ten en cuenta que la aplicacion si solicita recursos externos para:

- MapLibre GL JS.
- Proj4.
- Teselas de mapas base.
- Recursos de terreno o fuentes remotas.
- Logos institucionales cargados desde sus URLs publicas.

Si necesitas un modo completamente offline, habria que empaquetar localmente esas dependencias y configurar fuentes de teselas propias.

## Atribuciones

- **Autor del proyecto:** Jose Miguel Santana Nunez.
- **Institucion:** Universidad de Las Palmas de Gran Canaria.
- **Centro:** Escuela de Ingenieria Informatica.
- **Mapa y renderizado:** MapLibre GL JS.
- **Transformaciones de coordenadas:** Proj4js.
- **Cartografia base:** las fuentes externas configuradas en la aplicacion, incluyendo OpenStreetMap para el mapa de calles y servicios de teselas remotos para imagen/terreno.
- **Datos LiDAR:** los ficheros LAS que cargue el usuario. La autoria, licencia y condiciones de uso de esos datos dependen de su proveedor original.
- **Logo ULPGC:** marca institucional de la Universidad de Las Palmas de Gran Canaria.
- **Logo EII/ULPGC:** marca institucional de la Escuela de Ingenieria Informatica de la ULPGC.
- **Icono de GitHub:** marca de GitHub, usada como enlace al repositorio del proyecto.

Las marcas institucionales y comerciales pertenecen a sus respectivos titulares. Este repositorio no reclama propiedad sobre dichas marcas.

## Limitaciones conocidas

- Solo se contemplan ficheros LAS, no LAZ comprimido.
- El rendimiento depende del tamano de la nube, la memoria disponible y la GPU del equipo.
- Algunos recursos externos requieren conexion a Internet.
- Las definiciones CRS pueden depender de fuentes remotas cuando el fichero necesita reproyeccion.
- El servidor local no esta pensado como servidor de produccion ni implementa autenticacion.

## Desarrollo

El proyecto no usa bundler ni framework frontend. Para modificarlo:

- Edita `index.html` para cambios de estructura.
- Edita `styles.css` para cambios visuales.
- Edita `script.js` para la logica de mapa, UI y renderizado.
- Edita `las-index.worker.js` para cambios relacionados con indexacion o procesamiento intensivo.

Despues de tocar JavaScript, una comprobacion rapida util es:

```bash
node --check script.js
```

## Posibles mejoras futuras

- Soporte para LAZ.
- Empaquetado local de librerias y assets para modo offline.
- Persistencia opcional de indices entre sesiones.
- Exportacion de estadisticas de carga.
- Mas controles de simbologia para clasificaciones LAS.
- Seleccion de fuentes cartograficas configurables.
- Tests automatizados para parseo, indexacion y seleccion de teselas.

## Licencia

La licencia del codigo no esta declarada en el repositorio. Antes de reutilizar, distribuir o publicar partes del proyecto, conviene anadir un archivo `LICENSE` con las condiciones de uso deseadas.

Los datos, logos, mapas y librerias externas mantienen sus propias licencias y condiciones.
