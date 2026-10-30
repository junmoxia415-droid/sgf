# Servidor SGF

El instalador de escritorio incluye Node; no hace falta instalarlo por separado. Para ejecutar el servidor manualmente se necesita **Node 22.13.0 o posterior**. La protección interproceso utiliza `node:sqlite`, disponible en Node 22 y marcado como experimental por Node.

SGF reserva la carpeta de datos mediante un archivo SQLite de control separado antes de abrir la base de facturas. Otra instancia compatible no puede abrir la misma carpeta aunque use otro puerto; al terminar el proceso, Windows o el sistema libera el bloqueo. El archivo de control no contiene facturas ni credenciales y se conserva para futuros arranques.

La protección requiere un sistema de archivos que implemente correctamente los bloqueos de SQLite; no se garantiza en carpetas de red o unidades que no los respeten. Tampoco impide que una versión antigua de SGF, que no conoce este mecanismo, acceda a la misma carpeta con otro puerto. Cierre todas las versiones anteriores antes de actualizar y no comparta la carpeta de datos entre instalaciones antiguas y nuevas.

Cuando la aplicación de escritorio arranca el proceso, activa un canal TLS efímero que escucha únicamente en `127.0.0.1`. La aplicación verifica la huella anunciada y autenticada por la tubería del proceso antes de enviar la contraseña o el token. Ese canal no modifica los certificados de Windows ni cifra la web de la LAN, que sigue siendo HTTP.

Estos mecanismos no arrancan el servidor antes de iniciar sesión ni permiten adoptar un proceso independiente ya iniciado. Ese funcionamiento requiere todavía un servicio o tarea independientes, una identidad persistente protegida y pruebas adicionales en Windows.
