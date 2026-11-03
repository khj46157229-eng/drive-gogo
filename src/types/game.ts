export type GameState = 'START' | 'PLAYING' | 'PAUSED' | 'CLEAR' | 'GAMEOVER';

export type Difficulty = 'EASY' | 'NORMAL' | 'HARD';

export type TruckColor = 'blue' | 'amber' | 'emerald' | 'violet' | 'rose';

export interface HighScoreRecord {
  id: string;
  date: string;
  grade: 'S' | 'A' | 'B' | 'C' | 'F';
  cargoLeft: number;
  nearMissCount: number;
  timeRemaining: number;
  difficulty: Difficulty;
  isClear: boolean;
}

export type ObstacleType = 'SEDAN' | 'TRUCK' | 'BARREL' | 'BARRICADE' | 'PUDDLE' | 'CONE';

export interface Obstacle {
  id: number;
  x: number; // relative to road center
  y: number;
  type: ObstacleType;
  width: number;
  height: number;
  hit: boolean;
  nearMissed: boolean;
  vx: number;
  vy: number;
  animFrame: number;
  color: string;
}

export type ItemType = 'BOX' | 'SHIELD' | 'TIME';

export interface GameItem {
  id: number;
  x: number;
  y: number;
  type: ItemType;
  width: number;
  height: number;
  collected: boolean;
  animFrame: number;
}

export interface Particle {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  color: string;
  radius?: number;
  alpha: number;
  life: number;
  text?: string;
  fontSize?: number;
}

export interface FallingCargo {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  vRot: number;
  alpha: number;
}

export interface TireTrack {
  x: number;
  y: number;
  alpha: number;
}
