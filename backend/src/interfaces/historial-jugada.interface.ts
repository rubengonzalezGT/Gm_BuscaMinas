export interface HistorialJugada {
  turno: number;
  tipo: string;
  fila: number | null;
  columna: number | null;
  detalle: string;
  minasAlrededor: number | null;
  probabilidadMina: number | null;
  recomendacion: number | null;
  fecha: string;
}