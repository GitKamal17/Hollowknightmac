export const ACTIONS = [
  'left',
  'right',
  'up',
  'down',
  'jump',
  'attack',
  'dash',
  'heal',
  'pause',
  'confirm',
  'mute',
  'map',
] as const;

export type Action = (typeof ACTIONS)[number];
export type ActionFlags = Record<Action, boolean>;

/** What the simulation sees for one fixed step. */
export interface InputState {
  held: ActionFlags;
  pressed: ActionFlags;
}

export function flags(on: readonly Action[] = []): ActionFlags {
  const f = {} as ActionFlags;
  for (const a of ACTIONS) f[a] = on.includes(a);
  return f;
}

export function makeInput(held: readonly Action[] = [], pressed: readonly Action[] = []): InputState {
  // Anything pressed this step is also held this step.
  return { held: flags([...held, ...pressed]), pressed: flags(pressed) };
}

export const NO_INPUT: InputState = makeInput();
