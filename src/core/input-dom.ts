import { ACTIONS, flags, type Action, type ActionFlags, type InputState } from './input';

const KEYS: Record<string, Action[]> = {
  ArrowLeft: ['left'],
  ArrowRight: ['right'],
  ArrowUp: ['up'],
  ArrowDown: ['down'],
  KeyA: ['left'],
  KeyD: ['right'],
  KeyW: ['up'],
  KeyS: ['down'],
  KeyZ: ['jump'],
  Space: ['jump'],
  KeyJ: ['jump'],
  KeyX: ['attack'],
  KeyK: ['attack'],
  KeyC: ['dash'],
  KeyL: ['dash'],
  ShiftLeft: ['dash'],
  ShiftRight: ['dash'],
  KeyV: ['heal'],
  KeyI: ['heal'],
  Escape: ['pause'],
  KeyP: ['pause'],
  Enter: ['confirm'],
  KeyM: ['mute'],
  Tab: ['map'],
};

// Standard gamepad mapping (Xbox naming).
const PAD_BUTTONS: Partial<Record<number, Action[]>> = {
  0: ['jump', 'confirm'], // A
  1: ['heal'], // B
  2: ['attack'], // X
  5: ['dash'], // RB
  7: ['dash'], // RT
  8: ['map'], // Select / Back / View
  9: ['pause'], // Start
  12: ['up'],
  13: ['down'],
  14: ['left'],
  15: ['right'],
};

const STICK_DEADZONE = 0.4;

/**
 * Keyboard + gamepad. Presses are latched between polls, so a tap shorter than
 * one simulation step is never lost.
 */
export class InputManager {
  private keyHeld = new Set<string>();
  private latched = flags();
  private padPrev = flags();
  onGesture: (() => void) | null = null;

  constructor(target: Window) {
    target.addEventListener('keydown', (e) => {
      const acts = KEYS[e.code];
      if (acts) e.preventDefault();
      this.onGesture?.();
      if (e.repeat) return;
      this.keyHeld.add(e.code);
      if (acts) for (const a of acts) this.latched[a] = true;
    });
    target.addEventListener('keyup', (e) => {
      this.keyHeld.delete(e.code);
    });
    target.addEventListener('pointerdown', () => this.onGesture?.());
    target.addEventListener('blur', () => this.keyHeld.clear());
  }

  private padState(): ActionFlags {
    const f = flags();
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      pad.buttons.forEach((b, i) => {
        if (b.pressed) for (const a of PAD_BUTTONS[i] ?? []) f[a] = true;
      });
      const [ax = 0, ay = 0] = pad.axes;
      if (ax < -STICK_DEADZONE) f.left = true;
      if (ax > STICK_DEADZONE) f.right = true;
      if (ay < -STICK_DEADZONE) f.up = true;
      if (ay > STICK_DEADZONE) f.down = true;
    }
    return f;
  }

  poll(): InputState {
    const pad = this.padState();
    const held = flags();
    const pressed = flags();
    for (const code of this.keyHeld) for (const a of KEYS[code] ?? []) held[a] = true;
    for (const a of ACTIONS) {
      if (pad[a]) held[a] = true;
      pressed[a] = this.latched[a] || (pad[a] && !this.padPrev[a]);
      if (pressed[a]) held[a] = true;
    }
    this.padPrev = pad;
    this.latched = flags();
    return { held, pressed };
  }
}
