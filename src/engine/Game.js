import { Grid } from './Grid.js';
import { Player } from '../entities/Player.js';
import { Bomb } from '../entities/Bomb.js';
import { Bot } from '../entities/Bot.js';
import { GLOBAL_VARS } from '../main.js';

export class Game {
  constructor(canvas, isHeadless = false) {
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext('2d') : null;
    this.isHeadless = isHeadless;

    // Default grid fits in 600x520 canvas (40px cells)
    this.gridSize = 40;
    this.gridWidth = GLOBAL_VARS.gridWidth;
    this.gridHeight = GLOBAL_VARS.gridHeight;

    this.grid = new Grid(this.gridWidth, this.gridHeight);
    this.players = [];
    this.bombs = [];
    this.explosions = []; // {x, y, timer}

    this.keys = {};
    this.isRunning = false;
    this.lastTime = 0;
    this.accumulator = 0;
    this.gameSpeed = 1;

    if (!this.isHeadless) {
      this.setupInputs();
    }
  }


  startSinglePlayer() {
    if (this.gameLoopId) cancelAnimationFrame(this.gameLoopId);
    this.grid.generateLevel();
    this.players = [];
    this.bombs = [];
    this.explosions = [];
    // Spawn player top left
    const p1 = new Player(1, 1, 'P1', true);
    p1.px = 1 * this.gridSize + 5;
    p1.py = 1 * this.gridSize + 5;
    this.players.push(p1);


    // Spawn 3 bots in corners
    const spawnPoints = [
      { x: this.gridWidth - 2, y: 1 },
      { x: 1, y: this.gridHeight - 2 },
      { x: this.gridWidth - 2, y: this.gridHeight - 2 }
    ];

    spawnPoints.forEach((pt, i) => {
      const bot = new Bot(pt.x, pt.y, `Bot${i + 1}`);
      bot.px = pt.x * this.gridSize + 5;
      bot.py = pt.y * this.gridSize + 5;
      this.players.push(bot);
    });

    this.isRunning = true;
    this.lastTime = 0;
    this.gameLoopId = requestAnimationFrame((time) => this.loop(time));
  }

  setupInputs() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.key] = true;
      if (e.key === ' ' && this.isRunning && this.players[0]) {
        this.players[0].placeBomb(this);
      }
    });
    window.addEventListener('keyup', (e) => {
      this.keys[e.key] = false;
    });
  }

  handleExplosion(bomb, tiles) {
    // Remove bomb from list
    this.bombs = this.bombs.filter(b => b !== bomb);

    // Render explosions
    tiles.forEach(tile => {
      this.explosions.push({
        x: tile.x,
        y: tile.y,
        life: 500 // 500ms
      });

      // Chain reaction
      this.bombs.forEach(otherBomb => {
        if (!otherBomb.exploded && otherBomb.x === tile.x && otherBomb.y === tile.y) {
          otherBomb.forceExplode();
        }
      });

      // Kill players
      this.players.forEach(p => {
        if (p.alive && p.x === tile.x && p.y === tile.y) {
          p.alive = false;
          if (p !== bomb.owner && bomb.owner.enemiesKilled !== undefined) {
            bomb.owner.enemiesKilled++;
          }
        }
      });
    });
  }

  loop(time) {
    if (!this.isRunning) return;

    const realDt = time - (this.lastTime || time);
    this.lastTime = time;

    this.accumulator += realDt * this.gameSpeed;
    const fixedDt = 16; // 60fps internal simulation

    // Cap the accumulator to prevent game freezing if tab is inactive for a long time
    if (this.accumulator > fixedDt * 100) {
      this.accumulator = fixedDt * 100;
    }

    while (this.accumulator >= fixedDt) {
      this.update(fixedDt);
      this.accumulator -= fixedDt;
    }

    if (!this.isHeadless) this.render();

    this.gameLoopId = requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    this.players.forEach(p => {
      p.update(this.grid, this);
    });

    // Update bombs
    this.bombs.forEach(b => b.update(dt));

    // Update explosions
    this.explosions = this.explosions.filter(e => {
      e.life -= dt;
      return e.life > 0;
    });
  }

  render() {
    this.ctx.fillStyle = '#111';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Render grid
    for (let y = 0; y < this.gridHeight; y++) {
      for (let x = 0; x < this.gridWidth; x++) {
        const cell = this.grid.getCell(x, y);
        if (cell === 1) {
          this.ctx.fillStyle = '#666'; // Solid Wall
          this.ctx.fillRect(x * this.gridSize, y * this.gridSize, this.gridSize, this.gridSize);
        } else if (cell === 2) {
          this.ctx.fillStyle = '#d453ccff'; // Destructible
          this.ctx.fillRect(x * this.gridSize + 2, y * this.gridSize + 2, this.gridSize - 4, this.gridSize - 4);
        } else {
          // Floor
          this.ctx.fillStyle = '#373636ff';
          this.ctx.fillRect(x * this.gridSize, y * this.gridSize, this.gridSize, this.gridSize);
        }
      }
    }

    // Render explosions
    this.explosions.forEach(e => {
      this.ctx.fillStyle = 'orange';
      this.ctx.fillRect(e.x * this.gridSize, e.y * this.gridSize, this.gridSize, this.gridSize);
      this.ctx.fillStyle = 'red';
      this.ctx.fillRect(e.x * this.gridSize + 10, e.y * this.gridSize + 10, this.gridSize - 20, this.gridSize - 20);
    });

    // Render bombs
    this.bombs.forEach(b => {
      this.ctx.fillStyle = '#0a0a0aff'; // Black bomb
      this.ctx.beginPath();
      this.ctx.arc(b.px + b.size / 2, b.py + b.size / 2, b.size / 2, 0, Math.PI * 2);
      this.ctx.fill();
    });

    // Render players
    this.players.forEach(p => {
      if (!p.alive) return;
      this.ctx.fillStyle = p.color;
      this.ctx.beginPath();
      this.ctx.arc(p.px + p.size / 2, p.py + p.size / 2, p.size / 2, 0, Math.PI * 2);
      this.ctx.fill();
    });
  }
}
