export class Grid {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.cellSize = 40; // 40px per cell
    this.cells = Array(height).fill(null).map(() => Array(width).fill(0));
    // 0 = empty, 1 = solid wall, 2 = destructible block
  }

  generateLevel() {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        // Borders are solid walls
        if (x === 0 || y === 0 || x === this.width - 1 || y === this.height - 1) {
          this.cells[y][x] = 1;
        } 
        // Inner pillars
        else if (x % 2 === 0 && y % 2 === 0) {
          this.cells[y][x] = 1;
        }
        // Random destructible blocks (avoiding spawn corners)
        else {
          if (!this.isSafeZone(x, y) && Math.random() < 0.6) {
            this.cells[y][x] = 2; // Destructible block
          }
        }
      }
    }
  }

  isSafeZone(x, y) {
    // Top left, top right, bottom left, bottom right corners (plus adjacent cells)
    const corners = [
      [{x: 1, y: 1}, {x: 2, y: 1}, {x: 1, y: 2}],
      [{x: this.width - 2, y: 1}, {x: this.width - 3, y: 1}, {x: this.width - 2, y: 2}],
      [{x: 1, y: this.height - 2}, {x: 2, y: this.height - 2}, {x: 1, y: this.height - 3}],
      [{x: this.width - 2, y: this.height - 2}, {x: this.width - 3, y: this.height - 2}, {x: this.width - 2, y: this.height - 3}]
    ];

    for (const corner of corners) {
      for (const cell of corner) {
        if (x === cell.x && y === cell.y) return true;
      }
    }
    return false;
  }

  getCell(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 1; // Out of bounds is wall
    return this.cells[y][x];
  }

  setCell(x, y, value) {
    if (x >= 0 && y >= 0 && x < this.width && y < this.height) {
      this.cells[y][x] = value;
    }
  }
}
