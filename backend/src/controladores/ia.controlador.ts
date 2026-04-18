import { Request, Response } from 'express';
import { TableroModelo } from '../modelos/tablero.modelo';
import { estadoJuegoServicio } from '../servicios/estado-juego.servicio';
import { IABuscaminasServicio } from '../servicios/ia-buscaminas.servicio';

/**
 * IAControlador
 *
 * Maneja las peticiones HTTP del juego Buscaminas.
 *
 * Flujo de juego:
 *  1. POST /api/tablero    → crea el tablero Y devuelve la primera jugada de la IA automáticamente.
 *  2. POST /api/resultado  → el usuario informa cuántas minas hay alrededor → la IA devuelve la siguiente jugada.
 *  3. POST /api/mina       → el usuario informa que era una mina → juego perdido.
 *  4. POST /api/reiniciar  → reinicia todo para una nueva partida (la IA empieza de cero).
 *  GET  /api/tablero       → consulta el estado actual del tablero en cualquier momento.
 *
 * La IA NO aprende entre partidas. Cada reinicio es un inicio limpio.
 * La instancia de IABuscaminasServicio se recrea al reiniciar para garantizar estado cero.
 */
export class IAControlador {
  private tableroModelo = new TableroModelo();
  private iaBuscaminasServicio = new IABuscaminasServicio();

  // ─────────────────────────────────────────────────────────────────────────
  // 1. CREAR TABLERO + PRIMERA JUGADA AUTOMÁTICA DE LA IA
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/tablero
   * Crea un tablero 10x10 vacío y automáticamente calcula y devuelve
   * la primera casilla que la IA recomienda levantar.
   * No requiere body — el usuario no elige nada al inicio.
   */
  public crearTablero = (req: Request, res: Response): void => {
    try {
      // Crear tablero vacío sin minas predefinidas
      const tablero = this.tableroModelo.crearTableroVacio();
      estadoJuegoServicio.guardarTablero(tablero);

      // La IA escoge su primera jugada automáticamente
      const primeraJugada = this.iaBuscaminasServicio.obtenerSiguienteJugada(tablero);
      estadoJuegoServicio.guardarTablero(tablero);

      res.status(201).json({
        mensaje: 'Tablero creado. La IA ya escogió su primera casilla.',
        jugada: primeraJugada,
        tablero
      });
    } catch (error) {
      res.status(500).json({
        mensaje: 'Error al crear el tablero',
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 2. REGISTRAR RESULTADO Y OBTENER SIGUIENTE JUGADA
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/resultado
   * El usuario informa cuántas minas hay alrededor de la casilla levantada.
   * El backend abre esa casilla, actualiza el tablero, y devuelve la siguiente jugada de la IA.
   *
   * Body: { fila: number, columna: number, minasAlrededor: number }
   *
   * Respuesta: la siguiente jugada que la IA recomienda levantar.
   */
  public registrarResultado = (req: Request, res: Response): void => {
    try {
      if (!estadoJuegoServicio.existeTablero()) {
        res.status(400).json({ mensaje: 'Primero debes crear un tablero' });
        return;
      }

      if (estadoJuegoServicio.estaJuegoPerdido()) {
        res.status(400).json({ mensaje: 'El juego ya fue perdido. Reinicia para continuar.' });
        return;
      }

      const { fila, columna, minasAlrededor } = req.body;

      if (typeof fila !== 'number' || typeof columna !== 'number' || typeof minasAlrededor !== 'number') {
        res.status(400).json({ mensaje: 'Debes enviar fila, columna y minasAlrededor como números' });
        return;
      }

      if (fila < 0 || fila >= 10 || columna < 0 || columna >= 10) {
        res.status(400).json({ mensaje: 'Fila o columna fuera del rango 0-9' });
        return;
      }

      if (minasAlrededor < 0 || minasAlrededor > 8) {
        res.status(400).json({ mensaje: 'minasAlrededor debe estar entre 0 y 8' });
        return;
      }

      const tablero = estadoJuegoServicio.obtenerTablero()!;
      const casilla = tablero.matriz[fila][columna];

      if (casilla.abierta) {
        res.status(400).json({ mensaje: 'Esa casilla ya fue abierta anteriormente' });
        return;
      }

      // Registrar la información que el usuario informó sobre esta casilla
      casilla.abierta = true;
      casilla.minasAlrededor = minasAlrededor;
      casilla.fueIntentada = true;
      casilla.probabilidadMina = 0;
      casilla.recomendacion = 0;

      estadoJuegoServicio.guardarTablero(tablero);

      // Con la nueva información, la IA calcula su siguiente jugada
      const siguienteJugada = this.iaBuscaminasServicio.obtenerSiguienteJugada(tablero);
      estadoJuegoServicio.guardarTablero(tablero);

      res.status(200).json({
        mensaje: 'Resultado registrado. La IA ya escogió la siguiente casilla.',
        casillaAbierta: { fila, columna, minasAlrededor },
        jugada: siguienteJugada,
        tablero
      });
    } catch (error) {
      res.status(500).json({
        mensaje: 'Error al registrar el resultado',
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 3. REGISTRAR MINA — JUEGO PERDIDO
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/mina
   * El usuario informa que la casilla levantada era una mina.
   * El juego se pierde inmediatamente, sin importar si la lógica decía que era segura.
   * No se guarda memoria: al reiniciar la IA empieza desde cero.
   *
   * Body: { fila: number, columna: number }
   */
  public registrarMina = (req: Request, res: Response): void => {
    try {
      if (!estadoJuegoServicio.existeTablero()) {
        res.status(400).json({ mensaje: 'Primero debes crear un tablero' });
        return;
      }

      if (estadoJuegoServicio.estaJuegoPerdido()) {
        res.status(400).json({ mensaje: 'El juego ya estaba perdido. Reinicia para continuar.' });
        return;
      }

      const { fila, columna } = req.body;

      if (typeof fila !== 'number' || typeof columna !== 'number') {
        res.status(400).json({ mensaje: 'Debes enviar fila y columna como números' });
        return;
      }

      if (fila < 0 || fila >= 10 || columna < 0 || columna >= 10) {
        res.status(400).json({ mensaje: 'Fila o columna fuera del rango 0-9' });
        return;
      }

      // Marcar el juego como perdido
      estadoJuegoServicio.marcarJuegoPerdido();

      res.status(200).json({
        mensaje: `Mina en [${fila}, ${columna}]. Juego perdido. Reinicia para una nueva partida.`,
        juegoPerdido: true,
        posicionMina: { fila, columna }
      });
    } catch (error) {
      res.status(500).json({
        mensaje: 'Error al registrar la mina',
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // 4. REINICIAR
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * POST /api/reiniciar
   * Limpia el tablero y el estado de derrota.
   * Recrea la instancia de la IA para garantizar que empiece desde cero sin ninguna memoria.
   */
  public reiniciarTablero = (req: Request, res: Response): void => {
    try {
      estadoJuegoServicio.limpiarTablero();

      // Recrear la IA desde cero — sin memoria de partidas anteriores
      this.iaBuscaminasServicio = new IABuscaminasServicio();

      res.status(200).json({
        mensaje: 'Tablero reiniciado. Crea un nuevo tablero para empezar.'
      });
    } catch (error) {
      res.status(500).json({
        mensaje: 'Error al reiniciar el tablero',
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // VER TABLERO
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * GET /api/tablero
   * Devuelve el estado actual del tablero.
   * Útil para que el frontend sincronice su vista si algo falla.
   */
  public verTablero = (req: Request, res: Response): void => {
    try {
      if (!estadoJuegoServicio.existeTablero()) {
        res.status(400).json({ mensaje: 'No hay tablero activo. Crea uno primero.' });
        return;
      }

      res.status(200).json({
        mensaje: 'Tablero obtenido correctamente',
        juegoPerdido: estadoJuegoServicio.estaJuegoPerdido(),
        tablero: estadoJuegoServicio.obtenerTablero()
      });
    } catch (error) {
      res.status(500).json({
        mensaje: 'Error al obtener el tablero',
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  };
}