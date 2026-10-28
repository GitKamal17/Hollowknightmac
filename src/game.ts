import type { InputState } from './core/input';
import { DT } from './core/tuning';
import { Playtest } from './world/playtest';
import { clearSave, loadSave, newSave, type KV } from './world/save';
import { World } from './world/world';

export interface AudioLike {
  play(name: string): void;
  startAmbient(): void;
  toggleMute(): boolean;
  readonly muted: boolean;
}

export type Scene = 'title' | 'play' | 'pause';

export interface GameOptions {
  /** Record a playtest log (`?telemetry`). */
  telemetry?: boolean;
  /** Hand the exported playtest log to the browser as a file. */
  download?: (filename: string, text: string) => void;
}

/** Top-level scene flow: title menu, play, pause. */
export class Game {
  scene: Scene = 'title';
  world: World | null = null;
  menu = 0;
  pauseMenu = 0;
  showControls = false;
  time = 0;
  hasSave: boolean;
  /** Shown under the pause menu, e.g. after an export. */
  pauseNote = '';
  readonly playtest: Playtest | null;
  readonly pauseItems: string[];
  private download: GameOptions['download'];

  constructor(
    private store: KV | null,
    readonly audio: AudioLike,
    opts: GameOptions = {},
  ) {
    this.hasSave = loadSave(store) !== null;
    this.playtest = opts.telemetry ? new Playtest(store) : null;
    this.download = opts.download;
    this.pauseItems = this.playtest ? ['Resume', 'Export playtest', 'Quit to Title'] : ['Resume', 'Quit to Title'];
  }

  get titleItems(): string[] {
    return this.hasSave ? ['Continue', 'New Game', 'Controls'] : ['New Game', 'Controls'];
  }

  update(inp: InputState): void {
    this.time += DT;
    if (inp.pressed.mute) this.audio.toggleMute();
    switch (this.scene) {
      case 'title':
        this.updateTitle(inp);
        return;
      case 'play':
        if (inp.pressed.pause && !this.world!.modal && !this.world!.shop) {
          this.pause();
          this.audio.play('pause');
          return;
        }
        this.world!.update(inp);
        return;
      case 'pause':
        this.updatePause(inp);
        return;
    }
  }

  private confirmed(inp: InputState): boolean {
    return inp.pressed.confirm || inp.pressed.jump;
  }

  private updateTitle(inp: InputState): void {
    if (this.showControls) {
      if (this.confirmed(inp) || inp.pressed.pause) {
        this.showControls = false;
        this.audio.play('menu');
      }
      return;
    }
    const items = this.titleItems;
    if (inp.pressed.up) {
      this.menu = (this.menu + items.length - 1) % items.length;
      this.audio.play('menu');
    }
    if (inp.pressed.down) {
      this.menu = (this.menu + 1) % items.length;
      this.audio.play('menu');
    }
    if (!this.confirmed(inp)) return;
    const item = items[this.menu];
    if (item === 'Controls') {
      this.showControls = true;
      this.audio.play('menu');
    } else this.start(item === 'New Game');
  }

  start(fresh: boolean): void {
    if (fresh) clearSave(this.store);
    const save = fresh ? newSave() : (loadSave(this.store) ?? newSave());
    this.world = new World({
      save,
      store: this.store,
      sfx: (n) => this.audio.play(n),
      seed: (Date.now() & 0xffffff) | 1,
      playtest: this.playtest,
    });
    this.world.persist();
    this.scene = 'play';
    this.audio.play('confirm');
    this.audio.startAmbient();
  }

  private updatePause(inp: InputState): void {
    if (inp.pressed.pause) {
      this.scene = 'play';
      return;
    }
    const n = this.pauseItems.length;
    if (inp.pressed.up) this.pauseMenu = (this.pauseMenu + n - 1) % n;
    if (inp.pressed.down) this.pauseMenu = (this.pauseMenu + 1) % n;
    if (inp.pressed.up || inp.pressed.down) this.audio.play('menu');
    if (!this.confirmed(inp)) return;
    const item = this.pauseItems[this.pauseMenu];
    if (item === 'Resume') {
      this.scene = 'play';
    } else if (item === 'Export playtest') {
      this.exportPlaytest();
    } else {
      this.world?.persist();
      this.world = null;
      this.scene = 'title';
      this.hasSave = loadSave(this.store) !== null;
      this.menu = 0;
    }
    this.audio.play('confirm');
  }

  private pause(): void {
    this.scene = 'pause';
    this.pauseMenu = 0;
    this.pauseNote = '';
    this.playtest?.flush();
  }

  /** Download the playtest log as JSON. */
  exportPlaytest(): void {
    if (!this.playtest) return;
    const d = new Date();
    const pad = (n: number): string => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
    const name = `gloamwell-playtest-${stamp}.json`;
    this.download?.(name, this.playtest.export());
    this.pauseNote = `Saved ${name}`;
  }

  /** Called when the window loses focus. */
  autoPause(): void {
    if (this.scene === 'play' && !this.world?.modal) this.pause();
  }
}
