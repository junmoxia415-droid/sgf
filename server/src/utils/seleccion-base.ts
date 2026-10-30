// La selección de base no debe cambiar silenciosamente cuando una conexión
// falla: cada motor puede contener cuentas y datos completamente distintos.
export type MotorInicial = 'sqlite' | 'mssql' | 'oracle';
export class ErrorSeleccionBase extends Error {
  constructor(readonly motivo: 'configuracion' | 'conexion', readonly motor?: MotorInicial) {
    super(motivo === 'configuracion'
      ? 'Seleccione explícitamente SQLite, Oracle o SQL Server en DB_TYPE antes de iniciar.'
      : `No se pudo conectar a la base configurada (${motor}). SGF no abrió otra base automáticamente.`);
    this.name = 'ErrorSeleccionBase';
  }
}

export function seleccionarMotorInicial(env: NodeJS.ProcessEnv): MotorInicial {
  const tipo = String(env.DB_TYPE || '').trim().toLowerCase();
  if (tipo === 'sqlite' || tipo === 'oracle' || tipo === 'mssql') return tipo;
  // Las instalaciones sin selección pero con ajustes de otro motor son
  // ambiguas: no adivinar ni conectar a otro servidor sin autorización.
  if (tipo || Object.keys(env).some(k => /^(ORACLE|MSSQL)_(HOST|SERVER|DATABASE|SERVICE|USER|PASSWORD|PORT)$/.test(k) && env[k])) {
    throw new ErrorSeleccionBase('configuracion');
  }
  return 'sqlite';
}

export class ErrorBaseActivaSinGuardar extends Error {
  constructor() {
    super('La conexión cambió temporalmente, pero no pudo guardarse la configuración.');
    this.name = 'ErrorBaseActivaSinGuardar';
  }
}

/** Distingue un fallo de conexión de un fallo después de activar la conexión. */
export async function activarYGuardarBase(activar: () => Promise<unknown>, guardar: () => void): Promise<void> {
  await activar();
  try { guardar(); } catch { throw new ErrorBaseActivaSinGuardar(); }
}

export async function iniciarMotorSeleccionado<T>(motor: MotorInicial, iniciar: Record<MotorInicial, () => Promise<T>>): Promise<T> {
  try { return await iniciar[motor](); }
  catch (error) {
    if (motor === 'sqlite') throw error;
    throw new ErrorSeleccionBase('conexion', motor);
  }
}
