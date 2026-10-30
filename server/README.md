# Servidor SGF

El instalador de escritorio incluye Node; no hace falta instalarlo por separado. Para ejecutar el servidor manualmente se necesita **Node 22.13.0 o posterior**. La protección interproceso utiliza `node:sqlite`, disponible en Node 22 y marcado como experimental por Node.

SGF reserva la carpeta de datos mediante un archivo SQLite de control separado antes de abrir la base de facturas. Otra instancia compatible no puede abrir la misma carpeta aunque use otro puerto; al terminar el proceso, Windows o el sistema libera el bloqueo. El archivo de control no contiene facturas ni credenciales y se conserva para futuros arranques.

La protección requiere un sistema de archivos que implemente correctamente los bloqueos de SQLite; no se garantiza en carpetas de red o unidades que no los respeten. Tampoco impide que una versión antigua de SGF, que no conoce este mecanismo, acceda a la misma carpeta con otro puerto. Cierre todas las versiones anteriores antes de actualizar y no comparta la carpeta de datos entre instalaciones antiguas y nuevas.

Este mecanismo no arranca el servidor antes de iniciar sesión. Ese funcionamiento requiere todavía un servicio o tarea independientes, autenticación segura y pruebas adicionales en Windows.
