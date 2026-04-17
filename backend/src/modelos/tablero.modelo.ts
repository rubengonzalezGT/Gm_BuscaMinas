import { Casilla } from '../interfaces/casilla.interface';
import { Tablero } from '../interfaces/tablero.interface';

export class TableroModelo {
  public crearTableroVacio(totalMinas: number): Tablero {
    const matriz: Casilla[][] = [];

    for (let fila = 0; fila < 10; fila++) {
      const filaNueva: Casilla[] = [];

      for (let columna = 0; columna < 10; columna++) {
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
      totalColumnas: 10,
      totalMinas
    };
  }
}