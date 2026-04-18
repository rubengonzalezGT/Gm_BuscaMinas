import { Router } from 'express';
import { IAControlador } from '../controladores/ia.controlador';

/**
 * ia.ruta.ts — Rutas del juego Buscaminas
 *
 * Flujo de una partida:
 *
 *  1. POST /api/tablero
 *     → Crea el tablero y devuelve automáticamente la primera jugada de la IA.
 *     → No necesita body.
 *
 *  2. POST /api/resultado
 *     → El usuario le dice a la IA cuántas minas había alrededor.
 *     → Body: { fila: number, columna: number, minasAlrededor: number }
 *     → Devuelve la siguiente jugada de la IA.
 *
 *  3. POST /api/mina
 *     → El usuario informa que la casilla era una mina → juego perdido.
 *     → Body: { fila: number, columna: number }
 *
 *  4. POST /api/reiniciar
 *     → Reinicia todo. La IA empieza de cero sin memoria.
 *
 *  GET /api/tablero
 *     → Consulta el estado actual del tablero en cualquier momento.
 */

const router = Router();
const controlador = new IAControlador();

router.post('/tablero',   controlador.crearTablero);
router.get('/tablero',    controlador.verTablero);
router.post('/resultado', controlador.registrarResultado);
router.post('/mina',      controlador.registrarMina);
router.post('/reiniciar', controlador.reiniciarTablero);

export default router;