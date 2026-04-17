import { Router } from 'express';
import { IAControlador } from '../controladores/ia.controlador';

const rutaIA = Router();
const iaControlador = new IAControlador();

rutaIA.post('/crear-tablero', iaControlador.crearTablero);
rutaIA.post('/registrar-jugada', iaControlador.registrarJugada);
rutaIA.post('/siguiente-jugada', iaControlador.obtenerSiguienteJugada);
rutaIA.post('/registrar-resultado', iaControlador.registrarResultado);
rutaIA.post('/reiniciar-tablero', iaControlador.reiniciarTablero);
rutaIA.post('/limpiar-historial', iaControlador.limpiarHistorial);
rutaIA.get('/ver-tablero', iaControlador.verTablero);
rutaIA.get('/ver-tablero-texto', iaControlador.verTableroTexto);
rutaIA.get('/ver-probabilidades', iaControlador.verProbabilidades);
rutaIA.get('/ver-historial', iaControlador.verHistorial);

export default rutaIA;