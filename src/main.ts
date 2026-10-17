import './ui/styles.css';
import { Game } from './core/game';

const canvas = document.getElementById('game-canvas');
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Canvas #game-canvas tidak ditemukan');
void new Game(canvas).start();
