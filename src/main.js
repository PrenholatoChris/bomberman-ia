import { Game } from './engine/Game.js';
import { GeneticAlgorithm } from './ai/GeneticAlgorithm.js';
import { Agent } from './ai/Agent.js';

export const GLOBAL_VARS = {
  gridWidth: 15,
  gridHeight: 13,
  inputChannels: 5,
  hiddenLayers: 2,
  hiddenSize: 16,
  populationSize: 100
};
const canvas = document.getElementById('gameCanvas');
const btnPlay = document.getElementById('btnPlay');
const btnTrain = document.getElementById('btnTrain');
const btnStropTraining = document.getElementById('btnStropTraining');

const game = new Game(canvas);
let ga = null;
let isTraining = false;

// Stats UI
const statsDiv = document.getElementById('stats');
const genText = document.getElementById('genText');
const progText = document.getElementById('progText');
const fitText = document.getElementById('fitText');

// Speed UI
const speedInput = document.getElementById('speedInput');
speedInput.addEventListener('input', (e) => {
  game.gameSpeed = parseFloat(e.target.value) || 1;
});

btnPlay.addEventListener('click', (e) => {
  if (isTraining) return; // Prevent mixing modes
  e.target.blur(); // Prevent spacebar from clicking again
  game.startSinglePlayer();
});

btnTrain.addEventListener('click', async (e) => {
  if (isTraining) return;
  isTraining = true;
  e.target.blur();
  ga = new GeneticAlgorithm(GLOBAL_VARS.populationSize, canvas);
  statsDiv.style.display = 'block';

  // Run training loop indefinitely
  while (isTraining) {
    genText.innerText = ga.generation;

    await ga.evaluateGeneration((current, total) => {
      progText.innerText = `${current}/${total}`;
    });

    fitText.innerText = Math.round(ga.bestFitness);
  }
});

btnStropTraining.addEventListener('click', (e) => {
  if (!isTraining) return;
  isTraining = false;
  //save the best agent (weights ) to a file
  const serializedWeights = ga.bestAgentWeights ? ga.bestAgentWeights.map(t => Array.from(t.dataSync())) : [];
  const blob = new Blob([JSON.stringify(serializedWeights)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `best_agent_gen_${ga.generation}.json`;
  a.click();
  URL.revokeObjectURL(url);
  e.target.blur();
});

function playBestAgent(weights) {
  // Stop previous game
  game.isRunning = false;

  // Set up new game
  game.grid.generateLevel();
  game.players = [];
  game.bombs = [];
  game.explosions = [];

  // Spawn 4 copies of the Best AI in the corners
  const spawns = [
    { x: 1, y: 1 },
    { x: game.gridWidth - 2, y: 1 },
    { x: 1, y: game.gridHeight - 2 },
    { x: game.gridWidth - 2, y: game.gridHeight - 2 }
  ];

  for (let i = 0; i < 4; i++) {
    const ai = new Agent(spawns[i].x, spawns[i].y, `BestAI_${i}`, weights);
    ai.px = spawns[i].x * game.gridSize + 5;
    ai.py = spawns[i].y * game.gridSize + 5;
    game.players.push(ai);
  }

  // We need to import Agent at the top for this to work

  game.isRunning = true;
  game.lastTime = 0;
  if (game.gameLoopId) cancelAnimationFrame(game.gameLoopId);
  game.gameLoopId = requestAnimationFrame((t) => game.loop(t));
}
