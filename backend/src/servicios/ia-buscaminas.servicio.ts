import { Casilla } from '../interfaces/casilla.interface';
import { Jugada } from '../interfaces/jugada.interface';
import { Tablero } from '../interfaces/tablero.interface';

/**
 * IABuscaminasServicio
 *
 * Servicio de inteligencia artificial para el juego Buscaminas 10x10.
 *
 * Reglas del juego:
 *  - La IA escoge una casilla para levantar.
 *  - El usuario responde cuántas minas hay alrededor (0-8).
 *  - Si el usuario responde mina, el juego se pierde inmediatamente.
 *  - No existen minas predefinidas: solo hay mina si el usuario lo dice.
 *  - La IA no aprende entre partidas: cada juego empieza desde cero.
 *
 * Estrategia en tres capas:
 *  Capa 1 — Lógica directa:      deduce casillas seguras o minas con certeza.
 *  Capa 2 — Comparación de grupos: deduce nuevas minas comparando conjuntos de vecinos.
 *  Capa 3 — Estadística:          elige la casilla de menor riesgo cuando no hay certeza.
 *
 * La lógica de cada casilla está escrita de forma explícita casilla por casilla
 * ya que el tablero siempre es 10x10 y los vecinos de cada posición son fijos.
 */
export class IABuscaminasServicio {
  /**
   * Última casilla recomendada. Se usa para evitar recomendar la misma dos veces seguidas
   * cuando hay otras opciones disponibles.
   */
  private ultimaJugadaRecomendada: { fila: number; columna: number } | null = null;

  // ─────────────────────────────────────────────────────────────────────────
  // MÉTODO PÚBLICO PRINCIPAL
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Calcula y devuelve la siguiente jugada recomendada.
   * Aplica las tres capas de estrategia en orden.
   * Se llama tanto al inicio del juego como después de cada resultado informado.
   */
  public obtenerSiguienteJugada(tablero: Tablero): Jugada {
    const casillasDisponibles = this.obtenerCasillasDisponibles(tablero);

    if (casillasDisponibles.length === 0) {
      throw new Error('Ya no hay casillas disponibles para recomendar');
    }

    this.limpiarRecomendaciones(tablero);
    this.limpiarProbabilidades(tablero);

    // Capa 1: lógica directa — busca casillas seguras con certeza
    const jugadaLogica = this.buscarJugadaSeguraPorLogica(tablero);
    if (jugadaLogica) {
      this.ultimaJugadaRecomendada = { fila: jugadaLogica.fila, columna: jugadaLogica.columna };
      return jugadaLogica;
    }

    // Capa 2: comparación de grupos — deduce nuevas minas y vuelve a intentar lógica directa
    this.aplicarComparacionDeGrupos(tablero);
    const jugadaTrasComparacion = this.buscarJugadaSeguraPorLogica(tablero);
    if (jugadaTrasComparacion) {
      this.ultimaJugadaRecomendada = { fila: jugadaTrasComparacion.fila, columna: jugadaTrasComparacion.columna };
      return jugadaTrasComparacion;
    }

    // Capa 3: estadística — menor riesgo entre casillas disponibles, elegida al azar si hay empate
    const casillasActualizadas = this.obtenerCasillasDisponibles(tablero);
    if (casillasActualizadas.length === 0) {
      throw new Error('Ya no hay casillas disponibles para recomendar');
    }
    const jugadaEstadistica = this.buscarJugadaPorEstadistica(tablero, casillasActualizadas);
    this.ultimaJugadaRecomendada = { fila: jugadaEstadistica.fila, columna: jugadaEstadistica.columna };
    return jugadaEstadistica;
  }

  /**
   * Reinicia el estado interno de la IA para una nueva partida.
   * La IA no guarda memoria entre partidas.
   */
  public reiniciar(): void {
    this.ultimaJugadaRecomendada = null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MÉTODOS AUXILIARES
  // ─────────────────────────────────────────────────────────────────────────

  /** Devuelve todas las casillas que la IA puede recomendar: cerradas y no marcadas como mina. */
  private obtenerCasillasDisponibles(tablero: Tablero): Casilla[] {
    const disponibles: Casilla[] = [];
    for (let fila = 0; fila < 10; fila++) {
      for (let columna = 0; columna < 10; columna++) {
        const casilla = tablero.matriz[fila][columna];
        if (!casilla.abierta && !casilla.marcadaComoMina) disponibles.push(casilla);
      }
    }
    return disponibles;
  }

  /** Reinicia el campo recomendacion antes de cada análisis. */
  private limpiarRecomendaciones(tablero: Tablero): void {
    for (let fila = 0; fila < 10; fila++) {
      for (let columna = 0; columna < 10; columna++) {
        tablero.matriz[fila][columna].recomendacion = 0;
      }
    }
  }

  /** Reinicia el campo probabilidadMina antes de cada análisis. */
  private limpiarProbabilidades(tablero: Tablero): void {
    for (let fila = 0; fila < 10; fila++) {
      for (let columna = 0; columna < 10; columna++) {
        tablero.matriz[fila][columna].probabilidadMina = 0;
      }
    }
  }

  /** Aplica marcas de minas deducidas lógicamente. */
  private aplicarMarcasMinas(minas: Casilla[]): void {
    for (const mina of minas) {
      mina.marcadaComoMina = true;
      mina.probabilidadMina = 100;
      mina.recomendacion = -100;
    }
  }

  /** Entre varias casillas seguras, elige una que no sea la última recomendada. */
  private elegirMejorCasillaSegura(casillasSeguras: Casilla[]): Casilla {
    for (const casilla of casillasSeguras) {
      if (!this.esLaMismaUltimaJugada(casilla)) return casilla;
    }
    return casillasSeguras[0];
  }

  /** True si la casilla es la misma que la última recomendada. */
  private esLaMismaUltimaJugada(casilla: Casilla): boolean {
    if (!this.ultimaJugadaRecomendada) return false;
    return casilla.fila === this.ultimaJugadaRecomendada.fila && casilla.columna === this.ultimaJugadaRecomendada.columna;
  }

  private esSubconjunto(pequenas: Casilla[], grandes: Casilla[]): boolean {
    return pequenas.every((p) => grandes.some((g) => g.fila === p.fila && g.columna === p.columna));
  }

  private obtenerDiferenciaDeCasillas(origen: Casilla[], referencia: Casilla[]): Casilla[] {
    return origen.filter((o) => !referencia.some((r) => r.fila === o.fila && r.columna === o.columna));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CAPA 1 — LÓGICA DIRECTA (explícita por cada casilla del tablero 10x10)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Analiza las 100 casillas de forma explícita.
   * Las minas deducidas se acumulan y se aplican al FINAL del pase completo
   * para que el marcado de una casilla no afecte el análisis de las siguientes.
   *
   * Regla A — si minasFaltantes === 0 y hay vecinos cerrados → son seguros → devuelve uno.
   * Regla B — si vecinos cerrados === minasFaltantes → todos son minas → se acumulan.
   */
  private buscarJugadaSeguraPorLogica(tablero: Tablero): Jugada | null {
    const minasParaMarcar: Casilla[] = [];

    // ── Casilla [0,0] — esquina, 3 vecinos: [0,1], [1,0], [1,1]
    {
      const casilla = tablero.matriz[0][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][1], tablero.matriz[1][0], tablero.matriz[1][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [0,0]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [0,1] — borde, 5 vecinos: [0,0], [0,2], [1,0], [1,1], [1,2]
    {
      const casilla = tablero.matriz[0][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][0], tablero.matriz[0][2], tablero.matriz[1][0], tablero.matriz[1][1], tablero.matriz[1][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [0,1]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [0,2] — borde, 5 vecinos: [0,1], [0,3], [1,1], [1,2], [1,3]
    {
      const casilla = tablero.matriz[0][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][1], tablero.matriz[0][3], tablero.matriz[1][1], tablero.matriz[1][2], tablero.matriz[1][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [0,2]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [0,3] — borde, 5 vecinos: [0,2], [0,4], [1,2], [1,3], [1,4]
    {
      const casilla = tablero.matriz[0][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][2], tablero.matriz[0][4], tablero.matriz[1][2], tablero.matriz[1][3], tablero.matriz[1][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [0,3]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [0,4] — borde, 5 vecinos: [0,3], [0,5], [1,3], [1,4], [1,5]
    {
      const casilla = tablero.matriz[0][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][3], tablero.matriz[0][5], tablero.matriz[1][3], tablero.matriz[1][4], tablero.matriz[1][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [0,4]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [0,5] — borde, 5 vecinos: [0,4], [0,6], [1,4], [1,5], [1,6]
    {
      const casilla = tablero.matriz[0][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][4], tablero.matriz[0][6], tablero.matriz[1][4], tablero.matriz[1][5], tablero.matriz[1][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [0,5]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [0,6] — borde, 5 vecinos: [0,5], [0,7], [1,5], [1,6], [1,7]
    {
      const casilla = tablero.matriz[0][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][5], tablero.matriz[0][7], tablero.matriz[1][5], tablero.matriz[1][6], tablero.matriz[1][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [0,6]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [0,7] — borde, 5 vecinos: [0,6], [0,8], [1,6], [1,7], [1,8]
    {
      const casilla = tablero.matriz[0][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][6], tablero.matriz[0][8], tablero.matriz[1][6], tablero.matriz[1][7], tablero.matriz[1][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [0,7]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [0,8] — borde, 5 vecinos: [0,7], [0,9], [1,7], [1,8], [1,9]
    {
      const casilla = tablero.matriz[0][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][7], tablero.matriz[0][9], tablero.matriz[1][7], tablero.matriz[1][8], tablero.matriz[1][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [0,8]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [0,9] — esquina, 3 vecinos: [0,8], [1,8], [1,9]
    {
      const casilla = tablero.matriz[0][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][8], tablero.matriz[1][8], tablero.matriz[1][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [0,9]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [1,0] — borde, 5 vecinos: [0,0], [0,1], [1,1], [2,0], [2,1]
    {
      const casilla = tablero.matriz[1][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][0], tablero.matriz[0][1], tablero.matriz[1][1], tablero.matriz[2][0], tablero.matriz[2][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [1,0]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [1,1] — interior, 8 vecinos: [0,0], [0,1], [0,2], [1,0], [1,2], [2,0], [2,1], [2,2]
    {
      const casilla = tablero.matriz[1][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][0], tablero.matriz[0][1], tablero.matriz[0][2], tablero.matriz[1][0], tablero.matriz[1][2], tablero.matriz[2][0], tablero.matriz[2][1], tablero.matriz[2][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [1,1]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [1,2] — interior, 8 vecinos: [0,1], [0,2], [0,3], [1,1], [1,3], [2,1], [2,2], [2,3]
    {
      const casilla = tablero.matriz[1][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][1], tablero.matriz[0][2], tablero.matriz[0][3], tablero.matriz[1][1], tablero.matriz[1][3], tablero.matriz[2][1], tablero.matriz[2][2], tablero.matriz[2][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [1,2]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [1,3] — interior, 8 vecinos: [0,2], [0,3], [0,4], [1,2], [1,4], [2,2], [2,3], [2,4]
    {
      const casilla = tablero.matriz[1][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][2], tablero.matriz[0][3], tablero.matriz[0][4], tablero.matriz[1][2], tablero.matriz[1][4], tablero.matriz[2][2], tablero.matriz[2][3], tablero.matriz[2][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [1,3]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [1,4] — interior, 8 vecinos: [0,3], [0,4], [0,5], [1,3], [1,5], [2,3], [2,4], [2,5]
    {
      const casilla = tablero.matriz[1][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][3], tablero.matriz[0][4], tablero.matriz[0][5], tablero.matriz[1][3], tablero.matriz[1][5], tablero.matriz[2][3], tablero.matriz[2][4], tablero.matriz[2][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [1,4]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [1,5] — interior, 8 vecinos: [0,4], [0,5], [0,6], [1,4], [1,6], [2,4], [2,5], [2,6]
    {
      const casilla = tablero.matriz[1][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][4], tablero.matriz[0][5], tablero.matriz[0][6], tablero.matriz[1][4], tablero.matriz[1][6], tablero.matriz[2][4], tablero.matriz[2][5], tablero.matriz[2][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [1,5]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [1,6] — interior, 8 vecinos: [0,5], [0,6], [0,7], [1,5], [1,7], [2,5], [2,6], [2,7]
    {
      const casilla = tablero.matriz[1][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][5], tablero.matriz[0][6], tablero.matriz[0][7], tablero.matriz[1][5], tablero.matriz[1][7], tablero.matriz[2][5], tablero.matriz[2][6], tablero.matriz[2][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [1,6]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [1,7] — interior, 8 vecinos: [0,6], [0,7], [0,8], [1,6], [1,8], [2,6], [2,7], [2,8]
    {
      const casilla = tablero.matriz[1][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][6], tablero.matriz[0][7], tablero.matriz[0][8], tablero.matriz[1][6], tablero.matriz[1][8], tablero.matriz[2][6], tablero.matriz[2][7], tablero.matriz[2][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [1,7]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [1,8] — interior, 8 vecinos: [0,7], [0,8], [0,9], [1,7], [1,9], [2,7], [2,8], [2,9]
    {
      const casilla = tablero.matriz[1][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][7], tablero.matriz[0][8], tablero.matriz[0][9], tablero.matriz[1][7], tablero.matriz[1][9], tablero.matriz[2][7], tablero.matriz[2][8], tablero.matriz[2][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [1,8]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [1,9] — borde, 5 vecinos: [0,8], [0,9], [1,8], [2,8], [2,9]
    {
      const casilla = tablero.matriz[1][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][8], tablero.matriz[0][9], tablero.matriz[1][8], tablero.matriz[2][8], tablero.matriz[2][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [1,9]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [2,0] — borde, 5 vecinos: [1,0], [1,1], [2,1], [3,0], [3,1]
    {
      const casilla = tablero.matriz[2][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][0], tablero.matriz[1][1], tablero.matriz[2][1], tablero.matriz[3][0], tablero.matriz[3][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [2,0]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [2,1] — interior, 8 vecinos: [1,0], [1,1], [1,2], [2,0], [2,2], [3,0], [3,1], [3,2]
    {
      const casilla = tablero.matriz[2][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][0], tablero.matriz[1][1], tablero.matriz[1][2], tablero.matriz[2][0], tablero.matriz[2][2], tablero.matriz[3][0], tablero.matriz[3][1], tablero.matriz[3][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [2,1]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [2,2] — interior, 8 vecinos: [1,1], [1,2], [1,3], [2,1], [2,3], [3,1], [3,2], [3,3]
    {
      const casilla = tablero.matriz[2][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][1], tablero.matriz[1][2], tablero.matriz[1][3], tablero.matriz[2][1], tablero.matriz[2][3], tablero.matriz[3][1], tablero.matriz[3][2], tablero.matriz[3][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [2,2]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [2,3] — interior, 8 vecinos: [1,2], [1,3], [1,4], [2,2], [2,4], [3,2], [3,3], [3,4]
    {
      const casilla = tablero.matriz[2][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][2], tablero.matriz[1][3], tablero.matriz[1][4], tablero.matriz[2][2], tablero.matriz[2][4], tablero.matriz[3][2], tablero.matriz[3][3], tablero.matriz[3][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [2,3]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [2,4] — interior, 8 vecinos: [1,3], [1,4], [1,5], [2,3], [2,5], [3,3], [3,4], [3,5]
    {
      const casilla = tablero.matriz[2][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][3], tablero.matriz[1][4], tablero.matriz[1][5], tablero.matriz[2][3], tablero.matriz[2][5], tablero.matriz[3][3], tablero.matriz[3][4], tablero.matriz[3][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [2,4]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [2,5] — interior, 8 vecinos: [1,4], [1,5], [1,6], [2,4], [2,6], [3,4], [3,5], [3,6]
    {
      const casilla = tablero.matriz[2][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][4], tablero.matriz[1][5], tablero.matriz[1][6], tablero.matriz[2][4], tablero.matriz[2][6], tablero.matriz[3][4], tablero.matriz[3][5], tablero.matriz[3][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [2,5]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [2,6] — interior, 8 vecinos: [1,5], [1,6], [1,7], [2,5], [2,7], [3,5], [3,6], [3,7]
    {
      const casilla = tablero.matriz[2][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][5], tablero.matriz[1][6], tablero.matriz[1][7], tablero.matriz[2][5], tablero.matriz[2][7], tablero.matriz[3][5], tablero.matriz[3][6], tablero.matriz[3][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [2,6]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [2,7] — interior, 8 vecinos: [1,6], [1,7], [1,8], [2,6], [2,8], [3,6], [3,7], [3,8]
    {
      const casilla = tablero.matriz[2][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][6], tablero.matriz[1][7], tablero.matriz[1][8], tablero.matriz[2][6], tablero.matriz[2][8], tablero.matriz[3][6], tablero.matriz[3][7], tablero.matriz[3][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [2,7]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [2,8] — interior, 8 vecinos: [1,7], [1,8], [1,9], [2,7], [2,9], [3,7], [3,8], [3,9]
    {
      const casilla = tablero.matriz[2][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][7], tablero.matriz[1][8], tablero.matriz[1][9], tablero.matriz[2][7], tablero.matriz[2][9], tablero.matriz[3][7], tablero.matriz[3][8], tablero.matriz[3][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [2,8]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [2,9] — borde, 5 vecinos: [1,8], [1,9], [2,8], [3,8], [3,9]
    {
      const casilla = tablero.matriz[2][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][8], tablero.matriz[1][9], tablero.matriz[2][8], tablero.matriz[3][8], tablero.matriz[3][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [2,9]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [3,0] — borde, 5 vecinos: [2,0], [2,1], [3,1], [4,0], [4,1]
    {
      const casilla = tablero.matriz[3][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][0], tablero.matriz[2][1], tablero.matriz[3][1], tablero.matriz[4][0], tablero.matriz[4][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [3,0]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [3,1] — interior, 8 vecinos: [2,0], [2,1], [2,2], [3,0], [3,2], [4,0], [4,1], [4,2]
    {
      const casilla = tablero.matriz[3][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][0], tablero.matriz[2][1], tablero.matriz[2][2], tablero.matriz[3][0], tablero.matriz[3][2], tablero.matriz[4][0], tablero.matriz[4][1], tablero.matriz[4][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [3,1]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [3,2] — interior, 8 vecinos: [2,1], [2,2], [2,3], [3,1], [3,3], [4,1], [4,2], [4,3]
    {
      const casilla = tablero.matriz[3][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][1], tablero.matriz[2][2], tablero.matriz[2][3], tablero.matriz[3][1], tablero.matriz[3][3], tablero.matriz[4][1], tablero.matriz[4][2], tablero.matriz[4][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [3,2]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [3,3] — interior, 8 vecinos: [2,2], [2,3], [2,4], [3,2], [3,4], [4,2], [4,3], [4,4]
    {
      const casilla = tablero.matriz[3][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][2], tablero.matriz[2][3], tablero.matriz[2][4], tablero.matriz[3][2], tablero.matriz[3][4], tablero.matriz[4][2], tablero.matriz[4][3], tablero.matriz[4][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [3,3]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [3,4] — interior, 8 vecinos: [2,3], [2,4], [2,5], [3,3], [3,5], [4,3], [4,4], [4,5]
    {
      const casilla = tablero.matriz[3][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][3], tablero.matriz[2][4], tablero.matriz[2][5], tablero.matriz[3][3], tablero.matriz[3][5], tablero.matriz[4][3], tablero.matriz[4][4], tablero.matriz[4][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [3,4]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [3,5] — interior, 8 vecinos: [2,4], [2,5], [2,6], [3,4], [3,6], [4,4], [4,5], [4,6]
    {
      const casilla = tablero.matriz[3][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][4], tablero.matriz[2][5], tablero.matriz[2][6], tablero.matriz[3][4], tablero.matriz[3][6], tablero.matriz[4][4], tablero.matriz[4][5], tablero.matriz[4][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [3,5]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [3,6] — interior, 8 vecinos: [2,5], [2,6], [2,7], [3,5], [3,7], [4,5], [4,6], [4,7]
    {
      const casilla = tablero.matriz[3][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][5], tablero.matriz[2][6], tablero.matriz[2][7], tablero.matriz[3][5], tablero.matriz[3][7], tablero.matriz[4][5], tablero.matriz[4][6], tablero.matriz[4][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [3,6]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [3,7] — interior, 8 vecinos: [2,6], [2,7], [2,8], [3,6], [3,8], [4,6], [4,7], [4,8]
    {
      const casilla = tablero.matriz[3][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][6], tablero.matriz[2][7], tablero.matriz[2][8], tablero.matriz[3][6], tablero.matriz[3][8], tablero.matriz[4][6], tablero.matriz[4][7], tablero.matriz[4][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [3,7]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [3,8] — interior, 8 vecinos: [2,7], [2,8], [2,9], [3,7], [3,9], [4,7], [4,8], [4,9]
    {
      const casilla = tablero.matriz[3][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][7], tablero.matriz[2][8], tablero.matriz[2][9], tablero.matriz[3][7], tablero.matriz[3][9], tablero.matriz[4][7], tablero.matriz[4][8], tablero.matriz[4][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [3,8]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [3,9] — borde, 5 vecinos: [2,8], [2,9], [3,8], [4,8], [4,9]
    {
      const casilla = tablero.matriz[3][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][8], tablero.matriz[2][9], tablero.matriz[3][8], tablero.matriz[4][8], tablero.matriz[4][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [3,9]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [4,0] — borde, 5 vecinos: [3,0], [3,1], [4,1], [5,0], [5,1]
    {
      const casilla = tablero.matriz[4][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][0], tablero.matriz[3][1], tablero.matriz[4][1], tablero.matriz[5][0], tablero.matriz[5][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [4,0]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [4,1] — interior, 8 vecinos: [3,0], [3,1], [3,2], [4,0], [4,2], [5,0], [5,1], [5,2]
    {
      const casilla = tablero.matriz[4][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][0], tablero.matriz[3][1], tablero.matriz[3][2], tablero.matriz[4][0], tablero.matriz[4][2], tablero.matriz[5][0], tablero.matriz[5][1], tablero.matriz[5][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [4,1]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [4,2] — interior, 8 vecinos: [3,1], [3,2], [3,3], [4,1], [4,3], [5,1], [5,2], [5,3]
    {
      const casilla = tablero.matriz[4][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][1], tablero.matriz[3][2], tablero.matriz[3][3], tablero.matriz[4][1], tablero.matriz[4][3], tablero.matriz[5][1], tablero.matriz[5][2], tablero.matriz[5][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [4,2]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [4,3] — interior, 8 vecinos: [3,2], [3,3], [3,4], [4,2], [4,4], [5,2], [5,3], [5,4]
    {
      const casilla = tablero.matriz[4][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][2], tablero.matriz[3][3], tablero.matriz[3][4], tablero.matriz[4][2], tablero.matriz[4][4], tablero.matriz[5][2], tablero.matriz[5][3], tablero.matriz[5][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [4,3]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [4,4] — interior, 8 vecinos: [3,3], [3,4], [3,5], [4,3], [4,5], [5,3], [5,4], [5,5]
    {
      const casilla = tablero.matriz[4][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][3], tablero.matriz[3][4], tablero.matriz[3][5], tablero.matriz[4][3], tablero.matriz[4][5], tablero.matriz[5][3], tablero.matriz[5][4], tablero.matriz[5][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [4,4]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [4,5] — interior, 8 vecinos: [3,4], [3,5], [3,6], [4,4], [4,6], [5,4], [5,5], [5,6]
    {
      const casilla = tablero.matriz[4][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][4], tablero.matriz[3][5], tablero.matriz[3][6], tablero.matriz[4][4], tablero.matriz[4][6], tablero.matriz[5][4], tablero.matriz[5][5], tablero.matriz[5][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [4,5]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [4,6] — interior, 8 vecinos: [3,5], [3,6], [3,7], [4,5], [4,7], [5,5], [5,6], [5,7]
    {
      const casilla = tablero.matriz[4][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][5], tablero.matriz[3][6], tablero.matriz[3][7], tablero.matriz[4][5], tablero.matriz[4][7], tablero.matriz[5][5], tablero.matriz[5][6], tablero.matriz[5][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [4,6]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [4,7] — interior, 8 vecinos: [3,6], [3,7], [3,8], [4,6], [4,8], [5,6], [5,7], [5,8]
    {
      const casilla = tablero.matriz[4][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][6], tablero.matriz[3][7], tablero.matriz[3][8], tablero.matriz[4][6], tablero.matriz[4][8], tablero.matriz[5][6], tablero.matriz[5][7], tablero.matriz[5][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [4,7]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [4,8] — interior, 8 vecinos: [3,7], [3,8], [3,9], [4,7], [4,9], [5,7], [5,8], [5,9]
    {
      const casilla = tablero.matriz[4][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][7], tablero.matriz[3][8], tablero.matriz[3][9], tablero.matriz[4][7], tablero.matriz[4][9], tablero.matriz[5][7], tablero.matriz[5][8], tablero.matriz[5][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [4,8]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [4,9] — borde, 5 vecinos: [3,8], [3,9], [4,8], [5,8], [5,9]
    {
      const casilla = tablero.matriz[4][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][8], tablero.matriz[3][9], tablero.matriz[4][8], tablero.matriz[5][8], tablero.matriz[5][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [4,9]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [5,0] — borde, 5 vecinos: [4,0], [4,1], [5,1], [6,0], [6,1]
    {
      const casilla = tablero.matriz[5][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][0], tablero.matriz[4][1], tablero.matriz[5][1], tablero.matriz[6][0], tablero.matriz[6][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [5,0]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [5,1] — interior, 8 vecinos: [4,0], [4,1], [4,2], [5,0], [5,2], [6,0], [6,1], [6,2]
    {
      const casilla = tablero.matriz[5][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][0], tablero.matriz[4][1], tablero.matriz[4][2], tablero.matriz[5][0], tablero.matriz[5][2], tablero.matriz[6][0], tablero.matriz[6][1], tablero.matriz[6][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [5,1]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [5,2] — interior, 8 vecinos: [4,1], [4,2], [4,3], [5,1], [5,3], [6,1], [6,2], [6,3]
    {
      const casilla = tablero.matriz[5][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][1], tablero.matriz[4][2], tablero.matriz[4][3], tablero.matriz[5][1], tablero.matriz[5][3], tablero.matriz[6][1], tablero.matriz[6][2], tablero.matriz[6][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [5,2]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [5,3] — interior, 8 vecinos: [4,2], [4,3], [4,4], [5,2], [5,4], [6,2], [6,3], [6,4]
    {
      const casilla = tablero.matriz[5][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][2], tablero.matriz[4][3], tablero.matriz[4][4], tablero.matriz[5][2], tablero.matriz[5][4], tablero.matriz[6][2], tablero.matriz[6][3], tablero.matriz[6][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [5,3]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [5,4] — interior, 8 vecinos: [4,3], [4,4], [4,5], [5,3], [5,5], [6,3], [6,4], [6,5]
    {
      const casilla = tablero.matriz[5][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][3], tablero.matriz[4][4], tablero.matriz[4][5], tablero.matriz[5][3], tablero.matriz[5][5], tablero.matriz[6][3], tablero.matriz[6][4], tablero.matriz[6][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [5,4]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [5,5] — interior, 8 vecinos: [4,4], [4,5], [4,6], [5,4], [5,6], [6,4], [6,5], [6,6]
    {
      const casilla = tablero.matriz[5][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][4], tablero.matriz[4][5], tablero.matriz[4][6], tablero.matriz[5][4], tablero.matriz[5][6], tablero.matriz[6][4], tablero.matriz[6][5], tablero.matriz[6][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [5,5]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [5,6] — interior, 8 vecinos: [4,5], [4,6], [4,7], [5,5], [5,7], [6,5], [6,6], [6,7]
    {
      const casilla = tablero.matriz[5][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][5], tablero.matriz[4][6], tablero.matriz[4][7], tablero.matriz[5][5], tablero.matriz[5][7], tablero.matriz[6][5], tablero.matriz[6][6], tablero.matriz[6][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [5,6]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [5,7] — interior, 8 vecinos: [4,6], [4,7], [4,8], [5,6], [5,8], [6,6], [6,7], [6,8]
    {
      const casilla = tablero.matriz[5][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][6], tablero.matriz[4][7], tablero.matriz[4][8], tablero.matriz[5][6], tablero.matriz[5][8], tablero.matriz[6][6], tablero.matriz[6][7], tablero.matriz[6][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [5,7]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [5,8] — interior, 8 vecinos: [4,7], [4,8], [4,9], [5,7], [5,9], [6,7], [6,8], [6,9]
    {
      const casilla = tablero.matriz[5][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][7], tablero.matriz[4][8], tablero.matriz[4][9], tablero.matriz[5][7], tablero.matriz[5][9], tablero.matriz[6][7], tablero.matriz[6][8], tablero.matriz[6][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [5,8]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [5,9] — borde, 5 vecinos: [4,8], [4,9], [5,8], [6,8], [6,9]
    {
      const casilla = tablero.matriz[5][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][8], tablero.matriz[4][9], tablero.matriz[5][8], tablero.matriz[6][8], tablero.matriz[6][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [5,9]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [6,0] — borde, 5 vecinos: [5,0], [5,1], [6,1], [7,0], [7,1]
    {
      const casilla = tablero.matriz[6][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][0], tablero.matriz[5][1], tablero.matriz[6][1], tablero.matriz[7][0], tablero.matriz[7][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [6,0]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [6,1] — interior, 8 vecinos: [5,0], [5,1], [5,2], [6,0], [6,2], [7,0], [7,1], [7,2]
    {
      const casilla = tablero.matriz[6][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][0], tablero.matriz[5][1], tablero.matriz[5][2], tablero.matriz[6][0], tablero.matriz[6][2], tablero.matriz[7][0], tablero.matriz[7][1], tablero.matriz[7][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [6,1]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [6,2] — interior, 8 vecinos: [5,1], [5,2], [5,3], [6,1], [6,3], [7,1], [7,2], [7,3]
    {
      const casilla = tablero.matriz[6][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][1], tablero.matriz[5][2], tablero.matriz[5][3], tablero.matriz[6][1], tablero.matriz[6][3], tablero.matriz[7][1], tablero.matriz[7][2], tablero.matriz[7][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [6,2]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [6,3] — interior, 8 vecinos: [5,2], [5,3], [5,4], [6,2], [6,4], [7,2], [7,3], [7,4]
    {
      const casilla = tablero.matriz[6][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][2], tablero.matriz[5][3], tablero.matriz[5][4], tablero.matriz[6][2], tablero.matriz[6][4], tablero.matriz[7][2], tablero.matriz[7][3], tablero.matriz[7][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [6,3]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [6,4] — interior, 8 vecinos: [5,3], [5,4], [5,5], [6,3], [6,5], [7,3], [7,4], [7,5]
    {
      const casilla = tablero.matriz[6][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][3], tablero.matriz[5][4], tablero.matriz[5][5], tablero.matriz[6][3], tablero.matriz[6][5], tablero.matriz[7][3], tablero.matriz[7][4], tablero.matriz[7][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [6,4]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [6,5] — interior, 8 vecinos: [5,4], [5,5], [5,6], [6,4], [6,6], [7,4], [7,5], [7,6]
    {
      const casilla = tablero.matriz[6][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][4], tablero.matriz[5][5], tablero.matriz[5][6], tablero.matriz[6][4], tablero.matriz[6][6], tablero.matriz[7][4], tablero.matriz[7][5], tablero.matriz[7][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [6,5]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [6,6] — interior, 8 vecinos: [5,5], [5,6], [5,7], [6,5], [6,7], [7,5], [7,6], [7,7]
    {
      const casilla = tablero.matriz[6][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][5], tablero.matriz[5][6], tablero.matriz[5][7], tablero.matriz[6][5], tablero.matriz[6][7], tablero.matriz[7][5], tablero.matriz[7][6], tablero.matriz[7][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [6,6]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [6,7] — interior, 8 vecinos: [5,6], [5,7], [5,8], [6,6], [6,8], [7,6], [7,7], [7,8]
    {
      const casilla = tablero.matriz[6][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][6], tablero.matriz[5][7], tablero.matriz[5][8], tablero.matriz[6][6], tablero.matriz[6][8], tablero.matriz[7][6], tablero.matriz[7][7], tablero.matriz[7][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [6,7]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [6,8] — interior, 8 vecinos: [5,7], [5,8], [5,9], [6,7], [6,9], [7,7], [7,8], [7,9]
    {
      const casilla = tablero.matriz[6][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][7], tablero.matriz[5][8], tablero.matriz[5][9], tablero.matriz[6][7], tablero.matriz[6][9], tablero.matriz[7][7], tablero.matriz[7][8], tablero.matriz[7][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [6,8]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [6,9] — borde, 5 vecinos: [5,8], [5,9], [6,8], [7,8], [7,9]
    {
      const casilla = tablero.matriz[6][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][8], tablero.matriz[5][9], tablero.matriz[6][8], tablero.matriz[7][8], tablero.matriz[7][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [6,9]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [7,0] — borde, 5 vecinos: [6,0], [6,1], [7,1], [8,0], [8,1]
    {
      const casilla = tablero.matriz[7][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][0], tablero.matriz[6][1], tablero.matriz[7][1], tablero.matriz[8][0], tablero.matriz[8][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [7,0]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [7,1] — interior, 8 vecinos: [6,0], [6,1], [6,2], [7,0], [7,2], [8,0], [8,1], [8,2]
    {
      const casilla = tablero.matriz[7][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][0], tablero.matriz[6][1], tablero.matriz[6][2], tablero.matriz[7][0], tablero.matriz[7][2], tablero.matriz[8][0], tablero.matriz[8][1], tablero.matriz[8][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [7,1]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [7,2] — interior, 8 vecinos: [6,1], [6,2], [6,3], [7,1], [7,3], [8,1], [8,2], [8,3]
    {
      const casilla = tablero.matriz[7][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][1], tablero.matriz[6][2], tablero.matriz[6][3], tablero.matriz[7][1], tablero.matriz[7][3], tablero.matriz[8][1], tablero.matriz[8][2], tablero.matriz[8][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [7,2]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [7,3] — interior, 8 vecinos: [6,2], [6,3], [6,4], [7,2], [7,4], [8,2], [8,3], [8,4]
    {
      const casilla = tablero.matriz[7][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][2], tablero.matriz[6][3], tablero.matriz[6][4], tablero.matriz[7][2], tablero.matriz[7][4], tablero.matriz[8][2], tablero.matriz[8][3], tablero.matriz[8][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [7,3]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [7,4] — interior, 8 vecinos: [6,3], [6,4], [6,5], [7,3], [7,5], [8,3], [8,4], [8,5]
    {
      const casilla = tablero.matriz[7][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][3], tablero.matriz[6][4], tablero.matriz[6][5], tablero.matriz[7][3], tablero.matriz[7][5], tablero.matriz[8][3], tablero.matriz[8][4], tablero.matriz[8][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [7,4]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [7,5] — interior, 8 vecinos: [6,4], [6,5], [6,6], [7,4], [7,6], [8,4], [8,5], [8,6]
    {
      const casilla = tablero.matriz[7][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][4], tablero.matriz[6][5], tablero.matriz[6][6], tablero.matriz[7][4], tablero.matriz[7][6], tablero.matriz[8][4], tablero.matriz[8][5], tablero.matriz[8][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [7,5]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [7,6] — interior, 8 vecinos: [6,5], [6,6], [6,7], [7,5], [7,7], [8,5], [8,6], [8,7]
    {
      const casilla = tablero.matriz[7][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][5], tablero.matriz[6][6], tablero.matriz[6][7], tablero.matriz[7][5], tablero.matriz[7][7], tablero.matriz[8][5], tablero.matriz[8][6], tablero.matriz[8][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [7,6]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [7,7] — interior, 8 vecinos: [6,6], [6,7], [6,8], [7,6], [7,8], [8,6], [8,7], [8,8]
    {
      const casilla = tablero.matriz[7][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][6], tablero.matriz[6][7], tablero.matriz[6][8], tablero.matriz[7][6], tablero.matriz[7][8], tablero.matriz[8][6], tablero.matriz[8][7], tablero.matriz[8][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [7,7]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [7,8] — interior, 8 vecinos: [6,7], [6,8], [6,9], [7,7], [7,9], [8,7], [8,8], [8,9]
    {
      const casilla = tablero.matriz[7][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][7], tablero.matriz[6][8], tablero.matriz[6][9], tablero.matriz[7][7], tablero.matriz[7][9], tablero.matriz[8][7], tablero.matriz[8][8], tablero.matriz[8][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [7,8]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [7,9] — borde, 5 vecinos: [6,8], [6,9], [7,8], [8,8], [8,9]
    {
      const casilla = tablero.matriz[7][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][8], tablero.matriz[6][9], tablero.matriz[7][8], tablero.matriz[8][8], tablero.matriz[8][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [7,9]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [8,0] — borde, 5 vecinos: [7,0], [7,1], [8,1], [9,0], [9,1]
    {
      const casilla = tablero.matriz[8][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][0], tablero.matriz[7][1], tablero.matriz[8][1], tablero.matriz[9][0], tablero.matriz[9][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [8,0]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [8,1] — interior, 8 vecinos: [7,0], [7,1], [7,2], [8,0], [8,2], [9,0], [9,1], [9,2]
    {
      const casilla = tablero.matriz[8][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][0], tablero.matriz[7][1], tablero.matriz[7][2], tablero.matriz[8][0], tablero.matriz[8][2], tablero.matriz[9][0], tablero.matriz[9][1], tablero.matriz[9][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [8,1]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [8,2] — interior, 8 vecinos: [7,1], [7,2], [7,3], [8,1], [8,3], [9,1], [9,2], [9,3]
    {
      const casilla = tablero.matriz[8][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][1], tablero.matriz[7][2], tablero.matriz[7][3], tablero.matriz[8][1], tablero.matriz[8][3], tablero.matriz[9][1], tablero.matriz[9][2], tablero.matriz[9][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [8,2]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [8,3] — interior, 8 vecinos: [7,2], [7,3], [7,4], [8,2], [8,4], [9,2], [9,3], [9,4]
    {
      const casilla = tablero.matriz[8][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][2], tablero.matriz[7][3], tablero.matriz[7][4], tablero.matriz[8][2], tablero.matriz[8][4], tablero.matriz[9][2], tablero.matriz[9][3], tablero.matriz[9][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [8,3]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [8,4] — interior, 8 vecinos: [7,3], [7,4], [7,5], [8,3], [8,5], [9,3], [9,4], [9,5]
    {
      const casilla = tablero.matriz[8][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][3], tablero.matriz[7][4], tablero.matriz[7][5], tablero.matriz[8][3], tablero.matriz[8][5], tablero.matriz[9][3], tablero.matriz[9][4], tablero.matriz[9][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [8,4]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [8,5] — interior, 8 vecinos: [7,4], [7,5], [7,6], [8,4], [8,6], [9,4], [9,5], [9,6]
    {
      const casilla = tablero.matriz[8][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][4], tablero.matriz[7][5], tablero.matriz[7][6], tablero.matriz[8][4], tablero.matriz[8][6], tablero.matriz[9][4], tablero.matriz[9][5], tablero.matriz[9][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [8,5]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [8,6] — interior, 8 vecinos: [7,5], [7,6], [7,7], [8,5], [8,7], [9,5], [9,6], [9,7]
    {
      const casilla = tablero.matriz[8][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][5], tablero.matriz[7][6], tablero.matriz[7][7], tablero.matriz[8][5], tablero.matriz[8][7], tablero.matriz[9][5], tablero.matriz[9][6], tablero.matriz[9][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [8,6]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [8,7] — interior, 8 vecinos: [7,6], [7,7], [7,8], [8,6], [8,8], [9,6], [9,7], [9,8]
    {
      const casilla = tablero.matriz[8][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][6], tablero.matriz[7][7], tablero.matriz[7][8], tablero.matriz[8][6], tablero.matriz[8][8], tablero.matriz[9][6], tablero.matriz[9][7], tablero.matriz[9][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [8,7]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [8,8] — interior, 8 vecinos: [7,7], [7,8], [7,9], [8,7], [8,9], [9,7], [9,8], [9,9]
    {
      const casilla = tablero.matriz[8][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][7], tablero.matriz[7][8], tablero.matriz[7][9], tablero.matriz[8][7], tablero.matriz[8][9], tablero.matriz[9][7], tablero.matriz[9][8], tablero.matriz[9][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [8,8]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [8,9] — borde, 5 vecinos: [7,8], [7,9], [8,8], [9,8], [9,9]
    {
      const casilla = tablero.matriz[8][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][8], tablero.matriz[7][9], tablero.matriz[8][8], tablero.matriz[9][8], tablero.matriz[9][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [8,9]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [9,0] — esquina, 3 vecinos: [8,0], [8,1], [9,1]
    {
      const casilla = tablero.matriz[9][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][0], tablero.matriz[8][1], tablero.matriz[9][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [9,0]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [9,1] — borde, 5 vecinos: [8,0], [8,1], [8,2], [9,0], [9,2]
    {
      const casilla = tablero.matriz[9][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][0], tablero.matriz[8][1], tablero.matriz[8][2], tablero.matriz[9][0], tablero.matriz[9][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [9,1]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [9,2] — borde, 5 vecinos: [8,1], [8,2], [8,3], [9,1], [9,3]
    {
      const casilla = tablero.matriz[9][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][1], tablero.matriz[8][2], tablero.matriz[8][3], tablero.matriz[9][1], tablero.matriz[9][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [9,2]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [9,3] — borde, 5 vecinos: [8,2], [8,3], [8,4], [9,2], [9,4]
    {
      const casilla = tablero.matriz[9][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][2], tablero.matriz[8][3], tablero.matriz[8][4], tablero.matriz[9][2], tablero.matriz[9][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [9,3]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [9,4] — borde, 5 vecinos: [8,3], [8,4], [8,5], [9,3], [9,5]
    {
      const casilla = tablero.matriz[9][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][3], tablero.matriz[8][4], tablero.matriz[8][5], tablero.matriz[9][3], tablero.matriz[9][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [9,4]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [9,5] — borde, 5 vecinos: [8,4], [8,5], [8,6], [9,4], [9,6]
    {
      const casilla = tablero.matriz[9][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][4], tablero.matriz[8][5], tablero.matriz[8][6], tablero.matriz[9][4], tablero.matriz[9][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [9,5]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [9,6] — borde, 5 vecinos: [8,5], [8,6], [8,7], [9,5], [9,7]
    {
      const casilla = tablero.matriz[9][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][5], tablero.matriz[8][6], tablero.matriz[8][7], tablero.matriz[9][5], tablero.matriz[9][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [9,6]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [9,7] — borde, 5 vecinos: [8,6], [8,7], [8,8], [9,6], [9,8]
    {
      const casilla = tablero.matriz[9][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][6], tablero.matriz[8][7], tablero.matriz[8][8], tablero.matriz[9][6], tablero.matriz[9][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [9,7]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [9,8] — borde, 5 vecinos: [8,7], [8,8], [8,9], [9,7], [9,9]
    {
      const casilla = tablero.matriz[9][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][7], tablero.matriz[8][8], tablero.matriz[8][9], tablero.matriz[9][7], tablero.matriz[9][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [9,8]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    // ── Casilla [9,9] — esquina, 3 vecinos: [8,8], [8,9], [9,8]
    {
      const casilla = tablero.matriz[9][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][8], tablero.matriz[8][9], tablero.matriz[9][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes === 0 && cerrados.length > 0) {
          const segura = this.elegirMejorCasillaSegura(cerrados);
          segura.recomendacion = 100;
          segura.probabilidadMina = 0;
          this.aplicarMarcasMinas(minasParaMarcar);
          return { fila: segura.fila, columna: segura.columna, motivo: 'Casilla segura deducida alrededor de [9,9]', probabilidadMina: 0, recomendacion: 100 };
        }
        if (faltantes > 0 && cerrados.length === faltantes) {
          for (const v of cerrados) {
            if (!minasParaMarcar.some((m) => m.fila === v.fila && m.columna === v.columna)) minasParaMarcar.push(v);
          }
        }
      }
    }

    this.aplicarMarcasMinas(minasParaMarcar);
    return null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CAPA 2 — COMPARACIÓN DE GRUPOS (explícita por cada casilla del tablero 10x10)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Compara pares de grupos: si el grupo A está contenido en B y la diferencia de
   * minas faltantes coincide con las casillas extra, esas casillas extra son minas.
   * Solo marca minas — la jugada segura la busca buscarJugadaSeguraPorLogica después.
   */
  private aplicarComparacionDeGrupos(tablero: Tablero): void {
    const grupos = this.construirGruposAnalisis(tablero);
    for (let i = 0; i < grupos.length; i++) {
      for (let j = 0; j < grupos.length; j++) {
        if (i === j) continue;
        const A = grupos[i];
        const B = grupos[j];
        if (!A.casillasCerradas.length || !B.casillasCerradas.length) continue;
        if (!this.esSubconjunto(A.casillasCerradas, B.casillasCerradas)) continue;
        const diferencia = this.obtenerDiferenciaDeCasillas(B.casillasCerradas, A.casillasCerradas);
        if (!diferencia.length) continue;
        const difMinas = B.minasFaltantes - A.minasFaltantes;
        if (difMinas > 0 && difMinas === diferencia.length) {
          for (const m of diferencia) { m.marcadaComoMina = true; m.probabilidadMina = 100; m.recomendacion = -100; }
        }
      }
    }
  }

  /**
   * Construye los grupos de análisis del tablero.
   * Cada grupo = una casilla abierta con número + sus vecinos cerrados no marcados.
   * Escrito explícitamente para cada una de las 100 posiciones del tablero 10x10.
   */
  private construirGruposAnalisis(tablero: Tablero): Array<{ filaCentral: number; columnaCentral: number; casillasCerradas: Casilla[]; minasFaltantes: number }> {
    const grupos: Array<{ filaCentral: number; columnaCentral: number; casillasCerradas: Casilla[]; minasFaltantes: number }> = [];

    // ── Casilla [0,0] — esquina, 3 vecinos: [0,1], [1,0], [1,1]
    {
      const casilla = tablero.matriz[0][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][1], tablero.matriz[1][0], tablero.matriz[1][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 0, columnaCentral: 0, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [0,1] — borde, 5 vecinos: [0,0], [0,2], [1,0], [1,1], [1,2]
    {
      const casilla = tablero.matriz[0][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][0], tablero.matriz[0][2], tablero.matriz[1][0], tablero.matriz[1][1], tablero.matriz[1][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 0, columnaCentral: 1, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [0,2] — borde, 5 vecinos: [0,1], [0,3], [1,1], [1,2], [1,3]
    {
      const casilla = tablero.matriz[0][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][1], tablero.matriz[0][3], tablero.matriz[1][1], tablero.matriz[1][2], tablero.matriz[1][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 0, columnaCentral: 2, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [0,3] — borde, 5 vecinos: [0,2], [0,4], [1,2], [1,3], [1,4]
    {
      const casilla = tablero.matriz[0][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][2], tablero.matriz[0][4], tablero.matriz[1][2], tablero.matriz[1][3], tablero.matriz[1][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 0, columnaCentral: 3, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [0,4] — borde, 5 vecinos: [0,3], [0,5], [1,3], [1,4], [1,5]
    {
      const casilla = tablero.matriz[0][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][3], tablero.matriz[0][5], tablero.matriz[1][3], tablero.matriz[1][4], tablero.matriz[1][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 0, columnaCentral: 4, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [0,5] — borde, 5 vecinos: [0,4], [0,6], [1,4], [1,5], [1,6]
    {
      const casilla = tablero.matriz[0][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][4], tablero.matriz[0][6], tablero.matriz[1][4], tablero.matriz[1][5], tablero.matriz[1][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 0, columnaCentral: 5, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [0,6] — borde, 5 vecinos: [0,5], [0,7], [1,5], [1,6], [1,7]
    {
      const casilla = tablero.matriz[0][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][5], tablero.matriz[0][7], tablero.matriz[1][5], tablero.matriz[1][6], tablero.matriz[1][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 0, columnaCentral: 6, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [0,7] — borde, 5 vecinos: [0,6], [0,8], [1,6], [1,7], [1,8]
    {
      const casilla = tablero.matriz[0][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][6], tablero.matriz[0][8], tablero.matriz[1][6], tablero.matriz[1][7], tablero.matriz[1][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 0, columnaCentral: 7, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [0,8] — borde, 5 vecinos: [0,7], [0,9], [1,7], [1,8], [1,9]
    {
      const casilla = tablero.matriz[0][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][7], tablero.matriz[0][9], tablero.matriz[1][7], tablero.matriz[1][8], tablero.matriz[1][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 0, columnaCentral: 8, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [0,9] — esquina, 3 vecinos: [0,8], [1,8], [1,9]
    {
      const casilla = tablero.matriz[0][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][8], tablero.matriz[1][8], tablero.matriz[1][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 0, columnaCentral: 9, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [1,0] — borde, 5 vecinos: [0,0], [0,1], [1,1], [2,0], [2,1]
    {
      const casilla = tablero.matriz[1][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][0], tablero.matriz[0][1], tablero.matriz[1][1], tablero.matriz[2][0], tablero.matriz[2][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 1, columnaCentral: 0, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [1,1] — interior, 8 vecinos: [0,0], [0,1], [0,2], [1,0], [1,2], [2,0], [2,1], [2,2]
    {
      const casilla = tablero.matriz[1][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][0], tablero.matriz[0][1], tablero.matriz[0][2], tablero.matriz[1][0], tablero.matriz[1][2], tablero.matriz[2][0], tablero.matriz[2][1], tablero.matriz[2][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 1, columnaCentral: 1, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [1,2] — interior, 8 vecinos: [0,1], [0,2], [0,3], [1,1], [1,3], [2,1], [2,2], [2,3]
    {
      const casilla = tablero.matriz[1][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][1], tablero.matriz[0][2], tablero.matriz[0][3], tablero.matriz[1][1], tablero.matriz[1][3], tablero.matriz[2][1], tablero.matriz[2][2], tablero.matriz[2][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 1, columnaCentral: 2, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [1,3] — interior, 8 vecinos: [0,2], [0,3], [0,4], [1,2], [1,4], [2,2], [2,3], [2,4]
    {
      const casilla = tablero.matriz[1][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][2], tablero.matriz[0][3], tablero.matriz[0][4], tablero.matriz[1][2], tablero.matriz[1][4], tablero.matriz[2][2], tablero.matriz[2][3], tablero.matriz[2][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 1, columnaCentral: 3, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [1,4] — interior, 8 vecinos: [0,3], [0,4], [0,5], [1,3], [1,5], [2,3], [2,4], [2,5]
    {
      const casilla = tablero.matriz[1][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][3], tablero.matriz[0][4], tablero.matriz[0][5], tablero.matriz[1][3], tablero.matriz[1][5], tablero.matriz[2][3], tablero.matriz[2][4], tablero.matriz[2][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 1, columnaCentral: 4, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [1,5] — interior, 8 vecinos: [0,4], [0,5], [0,6], [1,4], [1,6], [2,4], [2,5], [2,6]
    {
      const casilla = tablero.matriz[1][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][4], tablero.matriz[0][5], tablero.matriz[0][6], tablero.matriz[1][4], tablero.matriz[1][6], tablero.matriz[2][4], tablero.matriz[2][5], tablero.matriz[2][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 1, columnaCentral: 5, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [1,6] — interior, 8 vecinos: [0,5], [0,6], [0,7], [1,5], [1,7], [2,5], [2,6], [2,7]
    {
      const casilla = tablero.matriz[1][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][5], tablero.matriz[0][6], tablero.matriz[0][7], tablero.matriz[1][5], tablero.matriz[1][7], tablero.matriz[2][5], tablero.matriz[2][6], tablero.matriz[2][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 1, columnaCentral: 6, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [1,7] — interior, 8 vecinos: [0,6], [0,7], [0,8], [1,6], [1,8], [2,6], [2,7], [2,8]
    {
      const casilla = tablero.matriz[1][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][6], tablero.matriz[0][7], tablero.matriz[0][8], tablero.matriz[1][6], tablero.matriz[1][8], tablero.matriz[2][6], tablero.matriz[2][7], tablero.matriz[2][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 1, columnaCentral: 7, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [1,8] — interior, 8 vecinos: [0,7], [0,8], [0,9], [1,7], [1,9], [2,7], [2,8], [2,9]
    {
      const casilla = tablero.matriz[1][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][7], tablero.matriz[0][8], tablero.matriz[0][9], tablero.matriz[1][7], tablero.matriz[1][9], tablero.matriz[2][7], tablero.matriz[2][8], tablero.matriz[2][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 1, columnaCentral: 8, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [1,9] — borde, 5 vecinos: [0,8], [0,9], [1,8], [2,8], [2,9]
    {
      const casilla = tablero.matriz[1][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][8], tablero.matriz[0][9], tablero.matriz[1][8], tablero.matriz[2][8], tablero.matriz[2][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 1, columnaCentral: 9, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [2,0] — borde, 5 vecinos: [1,0], [1,1], [2,1], [3,0], [3,1]
    {
      const casilla = tablero.matriz[2][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][0], tablero.matriz[1][1], tablero.matriz[2][1], tablero.matriz[3][0], tablero.matriz[3][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 2, columnaCentral: 0, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [2,1] — interior, 8 vecinos: [1,0], [1,1], [1,2], [2,0], [2,2], [3,0], [3,1], [3,2]
    {
      const casilla = tablero.matriz[2][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][0], tablero.matriz[1][1], tablero.matriz[1][2], tablero.matriz[2][0], tablero.matriz[2][2], tablero.matriz[3][0], tablero.matriz[3][1], tablero.matriz[3][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 2, columnaCentral: 1, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [2,2] — interior, 8 vecinos: [1,1], [1,2], [1,3], [2,1], [2,3], [3,1], [3,2], [3,3]
    {
      const casilla = tablero.matriz[2][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][1], tablero.matriz[1][2], tablero.matriz[1][3], tablero.matriz[2][1], tablero.matriz[2][3], tablero.matriz[3][1], tablero.matriz[3][2], tablero.matriz[3][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 2, columnaCentral: 2, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [2,3] — interior, 8 vecinos: [1,2], [1,3], [1,4], [2,2], [2,4], [3,2], [3,3], [3,4]
    {
      const casilla = tablero.matriz[2][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][2], tablero.matriz[1][3], tablero.matriz[1][4], tablero.matriz[2][2], tablero.matriz[2][4], tablero.matriz[3][2], tablero.matriz[3][3], tablero.matriz[3][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 2, columnaCentral: 3, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [2,4] — interior, 8 vecinos: [1,3], [1,4], [1,5], [2,3], [2,5], [3,3], [3,4], [3,5]
    {
      const casilla = tablero.matriz[2][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][3], tablero.matriz[1][4], tablero.matriz[1][5], tablero.matriz[2][3], tablero.matriz[2][5], tablero.matriz[3][3], tablero.matriz[3][4], tablero.matriz[3][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 2, columnaCentral: 4, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [2,5] — interior, 8 vecinos: [1,4], [1,5], [1,6], [2,4], [2,6], [3,4], [3,5], [3,6]
    {
      const casilla = tablero.matriz[2][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][4], tablero.matriz[1][5], tablero.matriz[1][6], tablero.matriz[2][4], tablero.matriz[2][6], tablero.matriz[3][4], tablero.matriz[3][5], tablero.matriz[3][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 2, columnaCentral: 5, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [2,6] — interior, 8 vecinos: [1,5], [1,6], [1,7], [2,5], [2,7], [3,5], [3,6], [3,7]
    {
      const casilla = tablero.matriz[2][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][5], tablero.matriz[1][6], tablero.matriz[1][7], tablero.matriz[2][5], tablero.matriz[2][7], tablero.matriz[3][5], tablero.matriz[3][6], tablero.matriz[3][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 2, columnaCentral: 6, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [2,7] — interior, 8 vecinos: [1,6], [1,7], [1,8], [2,6], [2,8], [3,6], [3,7], [3,8]
    {
      const casilla = tablero.matriz[2][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][6], tablero.matriz[1][7], tablero.matriz[1][8], tablero.matriz[2][6], tablero.matriz[2][8], tablero.matriz[3][6], tablero.matriz[3][7], tablero.matriz[3][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 2, columnaCentral: 7, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [2,8] — interior, 8 vecinos: [1,7], [1,8], [1,9], [2,7], [2,9], [3,7], [3,8], [3,9]
    {
      const casilla = tablero.matriz[2][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][7], tablero.matriz[1][8], tablero.matriz[1][9], tablero.matriz[2][7], tablero.matriz[2][9], tablero.matriz[3][7], tablero.matriz[3][8], tablero.matriz[3][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 2, columnaCentral: 8, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [2,9] — borde, 5 vecinos: [1,8], [1,9], [2,8], [3,8], [3,9]
    {
      const casilla = tablero.matriz[2][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][8], tablero.matriz[1][9], tablero.matriz[2][8], tablero.matriz[3][8], tablero.matriz[3][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 2, columnaCentral: 9, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [3,0] — borde, 5 vecinos: [2,0], [2,1], [3,1], [4,0], [4,1]
    {
      const casilla = tablero.matriz[3][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][0], tablero.matriz[2][1], tablero.matriz[3][1], tablero.matriz[4][0], tablero.matriz[4][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 3, columnaCentral: 0, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [3,1] — interior, 8 vecinos: [2,0], [2,1], [2,2], [3,0], [3,2], [4,0], [4,1], [4,2]
    {
      const casilla = tablero.matriz[3][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][0], tablero.matriz[2][1], tablero.matriz[2][2], tablero.matriz[3][0], tablero.matriz[3][2], tablero.matriz[4][0], tablero.matriz[4][1], tablero.matriz[4][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 3, columnaCentral: 1, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [3,2] — interior, 8 vecinos: [2,1], [2,2], [2,3], [3,1], [3,3], [4,1], [4,2], [4,3]
    {
      const casilla = tablero.matriz[3][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][1], tablero.matriz[2][2], tablero.matriz[2][3], tablero.matriz[3][1], tablero.matriz[3][3], tablero.matriz[4][1], tablero.matriz[4][2], tablero.matriz[4][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 3, columnaCentral: 2, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [3,3] — interior, 8 vecinos: [2,2], [2,3], [2,4], [3,2], [3,4], [4,2], [4,3], [4,4]
    {
      const casilla = tablero.matriz[3][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][2], tablero.matriz[2][3], tablero.matriz[2][4], tablero.matriz[3][2], tablero.matriz[3][4], tablero.matriz[4][2], tablero.matriz[4][3], tablero.matriz[4][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 3, columnaCentral: 3, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [3,4] — interior, 8 vecinos: [2,3], [2,4], [2,5], [3,3], [3,5], [4,3], [4,4], [4,5]
    {
      const casilla = tablero.matriz[3][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][3], tablero.matriz[2][4], tablero.matriz[2][5], tablero.matriz[3][3], tablero.matriz[3][5], tablero.matriz[4][3], tablero.matriz[4][4], tablero.matriz[4][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 3, columnaCentral: 4, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [3,5] — interior, 8 vecinos: [2,4], [2,5], [2,6], [3,4], [3,6], [4,4], [4,5], [4,6]
    {
      const casilla = tablero.matriz[3][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][4], tablero.matriz[2][5], tablero.matriz[2][6], tablero.matriz[3][4], tablero.matriz[3][6], tablero.matriz[4][4], tablero.matriz[4][5], tablero.matriz[4][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 3, columnaCentral: 5, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [3,6] — interior, 8 vecinos: [2,5], [2,6], [2,7], [3,5], [3,7], [4,5], [4,6], [4,7]
    {
      const casilla = tablero.matriz[3][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][5], tablero.matriz[2][6], tablero.matriz[2][7], tablero.matriz[3][5], tablero.matriz[3][7], tablero.matriz[4][5], tablero.matriz[4][6], tablero.matriz[4][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 3, columnaCentral: 6, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [3,7] — interior, 8 vecinos: [2,6], [2,7], [2,8], [3,6], [3,8], [4,6], [4,7], [4,8]
    {
      const casilla = tablero.matriz[3][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][6], tablero.matriz[2][7], tablero.matriz[2][8], tablero.matriz[3][6], tablero.matriz[3][8], tablero.matriz[4][6], tablero.matriz[4][7], tablero.matriz[4][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 3, columnaCentral: 7, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [3,8] — interior, 8 vecinos: [2,7], [2,8], [2,9], [3,7], [3,9], [4,7], [4,8], [4,9]
    {
      const casilla = tablero.matriz[3][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][7], tablero.matriz[2][8], tablero.matriz[2][9], tablero.matriz[3][7], tablero.matriz[3][9], tablero.matriz[4][7], tablero.matriz[4][8], tablero.matriz[4][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 3, columnaCentral: 8, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [3,9] — borde, 5 vecinos: [2,8], [2,9], [3,8], [4,8], [4,9]
    {
      const casilla = tablero.matriz[3][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][8], tablero.matriz[2][9], tablero.matriz[3][8], tablero.matriz[4][8], tablero.matriz[4][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 3, columnaCentral: 9, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [4,0] — borde, 5 vecinos: [3,0], [3,1], [4,1], [5,0], [5,1]
    {
      const casilla = tablero.matriz[4][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][0], tablero.matriz[3][1], tablero.matriz[4][1], tablero.matriz[5][0], tablero.matriz[5][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 4, columnaCentral: 0, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [4,1] — interior, 8 vecinos: [3,0], [3,1], [3,2], [4,0], [4,2], [5,0], [5,1], [5,2]
    {
      const casilla = tablero.matriz[4][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][0], tablero.matriz[3][1], tablero.matriz[3][2], tablero.matriz[4][0], tablero.matriz[4][2], tablero.matriz[5][0], tablero.matriz[5][1], tablero.matriz[5][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 4, columnaCentral: 1, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [4,2] — interior, 8 vecinos: [3,1], [3,2], [3,3], [4,1], [4,3], [5,1], [5,2], [5,3]
    {
      const casilla = tablero.matriz[4][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][1], tablero.matriz[3][2], tablero.matriz[3][3], tablero.matriz[4][1], tablero.matriz[4][3], tablero.matriz[5][1], tablero.matriz[5][2], tablero.matriz[5][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 4, columnaCentral: 2, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [4,3] — interior, 8 vecinos: [3,2], [3,3], [3,4], [4,2], [4,4], [5,2], [5,3], [5,4]
    {
      const casilla = tablero.matriz[4][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][2], tablero.matriz[3][3], tablero.matriz[3][4], tablero.matriz[4][2], tablero.matriz[4][4], tablero.matriz[5][2], tablero.matriz[5][3], tablero.matriz[5][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 4, columnaCentral: 3, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [4,4] — interior, 8 vecinos: [3,3], [3,4], [3,5], [4,3], [4,5], [5,3], [5,4], [5,5]
    {
      const casilla = tablero.matriz[4][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][3], tablero.matriz[3][4], tablero.matriz[3][5], tablero.matriz[4][3], tablero.matriz[4][5], tablero.matriz[5][3], tablero.matriz[5][4], tablero.matriz[5][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 4, columnaCentral: 4, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [4,5] — interior, 8 vecinos: [3,4], [3,5], [3,6], [4,4], [4,6], [5,4], [5,5], [5,6]
    {
      const casilla = tablero.matriz[4][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][4], tablero.matriz[3][5], tablero.matriz[3][6], tablero.matriz[4][4], tablero.matriz[4][6], tablero.matriz[5][4], tablero.matriz[5][5], tablero.matriz[5][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 4, columnaCentral: 5, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [4,6] — interior, 8 vecinos: [3,5], [3,6], [3,7], [4,5], [4,7], [5,5], [5,6], [5,7]
    {
      const casilla = tablero.matriz[4][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][5], tablero.matriz[3][6], tablero.matriz[3][7], tablero.matriz[4][5], tablero.matriz[4][7], tablero.matriz[5][5], tablero.matriz[5][6], tablero.matriz[5][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 4, columnaCentral: 6, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [4,7] — interior, 8 vecinos: [3,6], [3,7], [3,8], [4,6], [4,8], [5,6], [5,7], [5,8]
    {
      const casilla = tablero.matriz[4][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][6], tablero.matriz[3][7], tablero.matriz[3][8], tablero.matriz[4][6], tablero.matriz[4][8], tablero.matriz[5][6], tablero.matriz[5][7], tablero.matriz[5][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 4, columnaCentral: 7, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [4,8] — interior, 8 vecinos: [3,7], [3,8], [3,9], [4,7], [4,9], [5,7], [5,8], [5,9]
    {
      const casilla = tablero.matriz[4][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][7], tablero.matriz[3][8], tablero.matriz[3][9], tablero.matriz[4][7], tablero.matriz[4][9], tablero.matriz[5][7], tablero.matriz[5][8], tablero.matriz[5][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 4, columnaCentral: 8, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [4,9] — borde, 5 vecinos: [3,8], [3,9], [4,8], [5,8], [5,9]
    {
      const casilla = tablero.matriz[4][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][8], tablero.matriz[3][9], tablero.matriz[4][8], tablero.matriz[5][8], tablero.matriz[5][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 4, columnaCentral: 9, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [5,0] — borde, 5 vecinos: [4,0], [4,1], [5,1], [6,0], [6,1]
    {
      const casilla = tablero.matriz[5][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][0], tablero.matriz[4][1], tablero.matriz[5][1], tablero.matriz[6][0], tablero.matriz[6][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 5, columnaCentral: 0, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [5,1] — interior, 8 vecinos: [4,0], [4,1], [4,2], [5,0], [5,2], [6,0], [6,1], [6,2]
    {
      const casilla = tablero.matriz[5][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][0], tablero.matriz[4][1], tablero.matriz[4][2], tablero.matriz[5][0], tablero.matriz[5][2], tablero.matriz[6][0], tablero.matriz[6][1], tablero.matriz[6][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 5, columnaCentral: 1, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [5,2] — interior, 8 vecinos: [4,1], [4,2], [4,3], [5,1], [5,3], [6,1], [6,2], [6,3]
    {
      const casilla = tablero.matriz[5][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][1], tablero.matriz[4][2], tablero.matriz[4][3], tablero.matriz[5][1], tablero.matriz[5][3], tablero.matriz[6][1], tablero.matriz[6][2], tablero.matriz[6][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 5, columnaCentral: 2, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [5,3] — interior, 8 vecinos: [4,2], [4,3], [4,4], [5,2], [5,4], [6,2], [6,3], [6,4]
    {
      const casilla = tablero.matriz[5][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][2], tablero.matriz[4][3], tablero.matriz[4][4], tablero.matriz[5][2], tablero.matriz[5][4], tablero.matriz[6][2], tablero.matriz[6][3], tablero.matriz[6][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 5, columnaCentral: 3, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [5,4] — interior, 8 vecinos: [4,3], [4,4], [4,5], [5,3], [5,5], [6,3], [6,4], [6,5]
    {
      const casilla = tablero.matriz[5][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][3], tablero.matriz[4][4], tablero.matriz[4][5], tablero.matriz[5][3], tablero.matriz[5][5], tablero.matriz[6][3], tablero.matriz[6][4], tablero.matriz[6][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 5, columnaCentral: 4, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [5,5] — interior, 8 vecinos: [4,4], [4,5], [4,6], [5,4], [5,6], [6,4], [6,5], [6,6]
    {
      const casilla = tablero.matriz[5][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][4], tablero.matriz[4][5], tablero.matriz[4][6], tablero.matriz[5][4], tablero.matriz[5][6], tablero.matriz[6][4], tablero.matriz[6][5], tablero.matriz[6][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 5, columnaCentral: 5, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [5,6] — interior, 8 vecinos: [4,5], [4,6], [4,7], [5,5], [5,7], [6,5], [6,6], [6,7]
    {
      const casilla = tablero.matriz[5][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][5], tablero.matriz[4][6], tablero.matriz[4][7], tablero.matriz[5][5], tablero.matriz[5][7], tablero.matriz[6][5], tablero.matriz[6][6], tablero.matriz[6][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 5, columnaCentral: 6, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [5,7] — interior, 8 vecinos: [4,6], [4,7], [4,8], [5,6], [5,8], [6,6], [6,7], [6,8]
    {
      const casilla = tablero.matriz[5][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][6], tablero.matriz[4][7], tablero.matriz[4][8], tablero.matriz[5][6], tablero.matriz[5][8], tablero.matriz[6][6], tablero.matriz[6][7], tablero.matriz[6][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 5, columnaCentral: 7, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [5,8] — interior, 8 vecinos: [4,7], [4,8], [4,9], [5,7], [5,9], [6,7], [6,8], [6,9]
    {
      const casilla = tablero.matriz[5][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][7], tablero.matriz[4][8], tablero.matriz[4][9], tablero.matriz[5][7], tablero.matriz[5][9], tablero.matriz[6][7], tablero.matriz[6][8], tablero.matriz[6][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 5, columnaCentral: 8, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [5,9] — borde, 5 vecinos: [4,8], [4,9], [5,8], [6,8], [6,9]
    {
      const casilla = tablero.matriz[5][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][8], tablero.matriz[4][9], tablero.matriz[5][8], tablero.matriz[6][8], tablero.matriz[6][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 5, columnaCentral: 9, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [6,0] — borde, 5 vecinos: [5,0], [5,1], [6,1], [7,0], [7,1]
    {
      const casilla = tablero.matriz[6][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][0], tablero.matriz[5][1], tablero.matriz[6][1], tablero.matriz[7][0], tablero.matriz[7][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 6, columnaCentral: 0, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [6,1] — interior, 8 vecinos: [5,0], [5,1], [5,2], [6,0], [6,2], [7,0], [7,1], [7,2]
    {
      const casilla = tablero.matriz[6][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][0], tablero.matriz[5][1], tablero.matriz[5][2], tablero.matriz[6][0], tablero.matriz[6][2], tablero.matriz[7][0], tablero.matriz[7][1], tablero.matriz[7][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 6, columnaCentral: 1, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [6,2] — interior, 8 vecinos: [5,1], [5,2], [5,3], [6,1], [6,3], [7,1], [7,2], [7,3]
    {
      const casilla = tablero.matriz[6][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][1], tablero.matriz[5][2], tablero.matriz[5][3], tablero.matriz[6][1], tablero.matriz[6][3], tablero.matriz[7][1], tablero.matriz[7][2], tablero.matriz[7][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 6, columnaCentral: 2, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [6,3] — interior, 8 vecinos: [5,2], [5,3], [5,4], [6,2], [6,4], [7,2], [7,3], [7,4]
    {
      const casilla = tablero.matriz[6][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][2], tablero.matriz[5][3], tablero.matriz[5][4], tablero.matriz[6][2], tablero.matriz[6][4], tablero.matriz[7][2], tablero.matriz[7][3], tablero.matriz[7][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 6, columnaCentral: 3, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [6,4] — interior, 8 vecinos: [5,3], [5,4], [5,5], [6,3], [6,5], [7,3], [7,4], [7,5]
    {
      const casilla = tablero.matriz[6][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][3], tablero.matriz[5][4], tablero.matriz[5][5], tablero.matriz[6][3], tablero.matriz[6][5], tablero.matriz[7][3], tablero.matriz[7][4], tablero.matriz[7][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 6, columnaCentral: 4, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [6,5] — interior, 8 vecinos: [5,4], [5,5], [5,6], [6,4], [6,6], [7,4], [7,5], [7,6]
    {
      const casilla = tablero.matriz[6][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][4], tablero.matriz[5][5], tablero.matriz[5][6], tablero.matriz[6][4], tablero.matriz[6][6], tablero.matriz[7][4], tablero.matriz[7][5], tablero.matriz[7][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 6, columnaCentral: 5, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [6,6] — interior, 8 vecinos: [5,5], [5,6], [5,7], [6,5], [6,7], [7,5], [7,6], [7,7]
    {
      const casilla = tablero.matriz[6][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][5], tablero.matriz[5][6], tablero.matriz[5][7], tablero.matriz[6][5], tablero.matriz[6][7], tablero.matriz[7][5], tablero.matriz[7][6], tablero.matriz[7][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 6, columnaCentral: 6, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [6,7] — interior, 8 vecinos: [5,6], [5,7], [5,8], [6,6], [6,8], [7,6], [7,7], [7,8]
    {
      const casilla = tablero.matriz[6][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][6], tablero.matriz[5][7], tablero.matriz[5][8], tablero.matriz[6][6], tablero.matriz[6][8], tablero.matriz[7][6], tablero.matriz[7][7], tablero.matriz[7][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 6, columnaCentral: 7, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [6,8] — interior, 8 vecinos: [5,7], [5,8], [5,9], [6,7], [6,9], [7,7], [7,8], [7,9]
    {
      const casilla = tablero.matriz[6][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][7], tablero.matriz[5][8], tablero.matriz[5][9], tablero.matriz[6][7], tablero.matriz[6][9], tablero.matriz[7][7], tablero.matriz[7][8], tablero.matriz[7][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 6, columnaCentral: 8, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [6,9] — borde, 5 vecinos: [5,8], [5,9], [6,8], [7,8], [7,9]
    {
      const casilla = tablero.matriz[6][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][8], tablero.matriz[5][9], tablero.matriz[6][8], tablero.matriz[7][8], tablero.matriz[7][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 6, columnaCentral: 9, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [7,0] — borde, 5 vecinos: [6,0], [6,1], [7,1], [8,0], [8,1]
    {
      const casilla = tablero.matriz[7][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][0], tablero.matriz[6][1], tablero.matriz[7][1], tablero.matriz[8][0], tablero.matriz[8][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 7, columnaCentral: 0, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [7,1] — interior, 8 vecinos: [6,0], [6,1], [6,2], [7,0], [7,2], [8,0], [8,1], [8,2]
    {
      const casilla = tablero.matriz[7][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][0], tablero.matriz[6][1], tablero.matriz[6][2], tablero.matriz[7][0], tablero.matriz[7][2], tablero.matriz[8][0], tablero.matriz[8][1], tablero.matriz[8][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 7, columnaCentral: 1, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [7,2] — interior, 8 vecinos: [6,1], [6,2], [6,3], [7,1], [7,3], [8,1], [8,2], [8,3]
    {
      const casilla = tablero.matriz[7][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][1], tablero.matriz[6][2], tablero.matriz[6][3], tablero.matriz[7][1], tablero.matriz[7][3], tablero.matriz[8][1], tablero.matriz[8][2], tablero.matriz[8][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 7, columnaCentral: 2, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [7,3] — interior, 8 vecinos: [6,2], [6,3], [6,4], [7,2], [7,4], [8,2], [8,3], [8,4]
    {
      const casilla = tablero.matriz[7][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][2], tablero.matriz[6][3], tablero.matriz[6][4], tablero.matriz[7][2], tablero.matriz[7][4], tablero.matriz[8][2], tablero.matriz[8][3], tablero.matriz[8][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 7, columnaCentral: 3, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [7,4] — interior, 8 vecinos: [6,3], [6,4], [6,5], [7,3], [7,5], [8,3], [8,4], [8,5]
    {
      const casilla = tablero.matriz[7][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][3], tablero.matriz[6][4], tablero.matriz[6][5], tablero.matriz[7][3], tablero.matriz[7][5], tablero.matriz[8][3], tablero.matriz[8][4], tablero.matriz[8][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 7, columnaCentral: 4, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [7,5] — interior, 8 vecinos: [6,4], [6,5], [6,6], [7,4], [7,6], [8,4], [8,5], [8,6]
    {
      const casilla = tablero.matriz[7][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][4], tablero.matriz[6][5], tablero.matriz[6][6], tablero.matriz[7][4], tablero.matriz[7][6], tablero.matriz[8][4], tablero.matriz[8][5], tablero.matriz[8][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 7, columnaCentral: 5, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [7,6] — interior, 8 vecinos: [6,5], [6,6], [6,7], [7,5], [7,7], [8,5], [8,6], [8,7]
    {
      const casilla = tablero.matriz[7][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][5], tablero.matriz[6][6], tablero.matriz[6][7], tablero.matriz[7][5], tablero.matriz[7][7], tablero.matriz[8][5], tablero.matriz[8][6], tablero.matriz[8][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 7, columnaCentral: 6, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [7,7] — interior, 8 vecinos: [6,6], [6,7], [6,8], [7,6], [7,8], [8,6], [8,7], [8,8]
    {
      const casilla = tablero.matriz[7][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][6], tablero.matriz[6][7], tablero.matriz[6][8], tablero.matriz[7][6], tablero.matriz[7][8], tablero.matriz[8][6], tablero.matriz[8][7], tablero.matriz[8][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 7, columnaCentral: 7, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [7,8] — interior, 8 vecinos: [6,7], [6,8], [6,9], [7,7], [7,9], [8,7], [8,8], [8,9]
    {
      const casilla = tablero.matriz[7][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][7], tablero.matriz[6][8], tablero.matriz[6][9], tablero.matriz[7][7], tablero.matriz[7][9], tablero.matriz[8][7], tablero.matriz[8][8], tablero.matriz[8][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 7, columnaCentral: 8, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [7,9] — borde, 5 vecinos: [6,8], [6,9], [7,8], [8,8], [8,9]
    {
      const casilla = tablero.matriz[7][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][8], tablero.matriz[6][9], tablero.matriz[7][8], tablero.matriz[8][8], tablero.matriz[8][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 7, columnaCentral: 9, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [8,0] — borde, 5 vecinos: [7,0], [7,1], [8,1], [9,0], [9,1]
    {
      const casilla = tablero.matriz[8][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][0], tablero.matriz[7][1], tablero.matriz[8][1], tablero.matriz[9][0], tablero.matriz[9][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 8, columnaCentral: 0, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [8,1] — interior, 8 vecinos: [7,0], [7,1], [7,2], [8,0], [8,2], [9,0], [9,1], [9,2]
    {
      const casilla = tablero.matriz[8][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][0], tablero.matriz[7][1], tablero.matriz[7][2], tablero.matriz[8][0], tablero.matriz[8][2], tablero.matriz[9][0], tablero.matriz[9][1], tablero.matriz[9][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 8, columnaCentral: 1, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [8,2] — interior, 8 vecinos: [7,1], [7,2], [7,3], [8,1], [8,3], [9,1], [9,2], [9,3]
    {
      const casilla = tablero.matriz[8][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][1], tablero.matriz[7][2], tablero.matriz[7][3], tablero.matriz[8][1], tablero.matriz[8][3], tablero.matriz[9][1], tablero.matriz[9][2], tablero.matriz[9][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 8, columnaCentral: 2, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [8,3] — interior, 8 vecinos: [7,2], [7,3], [7,4], [8,2], [8,4], [9,2], [9,3], [9,4]
    {
      const casilla = tablero.matriz[8][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][2], tablero.matriz[7][3], tablero.matriz[7][4], tablero.matriz[8][2], tablero.matriz[8][4], tablero.matriz[9][2], tablero.matriz[9][3], tablero.matriz[9][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 8, columnaCentral: 3, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [8,4] — interior, 8 vecinos: [7,3], [7,4], [7,5], [8,3], [8,5], [9,3], [9,4], [9,5]
    {
      const casilla = tablero.matriz[8][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][3], tablero.matriz[7][4], tablero.matriz[7][5], tablero.matriz[8][3], tablero.matriz[8][5], tablero.matriz[9][3], tablero.matriz[9][4], tablero.matriz[9][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 8, columnaCentral: 4, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [8,5] — interior, 8 vecinos: [7,4], [7,5], [7,6], [8,4], [8,6], [9,4], [9,5], [9,6]
    {
      const casilla = tablero.matriz[8][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][4], tablero.matriz[7][5], tablero.matriz[7][6], tablero.matriz[8][4], tablero.matriz[8][6], tablero.matriz[9][4], tablero.matriz[9][5], tablero.matriz[9][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 8, columnaCentral: 5, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [8,6] — interior, 8 vecinos: [7,5], [7,6], [7,7], [8,5], [8,7], [9,5], [9,6], [9,7]
    {
      const casilla = tablero.matriz[8][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][5], tablero.matriz[7][6], tablero.matriz[7][7], tablero.matriz[8][5], tablero.matriz[8][7], tablero.matriz[9][5], tablero.matriz[9][6], tablero.matriz[9][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 8, columnaCentral: 6, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [8,7] — interior, 8 vecinos: [7,6], [7,7], [7,8], [8,6], [8,8], [9,6], [9,7], [9,8]
    {
      const casilla = tablero.matriz[8][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][6], tablero.matriz[7][7], tablero.matriz[7][8], tablero.matriz[8][6], tablero.matriz[8][8], tablero.matriz[9][6], tablero.matriz[9][7], tablero.matriz[9][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 8, columnaCentral: 7, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [8,8] — interior, 8 vecinos: [7,7], [7,8], [7,9], [8,7], [8,9], [9,7], [9,8], [9,9]
    {
      const casilla = tablero.matriz[8][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][7], tablero.matriz[7][8], tablero.matriz[7][9], tablero.matriz[8][7], tablero.matriz[8][9], tablero.matriz[9][7], tablero.matriz[9][8], tablero.matriz[9][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 8, columnaCentral: 8, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [8,9] — borde, 5 vecinos: [7,8], [7,9], [8,8], [9,8], [9,9]
    {
      const casilla = tablero.matriz[8][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][8], tablero.matriz[7][9], tablero.matriz[8][8], tablero.matriz[9][8], tablero.matriz[9][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 8, columnaCentral: 9, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [9,0] — esquina, 3 vecinos: [8,0], [8,1], [9,1]
    {
      const casilla = tablero.matriz[9][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][0], tablero.matriz[8][1], tablero.matriz[9][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 9, columnaCentral: 0, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [9,1] — borde, 5 vecinos: [8,0], [8,1], [8,2], [9,0], [9,2]
    {
      const casilla = tablero.matriz[9][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][0], tablero.matriz[8][1], tablero.matriz[8][2], tablero.matriz[9][0], tablero.matriz[9][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 9, columnaCentral: 1, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [9,2] — borde, 5 vecinos: [8,1], [8,2], [8,3], [9,1], [9,3]
    {
      const casilla = tablero.matriz[9][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][1], tablero.matriz[8][2], tablero.matriz[8][3], tablero.matriz[9][1], tablero.matriz[9][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 9, columnaCentral: 2, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [9,3] — borde, 5 vecinos: [8,2], [8,3], [8,4], [9,2], [9,4]
    {
      const casilla = tablero.matriz[9][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][2], tablero.matriz[8][3], tablero.matriz[8][4], tablero.matriz[9][2], tablero.matriz[9][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 9, columnaCentral: 3, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [9,4] — borde, 5 vecinos: [8,3], [8,4], [8,5], [9,3], [9,5]
    {
      const casilla = tablero.matriz[9][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][3], tablero.matriz[8][4], tablero.matriz[8][5], tablero.matriz[9][3], tablero.matriz[9][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 9, columnaCentral: 4, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [9,5] — borde, 5 vecinos: [8,4], [8,5], [8,6], [9,4], [9,6]
    {
      const casilla = tablero.matriz[9][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][4], tablero.matriz[8][5], tablero.matriz[8][6], tablero.matriz[9][4], tablero.matriz[9][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 9, columnaCentral: 5, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [9,6] — borde, 5 vecinos: [8,5], [8,6], [8,7], [9,5], [9,7]
    {
      const casilla = tablero.matriz[9][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][5], tablero.matriz[8][6], tablero.matriz[8][7], tablero.matriz[9][5], tablero.matriz[9][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 9, columnaCentral: 6, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [9,7] — borde, 5 vecinos: [8,6], [8,7], [8,8], [9,6], [9,8]
    {
      const casilla = tablero.matriz[9][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][6], tablero.matriz[8][7], tablero.matriz[8][8], tablero.matriz[9][6], tablero.matriz[9][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 9, columnaCentral: 7, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [9,8] — borde, 5 vecinos: [8,7], [8,8], [8,9], [9,7], [9,9]
    {
      const casilla = tablero.matriz[9][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][7], tablero.matriz[8][8], tablero.matriz[8][9], tablero.matriz[9][7], tablero.matriz[9][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 9, columnaCentral: 8, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    // ── Casilla [9,9] — esquina, 3 vecinos: [8,8], [8,9], [9,8]
    {
      const casilla = tablero.matriz[9][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][8], tablero.matriz[8][9], tablero.matriz[9][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (cerrados.length > 0 && faltantes >= 0) {
          grupos.push({ filaCentral: 9, columnaCentral: 9, casillasCerradas: cerrados, minasFaltantes: faltantes });
        }
      }
    }

    return grupos;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CAPA 3 — ESTADÍSTICA (explícita por cada casilla del tablero 10x10)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Calcula el riesgo de cada casilla cerrada según sus vecinos abiertos.
   * riesgo = (minasFaltantes / vecinosCerrados) × 100
   * Cada vecino hereda el riesgo más alto que le asigne cualquiera de sus pistas.
   * Escrito explícitamente para cada una de las 100 posiciones del tablero 10x10.
   */
  private calcularRiesgosPorCasillasAbiertas(tablero: Tablero): void {

    // ── Casilla [0,0] — esquina, 3 vecinos: [0,1], [1,0], [1,1]
    {
      const casilla = tablero.matriz[0][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][1], tablero.matriz[1][0], tablero.matriz[1][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [0,1] — borde, 5 vecinos: [0,0], [0,2], [1,0], [1,1], [1,2]
    {
      const casilla = tablero.matriz[0][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][0], tablero.matriz[0][2], tablero.matriz[1][0], tablero.matriz[1][1], tablero.matriz[1][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [0,2] — borde, 5 vecinos: [0,1], [0,3], [1,1], [1,2], [1,3]
    {
      const casilla = tablero.matriz[0][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][1], tablero.matriz[0][3], tablero.matriz[1][1], tablero.matriz[1][2], tablero.matriz[1][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [0,3] — borde, 5 vecinos: [0,2], [0,4], [1,2], [1,3], [1,4]
    {
      const casilla = tablero.matriz[0][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][2], tablero.matriz[0][4], tablero.matriz[1][2], tablero.matriz[1][3], tablero.matriz[1][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [0,4] — borde, 5 vecinos: [0,3], [0,5], [1,3], [1,4], [1,5]
    {
      const casilla = tablero.matriz[0][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][3], tablero.matriz[0][5], tablero.matriz[1][3], tablero.matriz[1][4], tablero.matriz[1][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [0,5] — borde, 5 vecinos: [0,4], [0,6], [1,4], [1,5], [1,6]
    {
      const casilla = tablero.matriz[0][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][4], tablero.matriz[0][6], tablero.matriz[1][4], tablero.matriz[1][5], tablero.matriz[1][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [0,6] — borde, 5 vecinos: [0,5], [0,7], [1,5], [1,6], [1,7]
    {
      const casilla = tablero.matriz[0][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][5], tablero.matriz[0][7], tablero.matriz[1][5], tablero.matriz[1][6], tablero.matriz[1][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [0,7] — borde, 5 vecinos: [0,6], [0,8], [1,6], [1,7], [1,8]
    {
      const casilla = tablero.matriz[0][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][6], tablero.matriz[0][8], tablero.matriz[1][6], tablero.matriz[1][7], tablero.matriz[1][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [0,8] — borde, 5 vecinos: [0,7], [0,9], [1,7], [1,8], [1,9]
    {
      const casilla = tablero.matriz[0][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][7], tablero.matriz[0][9], tablero.matriz[1][7], tablero.matriz[1][8], tablero.matriz[1][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [0,9] — esquina, 3 vecinos: [0,8], [1,8], [1,9]
    {
      const casilla = tablero.matriz[0][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][8], tablero.matriz[1][8], tablero.matriz[1][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [1,0] — borde, 5 vecinos: [0,0], [0,1], [1,1], [2,0], [2,1]
    {
      const casilla = tablero.matriz[1][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][0], tablero.matriz[0][1], tablero.matriz[1][1], tablero.matriz[2][0], tablero.matriz[2][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [1,1] — interior, 8 vecinos: [0,0], [0,1], [0,2], [1,0], [1,2], [2,0], [2,1], [2,2]
    {
      const casilla = tablero.matriz[1][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][0], tablero.matriz[0][1], tablero.matriz[0][2], tablero.matriz[1][0], tablero.matriz[1][2], tablero.matriz[2][0], tablero.matriz[2][1], tablero.matriz[2][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [1,2] — interior, 8 vecinos: [0,1], [0,2], [0,3], [1,1], [1,3], [2,1], [2,2], [2,3]
    {
      const casilla = tablero.matriz[1][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][1], tablero.matriz[0][2], tablero.matriz[0][3], tablero.matriz[1][1], tablero.matriz[1][3], tablero.matriz[2][1], tablero.matriz[2][2], tablero.matriz[2][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [1,3] — interior, 8 vecinos: [0,2], [0,3], [0,4], [1,2], [1,4], [2,2], [2,3], [2,4]
    {
      const casilla = tablero.matriz[1][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][2], tablero.matriz[0][3], tablero.matriz[0][4], tablero.matriz[1][2], tablero.matriz[1][4], tablero.matriz[2][2], tablero.matriz[2][3], tablero.matriz[2][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [1,4] — interior, 8 vecinos: [0,3], [0,4], [0,5], [1,3], [1,5], [2,3], [2,4], [2,5]
    {
      const casilla = tablero.matriz[1][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][3], tablero.matriz[0][4], tablero.matriz[0][5], tablero.matriz[1][3], tablero.matriz[1][5], tablero.matriz[2][3], tablero.matriz[2][4], tablero.matriz[2][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [1,5] — interior, 8 vecinos: [0,4], [0,5], [0,6], [1,4], [1,6], [2,4], [2,5], [2,6]
    {
      const casilla = tablero.matriz[1][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][4], tablero.matriz[0][5], tablero.matriz[0][6], tablero.matriz[1][4], tablero.matriz[1][6], tablero.matriz[2][4], tablero.matriz[2][5], tablero.matriz[2][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [1,6] — interior, 8 vecinos: [0,5], [0,6], [0,7], [1,5], [1,7], [2,5], [2,6], [2,7]
    {
      const casilla = tablero.matriz[1][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][5], tablero.matriz[0][6], tablero.matriz[0][7], tablero.matriz[1][5], tablero.matriz[1][7], tablero.matriz[2][5], tablero.matriz[2][6], tablero.matriz[2][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [1,7] — interior, 8 vecinos: [0,6], [0,7], [0,8], [1,6], [1,8], [2,6], [2,7], [2,8]
    {
      const casilla = tablero.matriz[1][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][6], tablero.matriz[0][7], tablero.matriz[0][8], tablero.matriz[1][6], tablero.matriz[1][8], tablero.matriz[2][6], tablero.matriz[2][7], tablero.matriz[2][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [1,8] — interior, 8 vecinos: [0,7], [0,8], [0,9], [1,7], [1,9], [2,7], [2,8], [2,9]
    {
      const casilla = tablero.matriz[1][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][7], tablero.matriz[0][8], tablero.matriz[0][9], tablero.matriz[1][7], tablero.matriz[1][9], tablero.matriz[2][7], tablero.matriz[2][8], tablero.matriz[2][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [1,9] — borde, 5 vecinos: [0,8], [0,9], [1,8], [2,8], [2,9]
    {
      const casilla = tablero.matriz[1][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[0][8], tablero.matriz[0][9], tablero.matriz[1][8], tablero.matriz[2][8], tablero.matriz[2][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [2,0] — borde, 5 vecinos: [1,0], [1,1], [2,1], [3,0], [3,1]
    {
      const casilla = tablero.matriz[2][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][0], tablero.matriz[1][1], tablero.matriz[2][1], tablero.matriz[3][0], tablero.matriz[3][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [2,1] — interior, 8 vecinos: [1,0], [1,1], [1,2], [2,0], [2,2], [3,0], [3,1], [3,2]
    {
      const casilla = tablero.matriz[2][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][0], tablero.matriz[1][1], tablero.matriz[1][2], tablero.matriz[2][0], tablero.matriz[2][2], tablero.matriz[3][0], tablero.matriz[3][1], tablero.matriz[3][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [2,2] — interior, 8 vecinos: [1,1], [1,2], [1,3], [2,1], [2,3], [3,1], [3,2], [3,3]
    {
      const casilla = tablero.matriz[2][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][1], tablero.matriz[1][2], tablero.matriz[1][3], tablero.matriz[2][1], tablero.matriz[2][3], tablero.matriz[3][1], tablero.matriz[3][2], tablero.matriz[3][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [2,3] — interior, 8 vecinos: [1,2], [1,3], [1,4], [2,2], [2,4], [3,2], [3,3], [3,4]
    {
      const casilla = tablero.matriz[2][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][2], tablero.matriz[1][3], tablero.matriz[1][4], tablero.matriz[2][2], tablero.matriz[2][4], tablero.matriz[3][2], tablero.matriz[3][3], tablero.matriz[3][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [2,4] — interior, 8 vecinos: [1,3], [1,4], [1,5], [2,3], [2,5], [3,3], [3,4], [3,5]
    {
      const casilla = tablero.matriz[2][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][3], tablero.matriz[1][4], tablero.matriz[1][5], tablero.matriz[2][3], tablero.matriz[2][5], tablero.matriz[3][3], tablero.matriz[3][4], tablero.matriz[3][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [2,5] — interior, 8 vecinos: [1,4], [1,5], [1,6], [2,4], [2,6], [3,4], [3,5], [3,6]
    {
      const casilla = tablero.matriz[2][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][4], tablero.matriz[1][5], tablero.matriz[1][6], tablero.matriz[2][4], tablero.matriz[2][6], tablero.matriz[3][4], tablero.matriz[3][5], tablero.matriz[3][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [2,6] — interior, 8 vecinos: [1,5], [1,6], [1,7], [2,5], [2,7], [3,5], [3,6], [3,7]
    {
      const casilla = tablero.matriz[2][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][5], tablero.matriz[1][6], tablero.matriz[1][7], tablero.matriz[2][5], tablero.matriz[2][7], tablero.matriz[3][5], tablero.matriz[3][6], tablero.matriz[3][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [2,7] — interior, 8 vecinos: [1,6], [1,7], [1,8], [2,6], [2,8], [3,6], [3,7], [3,8]
    {
      const casilla = tablero.matriz[2][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][6], tablero.matriz[1][7], tablero.matriz[1][8], tablero.matriz[2][6], tablero.matriz[2][8], tablero.matriz[3][6], tablero.matriz[3][7], tablero.matriz[3][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [2,8] — interior, 8 vecinos: [1,7], [1,8], [1,9], [2,7], [2,9], [3,7], [3,8], [3,9]
    {
      const casilla = tablero.matriz[2][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][7], tablero.matriz[1][8], tablero.matriz[1][9], tablero.matriz[2][7], tablero.matriz[2][9], tablero.matriz[3][7], tablero.matriz[3][8], tablero.matriz[3][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [2,9] — borde, 5 vecinos: [1,8], [1,9], [2,8], [3,8], [3,9]
    {
      const casilla = tablero.matriz[2][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[1][8], tablero.matriz[1][9], tablero.matriz[2][8], tablero.matriz[3][8], tablero.matriz[3][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [3,0] — borde, 5 vecinos: [2,0], [2,1], [3,1], [4,0], [4,1]
    {
      const casilla = tablero.matriz[3][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][0], tablero.matriz[2][1], tablero.matriz[3][1], tablero.matriz[4][0], tablero.matriz[4][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [3,1] — interior, 8 vecinos: [2,0], [2,1], [2,2], [3,0], [3,2], [4,0], [4,1], [4,2]
    {
      const casilla = tablero.matriz[3][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][0], tablero.matriz[2][1], tablero.matriz[2][2], tablero.matriz[3][0], tablero.matriz[3][2], tablero.matriz[4][0], tablero.matriz[4][1], tablero.matriz[4][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [3,2] — interior, 8 vecinos: [2,1], [2,2], [2,3], [3,1], [3,3], [4,1], [4,2], [4,3]
    {
      const casilla = tablero.matriz[3][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][1], tablero.matriz[2][2], tablero.matriz[2][3], tablero.matriz[3][1], tablero.matriz[3][3], tablero.matriz[4][1], tablero.matriz[4][2], tablero.matriz[4][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [3,3] — interior, 8 vecinos: [2,2], [2,3], [2,4], [3,2], [3,4], [4,2], [4,3], [4,4]
    {
      const casilla = tablero.matriz[3][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][2], tablero.matriz[2][3], tablero.matriz[2][4], tablero.matriz[3][2], tablero.matriz[3][4], tablero.matriz[4][2], tablero.matriz[4][3], tablero.matriz[4][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [3,4] — interior, 8 vecinos: [2,3], [2,4], [2,5], [3,3], [3,5], [4,3], [4,4], [4,5]
    {
      const casilla = tablero.matriz[3][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][3], tablero.matriz[2][4], tablero.matriz[2][5], tablero.matriz[3][3], tablero.matriz[3][5], tablero.matriz[4][3], tablero.matriz[4][4], tablero.matriz[4][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [3,5] — interior, 8 vecinos: [2,4], [2,5], [2,6], [3,4], [3,6], [4,4], [4,5], [4,6]
    {
      const casilla = tablero.matriz[3][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][4], tablero.matriz[2][5], tablero.matriz[2][6], tablero.matriz[3][4], tablero.matriz[3][6], tablero.matriz[4][4], tablero.matriz[4][5], tablero.matriz[4][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [3,6] — interior, 8 vecinos: [2,5], [2,6], [2,7], [3,5], [3,7], [4,5], [4,6], [4,7]
    {
      const casilla = tablero.matriz[3][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][5], tablero.matriz[2][6], tablero.matriz[2][7], tablero.matriz[3][5], tablero.matriz[3][7], tablero.matriz[4][5], tablero.matriz[4][6], tablero.matriz[4][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [3,7] — interior, 8 vecinos: [2,6], [2,7], [2,8], [3,6], [3,8], [4,6], [4,7], [4,8]
    {
      const casilla = tablero.matriz[3][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][6], tablero.matriz[2][7], tablero.matriz[2][8], tablero.matriz[3][6], tablero.matriz[3][8], tablero.matriz[4][6], tablero.matriz[4][7], tablero.matriz[4][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [3,8] — interior, 8 vecinos: [2,7], [2,8], [2,9], [3,7], [3,9], [4,7], [4,8], [4,9]
    {
      const casilla = tablero.matriz[3][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][7], tablero.matriz[2][8], tablero.matriz[2][9], tablero.matriz[3][7], tablero.matriz[3][9], tablero.matriz[4][7], tablero.matriz[4][8], tablero.matriz[4][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [3,9] — borde, 5 vecinos: [2,8], [2,9], [3,8], [4,8], [4,9]
    {
      const casilla = tablero.matriz[3][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[2][8], tablero.matriz[2][9], tablero.matriz[3][8], tablero.matriz[4][8], tablero.matriz[4][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [4,0] — borde, 5 vecinos: [3,0], [3,1], [4,1], [5,0], [5,1]
    {
      const casilla = tablero.matriz[4][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][0], tablero.matriz[3][1], tablero.matriz[4][1], tablero.matriz[5][0], tablero.matriz[5][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [4,1] — interior, 8 vecinos: [3,0], [3,1], [3,2], [4,0], [4,2], [5,0], [5,1], [5,2]
    {
      const casilla = tablero.matriz[4][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][0], tablero.matriz[3][1], tablero.matriz[3][2], tablero.matriz[4][0], tablero.matriz[4][2], tablero.matriz[5][0], tablero.matriz[5][1], tablero.matriz[5][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [4,2] — interior, 8 vecinos: [3,1], [3,2], [3,3], [4,1], [4,3], [5,1], [5,2], [5,3]
    {
      const casilla = tablero.matriz[4][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][1], tablero.matriz[3][2], tablero.matriz[3][3], tablero.matriz[4][1], tablero.matriz[4][3], tablero.matriz[5][1], tablero.matriz[5][2], tablero.matriz[5][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [4,3] — interior, 8 vecinos: [3,2], [3,3], [3,4], [4,2], [4,4], [5,2], [5,3], [5,4]
    {
      const casilla = tablero.matriz[4][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][2], tablero.matriz[3][3], tablero.matriz[3][4], tablero.matriz[4][2], tablero.matriz[4][4], tablero.matriz[5][2], tablero.matriz[5][3], tablero.matriz[5][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [4,4] — interior, 8 vecinos: [3,3], [3,4], [3,5], [4,3], [4,5], [5,3], [5,4], [5,5]
    {
      const casilla = tablero.matriz[4][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][3], tablero.matriz[3][4], tablero.matriz[3][5], tablero.matriz[4][3], tablero.matriz[4][5], tablero.matriz[5][3], tablero.matriz[5][4], tablero.matriz[5][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [4,5] — interior, 8 vecinos: [3,4], [3,5], [3,6], [4,4], [4,6], [5,4], [5,5], [5,6]
    {
      const casilla = tablero.matriz[4][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][4], tablero.matriz[3][5], tablero.matriz[3][6], tablero.matriz[4][4], tablero.matriz[4][6], tablero.matriz[5][4], tablero.matriz[5][5], tablero.matriz[5][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [4,6] — interior, 8 vecinos: [3,5], [3,6], [3,7], [4,5], [4,7], [5,5], [5,6], [5,7]
    {
      const casilla = tablero.matriz[4][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][5], tablero.matriz[3][6], tablero.matriz[3][7], tablero.matriz[4][5], tablero.matriz[4][7], tablero.matriz[5][5], tablero.matriz[5][6], tablero.matriz[5][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [4,7] — interior, 8 vecinos: [3,6], [3,7], [3,8], [4,6], [4,8], [5,6], [5,7], [5,8]
    {
      const casilla = tablero.matriz[4][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][6], tablero.matriz[3][7], tablero.matriz[3][8], tablero.matriz[4][6], tablero.matriz[4][8], tablero.matriz[5][6], tablero.matriz[5][7], tablero.matriz[5][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [4,8] — interior, 8 vecinos: [3,7], [3,8], [3,9], [4,7], [4,9], [5,7], [5,8], [5,9]
    {
      const casilla = tablero.matriz[4][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][7], tablero.matriz[3][8], tablero.matriz[3][9], tablero.matriz[4][7], tablero.matriz[4][9], tablero.matriz[5][7], tablero.matriz[5][8], tablero.matriz[5][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [4,9] — borde, 5 vecinos: [3,8], [3,9], [4,8], [5,8], [5,9]
    {
      const casilla = tablero.matriz[4][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[3][8], tablero.matriz[3][9], tablero.matriz[4][8], tablero.matriz[5][8], tablero.matriz[5][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [5,0] — borde, 5 vecinos: [4,0], [4,1], [5,1], [6,0], [6,1]
    {
      const casilla = tablero.matriz[5][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][0], tablero.matriz[4][1], tablero.matriz[5][1], tablero.matriz[6][0], tablero.matriz[6][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [5,1] — interior, 8 vecinos: [4,0], [4,1], [4,2], [5,0], [5,2], [6,0], [6,1], [6,2]
    {
      const casilla = tablero.matriz[5][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][0], tablero.matriz[4][1], tablero.matriz[4][2], tablero.matriz[5][0], tablero.matriz[5][2], tablero.matriz[6][0], tablero.matriz[6][1], tablero.matriz[6][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [5,2] — interior, 8 vecinos: [4,1], [4,2], [4,3], [5,1], [5,3], [6,1], [6,2], [6,3]
    {
      const casilla = tablero.matriz[5][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][1], tablero.matriz[4][2], tablero.matriz[4][3], tablero.matriz[5][1], tablero.matriz[5][3], tablero.matriz[6][1], tablero.matriz[6][2], tablero.matriz[6][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [5,3] — interior, 8 vecinos: [4,2], [4,3], [4,4], [5,2], [5,4], [6,2], [6,3], [6,4]
    {
      const casilla = tablero.matriz[5][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][2], tablero.matriz[4][3], tablero.matriz[4][4], tablero.matriz[5][2], tablero.matriz[5][4], tablero.matriz[6][2], tablero.matriz[6][3], tablero.matriz[6][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [5,4] — interior, 8 vecinos: [4,3], [4,4], [4,5], [5,3], [5,5], [6,3], [6,4], [6,5]
    {
      const casilla = tablero.matriz[5][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][3], tablero.matriz[4][4], tablero.matriz[4][5], tablero.matriz[5][3], tablero.matriz[5][5], tablero.matriz[6][3], tablero.matriz[6][4], tablero.matriz[6][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [5,5] — interior, 8 vecinos: [4,4], [4,5], [4,6], [5,4], [5,6], [6,4], [6,5], [6,6]
    {
      const casilla = tablero.matriz[5][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][4], tablero.matriz[4][5], tablero.matriz[4][6], tablero.matriz[5][4], tablero.matriz[5][6], tablero.matriz[6][4], tablero.matriz[6][5], tablero.matriz[6][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [5,6] — interior, 8 vecinos: [4,5], [4,6], [4,7], [5,5], [5,7], [6,5], [6,6], [6,7]
    {
      const casilla = tablero.matriz[5][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][5], tablero.matriz[4][6], tablero.matriz[4][7], tablero.matriz[5][5], tablero.matriz[5][7], tablero.matriz[6][5], tablero.matriz[6][6], tablero.matriz[6][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [5,7] — interior, 8 vecinos: [4,6], [4,7], [4,8], [5,6], [5,8], [6,6], [6,7], [6,8]
    {
      const casilla = tablero.matriz[5][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][6], tablero.matriz[4][7], tablero.matriz[4][8], tablero.matriz[5][6], tablero.matriz[5][8], tablero.matriz[6][6], tablero.matriz[6][7], tablero.matriz[6][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [5,8] — interior, 8 vecinos: [4,7], [4,8], [4,9], [5,7], [5,9], [6,7], [6,8], [6,9]
    {
      const casilla = tablero.matriz[5][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][7], tablero.matriz[4][8], tablero.matriz[4][9], tablero.matriz[5][7], tablero.matriz[5][9], tablero.matriz[6][7], tablero.matriz[6][8], tablero.matriz[6][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [5,9] — borde, 5 vecinos: [4,8], [4,9], [5,8], [6,8], [6,9]
    {
      const casilla = tablero.matriz[5][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[4][8], tablero.matriz[4][9], tablero.matriz[5][8], tablero.matriz[6][8], tablero.matriz[6][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [6,0] — borde, 5 vecinos: [5,0], [5,1], [6,1], [7,0], [7,1]
    {
      const casilla = tablero.matriz[6][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][0], tablero.matriz[5][1], tablero.matriz[6][1], tablero.matriz[7][0], tablero.matriz[7][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [6,1] — interior, 8 vecinos: [5,0], [5,1], [5,2], [6,0], [6,2], [7,0], [7,1], [7,2]
    {
      const casilla = tablero.matriz[6][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][0], tablero.matriz[5][1], tablero.matriz[5][2], tablero.matriz[6][0], tablero.matriz[6][2], tablero.matriz[7][0], tablero.matriz[7][1], tablero.matriz[7][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [6,2] — interior, 8 vecinos: [5,1], [5,2], [5,3], [6,1], [6,3], [7,1], [7,2], [7,3]
    {
      const casilla = tablero.matriz[6][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][1], tablero.matriz[5][2], tablero.matriz[5][3], tablero.matriz[6][1], tablero.matriz[6][3], tablero.matriz[7][1], tablero.matriz[7][2], tablero.matriz[7][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [6,3] — interior, 8 vecinos: [5,2], [5,3], [5,4], [6,2], [6,4], [7,2], [7,3], [7,4]
    {
      const casilla = tablero.matriz[6][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][2], tablero.matriz[5][3], tablero.matriz[5][4], tablero.matriz[6][2], tablero.matriz[6][4], tablero.matriz[7][2], tablero.matriz[7][3], tablero.matriz[7][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [6,4] — interior, 8 vecinos: [5,3], [5,4], [5,5], [6,3], [6,5], [7,3], [7,4], [7,5]
    {
      const casilla = tablero.matriz[6][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][3], tablero.matriz[5][4], tablero.matriz[5][5], tablero.matriz[6][3], tablero.matriz[6][5], tablero.matriz[7][3], tablero.matriz[7][4], tablero.matriz[7][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [6,5] — interior, 8 vecinos: [5,4], [5,5], [5,6], [6,4], [6,6], [7,4], [7,5], [7,6]
    {
      const casilla = tablero.matriz[6][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][4], tablero.matriz[5][5], tablero.matriz[5][6], tablero.matriz[6][4], tablero.matriz[6][6], tablero.matriz[7][4], tablero.matriz[7][5], tablero.matriz[7][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [6,6] — interior, 8 vecinos: [5,5], [5,6], [5,7], [6,5], [6,7], [7,5], [7,6], [7,7]
    {
      const casilla = tablero.matriz[6][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][5], tablero.matriz[5][6], tablero.matriz[5][7], tablero.matriz[6][5], tablero.matriz[6][7], tablero.matriz[7][5], tablero.matriz[7][6], tablero.matriz[7][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [6,7] — interior, 8 vecinos: [5,6], [5,7], [5,8], [6,6], [6,8], [7,6], [7,7], [7,8]
    {
      const casilla = tablero.matriz[6][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][6], tablero.matriz[5][7], tablero.matriz[5][8], tablero.matriz[6][6], tablero.matriz[6][8], tablero.matriz[7][6], tablero.matriz[7][7], tablero.matriz[7][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [6,8] — interior, 8 vecinos: [5,7], [5,8], [5,9], [6,7], [6,9], [7,7], [7,8], [7,9]
    {
      const casilla = tablero.matriz[6][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][7], tablero.matriz[5][8], tablero.matriz[5][9], tablero.matriz[6][7], tablero.matriz[6][9], tablero.matriz[7][7], tablero.matriz[7][8], tablero.matriz[7][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [6,9] — borde, 5 vecinos: [5,8], [5,9], [6,8], [7,8], [7,9]
    {
      const casilla = tablero.matriz[6][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[5][8], tablero.matriz[5][9], tablero.matriz[6][8], tablero.matriz[7][8], tablero.matriz[7][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [7,0] — borde, 5 vecinos: [6,0], [6,1], [7,1], [8,0], [8,1]
    {
      const casilla = tablero.matriz[7][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][0], tablero.matriz[6][1], tablero.matriz[7][1], tablero.matriz[8][0], tablero.matriz[8][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [7,1] — interior, 8 vecinos: [6,0], [6,1], [6,2], [7,0], [7,2], [8,0], [8,1], [8,2]
    {
      const casilla = tablero.matriz[7][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][0], tablero.matriz[6][1], tablero.matriz[6][2], tablero.matriz[7][0], tablero.matriz[7][2], tablero.matriz[8][0], tablero.matriz[8][1], tablero.matriz[8][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [7,2] — interior, 8 vecinos: [6,1], [6,2], [6,3], [7,1], [7,3], [8,1], [8,2], [8,3]
    {
      const casilla = tablero.matriz[7][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][1], tablero.matriz[6][2], tablero.matriz[6][3], tablero.matriz[7][1], tablero.matriz[7][3], tablero.matriz[8][1], tablero.matriz[8][2], tablero.matriz[8][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [7,3] — interior, 8 vecinos: [6,2], [6,3], [6,4], [7,2], [7,4], [8,2], [8,3], [8,4]
    {
      const casilla = tablero.matriz[7][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][2], tablero.matriz[6][3], tablero.matriz[6][4], tablero.matriz[7][2], tablero.matriz[7][4], tablero.matriz[8][2], tablero.matriz[8][3], tablero.matriz[8][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [7,4] — interior, 8 vecinos: [6,3], [6,4], [6,5], [7,3], [7,5], [8,3], [8,4], [8,5]
    {
      const casilla = tablero.matriz[7][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][3], tablero.matriz[6][4], tablero.matriz[6][5], tablero.matriz[7][3], tablero.matriz[7][5], tablero.matriz[8][3], tablero.matriz[8][4], tablero.matriz[8][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [7,5] — interior, 8 vecinos: [6,4], [6,5], [6,6], [7,4], [7,6], [8,4], [8,5], [8,6]
    {
      const casilla = tablero.matriz[7][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][4], tablero.matriz[6][5], tablero.matriz[6][6], tablero.matriz[7][4], tablero.matriz[7][6], tablero.matriz[8][4], tablero.matriz[8][5], tablero.matriz[8][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [7,6] — interior, 8 vecinos: [6,5], [6,6], [6,7], [7,5], [7,7], [8,5], [8,6], [8,7]
    {
      const casilla = tablero.matriz[7][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][5], tablero.matriz[6][6], tablero.matriz[6][7], tablero.matriz[7][5], tablero.matriz[7][7], tablero.matriz[8][5], tablero.matriz[8][6], tablero.matriz[8][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [7,7] — interior, 8 vecinos: [6,6], [6,7], [6,8], [7,6], [7,8], [8,6], [8,7], [8,8]
    {
      const casilla = tablero.matriz[7][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][6], tablero.matriz[6][7], tablero.matriz[6][8], tablero.matriz[7][6], tablero.matriz[7][8], tablero.matriz[8][6], tablero.matriz[8][7], tablero.matriz[8][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [7,8] — interior, 8 vecinos: [6,7], [6,8], [6,9], [7,7], [7,9], [8,7], [8,8], [8,9]
    {
      const casilla = tablero.matriz[7][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][7], tablero.matriz[6][8], tablero.matriz[6][9], tablero.matriz[7][7], tablero.matriz[7][9], tablero.matriz[8][7], tablero.matriz[8][8], tablero.matriz[8][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [7,9] — borde, 5 vecinos: [6,8], [6,9], [7,8], [8,8], [8,9]
    {
      const casilla = tablero.matriz[7][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[6][8], tablero.matriz[6][9], tablero.matriz[7][8], tablero.matriz[8][8], tablero.matriz[8][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [8,0] — borde, 5 vecinos: [7,0], [7,1], [8,1], [9,0], [9,1]
    {
      const casilla = tablero.matriz[8][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][0], tablero.matriz[7][1], tablero.matriz[8][1], tablero.matriz[9][0], tablero.matriz[9][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [8,1] — interior, 8 vecinos: [7,0], [7,1], [7,2], [8,0], [8,2], [9,0], [9,1], [9,2]
    {
      const casilla = tablero.matriz[8][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][0], tablero.matriz[7][1], tablero.matriz[7][2], tablero.matriz[8][0], tablero.matriz[8][2], tablero.matriz[9][0], tablero.matriz[9][1], tablero.matriz[9][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [8,2] — interior, 8 vecinos: [7,1], [7,2], [7,3], [8,1], [8,3], [9,1], [9,2], [9,3]
    {
      const casilla = tablero.matriz[8][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][1], tablero.matriz[7][2], tablero.matriz[7][3], tablero.matriz[8][1], tablero.matriz[8][3], tablero.matriz[9][1], tablero.matriz[9][2], tablero.matriz[9][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [8,3] — interior, 8 vecinos: [7,2], [7,3], [7,4], [8,2], [8,4], [9,2], [9,3], [9,4]
    {
      const casilla = tablero.matriz[8][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][2], tablero.matriz[7][3], tablero.matriz[7][4], tablero.matriz[8][2], tablero.matriz[8][4], tablero.matriz[9][2], tablero.matriz[9][3], tablero.matriz[9][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [8,4] — interior, 8 vecinos: [7,3], [7,4], [7,5], [8,3], [8,5], [9,3], [9,4], [9,5]
    {
      const casilla = tablero.matriz[8][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][3], tablero.matriz[7][4], tablero.matriz[7][5], tablero.matriz[8][3], tablero.matriz[8][5], tablero.matriz[9][3], tablero.matriz[9][4], tablero.matriz[9][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [8,5] — interior, 8 vecinos: [7,4], [7,5], [7,6], [8,4], [8,6], [9,4], [9,5], [9,6]
    {
      const casilla = tablero.matriz[8][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][4], tablero.matriz[7][5], tablero.matriz[7][6], tablero.matriz[8][4], tablero.matriz[8][6], tablero.matriz[9][4], tablero.matriz[9][5], tablero.matriz[9][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [8,6] — interior, 8 vecinos: [7,5], [7,6], [7,7], [8,5], [8,7], [9,5], [9,6], [9,7]
    {
      const casilla = tablero.matriz[8][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][5], tablero.matriz[7][6], tablero.matriz[7][7], tablero.matriz[8][5], tablero.matriz[8][7], tablero.matriz[9][5], tablero.matriz[9][6], tablero.matriz[9][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [8,7] — interior, 8 vecinos: [7,6], [7,7], [7,8], [8,6], [8,8], [9,6], [9,7], [9,8]
    {
      const casilla = tablero.matriz[8][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][6], tablero.matriz[7][7], tablero.matriz[7][8], tablero.matriz[8][6], tablero.matriz[8][8], tablero.matriz[9][6], tablero.matriz[9][7], tablero.matriz[9][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [8,8] — interior, 8 vecinos: [7,7], [7,8], [7,9], [8,7], [8,9], [9,7], [9,8], [9,9]
    {
      const casilla = tablero.matriz[8][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][7], tablero.matriz[7][8], tablero.matriz[7][9], tablero.matriz[8][7], tablero.matriz[8][9], tablero.matriz[9][7], tablero.matriz[9][8], tablero.matriz[9][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [8,9] — borde, 5 vecinos: [7,8], [7,9], [8,8], [9,8], [9,9]
    {
      const casilla = tablero.matriz[8][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[7][8], tablero.matriz[7][9], tablero.matriz[8][8], tablero.matriz[9][8], tablero.matriz[9][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [9,0] — esquina, 3 vecinos: [8,0], [8,1], [9,1]
    {
      const casilla = tablero.matriz[9][0];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][0], tablero.matriz[8][1], tablero.matriz[9][1]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [9,1] — borde, 5 vecinos: [8,0], [8,1], [8,2], [9,0], [9,2]
    {
      const casilla = tablero.matriz[9][1];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][0], tablero.matriz[8][1], tablero.matriz[8][2], tablero.matriz[9][0], tablero.matriz[9][2]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [9,2] — borde, 5 vecinos: [8,1], [8,2], [8,3], [9,1], [9,3]
    {
      const casilla = tablero.matriz[9][2];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][1], tablero.matriz[8][2], tablero.matriz[8][3], tablero.matriz[9][1], tablero.matriz[9][3]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [9,3] — borde, 5 vecinos: [8,2], [8,3], [8,4], [9,2], [9,4]
    {
      const casilla = tablero.matriz[9][3];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][2], tablero.matriz[8][3], tablero.matriz[8][4], tablero.matriz[9][2], tablero.matriz[9][4]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [9,4] — borde, 5 vecinos: [8,3], [8,4], [8,5], [9,3], [9,5]
    {
      const casilla = tablero.matriz[9][4];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][3], tablero.matriz[8][4], tablero.matriz[8][5], tablero.matriz[9][3], tablero.matriz[9][5]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [9,5] — borde, 5 vecinos: [8,4], [8,5], [8,6], [9,4], [9,6]
    {
      const casilla = tablero.matriz[9][5];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][4], tablero.matriz[8][5], tablero.matriz[8][6], tablero.matriz[9][4], tablero.matriz[9][6]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [9,6] — borde, 5 vecinos: [8,5], [8,6], [8,7], [9,5], [9,7]
    {
      const casilla = tablero.matriz[9][6];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][5], tablero.matriz[8][6], tablero.matriz[8][7], tablero.matriz[9][5], tablero.matriz[9][7]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [9,7] — borde, 5 vecinos: [8,6], [8,7], [8,8], [9,6], [9,8]
    {
      const casilla = tablero.matriz[9][7];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][6], tablero.matriz[8][7], tablero.matriz[8][8], tablero.matriz[9][6], tablero.matriz[9][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [9,8] — borde, 5 vecinos: [8,7], [8,8], [8,9], [9,7], [9,9]
    {
      const casilla = tablero.matriz[9][8];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][7], tablero.matriz[8][8], tablero.matriz[8][9], tablero.matriz[9][7], tablero.matriz[9][9]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }

    // ── Casilla [9,9] — esquina, 3 vecinos: [8,8], [8,9], [9,8]
    {
      const casilla = tablero.matriz[9][9];
      if (casilla.abierta && casilla.minasAlrededor !== null) {
        const vecinos   = [tablero.matriz[8][8], tablero.matriz[8][9], tablero.matriz[9][8]];
        const cerrados  = vecinos.filter((v) => !v.abierta && !v.marcadaComoMina);
        const marcados  = vecinos.filter((v) => v.marcadaComoMina);
        const faltantes = casilla.minasAlrededor - marcados.length;
        if (faltantes > 0 && cerrados.length > 0) {
          const riesgo = Math.round((faltantes / cerrados.length) * 100);
          for (const v of cerrados) { if (riesgo > v.probabilidadMina) v.probabilidadMina = riesgo; }
        }
      }
    }
  }

  /**
   * Elige la casilla de menor riesgo estadístico.
   * Si varias tienen el mismo riesgo mínimo, elige una al azar para no empezar siempre igual.
   * Si ninguna pista le asignó riesgo, se usa 50% como estimación base neutral.
   */
  private buscarJugadaPorEstadistica(tablero: Tablero, casillasDisponibles: Casilla[]): Jugada {
    this.calcularRiesgosPorCasillasAbiertas(tablero);

    let minRiesgo = Infinity;
    for (const c of casillasDisponibles) {
      if (c.probabilidadMina === 0) c.probabilidadMina = 50;
      c.recomendacion = 100 - c.probabilidadMina;
      if (c.probabilidadMina < minRiesgo) minRiesgo = c.probabilidadMina;
    }

    const candidatas = casillasDisponibles.filter((c) => c.probabilidadMina === minRiesgo && !this.esLaMismaUltimaJugada(c));
    const pool = candidatas.length > 0 ? candidatas : casillasDisponibles.filter((c) => c.probabilidadMina === minRiesgo);

    if (!pool.length) throw new Error('No fue posible determinar una jugada');

    const elegida = pool[Math.floor(Math.random() * pool.length)];
    return { fila: elegida.fila, columna: elegida.columna, motivo: 'Jugada estadística — menor riesgo entre candidatas', probabilidadMina: elegida.probabilidadMina, recomendacion: elegida.recomendacion };
  }
}