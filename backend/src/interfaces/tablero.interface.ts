import { Casilla } from './casilla.interface';

export interface Tablero {
  matriz: Casilla[][];
  totalFilas: number;
  totalColumnas: number;
}