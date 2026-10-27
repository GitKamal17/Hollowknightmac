export interface Theme {
  skyTop: string;
  skyBottom: string;
  far: string;
  mid: string;
  rock: string;
  rockLight: string;
  moss: string;
  accent: string;
  /** Shaft-of-light colour, as an "r,g,b" triple for building rgba(). */
  beam: string;
}

export const THEMES: Record<string, Theme> = {
  gate: { skyTop: '#1d2740', skyBottom: '#0a0e19', far: '#26314d', mid: '#161e33', rock: '#0a0d15', rockLight: '#3d4b6d', moss: '#86a6bd', accent: '#a9cbff', beam: '170,200,255' },
  roots: { skyTop: '#15302a', skyBottom: '#071210', far: '#1f4236', mid: '#122a22', rock: '#07100d', rockLight: '#2f5d4a', moss: '#7fcaa0', accent: '#a8f5c8', beam: '160,240,200' },
  shaft: { skyTop: '#171e3a', skyBottom: '#060810', far: '#212a52', mid: '#121833', rock: '#070912', rockLight: '#36427a', moss: '#808dd2', accent: '#b0bcff', beam: '170,180,255' },
  lantern: { skyTop: '#2e2019', skyBottom: '#0d0908', far: '#3f2e24', mid: '#231914', rock: '#0c0908', rockLight: '#5f4836', moss: '#e0ae70', accent: '#ffd38a', beam: '255,210,150' },
  thorns: { skyTop: '#2a1a38', skyBottom: '#0b0711', far: '#392650', mid: '#21172f', rock: '#0b0811', rockLight: '#4e3a6c', moss: '#bd97de', accent: '#e6c0ff', beam: '220,180,255' },
  shrine: { skyTop: '#18363f', skyBottom: '#071315', far: '#224852', mid: '#142d34', rock: '#061013', rockLight: '#3e727d', moss: '#a3e7f1', accent: '#d0f8ff', beam: '190,245,255' },
  gap: { skyTop: '#141838', skyBottom: '#04050d', far: '#1d224b', mid: '#10132d', rock: '#05060d', rockLight: '#2e366b', moss: '#7381cf', accent: '#98a8ff', beam: '150,165,255' },
  descent: { skyTop: '#2a1612', skyBottom: '#0b0605', far: '#3b2119', mid: '#21120e', rock: '#0b0606', rockLight: '#5a3022', moss: '#c97a50', accent: '#ffb07a', beam: '255,170,120' },
  market: { skyTop: '#2b2416', skyBottom: '#0d0b07', far: '#3e3420', mid: '#251f13', rock: '#0c0a06', rockLight: '#62533a', moss: '#e3c27a', accent: '#ffdc8a', beam: '255,220,150' },
  spires: { skyTop: '#1c2b33', skyBottom: '#060b0e', far: '#2a4049', mid: '#16252c', rock: '#060b0d', rockLight: '#3f6672', moss: '#94d6c8', accent: '#b8fff0', beam: '180,255,240' },
  nest: { skyTop: '#2f2a20', skyBottom: '#0d0b08', far: '#45392a', mid: '#262017', rock: '#0c0a07', rockLight: '#6b5a40', moss: '#f0dca0', accent: '#fff0c0', beam: '255,240,200' },
  cache: { skyTop: '#132838', skyBottom: '#050c12', far: '#1c3a50', mid: '#10222f', rock: '#050b10', rockLight: '#2f5f7c', moss: '#8fd3ff', accent: '#c8efff', beam: '160,220,255' },
  heights: { skyTop: '#22263f', skyBottom: '#080912', far: '#2f3558', mid: '#1a1e36', rock: '#070812', rockLight: '#454f86', moss: '#a7b4f0', accent: '#d0d8ff', beam: '200,210,255' },
  duel: { skyTop: '#241a38', skyBottom: '#08060f', far: '#33264e', mid: '#1d152e', rock: '#08060e', rockLight: '#4d3d78', moss: '#b8a0ec', accent: '#d8c4ff', beam: '210,190,255' },
  arena: { skyTop: '#301712', skyBottom: '#0c0504', far: '#44221a', mid: '#26120d', rock: '#0c0605', rockLight: '#653325', moss: '#e08b5c', accent: '#ffa36a', beam: '255,170,120' },
};

export const themeFor = (key: string): Theme => THEMES[key] ?? THEMES.gate;
