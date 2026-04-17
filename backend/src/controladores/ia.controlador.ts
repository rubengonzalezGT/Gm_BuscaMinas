import { Request, Response } from 'express';
import { TableroModelo } from '../modelos/tablero.modelo';
import { estadoJuegoServicio } from '../servicios/estado-juego.servicio';
import { IABuscaminasServicio } from '../servicios/ia-buscaminas.servicio';
import { TableroUtilidad } from '../utilidades/tablero.utilidad';
import { historialJugadasServicio } from '../servicios/historial-jugadas.servicio';

export class IAControlador {
  private tableroModelo = new TableroModelo();
  private iaBuscaminasServicio = new IABuscaminasServicio();

  public crearTablero = (req: Request, res: Response): void => {
    try {
      const { totalMinas } = req.body;

      if (typeof totalMinas !== 'number' || totalMinas <= 0) {
        res.status(400).json({
          mensaje: 'Debes enviar un totalMinas válido'
        });
        return;
      }

      const tablero = this.tableroModelo.crearTableroVacio(totalMinas);
      estadoJuegoServicio.guardarTablero(tablero);

      historialJugadasServicio.agregarEvento({
        tipo: 'crear-tablero',
        fila: null,
        columna: null,
        detalle: `Se creó un tablero 10x10 con ${totalMinas} minas`,
        minasAlrededor: null,
        probabilidadMina: null,
        recomendacion: null
      });

      res.status(201).json({
        mensaje: 'Tablero creado correctamente',
        tablero
      });
    } catch (error) {
      res.status(500).json({
        mensaje: 'Ocurrió un error al crear el tablero',
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  };

  public registrarJugada = (req: Request, res: Response): void => {
    try {
      const { fila, columna, minasAlrededor } = req.body;

      if (!estadoJuegoServicio.existeTablero()) {
        res.status(400).json({
          mensaje: 'Primero debes crear un tablero'
        });
        return;
      }

      if (
        typeof fila !== 'number' ||
        typeof columna !== 'number' ||
        typeof minasAlrededor !== 'number'
      ) {
        res.status(400).json({
          mensaje: 'Debes enviar fila, columna y minasAlrededor válidos'
        });
        return;
      }

      const tablero = estadoJuegoServicio.obtenerTablero();

      if (!tablero) {
        res.status(400).json({
          mensaje: 'No se encontró el tablero actual'
        });
        return;
      }

      if (
        fila < 0 ||
        fila >= tablero.totalFilas ||
        columna < 0 ||
        columna >= tablero.totalColumnas
      ) {
        res.status(400).json({
          mensaje: 'La fila o columna están fuera del rango del tablero'
        });
        return;
      }

      const casillaActual = tablero.matriz[fila][columna];

      if (casillaActual.abierta) {
        res.status(400).json({
          mensaje: 'Esa casilla ya fue usada'
        });
        return;
      }

      // Lógica de la casilla [fila, columna]: el usuario registra una sola casilla abierta con el número de minas alrededor.
      casillaActual.abierta = true;
      casillaActual.minasAlrededor = minasAlrededor;
      casillaActual.fueIntentada = true;
      casillaActual.probabilidadMina = 0;
      casillaActual.recomendacion = 0;

      estadoJuegoServicio.guardarTablero(tablero);

      historialJugadasServicio.agregarEvento({
        tipo: 'jugada-usuario',
        fila,
        columna,
        detalle: 'El usuario registró su jugada manual inicial o una jugada manual',
        minasAlrededor,
        probabilidadMina: 0,
        recomendacion: 0
      });

      res.status(200).json({
        mensaje: 'Jugada registrada correctamente',
        casilla: casillaActual,
        tablero
      });
    } catch (error) {
      res.status(500).json({
        mensaje: 'Ocurrió un error al registrar la jugada',
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  };

  public obtenerSiguienteJugada = (req: Request, res: Response): void => {
    try {
      if (!estadoJuegoServicio.existeTablero()) {
        res.status(400).json({
          mensaje: 'Primero debes crear un tablero'
        });
        return;
      }

      const tablero = estadoJuegoServicio.obtenerTablero();

      if (!tablero) {
        res.status(400).json({
          mensaje: 'No se encontró el tablero actual'
        });
        return;
      }

      const jugada = this.iaBuscaminasServicio.obtenerSiguienteJugada(tablero);
      estadoJuegoServicio.guardarTablero(tablero);

      historialJugadasServicio.agregarEvento({
        tipo: 'jugada-ia',
        fila: jugada.fila,
        columna: jugada.columna,
        detalle: jugada.motivo,
        minasAlrededor: null,
        probabilidadMina: jugada.probabilidadMina,
        recomendacion: jugada.recomendacion
      });

      res.status(200).json({
        mensaje: 'Siguiente jugada calculada correctamente',
        jugada,
        tablero
      });
    } catch (error) {
      res.status(500).json({
        mensaje: 'Ocurrió un error al calcular la siguiente jugada',
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  };

  public registrarResultado = (req: Request, res: Response): void => {
    try {
      const { fila, columna, minasAlrededor } = req.body;

      if (!estadoJuegoServicio.existeTablero()) {
        res.status(400).json({
          mensaje: 'Primero debes crear un tablero'
        });
        return;
      }

      if (
        typeof fila !== 'number' ||
        typeof columna !== 'number' ||
        typeof minasAlrededor !== 'number'
      ) {
        res.status(400).json({
          mensaje: 'Debes enviar fila, columna y minasAlrededor válidos'
        });
        return;
      }

      const tablero = estadoJuegoServicio.obtenerTablero();

      if (!tablero) {
        res.status(400).json({
          mensaje: 'No se encontró el tablero actual'
        });
        return;
      }

      if (
        fila < 0 ||
        fila >= tablero.totalFilas ||
        columna < 0 ||
        columna >= tablero.totalColumnas
      ) {
        res.status(400).json({
          mensaje: 'La fila o columna están fuera del rango del tablero'
        });
        return;
      }

      const casillaActual = tablero.matriz[fila][columna];

      if (casillaActual.abierta) {
        res.status(400).json({
          mensaje: 'Esa casilla ya fue abierta anteriormente'
        });
        return;
      }

      // Lógica de la casilla [fila, columna]: se registra el resultado de la casilla recomendada por la IA y se abre esa única casilla.
      casillaActual.abierta = true;
      casillaActual.minasAlrededor = minasAlrededor;
      casillaActual.fueIntentada = true;
      casillaActual.probabilidadMina = 0;
      casillaActual.recomendacion = 0;

      estadoJuegoServicio.guardarTablero(tablero);

      historialJugadasServicio.agregarEvento({
        tipo: 'resultado-ia',
        fila,
        columna,
        detalle: 'Se registró el resultado de la casilla recomendada por la IA',
        minasAlrededor,
        probabilidadMina: 0,
        recomendacion: 0
      });

      res.status(200).json({
        mensaje: 'Resultado de la IA registrado correctamente',
        casilla: casillaActual,
        tablero
      });
    } catch (error) {
      res.status(500).json({
        mensaje: 'Ocurrió un error al registrar el resultado',
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  };

  public reiniciarTablero = (req: Request, res: Response): void => {
    try {
      estadoJuegoServicio.limpiarTablero();

      historialJugadasServicio.agregarEvento({
        tipo: 'reinicio-tablero',
        fila: null,
        columna: null,
        detalle: 'Se reinició el tablero actual',
        minasAlrededor: null,
        probabilidadMina: null,
        recomendacion: null
      });

      res.status(200).json({
        mensaje: 'Tablero reiniciado correctamente'
      });
    } catch (error) {
      res.status(500).json({
        mensaje: 'Ocurrió un error al reiniciar el tablero',
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  };

  public verTablero = (req: Request, res: Response): void => {
    try {
      if (!estadoJuegoServicio.existeTablero()) {
        res.status(400).json({
          mensaje: 'Primero debes crear un tablero'
        });
        return;
      }

      const tablero = estadoJuegoServicio.obtenerTablero();

      if (!tablero) {
        res.status(400).json({
          mensaje: 'No se encontró el tablero actual'
        });
        return;
      }

      res.status(200).json({
        mensaje: 'Tablero obtenido correctamente',
        tablero
      });
    } catch (error) {
      res.status(500).json({
        mensaje: 'Ocurrió un error al obtener el tablero',
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  };

  public verTableroTexto = (req: Request, res: Response): void => {
    try {
      if (!estadoJuegoServicio.existeTablero()) {
        res.status(400).json({
          mensaje: 'Primero debes crear un tablero'
        });
        return;
      }

      const tablero = estadoJuegoServicio.obtenerTablero();

      if (!tablero) {
        res.status(400).json({
          mensaje: 'No se encontró el tablero actual'
        });
        return;
      }

      const tableroTexto = TableroUtilidad.convertirATexto(tablero);

      res.status(200).json({
        mensaje: 'Tablero en texto obtenido correctamente',
        tableroTexto
      });
    } catch (error) {
      res.status(500).json({
        mensaje: 'Ocurrió un error al obtener el tablero en texto',
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  };

  public verProbabilidades = (req: Request, res: Response): void => {
    try {
      if (!estadoJuegoServicio.existeTablero()) {
        res.status(400).json({
          mensaje: 'Primero debes crear un tablero'
        });
        return;
      }

      const tablero = estadoJuegoServicio.obtenerTablero();

      if (!tablero) {
        res.status(400).json({
          mensaje: 'No se encontró el tablero actual'
        });
        return;
      }

      const tableroProbabilidades = TableroUtilidad.convertirAProbabilidades(tablero);

      res.status(200).json({
        mensaje: 'Probabilidades obtenidas correctamente',
        tableroProbabilidades,
        tablero
      });
    } catch (error) {
      res.status(500).json({
        mensaje: 'Ocurrió un error al obtener las probabilidades',
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  };

  public verHistorial = (req: Request, res: Response): void => {
    try {
      const historial = historialJugadasServicio.obtenerHistorial();

      res.status(200).json({
        mensaje: 'Historial obtenido correctamente',
        totalEventos: historial.length,
        historial
      });
    } catch (error) {
      res.status(500).json({
        mensaje: 'Ocurrió un error al obtener el historial',
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  };

  public limpiarHistorial = (req: Request, res: Response): void => {
    try {
      historialJugadasServicio.limpiarHistorial();

      res.status(200).json({
        mensaje: 'Historial limpiado correctamente'
      });
    } catch (error) {
      res.status(500).json({
        mensaje: 'Ocurrió un error al limpiar el historial',
        error: error instanceof Error ? error.message : 'Error desconocido'
      });
    }
  };
}