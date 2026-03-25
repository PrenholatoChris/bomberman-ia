import { Bomb } from './Bomb.js';

export class Player {
  constructor(x, y, id, isHuman = false) {
    this.x = x; // Grid X
    this.y = y; // Grid Y
    this.px = x * 40; // Pixel X
    this.py = y * 40; // Pixel Y
    this.id = id;
    this.isHuman = isHuman;

    this.speed = 3;
    this.maxBombs = 1;
    this.bombsPlaced = 0;
    this.totalBombsPlaced = 0;
    this.bombRange = 2;
    this.alive = true;
    this.wallHits = 0;
    this.walks = 0;

    // Pixel sizing
    this.size = 30; // 30x30 player size (fits in 40x40 cell)

    // Movement intent
    this.dx = 0;
    this.dy = 0;

    this.color = isHuman ? '#4CAF50' : '#FF5722';
  }

  update(grid, game) {
    if (!this.alive) return;

    // Subclasses (Bot, Agent) and Humans use this to set dx, dy, and bombs
    this.processIntent(grid, game);

    // Calculate intended pixel position
    let nextPx = this.px + this.dx * this.speed;
    let nextPy = this.py + this.dy * this.speed;

    let moved = false;

    // Check collision based on bounding box
    if (!this.checkCollision(nextPx, this.py, grid)) {
      this.px = nextPx;
      moved = true;
    } else {
      this.wallHits++;
    }
    if (!this.checkCollision(this.px, nextPy, grid)) {
      this.py = nextPy;
      moved = true;
    } else {
      this.wallHits++;
    }

    if (moved && (this.dx !== 0 || this.dy !== 0)) {
      this.walks++;
    }

    // Update grid position
    this.x = Math.floor((this.px + this.size / 2) / grid.cellSize);
    this.y = Math.floor((this.py + this.size / 2) / grid.cellSize);
  }

  checkCollision(nx, ny, grid) {
    const margin = 6; // larger margin to let player slide smoothly without getting stuck easily
    const left = Math.floor((nx + margin) / grid.cellSize);
    const right = Math.floor((nx + this.size - margin) / grid.cellSize);
    const top = Math.floor((ny + margin) / grid.cellSize);
    const bottom = Math.floor((ny + this.size - margin) / grid.cellSize);

    // If any of the 4 corners of the bounding box is in a solid cell, there's a collision
    if (grid.getCell(left, top) === 1 || grid.getCell(left, top) === 2 ||
      grid.getCell(right, top) === 1 || grid.getCell(right, top) === 2 ||
      grid.getCell(left, bottom) === 1 || grid.getCell(left, bottom) === 2 ||
      grid.getCell(right, bottom) === 1 || grid.getCell(right, bottom) === 2) {
      return true;
    }
    return false;
  }

  processIntent(grid, game) {
    if (!this.isHuman || !game) return;

    this.dx = 0;
    this.dy = 0;

    const keys = game.keys;
    if (keys['ArrowUp'] || keys['w']) this.dy = -1;
    else if (keys['ArrowDown'] || keys['s']) this.dy = 1;
    else if (keys['ArrowLeft'] || keys['a']) this.dx = -1;
    else if (keys['ArrowRight'] || keys['d']) this.dx = 1;
  }

  placeBomb(game) {
    if (this.bombsPlaced >= this.maxBombs || !this.alive) return;

    // Check if a bomb already exists at (x, y)
    const existingBomb = game.bombs.find(b => b.x === this.x && b.y === this.y);
    if (!existingBomb) {
      const bomb = new Bomb(this.x, this.y, game.grid, this);
      bomb.onExplode = (tiles) => game.handleExplosion(bomb, tiles);
      game.bombs.push(bomb);
      this.bombsPlaced++;
      this.totalBombsPlaced++;
    }
  }
}
