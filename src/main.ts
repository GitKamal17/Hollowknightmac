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
// `?debug` exposes hooks for automated playtests and shows FPS; `?hitboxes` draws collision boxes;
// `?telemetry` records a playtest log, exported from the pause menu.
const params = new URLSearchParams(location.search);
const game = new Game(browserStorage(), audio, { telemetry: params.has('telemetry'), download });
const renderer = new Renderer(canvas);

window.addEventListener('blur', () => game.autoPause());
window.addEventListener('pagehide', () => game.playtest?.flush());
canvas.focus();

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

function download(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

runLoop(
  () => game.update(input.poll()),
  (alpha) => renderer.render(game, alpha),
);
