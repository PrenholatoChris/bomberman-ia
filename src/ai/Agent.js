import { Player } from '../entities/Player.js';
import * as tf from '@tensorflow/tfjs';
import { GLOBAL_VARS } from '../main.js';

export class TFNeuralNetwork {
  constructor(inputSize, hiddenLayers, hiddenSize, outputSize, weightsTensors = null) {
    this.model = tf.sequential();

    // First hidden layer
    this.model.add(tf.layers.dense({
      units: hiddenSize,
      inputShape: [inputSize],
      activation: 'relu'
    }));

    // Additional hidden layers
    for (let i = 1; i < hiddenLayers; i++) {
      this.model.add(tf.layers.dense({
        units: hiddenSize,
        activation: 'relu'
      }));
    }

    // Output layer
    this.model.add(tf.layers.dense({
      units: outputSize,
      activation: 'linear'
    }));

    if (weightsTensors) {
      const isRawArrays = weightsTensors.length > 0 && Array.isArray(weightsTensors[0]);
      if (isRawArrays) {
        const shapes = this.model.getWeights().map(w => w.shape);
        const tensorWeights = weightsTensors.map((wArray, i) => tf.tensor(wArray, shapes[i]));
        this.model.setWeights(tensorWeights);
      } else {
        this.model.setWeights(weightsTensors);
      }
    }
  }

  predict(inputsArray) {
    return tf.tidy(() => {
      const inputTensor = tf.tensor2d([inputsArray]);
      const prediction = this.model.predict(inputTensor);
      return Array.from(prediction.dataSync());
    });
  }

  getWeights() {
    return this.model.getWeights();
  }

  dispose() {
    this.model.dispose();
  }
}

export class Agent extends Player {
  constructor(x, y, id, weights = null) {
    super(x, y, id, false);
    this.color = '#9C27B0'; // Purple for AI

    // Inputs channels: isWall, isDestructible, isEnemy, isBomb, isSelf

    this.gridWidth = GLOBAL_VARS.gridWidth;
    this.gridHeight = GLOBAL_VARS.gridHeight;
    this.inputSize = this.gridWidth * this.gridHeight * GLOBAL_VARS.inputChannels;

    this.nn = new TFNeuralNetwork(this.inputSize, GLOBAL_VARS.hiddenLayers, GLOBAL_VARS.hiddenSize, 6, weights);

    this.fitness = 0;
    this.survivalTime = 0;
    this.blocksDestroyed = 0;
    this.enemiesKilled = 0;
    this.uniqueTiles = new Set();

    this.actionCooldown = 0;
  }

  processIntent(grid, game) {
    this.survivalTime++;
    this.uniqueTiles.add(`${this.x},${this.y}`);

    if (this.actionCooldown <= 0) {
      this.makeDecision(grid, game);
      this.actionCooldown = 15; // Decisions every ~0.25 seconds
    } else {
      this.actionCooldown--;
    }
  }

  getInputs(grid, game) {
    const inputs = [];

    for (let gy = 0; gy < this.gridHeight; gy++) {
      for (let gx = 0; gx < this.gridWidth; gx++) {
        const cell = grid.getCell(gx, gy);

        const isWall = cell === 1 ? 1 : 0;
        const isDestructible = cell === 2 ? 1 : 0;

        let isEnemy = 0;
        let isSelf = 0;
        for (const p of game.players) {
          if (p.alive && p.x === gx && p.y === gy) {
            if (p === this) isSelf = 1;
            else isEnemy = 1;
          }
        }

        let isBomb = 0;
        for (const b of game.bombs) {
          if (b.x === gx && b.y === gy) {
            isBomb = 1;
            break;
          }
        }
        if (isBomb === 0) {
          for (const e of game.explosions) {
            if (e.x === gx && e.y === gy) {
              isBomb = 1;
              break;
            }
          }
        }

        inputs.push(isWall, isDestructible, isEnemy, isBomb, isSelf);
      }
    }

    return inputs;
  }

  makeDecision(grid, game) {
    const inputs = this.getInputs(grid, game);
    const outputs = this.nn.predict(inputs);

    const maxIdx = outputs.indexOf(Math.max(...outputs));

    this.dx = 0;
    this.dy = 0;

    if (maxIdx === 0) this.dy = -1; // Up
    else if (maxIdx === 1) this.dy = 1;  // Down
    else if (maxIdx === 2) this.dx = -1; // Left
    else if (maxIdx === 3) this.dx = 1;  // Right
    else if (maxIdx === 4) this.placeBomb(game); // Bomb
    // 5 is wait
  }

  calculateFitness() {
    let winBonus = this.alive && this.enemiesKilled > 0 ? 5000 : 0;

    // De-value pure survival to stop agents from hiding safely in corners.
    // Extremely heavily value exploration (unique tiles) and actions (bombs, kills)
    this.fitness = (this.survivalTime * 0.1) +
      (this.blocksDestroyed * 500) +
      (this.enemiesKilled * 1000) +
      (this.uniqueTiles.size * 200) +
      (this.totalBombsPlaced * 300) +
      (this.walks * 100) +
      winBonus;

    //punish them for living too long
    if (this.survivalTime > 1000) {
      this.fitness -= (this.survivalTime * 0.1);
    }

    // Punish them for repeatedly walking blindly into solid walls to force them to learn to turn
    if (this.wallHits) {
      this.fitness -= (this.wallHits * 300);
    }

    // Prevent negative fitness which breaks tournament selection
    return Math.max(1, this.fitness);
  }

  dispose() {
    this.nn.dispose();
  }
}
