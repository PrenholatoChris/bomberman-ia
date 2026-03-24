import { Player } from './Player.js';

export class Bot extends Player {
  constructor(x, y, id) {
    super(x, y, id, false); // isHuman = false
    this.color = '#FF5722'; // Bots are orange/red
    this.speed = 3; // Bots are slightly slower

    // AI state
    this.moveTimer = 0;
    this.currentDir = { dx: 0, dy: 0 };
    this.dirs = [
      { dx: 0, dy: -1 }, // Up
      { dx: 0, dy: 1 },  // Down
      { dx: -1, dy: 0 }, // Left
      { dx: 1, dy: 0 },  // Right
    ];
  }

  processIntent(grid, game) {
    // Simple AI: Move in a direction for a while, then pick a new one
    // Also change direction if colliding
    this.moveTimer -= 16; // Approx 60fps dt

    if (this.moveTimer <= 0 || this.isBlocked(grid)) {
      // Pick a random valid direction
      const validDirs = this.dirs.filter(dir => !this.checkCollision(this.px + dir.dx * this.speed, this.py + dir.dy * this.speed, grid));

      if (validDirs.length > 0) {
        this.currentDir = validDirs[Math.floor(Math.random() * validDirs.length)];
      } else {
        this.currentDir = { dx: 0, dy: 0 }; // Stuck
      }

      this.dx = this.currentDir.dx;
      this.dy = this.currentDir.dy;
      this.moveTimer = 500 + Math.random() * 1000; // Move for 0.5s to 1.5s
    }
    //make it put a bomb from time to time 
    if (Math.random() < 0.01 && game) {
      this.placeBomb(game);
    }
  }

  isBlocked(grid) {
    return this.checkCollision(this.px + this.dx * this.speed, this.py + this.dy * this.speed, grid);
  }
}
