import { Agent, TFNeuralNetwork } from './Agent.js';
import { Game } from '../engine/Game.js';
import * as tf from '@tensorflow/tfjs';
import { GLOBAL_VARS } from '../main.js';

export class GeneticAlgorithm {
  constructor(populationSize, gameCanvas) {
    this.populationSize = populationSize;
    this.canvas = gameCanvas;

    this.inputSize = GLOBAL_VARS.gridWidth * GLOBAL_VARS.gridHeight * GLOBAL_VARS.inputChannels;
    this.hiddenLayers = GLOBAL_VARS.hiddenLayers;
    this.hiddenSize = GLOBAL_VARS.hiddenSize;
    this.outputSize = 6;

    this.population = [];
    this.generation = 1;
    this.bestFitness = 0;
    this.bestAgentWeights = null;
    this.initPopulation();
  }

  initPopulation() {
    for (let i = 0; i < this.populationSize; i++) {
      tf.tidy(() => {
        const dummy = new TFNeuralNetwork(this.inputSize, this.hiddenLayers, this.hiddenSize, this.outputSize);
        // We MUST use tf.keep so the tensors survive the tidy disposal
        const genome = dummy.getWeights().map(t => tf.keep(t.clone()));
        this.population.push(genome);
      });
    }
  }

  // Run a full generation
  async evaluateGeneration(onProgress) {
    const scores = [];

    // Shuffle indices for random 4-player matchmaking
    const indices = Array.from({ length: this.populationSize }, (_, i) => i);
    indices.sort(() => Math.random() - 0.5);

    // 1. Play exactly ONE match visually on the main canvas so the user can watch the training
    const visualGenomes = [
      this.population[indices[0]],
      this.population[indices[1]],
      this.population[indices[2]],
      this.population[indices[3]]
    ];
    const visualScores = await this.simulateVisual4Players(visualGenomes, this.canvas);
    for (let j = 0; j < 4; j++) {
      scores.push({ genome: visualGenomes[j], score: visualScores[j] });
    }
    if (onProgress) onProgress(4, this.populationSize);

    // 2. Evaluate everyone else headlessly in the background
    for (let i = 4; i < this.populationSize; i += 4) {
      const matchGenomes = [
        this.population[indices[i]],
        this.population[indices[i + 1]],
        this.population[indices[i + 2]],
        this.population[indices[i + 3]]
      ];
      const matchScores = await this.simulateHeadless4Players(matchGenomes);
      for (let j = 0; j < 4; j++) {
        scores.push({ genome: matchGenomes[j], score: matchScores[j] });
      }
      if (onProgress) onProgress(i + 4, this.populationSize);
    }

    // Sort by fitness (descending)
    scores.sort((a, b) => b.score - a.score);

    if (scores[0].score > this.bestFitness) {
      this.bestFitness = scores[0].score;
      // Save best weights detached from graph context
      if (this.bestAgentWeights) {
        this.bestAgentWeights.forEach(t => t.dispose());
      }
      this.bestAgentWeights = [];
      scores[0].genome.forEach(t => this.bestAgentWeights.push(t.clone()));
    }

    console.log(`Generation ${this.generation} completed. Best Score: ${scores[0].score}`);

    this.population = this.nextGeneration(scores);
    this.generation++;

    return scores[0].score; // Return best score of generation
  }

  // Start a headless simulation loop
  simulateHeadless4Players(genomes) {
    return new Promise(resolve => {
      const simCanvas = document.createElement('canvas');
      const game = new Game(simCanvas, true);

      game.grid.generateLevel();

      const spawns = [
        { x: 1, y: 1 },
        { x: game.gridWidth - 2, y: 1 },
        { x: 1, y: game.gridHeight - 2 },
        { x: game.gridWidth - 2, y: game.gridHeight - 2 }
      ];

      const agents = [];
      for (let i = 0; i < 4; i++) {
        const p = new Agent(spawns[i].x, spawns[i].y, `AI_${i}`, genomes[i]);
        p.px = spawns[i].x * game.gridSize + 5;
        p.py = spawns[i].y * game.gridSize + 5;
        game.players.push(p);
        agents.push(p);
      }

      let ticks = 0;
      const MAX_TICKS = 500;

      while (ticks < MAX_TICKS && agents.filter(a => a.alive).length > 1) {
        game.update(16);
        ticks++;
      }

      const fitnesses = agents.map(a => a.calculateFitness());
      resolve(fitnesses);
    });
  }

  simulateVisual4Players(genomes, canvas) {
    return new Promise(resolve => {
      const game = new Game(canvas, false);
      game.grid.generateLevel();

      const spawns = [
        { x: 1, y: 1 },
        { x: game.gridWidth - 2, y: 1 },
        { x: 1, y: game.gridHeight - 2 },
        { x: game.gridWidth - 2, y: game.gridHeight - 2 }
      ];

      const agents = [];
      for (let i = 0; i < 4; i++) {
        const p = new Agent(spawns[i].x, spawns[i].y, `AI_${i}`, genomes[i]);
        p.px = spawns[i].x * game.gridSize + 5;
        p.py = spawns[i].y * game.gridSize + 5;
        game.players.push(p);
        agents.push(p);
      }

      let ticks = 0;
      const MAX_TICKS = 2000;
      let lastTime = performance.now();

      const frame = (t) => {
        const dt = t - lastTime;
        lastTime = t;

        const speedInput = document.getElementById('speedInput');
        game.gameSpeed = speedInput ? parseFloat(speedInput.value) || 1 : 1;

        game.accumulator += dt * game.gameSpeed;
        while (game.accumulator >= 16) {
          game.update(16);
          game.accumulator -= 16;
          ticks++;

          if (agents.filter(a => a.alive).length <= 1 || ticks >= MAX_TICKS) {
            const fitnesses = agents.map(a => a.calculateFitness());
            resolve(fitnesses);
            return;
          }
        }

        game.render();
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }

  nextGeneration(scoredPopulation) {
    const nextPop = [];
    const elites = 2; // Keep top 2 without mutation

    tf.tidy(() => {
      // Elitism
      for (let i = 0; i < elites; i++) {
        const cloned = scoredPopulation[i].genome.map(t => tf.keep(t.clone()));
        nextPop.push(cloned);
      }

      // Fill the rest with crossover + mutation
      while (nextPop.length < this.populationSize) {
        const parentA = this.tournamentSelection(scoredPopulation);
        const parentB = this.tournamentSelection(scoredPopulation);

        const child = this.crossover(parentA, parentB);
        const mutatedChild = this.mutate(child);

        nextPop.push(mutatedChild.map(t => tf.keep(t)));
      }
    });

    // Dispose old population tensors
    scoredPopulation.forEach(s => s.genome.forEach(t => t.dispose()));

    return nextPop;
  }

  tournamentSelection(scoredPopulation) {
    const tournamentSize = 3;
    let best = null;
    for (let i = 0; i < tournamentSize; i++) {
      const candidate = scoredPopulation[Math.floor(Math.random() * scoredPopulation.length)];
      if (!best || candidate.score > best.score) {
        best = candidate;
      }
    }
    return best.genome;
  }

  crossover(parentA, parentB) {
    return parentA.map((wA, idx) => {
      const wB = parentB[idx];
      const shape = wA.shape;
      const valA = wA.dataSync();
      const valB = wB.dataSync();
      const numElements = valA.length;

      const childVal = new Float32Array(numElements);
      const crossoverPoint = Math.floor(Math.random() * numElements);

      for (let i = 0; i < numElements; i++) {
        childVal[i] = i < crossoverPoint ? valA[i] : valB[i];
      }
      return tf.tensor(childVal, shape);
    });
  }

  mutate(genome) {
    const mutationRate = 0.05; // Drop back to 5%. 80% is pure random noise!
    const mutationStrength = 1.0;

    return genome.map(tensor => {
      const shape = tensor.shape;
      const values = tensor.dataSync();
      const newValues = new Float32Array(values.length);

      for (let i = 0; i < values.length; i++) {
        if (Math.random() < mutationRate) {
          let val = values[i] + (Math.random() * 2 - 1) * mutationStrength;
          // Clamp weights
          if (val > 10) val = 10;
          if (val < -10) val = -10;
          newValues[i] = val;
        } else {
          newValues[i] = values[i];
        }
      }
      return tf.tensor(newValues, shape);
    });
  }
}
