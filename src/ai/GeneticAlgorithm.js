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
    this.avgFitness = 0;
    this.bestAgentWeights = null;
    this.initPopulation();
  }

  initPopulation() {
    for (let i = 0; i < this.populationSize; i++) {
      tf.tidy(() => {
        const dummy = new TFNeuralNetwork(this.inputSize, this.hiddenLayers, this.hiddenSize, this.outputSize);
        // tf.keep ensures tensors survive the tidy disposal
        const genome = dummy.getWeights().map(t => tf.keep(t.clone()));
        this.population.push(genome);
      });
    }
  }

  // ─── Evaluate one full generation ───────────────────────────────────────────
  async evaluateGeneration(onProgress) {
    const scores = [];

    // Shuffle population indices for random matchmaking
    const indices = Array.from({ length: this.populationSize }, (_, i) => i);
    indices.sort(() => Math.random() - 0.5);

    const totalGroups = Math.ceil(this.populationSize / 4);

    for (let g = 0; g < totalGroups; g++) {
      // Build a group of 4 (pad with random agents if the last group is short)
      const matchGenomes = [];
      const actualCount = Math.min(4, this.populationSize - g * 4);
      for (let j = 0; j < 4; j++) {
        if (j < actualCount) {
          matchGenomes.push(this.population[indices[g * 4 + j]]);
        } else {
          matchGenomes.push(this.population[Math.floor(Math.random() * this.populationSize)]);
        }
      }

      let matchScores;

      // Strategy 1 — visualise only the FIRST group per generation (≈1/totalGroups %)
      if (g === 0) {
        matchScores = await this.simulateVisual4Players(matchGenomes, this.canvas);
      } else {
        matchScores = await this.simulateHeadless4Players(matchGenomes);
      }

      for (let j = 0; j < actualCount; j++) {
        scores.push({
          genome: matchGenomes[j],
          score: matchScores[j].score,
          breakdown: matchScores[j].breakdown,
        });
      }

      if (onProgress) onProgress(Math.min((g + 1) * 4, this.populationSize), this.populationSize);
    }

    // ── Sort descending by fitness ──────────────────────────────────────────
    scores.sort((a, b) => b.score - a.score);

    // ── Track stats ────────────────────────────────────────────────────────
    const maxScore = scores[0].score;
    const avgScore = scores.reduce((s, e) => s + e.score, 0) / scores.length;
    this.avgFitness = avgScore;

    if (maxScore > this.bestFitness) {
      this.bestFitness = maxScore;
      if (this.bestAgentWeights) {
        this.bestAgentWeights.forEach(t => t.dispose());
      }
      this.bestAgentWeights = scores[0].genome.map(t => t.clone());
    }

    console.log(`Gen ${this.generation} | Best: ${maxScore.toFixed(0)} | Avg: ${avgScore.toFixed(0)}`);
    // if (scores[0].breakdown) {
    // console.table(scores[0].breakdown);
    // }

    this.population = this.nextGeneration(scores);
    this.generation++;

    return { best: maxScore, avg: avgScore };
  }

  // ─── Headless simulation ────────────────────────────────────────────────────
  simulateHeadless4Players(genomes) {
    return new Promise(resolve => {
      const simCanvas = document.createElement('canvas');
      const game = new Game(simCanvas, true);

      game.grid.generateLevel();

      const spawns = [
        { x: 1, y: 1 },
        { x: game.gridWidth - 2, y: 1 },
        { x: 1, y: game.gridHeight - 2 },
        { x: game.gridWidth - 2, y: game.gridHeight - 2 },
      ];

      const agents = [];
      for (let i = 0; i < 4; i++) {
        const p = new Agent(spawns[i].x, spawns[i].y, `AI_${i}`, genomes[i]);
        p.px = spawns[i].x * game.gridSize + 5;
        p.py = spawns[i].y * game.gridSize + 5;
        game.players.push(p);
        agents.push(p);
      }

      const MIN_TICKS = GLOBAL_VARS.minTicksPerMatch;
      const MAX_TICKS = GLOBAL_VARS.maxTicksPerMatch;
      let ticks = 0;

      while (ticks < MAX_TICKS) {
        game.update(16);
        ticks++;
        // Only allow early exit after the minimum floor has been reached
        if (ticks >= MIN_TICKS && agents.filter(a => a.alive).length <= 1) break;
      }

      const results = agents.map(a => ({ score: a.calculateFitness(), breakdown: a.fitnessBreakdown }));
      resolve(results);
    });
  }

  // ─── Visual simulation ──────────────────────────────────────────────────────
  simulateVisual4Players(genomes, canvas) {
    return new Promise(resolve => {
      const game = new Game(canvas, false);
      game.grid.generateLevel();

      const spawns = [
        { x: 1, y: 1 },
        { x: game.gridWidth - 2, y: 1 },
        { x: 1, y: game.gridHeight - 2 },
        { x: game.gridWidth - 2, y: game.gridHeight - 2 },
      ];

      const agents = [];
      for (let i = 0; i < 4; i++) {
        const p = new Agent(spawns[i].x, spawns[i].y, `AI_${i}`, genomes[i]);
        p.px = spawns[i].x * game.gridSize + 5;
        p.py = spawns[i].y * game.gridSize + 5;
        game.players.push(p);
        agents.push(p);
      }

      const MIN_TICKS = GLOBAL_VARS.minTicksPerMatch;
      const MAX_TICKS = GLOBAL_VARS.maxTicksPerMatch;
      let ticks = 0;
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

          const canEnd = ticks >= MIN_TICKS && (agents.filter(a => a.alive).length <= 1 || ticks >= MAX_TICKS);
          if (canEnd) {
            const results = agents.map(a => ({ score: a.calculateFitness(), breakdown: a.fitnessBreakdown }));
            resolve(results);
            return;
          }
        }

        game.render();
        requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
    });
  }

  // ─── Build next generation ──────────────────────────────────────────────────
  nextGeneration(scoredPopulation) {
    const nextPop = [];
    const eliteCount = Math.max(2, Math.round(this.populationSize * GLOBAL_VARS.elitismRate));

    // Strategy 3 — Elitism: clone top performers directly
    for (let i = 0; i < eliteCount; i++) {
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

    // Dispose old population tensors now that all children are built
    scoredPopulation.forEach(s => s.genome.forEach(t => t.dispose()));

    return nextPop;
  }

  // ─── Tournament selection (fixed: starts at i=0) ────────────────────────────
  tournamentSelection(scoredPopulation) {
    const tournamentSize = GLOBAL_VARS.tournamentSize;
    let best = null;
    for (let i = 0; i < tournamentSize; i++) {
      const candidate = scoredPopulation[Math.floor(Math.random() * scoredPopulation.length)];
      if (!best || candidate.score > best.score) {
        best = candidate;
      }
    }
    return best.genome;
  }

  // ─── Crossover ──────────────────────────────────────────────────────────────
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

  // ─── Mutation: 95% soft / 5% hard ───────────────────────────────────────────
  mutate(genome) {
    const isHard = Math.random() < GLOBAL_VARS.hardMutationChance;
    const mutationRate = isHard ? GLOBAL_VARS.hardMutationRate : GLOBAL_VARS.softMutationRate;
    const mutationStrength = isHard ? GLOBAL_VARS.hardMutationStrength : GLOBAL_VARS.softMutationStrength;

    return genome.map(tensor => {
      const shape = tensor.shape;
      const values = tensor.dataSync();
      const newValues = new Float32Array(values.length);

      for (let i = 0; i < values.length; i++) {
        if (Math.random() < mutationRate) {
          let val = values[i] + (Math.random() * 2 - 1) * mutationStrength;
          // Clamp weights to avoid exploding gradients
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
