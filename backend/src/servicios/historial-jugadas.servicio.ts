import { HistorialJugada } from '../interfaces/historial-jugada.interface';

export class HistorialJugadasServicio {
  private historial: HistorialJugada[] = [];
  private contadorTurnos = 0;

  public agregarEvento(evento: Omit<HistorialJugada, 'turno' | 'fecha'>): void {
    this.contadorTurnos++;

    this.historial.push({
      turno: this.contadorTurnos,
      fecha: new Date().toISOString(),
      ...evento
    });
  }

  public obtenerHistorial(): HistorialJugada[] {
    return this.historial;
  }

  public limpiarHistorial(): void {
    this.historial = [];
    this.contadorTurnos = 0;
  }
}

export const historialJugadasServicio = new HistorialJugadasServicio();