export class Bomb {
  constructor(x, y, grid, owner) {
    this.x = x;
    this.y = y;
    this.grid = grid;
    this.owner = owner;
    this.exploded = false;
    this.range = owner.bombRange;
    this.fuseTime = 3000; // 3 seconds
    this.timer = this.fuseTime;
    
    // Pixel sizing
    this.px = x * grid.cellSize + (grid.cellSize - 30) / 2;
    this.py = y * grid.cellSize + (grid.cellSize - 30) / 2;
    this.size = 30;

  }

  update(dt) {
    if (this.exploded) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.explode();
    }
  }

  explode() {
    if (this.exploded) return;
    this.exploded = true;
    this.owner.bombsPlaced--;

    const explosions = [{x: this.x, y: this.y}]; // Center

    // Directions: Up, Down, Left, Right
    const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]];

    for (const [dx, dy] of dirs) {
      for (let i = 1; i <= this.range; i++) {
        const nx = this.x + dx * i;
        const ny = this.y + dy * i;
        const cell = this.grid.getCell(nx, ny);

        if (cell === 1) break; // Solid wall blocks explosion

        explosions.push({x: nx, y: ny});

        if (cell === 2) {
          // Destructible block destroyed, stops explosion
          this.grid.setCell(nx, ny, 0); 
          if (this.owner.blocksDestroyed !== undefined) {
             this.owner.blocksDestroyed++;
          }
          break;
        }
      }
    }

    // Pass explosions back to Game to handle rendering/killing
    if (this.onExplode) {
      this.onExplode(explosions);
    }
  }

  forceExplode() {
    this.explode();
  }
}
