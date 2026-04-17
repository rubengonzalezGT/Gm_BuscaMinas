import { Tablero } from '../interfaces/tablero.interface';

export class EstadoJuegoServicio {
  private tableroActual: Tablero | null = null;

  public guardarTablero(tablero: Tablero): void {
    this.tableroActual = tablero;
  }

  public obtenerTablero(): Tablero | null {
    return this.tableroActual;
  }

  public existeTablero(): boolean {
    return this.tableroActual !== null;
  }

  public limpiarTablero(): void {
    this.tableroActual = null;
  }
}

export const estadoJuegoServicio = new EstadoJuegoServicio();