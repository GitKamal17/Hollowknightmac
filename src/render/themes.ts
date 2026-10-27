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
  arena: { skyTop: '#301712', skyBottom: '#0c0504', far: '#44221a', mid: '#26120d', rock: '#0c0605', rockLight: '#653325', moss: '#e08b5c', accent: '#ffa36a', beam: '255,170,120' },
};

export const themeFor = (key: string): Theme => THEMES[key] ?? THEMES.gate;
