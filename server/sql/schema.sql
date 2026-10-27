-- =============================================================================
-- SGF v4.0 - ESQUEMA DE BASE DE DATOS
-- =============================================================================
-- Este script crea las tablas necesarias para que el sistema SGF funcione.
-- Se ejecuta automaticamente al primer arranque del servidor contra Oracle
-- o SQL Server, pero se incluye aqui por si se quiere crear manualmente
-- antes de conectar el sistema.
--
-- El sistema crea las tablas SGF_* automaticamente con la configuracion
-- por defecto. Las tablas PCELULAR.* (sistema ETECSA principal) NO las
-- crea el sistema, deben existir previamente en la BD.
--
-- El usuario administrador por defecto (yolexis) se crea automaticamente
-- al primer arranque si la tabla SGF_USUARIOS esta vacia. La contrasena
-- se toma de DEFAULT_ADMIN_PASSWORD en el .env (default: 5421915432).
--
-- USO:
--   1. Crear las tablas SGF_* (ejecutar seccion ORACLE o SQL SERVER segun
--      corresponda)
--   2. Opcionalmente insertar el admin manualmente:
--      INSERT INTO SGF_USUARIOS (ID, USERNAME, NAME, ROLE, PASSWORD_HASH, ACTIVE)
--      VALUES (NEWID(), 'yolexis', 'Administrador SGF', 'admin', '<hash>', 1);
--   3. La primera vez que arranque el servidor, las tablas restantes
--      (indices) se crearan automaticamente.
-- =============================================================================


-- =============================================================================
-- SECCION 1: SCRIPT PARA ORACLE
-- =============================================================================

CREATE TABLE SGF_USUARIOS (
    ID              VARCHAR2(36)    PRIMARY KEY,
    USERNAME        VARCHAR2(50)    NOT NULL UNIQUE,
    NAME            VARCHAR2(200)   NOT NULL,
    ROLE            VARCHAR2(20)    DEFAULT 'usuario' NOT NULL CHECK (ROLE IN ('admin', 'usuario')),
    PASSWORD_HASH   VARCHAR2(255)   NOT NULL,
    ACTIVE          NUMBER(1)       DEFAULT 1 NOT NULL CHECK (ACTIVE IN (0, 1)),
    CREATED_AT      TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    UPDATED_AT      TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE TABLE SGF_FACTURAS (
    ID                  VARCHAR2(36)    PRIMARY KEY,
    CLIENTE             VARCHAR2(500)   NOT NULL,
    CUENTA              VARCHAR2(500),
    NUMERO_CLIENTE      VARCHAR2(50),
    NUMERO_CUENTA       VARCHAR2(50),
    NO_FACTURA          VARCHAR2(50),
    FECHA_EMISION       VARCHAR2(30),
    FECHA_VENCIMIENTO   VARCHAR2(30),
    PERIODO_CONSUMO     VARCHAR2(60),
    CODIGO_PAGO         VARCHAR2(30),
    MONEDA              VARCHAR2(10)    DEFAULT 'CUP',
    NIT                 VARCHAR2(30),
    CUOTA               NUMBER(18,4)    DEFAULT 0,
    CONSUMO             NUMBER(18,4)    DEFAULT 0,
    COMISION            NUMBER(18,4)    DEFAULT 0,
    IMPUESTO            NUMBER(18,4)    DEFAULT 0,
    TOTAL               NUMBER(18,4)    DEFAULT 0,
    TOTAL_PAGAR         NUMBER(18,4)    DEFAULT 0,
    ESTADO              VARCHAR2(20)    DEFAULT 'pendiente' CHECK (ESTADO IN ('procesado', 'pendiente', 'error')),
    PARSER              VARCHAR2(80),
    OCR_CONFIDENCE      NUMBER(5,2)     DEFAULT 0,
    OCR_DURATION        NUMBER(10)      DEFAULT 0,
    ARCHIVO             VARCHAR2(500),
    TEXTO_OCR           CLOB,
    USER_ID             VARCHAR2(36)    NOT NULL,
    CREATED_AT          TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    UPDATED_AT          TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE TABLE SGF_SERVICIOS (
    ID                  VARCHAR2(36)    PRIMARY KEY,
    FACTURA_ID          VARCHAR2(36)    NOT NULL,
    NUMERO_SERVICIO     VARCHAR2(50)    NOT NULL,
    CUOTA               NUMBER(18,4)    DEFAULT 0,
    CONSUMO             NUMBER(18,4)    DEFAULT 0,
    COMISION            NUMBER(18,4)    DEFAULT 0,
    IMPUESTO            NUMBER(18,4)    DEFAULT 0,
    IMPORTE             NUMBER(18,4)    DEFAULT 0
);

CREATE TABLE SGF_LOGS (
    ID              VARCHAR2(36)    PRIMARY KEY,
    USER_ID         VARCHAR2(36),
    ACCION          VARCHAR2(100)   NOT NULL,
    ENTIDAD         VARCHAR2(100),
    ENTIDAD_ID      VARCHAR2(36),
    LEVEL           VARCHAR2(10)    DEFAULT 'info' CHECK (LEVEL IN ('info', 'warn', 'error')),
    DETALLES        VARCHAR2(4000),
    IP_ADDRESS      VARCHAR2(50),
    CREATED_AT      TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL
);

CREATE TABLE SGF_SESIONES (
    ID              VARCHAR2(36)    PRIMARY KEY,
    USER_ID         VARCHAR2(36)    NOT NULL,
    SESSION_TOKEN   VARCHAR2(512)   NOT NULL UNIQUE,
    MACHINE_ID      VARCHAR2(200),
    IP_ADDRESS      VARCHAR2(50),
    ACTIVE          NUMBER(1)       DEFAULT 1 CHECK (ACTIVE IN (0, 1)),
    CREATED_AT      TIMESTAMP       DEFAULT SYSTIMESTAMP NOT NULL,
    EXPIRES_AT      TIMESTAMP       NOT NULL,
    ENDED_AT        TIMESTAMP
);

CREATE INDEX IDX_FACTURAS_USER_ID ON SGF_FACTURAS(USER_ID);
CREATE INDEX IDX_FACTURAS_ESTADO ON SGF_FACTURAS(ESTADO);
CREATE INDEX IDX_FACTURAS_NO_FACTURA ON SGF_FACTURAS(NO_FACTURA);
CREATE INDEX IDX_FACTURAS_CREATED_AT ON SGF_FACTURAS(CREATED_AT);
CREATE INDEX IDX_SERVICIOS_FACTURA_ID ON SGF_SERVICIOS(FACTURA_ID);
CREATE INDEX IDX_LOGS_USER_ID ON SGF_LOGS(USER_ID);
CREATE INDEX IDX_LOGS_CREATED_AT ON SGF_LOGS(CREATED_AT);
CREATE INDEX IDX_SESIONES_USER_ID ON SGF_SESIONES(USER_ID);
CREATE INDEX IDX_SESIONES_TOKEN ON SGF_SESIONES(SESSION_TOKEN);


-- =============================================================================
-- SECCION 2: SCRIPT PARA SQL SERVER
-- =============================================================================
-- Pegar en SQL Server Management Studio o az data studio, o ejecutar
-- con sqlcmd. Ajustar el nombre de la base de datos si es necesario.
-- =============================================================================

/*
USE [sgf];
GO

CREATE TABLE SGF_USUARIOS (
    ID              NVARCHAR(36)    PRIMARY KEY,
    USERNAME        NVARCHAR(50)    NOT NULL UNIQUE,
    NAME            NVARCHAR(200)   NOT NULL,
    ROLE            NVARCHAR(20)    NOT NULL DEFAULT 'usuario' CHECK (ROLE IN ('admin', 'usuario')),
    PASSWORD_HASH   NVARCHAR(255)   NOT NULL,
    ACTIVE          BIT             NOT NULL DEFAULT 1,
    CREATED_AT      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    UPDATED_AT      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE SGF_FACTURAS (
    ID                  NVARCHAR(36)    PRIMARY KEY,
    CLIENTE             NVARCHAR(500)   NOT NULL,
    CUENTA              NVARCHAR(500)   NULL,
    NUMERO_CLIENTE      NVARCHAR(50)    NULL,
    NUMERO_CUENTA       NVARCHAR(50)    NULL,
    NO_FACTURA          NVARCHAR(50)    NULL,
    FECHA_EMISION       NVARCHAR(30)    NULL,
    FECHA_VENCIMIENTO   NVARCHAR(30)    NULL,
    PERIODO_CONSUMO     NVARCHAR(60)    NULL,
    CODIGO_PAGO         NVARCHAR(30)    NULL,
    MONEDA              NVARCHAR(10)    NOT NULL DEFAULT 'CUP',
    NIT                 NVARCHAR(30)    NULL,
    CUOTA               DECIMAL(18,4)   NOT NULL DEFAULT 0,
    CONSUMO             DECIMAL(18,4)   NOT NULL DEFAULT 0,
    COMISION            DECIMAL(18,4)   NOT NULL DEFAULT 0,
    IMPUESTO            DECIMAL(18,4)   NOT NULL DEFAULT 0,
    TOTAL               DECIMAL(18,4)   NOT NULL DEFAULT 0,
    TOTAL_PAGAR         DECIMAL(18,4)   NOT NULL DEFAULT 0,
    ESTADO              NVARCHAR(20)    NOT NULL DEFAULT 'pendiente' CHECK (ESTADO IN ('procesado', 'pendiente', 'error')),
    PARSER              NVARCHAR(80)    NULL,
    OCR_CONFIDENCE      DECIMAL(5,2)    NOT NULL DEFAULT 0,
    OCR_DURATION        INT             NOT NULL DEFAULT 0,
    ARCHIVO             NVARCHAR(500)   NULL,
    TEXTO_OCR           NVARCHAR(MAX)   NULL,
    USER_ID             NVARCHAR(36)    NOT NULL,
    CREATED_AT          DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    UPDATED_AT          DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE SGF_SERVICIOS (
    ID                  NVARCHAR(36)    PRIMARY KEY,
    FACTURA_ID          NVARCHAR(36)    NOT NULL,
    NUMERO_SERVICIO     NVARCHAR(50)    NOT NULL,
    CUOTA               DECIMAL(18,4)   NOT NULL DEFAULT 0,
    CONSUMO             DECIMAL(18,4)   NOT NULL DEFAULT 0,
    COMISION            DECIMAL(18,4)   NOT NULL DEFAULT 0,
    IMPUESTO            DECIMAL(18,4)   NOT NULL DEFAULT 0,
    IMPORTE             DECIMAL(18,4)   NOT NULL DEFAULT 0
);

CREATE TABLE SGF_LOGS (
    ID              NVARCHAR(36)    PRIMARY KEY,
    USER_ID         NVARCHAR(36)    NULL,
    ACCION          NVARCHAR(100)   NOT NULL,
    ENTIDAD         NVARCHAR(100)   NULL,
    ENTIDAD_ID      NVARCHAR(36)    NULL,
    LEVEL           NVARCHAR(10)    NOT NULL DEFAULT 'info' CHECK (LEVEL IN ('info', 'warn', 'error')),
    DETALLES        NVARCHAR(MAX)   NULL,
    IP_ADDRESS      NVARCHAR(50)    NULL,
    CREATED_AT      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE SGF_SESIONES (
    ID              NVARCHAR(36)    PRIMARY KEY,
    USER_ID         NVARCHAR(36)    NOT NULL,
    SESSION_TOKEN   NVARCHAR(512)   NOT NULL UNIQUE,
    MACHINE_ID      NVARCHAR(200)   NULL,
    IP_ADDRESS      NVARCHAR(50)    NULL,
    ACTIVE          BIT             NOT NULL DEFAULT 1,
    CREATED_AT      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    EXPIRES_AT      DATETIME2        NOT NULL,
    ENDED_AT        DATETIME2        NULL
);

CREATE INDEX IDX_FACTURAS_USER_ID ON SGF_FACTURAS(USER_ID);
CREATE INDEX IDX_FACTURAS_ESTADO ON SGF_FACTURAS(ESTADO);
CREATE INDEX IDX_FACTURAS_NO_FACTURA ON SGF_FACTURAS(NO_FACTURA);
CREATE INDEX IDX_FACTURAS_CREATED_AT ON SGF_FACTURAS(CREATED_AT);
CREATE INDEX IDX_SERVICIOS_FACTURA_ID ON SGF_SERVICIOS(FACTURA_ID);
CREATE INDEX IDX_LOGS_USER_ID ON SGF_LOGS(USER_ID);
CREATE INDEX IDX_LOGS_CREATED_AT ON SGF_LOGS(CREATED_AT);
CREATE INDEX IDX_SESIONES_USER_ID ON SGF_SESIONES(USER_ID);
CREATE INDEX IDX_SESIONES_TOKEN ON SGF_SESIONES(SESSION_TOKEN);

GO
*/


-- =============================================================================
-- NOTAS SOBRE LAS TABLAS PCELULAR.*
-- =============================================================================
-- El sistema SGF sincroniza resultados en PCELULAR.CARGARARCH (solo en
-- Oracle, ya que en SQL Server esta tabla no forma parte del sistema
-- principal de ETECSA). Esa tabla la crea el DBA con el script del
-- sistema principal; aqui no la creamos.
--
-- Si vas a usar SGF contra SQL Server y NO existe PCELULAR.CARGARARCH,
-- el sistema lo detecta automaticamente y no intenta escribir en ella.
-- Si quieres habilitar la sincronizacion en SQL Server, crea la tabla
-- manualmente con este script:
--
-- CREATE TABLE PCELULAR_CARGARARCH (
--     NUMERO       NVARCHAR(10)    NULL,
--     CUOTA        NVARCHAR(7)     NULL,
--     CONSUMO      NVARCHAR(10)    NULL,
--     COMISION     NVARCHAR(7)     NULL,
--     IMPUESTO     NVARCHAR(9)     NULL,
--     IMPORTE      NVARCHAR(14)    NULL,
--     TIRA         NVARCHAR(50)    NULL,
--     FECHA_PARTE  DATETIME2        NULL
-- );
-- (sin esquema PCELULAR porque en SQL Server no existe ese schema,
--  el sistema usa el prefijo PCELULAR_ en su lugar)
-- =============================================================================
