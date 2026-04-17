export interface Casilla {
  fila: number;
  columna: number;
  abierta: boolean;
  marcadaComoMina: boolean;
  minasAlrededor: number | null;
  probabilidadMina: number;
  recomendacion: number;
  fueIntentada: boolean;
}