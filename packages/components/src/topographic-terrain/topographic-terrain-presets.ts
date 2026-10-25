import type { TopographicGradientColors } from '../topographic-flow/topographic-renderer';

export type TopographicTerrainGradientColors = TopographicGradientColors;

export const topographicTerrainDefaults = {
  animateEntrance: true,
  scale: 400,
  density: 6,
  speed: 1.5,
  distortion: 2.4,
  lineWidth: 0.5,
  opacity: 0,
  seed: 42,
  gradientDiffusion: 0,
  surfaceColor: '#ffffff',
  shadowColor: '#737373',
  shadowAnimation: 'none' as 'none' | 'rgb',
  shadowCycleDuration: 6,
  elevation: 160,
  cameraTilt: 38,
  cameraRotation: -20,
  cameraZoom: 1,
  terraceSoftness: 0.6,
  lightingBlend: 0,
  lightDirection: 315,
  lightIntensity: 1,
  hover: 0.45,
  hoverRadius: 200,
  hoverFollow: 0.16,
  hoverFade: 0.8,
  grain: 0.2,
  paused: false,
  backgroundColor: '#ffffff',
  backgroundImage: 'none',
  gradientColors: [] as TopographicTerrainGradientColors,
  lineColor: '#000000',
  accentColor: '#000000',
};

const terraced = { ...topographicTerrainDefaults };
const slate = {
  ...terraced,
  backgroundColor: '#000000',
  surfaceColor: '#000000',
  shadowColor: '#9d9d9d',
  lineColor: '#ffffff',
  accentColor: '#ffffff',
};

const blackColor = (shadowColor: string, shadowAnimation: 'none' | 'rgb' = 'none') => ({
  ...slate,
  shadowColor,
  shadowAnimation,
});
const red = blackColor('#ff0000');
const blue = blackColor('#0000ff');
const cyan = blackColor('#00ffff');
const green = blackColor('#00ff00');
const magenta = blackColor('#ff00ff');
const yellow = blackColor('#ffff00');
const rgb = blackColor('#ff0000', 'rgb');

export const topographicTerrainPresets = {
  terraced,
  slate,
  'terraced-top': { ...terraced, cameraTilt: 0 },
  'slate-top': { ...slate, cameraTilt: 0 },
  'slate-red': red,
  'slate-red-top': { ...red, cameraTilt: 0 },
  'slate-blue': blue,
  'slate-blue-top': { ...blue, cameraTilt: 0 },
  'slate-cyan': cyan,
  'slate-cyan-top': { ...cyan, cameraTilt: 0 },
  'slate-green': green,
  'slate-green-top': { ...green, cameraTilt: 0 },
  'slate-magenta': magenta,
  'slate-magenta-top': { ...magenta, cameraTilt: 0 },
  'slate-yellow': yellow,
  'slate-yellow-top': { ...yellow, cameraTilt: 0 },
  'slate-rgb': rgb,
  'slate-rgb-top': { ...rgb, cameraTilt: 0 },
};
export type TopographicTerrainPreset = keyof typeof topographicTerrainPresets;
