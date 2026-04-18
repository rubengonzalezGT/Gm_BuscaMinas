import { Tablero } from '../interfaces/tablero.interface';

/**
 * EstadoJuegoServicio
 *
 * Guarda el estado de la partida actual en memoria.
 * Se resetea completamente al reiniciar — la IA no aprende entre partidas.
 */
export class EstadoJuegoServicio {
  /** Tablero activo. Null si no hay partida en curso. */
  private tableroActual: Tablero | null = null;

  /** True si la partida fue perdida porque el usuario informó una mina. */
  private juegoPerdido: boolean = false;

  public guardarTablero(tablero: Tablero): void {
    this.tableroActual = tablero;
  }

  public obtenerTablero(): Tablero | null {
    return this.tableroActual;
  }

  public existeTablero(): boolean {
    return this.tableroActual !== null;
  }

  /** Marca la partida como perdida. Bloquea nuevas jugadas hasta reiniciar. */
  public marcarJuegoPerdido(): void {
    this.juegoPerdido = true;
  }

  public estaJuegoPerdido(): boolean {
    return this.juegoPerdido;
  }

  /** Limpia todo el estado para iniciar una partida desde cero. */
  public limpiarTablero(): void {
    this.tableroActual = null;
    this.juegoPerdido = false;
  }
}

export const estadoJuegoServicio = new EstadoJuegoServicio();