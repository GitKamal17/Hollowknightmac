import { AudioFx } from './core/audio';
import { InputManager } from './core/input-dom';
import { runLoop } from './core/loop';
import { Game } from './game';
import { Renderer } from './render/renderer';
import { browserStorage } from './world/save';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const audio = new AudioFx();
const input = new InputManager(window);
input.onGesture = () => audio.unlock();
const game = new Game(browserStorage(), audio);
const renderer = new Renderer(canvas);

window.addEventListener('blur', () => game.autoPause());
canvas.focus();

// `?debug` exposes hooks for automated playtests and shows FPS; `?hitboxes` draws collision boxes.
const params = new URLSearchParams(location.search);
renderer.hitboxes = params.has('hitboxes');
if (params.has('debug')) {
  renderer.debug = true;
  Object.assign(window, {
    __gloam: {
      game,
      get world() {
        return game.world;
      },
      warp(room: string, door?: string) {
        game.world?.warp(room, door);
      },
      unlockDash() {
        if (game.world) game.world.save.dash = true;
      },
    },
  });
}

runLoop(
  () => game.update(input.poll()),
  (alpha) => renderer.render(game, alpha),
);
