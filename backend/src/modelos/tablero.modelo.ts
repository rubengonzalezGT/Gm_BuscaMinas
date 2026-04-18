import { Casilla } from '../interfaces/casilla.interface';
import { Tablero } from '../interfaces/tablero.interface';

/**
 * TableroModelo
 *
 * Crea el tablero vacío de 10x10 al inicio de cada partida.
 * No hay minas predefinidas — solo existirá una mina en una casilla
 * si el usuario así lo informa durante el juego.
 */
export class TableroModelo {
  public crearTableroVacio(): Tablero {
    const matriz: Casilla[][] = [];

    for (let fila = 0; fila < 10; fila++) {
      const filaNueva: Casilla[] = [];

      for (let columna = 0; columna < 10; columna++) {
        // Cada casilla comienza cerrada, sin número y sin marca de mina
        filaNueva.push({
          fila,
          columna,
          abierta: false,
          marcadaComoMina: false,
          minasAlrededor: null,
          probabilidadMina: 0,
          recomendacion: 0,
          fueIntentada: false
        });
      }

      matriz.push(filaNueva);
    }

    return {
      matriz,
      totalFilas: 10,
      totalColumnas: 10
    };
  }
}