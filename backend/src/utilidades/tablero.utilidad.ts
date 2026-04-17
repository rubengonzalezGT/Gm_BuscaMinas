import { Tablero } from '../interfaces/tablero.interface';

export class TableroUtilidad {
  public static convertirATexto(tablero: Tablero): string {
    let salida = '';

    for (let fila = 0; fila < tablero.totalFilas; fila++) {
      let filaTexto = '';

      for (let columna = 0; columna < tablero.totalColumnas; columna++) {
        const casillaActual = tablero.matriz[fila][columna];

        // Lógica de la casilla [fila, columna]: si la casilla fue marcada como mina, se pinta como M.
        if (casillaActual.marcadaComoMina) {
          filaTexto += 'M ';
          continue;
        }

        // Lógica de la casilla [fila, columna]: si la casilla aún no está abierta, se pinta como X.
        if (!casillaActual.abierta) {
          filaTexto += 'X ';
          continue;
        }

        // Lógica de la casilla [fila, columna]: si la casilla está abierta, se pinta su número real.
        filaTexto += `${casillaActual.minasAlrededor} `;
      }

      salida += filaTexto.trimEnd() + '\n';
    }

    return salida.trimEnd();
  }

  public static convertirAProbabilidades(tablero: Tablero): string {
    let salida = '';

    for (let fila = 0; fila < tablero.totalFilas; fila++) {
      const celdasFila: string[] = [];

      for (let columna = 0; columna < tablero.totalColumnas; columna++) {
        const casillaActual = tablero.matriz[fila][columna];

        // Lógica de la casilla [fila, columna]: una mina marcada se muestra como M.
        if (casillaActual.marcadaComoMina) {
          celdasFila.push('M');
          continue;
        }

        // Lógica de la casilla [fila, columna]: una casilla abierta se muestra como A:n para distinguirla del riesgo.
        if (casillaActual.abierta) {
          celdasFila.push(`A:${casillaActual.minasAlrededor}`);
          continue;
        }

        // Lógica de la casilla [fila, columna]: una casilla cerrada con riesgo calculado se muestra con porcentaje.
        if (casillaActual.probabilidadMina > 0) {
          celdasFila.push(`${casillaActual.probabilidadMina}%`);
          continue;
        }

        // Lógica de la casilla [fila, columna]: una casilla cerrada sin riesgo calculado aún se muestra como X.
        celdasFila.push('X');
      }

      salida += celdasFila.join(' | ') + '\n';
    }

    return salida.trimEnd();
  }
}