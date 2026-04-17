import { Casilla } from '../interfaces/casilla.interface';
import { Jugada } from '../interfaces/jugada.interface';
import { Tablero } from '../interfaces/tablero.interface';

interface GrupoAnalisis {
  filaCentral: number;
  columnaCentral: number;
  casillasCerradas: Casilla[];
  minasFaltantes: number;
}

export class IABuscaminasServicio {
  private ultimaJugadaRecomendada: { fila: number; columna: number } | null = null;

  public obtenerSiguienteJugada(tablero: Tablero): Jugada {
    const casillasDisponibles = this.obtenerCasillasDisponibles(tablero);

    if (casillasDisponibles.length === 0) {
      throw new Error('Ya no hay casillas disponibles para recomendar');
    }

    this.limpiarRecomendaciones(tablero);
    this.limpiarProbabilidades(tablero);

    const jugadaSeguraBasica = this.buscarJugadaSeguraPorLogica(tablero);

    if (jugadaSeguraBasica) {
      this.ultimaJugadaRecomendada = {
        fila: jugadaSeguraBasica.fila,
        columna: jugadaSeguraBasica.columna
      };

      return jugadaSeguraBasica;
    }

    const jugadaSeguraPorComparacion = this.buscarJugadaPorComparacionDeGrupos(tablero);

    if (jugadaSeguraPorComparacion) {
      this.ultimaJugadaRecomendada = {
        fila: jugadaSeguraPorComparacion.fila,
        columna: jugadaSeguraPorComparacion.columna
      };

      return jugadaSeguraPorComparacion;
    }

    const jugadaEstadistica = this.buscarJugadaPorEstadistica(tablero, casillasDisponibles);

    this.ultimaJugadaRecomendada = {
      fila: jugadaEstadistica.fila,
      columna: jugadaEstadistica.columna
    };

    return jugadaEstadistica;
  }

  private obtenerCasillasDisponibles(tablero: Tablero): Casilla[] {
    const casillasDisponibles: Casilla[] = [];

    for (let fila = 0; fila < tablero.totalFilas; fila++) {
      for (let columna = 0; columna < tablero.totalColumnas; columna++) {
        const casillaActual = tablero.matriz[fila][columna];

        // Lógica de la casilla [fila, columna]: una casilla disponible es una que sigue cerrada y no está marcada como mina.
        if (!casillaActual.abierta && !casillaActual.marcadaComoMina) {
          casillasDisponibles.push(casillaActual);
        }
      }
    }

    return casillasDisponibles;
  }

  private limpiarRecomendaciones(tablero: Tablero): void {
    for (let fila = 0; fila < tablero.totalFilas; fila++) {
      for (let columna = 0; columna < tablero.totalColumnas; columna++) {
        // Lógica de la casilla [fila, columna]: se reinicia la recomendación antes de volver a evaluar el tablero.
        tablero.matriz[fila][columna].recomendacion = 0;
      }
    }
  }

  private limpiarProbabilidades(tablero: Tablero): void {
    for (let fila = 0; fila < tablero.totalFilas; fila++) {
      for (let columna = 0; columna < tablero.totalColumnas; columna++) {
        // Lógica de la casilla [fila, columna]: se limpia la probabilidad anterior para recalcular el riesgo actual.
        tablero.matriz[fila][columna].probabilidadMina = 0;
      }
    }
  }

  private buscarJugadaSeguraPorLogica(tablero: Tablero): Jugada | null {
    for (let fila = 0; fila < tablero.totalFilas; fila++) {
      for (let columna = 0; columna < tablero.totalColumnas; columna++) {
        const casillaCentral = tablero.matriz[fila][columna];

        // Lógica de la casilla [fila, columna]: solo se analizan casillas abiertas con número conocido.
        if (!casillaCentral.abierta || casillaCentral.minasAlrededor === null) {
          continue;
        }

        const vecinos = this.obtenerVecinos(tablero, fila, columna);
        const vecinosCerrados = vecinos.filter((vecino) => !vecino.abierta && !vecino.marcadaComoMina);
        const vecinosMarcadosComoMina = vecinos.filter((vecino) => vecino.marcadaComoMina);

        const minasFaltantes = casillaCentral.minasAlrededor - vecinosMarcadosComoMina.length;

        // Lógica de la casilla [fila, columna]: si ya se cubrieron sus minas, el resto de vecinos cerrados son seguros.
        if (minasFaltantes === 0 && vecinosCerrados.length > 0) {
          const casillaSegura = this.elegirMejorCasillaSegura(vecinosCerrados);

          casillaSegura.recomendacion = 100;
          casillaSegura.probabilidadMina = 0;

          return {
            fila: casillaSegura.fila,
            columna: casillaSegura.columna,
            motivo: `Casilla segura deducida alrededor de [${fila}, ${columna}]`,
            probabilidadMina: 0,
            recomendacion: 100
          };
        }

        // Lógica de la casilla [fila, columna]: si las cerradas coinciden exactamente con las minas faltantes, todas son minas.
        if (minasFaltantes > 0 && vecinosCerrados.length === minasFaltantes) {
          for (const vecino of vecinosCerrados) {
            // Lógica de la casilla vecina [vecino.fila, vecino.columna]: se marca como mina por deducción exacta.
            vecino.marcadaComoMina = true;
            vecino.probabilidadMina = 100;
            vecino.recomendacion = -100;
          }
        }
      }
    }

    return null;
  }

  private buscarJugadaPorComparacionDeGrupos(tablero: Tablero): Jugada | null {
    const grupos = this.construirGruposAnalisis(tablero);

    for (let i = 0; i < grupos.length; i++) {
      for (let j = 0; j < grupos.length; j++) {
        if (i === j) {
          continue;
        }

        const grupoA = grupos[i];
        const grupoB = grupos[j];

        if (grupoA.casillasCerradas.length === 0 || grupoB.casillasCerradas.length === 0) {
          continue;
        }

        const grupoAIncluidoEnGrupoB = this.esSubconjunto(grupoA.casillasCerradas, grupoB.casillasCerradas);

        // Lógica de grupos [grupoA.filaCentral, grupoA.columnaCentral] y [grupoB.filaCentral, grupoB.columnaCentral]:
        // solo sirve comparar si el grupo pequeño está contenido en el grande.
        if (!grupoAIncluidoEnGrupoB) {
          continue;
        }

        const casillasDiferencia = this.obtenerDiferenciaDeCasillas(
          grupoB.casillasCerradas,
          grupoA.casillasCerradas
        );

        if (casillasDiferencia.length === 0) {
          continue;
        }

        const diferenciaMinas = grupoB.minasFaltantes - grupoA.minasFaltantes;

        // Lógica comparativa: si ambos grupos requieren la misma cantidad de minas,
        // las casillas extra del grupo grande son seguras.
        if (diferenciaMinas === 0) {
          const casillaSegura = this.elegirMejorCasillaSegura(casillasDiferencia);
          casillaSegura.probabilidadMina = 0;
          casillaSegura.recomendacion = 100;

          return {
            fila: casillaSegura.fila,
            columna: casillaSegura.columna,
            motivo: `Casilla segura por comparación de grupos entre [${grupoA.filaCentral}, ${grupoA.columnaCentral}] y [${grupoB.filaCentral}, ${grupoB.columnaCentral}]`,
            probabilidadMina: 0,
            recomendacion: 100
          };
        }

        // Lógica comparativa: si la diferencia de minas coincide exactamente con las casillas extra,
        // entonces esas casillas extra son minas.
        if (diferenciaMinas > 0 && diferenciaMinas === casillasDiferencia.length) {
          for (const casillaMina of casillasDiferencia) {
            // Lógica de la casilla diferencia [casillaMina.fila, casillaMina.columna]: se marca como mina por relación entre grupos.
            casillaMina.marcadaComoMina = true;
            casillaMina.probabilidadMina = 100;
            casillaMina.recomendacion = -100;
          }
        }
      }
    }

    return this.buscarJugadaSeguraPorLogica(tablero);
  }

  private construirGruposAnalisis(tablero: Tablero): GrupoAnalisis[] {
    const grupos: GrupoAnalisis[] = [];

    for (let fila = 0; fila < tablero.totalFilas; fila++) {
      for (let columna = 0; columna < tablero.totalColumnas; columna++) {
        const casillaCentral = tablero.matriz[fila][columna];

        // Lógica de la casilla [fila, columna]: solo una pista abierta genera un grupo útil de análisis.
        if (!casillaCentral.abierta || casillaCentral.minasAlrededor === null) {
          continue;
        }

        const vecinos = this.obtenerVecinos(tablero, fila, columna);
        const vecinosCerrados = vecinos.filter((vecino) => !vecino.abierta && !vecino.marcadaComoMina);
        const vecinosMarcadosComoMina = vecinos.filter((vecino) => vecino.marcadaComoMina);

        const minasFaltantes = casillaCentral.minasAlrededor - vecinosMarcadosComoMina.length;

        if (vecinosCerrados.length === 0 || minasFaltantes < 0) {
          continue;
        }

        grupos.push({
          filaCentral: fila,
          columnaCentral: columna,
          casillasCerradas: vecinosCerrados,
          minasFaltantes
        });
      }
    }

    return grupos;
  }

  private esSubconjunto(casillasPequenas: Casilla[], casillasGrandes: Casilla[]): boolean {
    for (const casillaPequena of casillasPequenas) {
      const existe = casillasGrandes.some(
        (casillaGrande) =>
          casillaGrande.fila === casillaPequena.fila &&
          casillaGrande.columna === casillaPequena.columna
      );

      if (!existe) {
        return false;
      }
    }

    return true;
  }

  private obtenerDiferenciaDeCasillas(origen: Casilla[], referencia: Casilla[]): Casilla[] {
    const diferencia: Casilla[] = [];

    for (const casillaOrigen of origen) {
      const existeEnReferencia = referencia.some(
        (casillaReferencia) =>
          casillaReferencia.fila === casillaOrigen.fila &&
          casillaReferencia.columna === casillaOrigen.columna
      );

      // Lógica de la casilla [casillaOrigen.fila, casillaOrigen.columna]: si no está en la referencia, pertenece a la diferencia.
      if (!existeEnReferencia) {
        diferencia.push(casillaOrigen);
      }
    }

    return diferencia;
  }

  private buscarJugadaPorEstadistica(tablero: Tablero, casillasDisponibles: Casilla[]): Jugada {
    this.calcularRiesgosPorCasillasAbiertas(tablero);

    let mejorCasilla: Casilla | null = null;

    for (const casilla of casillasDisponibles) {
      // Lógica de la casilla [casilla.fila, casilla.columna]: si nadie le asignó riesgo todavía, se le pone un riesgo base medio.
      if (casilla.probabilidadMina === 0) {
        casilla.probabilidadMina = 50;
      }

      // Lógica de la casilla [casilla.fila, casilla.columna]: a menor riesgo, mayor recomendación.
      casilla.recomendacion = 100 - casilla.probabilidadMina;

      if (!mejorCasilla) {
        mejorCasilla = casilla;
        continue;
      }

      if (casilla.probabilidadMina < mejorCasilla.probabilidadMina) {
        mejorCasilla = casilla;
        continue;
      }

      if (
        casilla.probabilidadMina === mejorCasilla.probabilidadMina &&
        !this.esLaMismaUltimaJugada(casilla)
      ) {
        mejorCasilla = casilla;
      }
    }

    if (!mejorCasilla) {
      throw new Error('No fue posible determinar una jugada');
    }

    return {
      fila: mejorCasilla.fila,
      columna: mejorCasilla.columna,
      motivo: 'Jugada elegida por análisis estadístico mejorado',
      probabilidadMina: mejorCasilla.probabilidadMina,
      recomendacion: mejorCasilla.recomendacion
    };
  }

  private calcularRiesgosPorCasillasAbiertas(tablero: Tablero): void {
    for (let fila = 0; fila < tablero.totalFilas; fila++) {
      for (let columna = 0; columna < tablero.totalColumnas; columna++) {
        const casillaCentral = tablero.matriz[fila][columna];

        // Lógica de la casilla [fila, columna]: solo una pista abierta reparte riesgo a sus vecinas cerradas.
        if (!casillaCentral.abierta || casillaCentral.minasAlrededor === null) {
          continue;
        }

        const vecinos = this.obtenerVecinos(tablero, fila, columna);
        const vecinosCerrados = vecinos.filter((vecino) => !vecino.abierta && !vecino.marcadaComoMina);
        const vecinosMarcadosComoMina = vecinos.filter((vecino) => vecino.marcadaComoMina);

        const minasFaltantes = casillaCentral.minasAlrededor - vecinosMarcadosComoMina.length;

        if (minasFaltantes <= 0 || vecinosCerrados.length === 0) {
          continue;
        }

        const riesgoEstimado = Math.round((minasFaltantes / vecinosCerrados.length) * 100);

        for (const vecino of vecinosCerrados) {
          // Lógica de la casilla vecina [vecino.fila, vecino.columna]: se conserva el riesgo más alto detectado entre todas sus pistas cercanas.
          if (riesgoEstimado > vecino.probabilidadMina) {
            vecino.probabilidadMina = riesgoEstimado;
          }
        }
      }
    }
  }

  private obtenerVecinos(tablero: Tablero, fila: number, columna: number): Casilla[] {
    const vecinos: Casilla[] = [];

    for (let desplazamientoFila = -1; desplazamientoFila <= 1; desplazamientoFila++) {
      for (let desplazamientoColumna = -1; desplazamientoColumna <= 1; desplazamientoColumna++) {
        const nuevaFila = fila + desplazamientoFila;
        const nuevaColumna = columna + desplazamientoColumna;

        // Lógica de la casilla [fila, columna]: se ignora la propia casilla central.
        if (desplazamientoFila === 0 && desplazamientoColumna === 0) {
          continue;
        }

        // Lógica del vecino [nuevaFila, nuevaColumna]: solo se toma si está dentro del tablero.
        if (
          nuevaFila >= 0 &&
          nuevaFila < tablero.totalFilas &&
          nuevaColumna >= 0 &&
          nuevaColumna < tablero.totalColumnas
        ) {
          vecinos.push(tablero.matriz[nuevaFila][nuevaColumna]);
        }
      }
    }

    return vecinos;
  }

  private elegirMejorCasillaSegura(casillasSeguras: Casilla[]): Casilla {
    let mejorCasilla = casillasSeguras[0];

    for (const casilla of casillasSeguras) {
      // Lógica de la casilla segura [casilla.fila, casilla.columna]: se evita repetir la última recomendación si hay otra disponible.
      if (!this.esLaMismaUltimaJugada(casilla)) {
        mejorCasilla = casilla;
        break;
      }
    }

    return mejorCasilla;
  }

  private esLaMismaUltimaJugada(casilla: Casilla): boolean {
    if (!this.ultimaJugadaRecomendada) {
      return false;
    }

    return (
      casilla.fila === this.ultimaJugadaRecomendada.fila &&
      casilla.columna === this.ultimaJugadaRecomendada.columna
    );
  }
}