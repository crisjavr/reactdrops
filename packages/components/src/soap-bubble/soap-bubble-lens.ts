// The rim lens of the live glass: a displacement map per surface size in an
// SVG filter, added at the end of the surface's backdrop-filter through
// --soap-bubble-liquid-lens. Only Chromium draws url() in backdrop-filter;
// everywhere else the glass blurs and tints without bending.

const svgNamespace = 'http://www.w3.org/2000/svg';

type LensMap = { url: string; maxOffset: number };
const maps = new Map<string, Promise<LensMap>>();
let nextFilter = 0;

export type SoapBubbleLensSettings = {
  /** Width of the rim that bends, in pixels. */
  rimWidth: number;
  /** How far the rim bends the page. */
  bend: number;
  /** How far apart red, green and blue bend; 0 bends them as one. */
  split: number;
};

async function drawMap(width: number, height: number, radius: number, rim: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  const image = context.createImageData(width, height);
  const data = image.data;
  // The map holds the direction and falloff; Bend scales it in the filter.
  const maxOffset = rim;
  // It is symmetric about both axes: the top-left quarter is worked out and
  // the rest copied from it with the displacement turned round (128 + d
  // stored becomes 256 minus it, which rounds exactly as -d would).
  const halfWidth = Math.ceil(width / 2);
  const halfHeight = Math.ceil(height / 2);
  for (let y = 0; y < halfHeight; y++) {
    for (let x = 0; x < halfWidth; x++) {
      // Distance from the edge of the same rounded box the CSS draws.
      const px = x + 0.5 - width / 2;
      const py = y + 0.5 - height / 2;
      const qx = Math.abs(px) - (width / 2 - radius);
      const qy = Math.abs(py) - (height / 2 - radius);
      const outsideX = Math.max(qx, 0);
      const outsideY = Math.max(qy, 0);
      const corner = Math.hypot(outsideX, outsideY);
      const d = -(corner + Math.min(Math.max(qx, qy), 0) - radius);
      let dx = 0;
      let dy = 0;
      if (d >= 0 && d < rim) {
        // Hard at the edge, easing to nothing at the rim's inner edge.
        const offset = maxOffset * Math.pow(1 - d / rim, 2.6);
        const outwardX = corner > 0 ? outsideX / corner : qx > qy ? 1 : 0;
        const outwardY = corner > 0 ? outsideY / corner : qx > qy ? 0 : 1;
        dx = -Math.sign(px) * outwardX * offset;
        dy = -Math.sign(py) * outwardY * offset;
      }
      const at = (y * width + x) * 4;
      data[at] = 128 + (127 * dx) / maxOffset;
      data[at + 1] = 128 + (127 * dy) / maxOffset;
      const red = data[at];
      const green = data[at + 1];
      const across = (y * width + (width - 1 - x)) * 4;
      const below = ((height - 1 - y) * width + x) * 4;
      const opposite = ((height - 1 - y) * width + (width - 1 - x)) * 4;
      data[across] = 256 - red;
      data[across + 1] = green;
      data[below] = red;
      data[below + 1] = 256 - green;
      data[opposite] = 256 - red;
      data[opposite + 1] = 256 - green;
      for (const pixel of [at, across, below, opposite]) {
        data[pixel + 2] = 128;
        data[pixel + 3] = 255;
      }
    }
  }
  context.putImageData(image, 0, 0);
  // Encoded as the page idles rather than in one go: a menu opening would
  // otherwise wait for its PNG.
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Soap Bubble lens map could not be encoded.');
  return { url: URL.createObjectURL(blob), maxOffset };
}

// Built once per size, radius and rim. A filter only points at a map once the
// map has decoded: before that it would draw without its blur.
function lensMap(width: number, height: number, radius: number, rim: number) {
  const key = `${width}|${height}|${radius}|${rim}`;
  let map = maps.get(key);
  if (!map) {
    map = drawMap(width, height, radius, rim).then(async (drawn) => {
      const image = new Image();
      image.src = drawn.url;
      await image.decode();
      return drawn;
    });
    maps.set(key, map);
  }
  return map;
}

const channel = (index: number) =>
  [0, 1, 2]
    .map((row) => [0, 1, 2, 3, 4].map((col) => (row === index && col === index ? 1 : 0)).join(' '))
    .join(' ') + ' 0 0 0 1 0';

function lensFilter(
  id: string,
  width: number,
  height: number,
  map: LensMap,
  { bend, split }: SoapBubbleLensSettings,
) {
  const svg = document.createElementNS(svgNamespace, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  const scale = 2 * bend * map.maxOffset;
  const pass = (amount: number, result: string) =>
    `<feDisplacementMap in="SourceGraphic" in2="map" scale="${amount}" xChannelSelector="R" yChannelSelector="G" result="${result}"/>`;
  // Colour separation bends each channel by its own amount: three passes.
  const passes =
    split > 0
      ? `${pass(scale * (1 + split), 'bentRed')}
    <feColorMatrix in="bentRed" values="${channel(0)}" result="red"/>
    ${pass(scale, 'bentGreen')}
    <feColorMatrix in="bentGreen" values="${channel(1)}" result="green"/>
    ${pass(scale * (1 - split), 'bentBlue')}
    <feColorMatrix in="bentBlue" values="${channel(2)}" result="blue"/>
    <feBlend in="red" in2="green" mode="screen" result="redGreen"/>
    <feBlend in="redGreen" in2="blue" mode="screen"/>`
      : pass(scale, 'bent');
  svg.innerHTML = `<filter id="${id}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
    <feImage href="${map.url}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="none" result="map"/>
    ${passes}
  </filter>`;
  return svg;
}

let supported: boolean | undefined;
/**
 * Only Chromium draws url() in backdrop-filter. Firefox and Safari accept it
 * and draw nothing for it; they are told apart by the prefixes they keep.
 */
export function soapBubbleLensSupported() {
  if (typeof window === 'undefined' || typeof CSS === 'undefined') return false;
  supported ??=
    CSS.supports('backdrop-filter', 'url(#a)') &&
    !CSS.supports('-moz-appearance', 'none') &&
    !CSS.supports('-webkit-backdrop-filter', 'blur(1px)');
  return supported && !matchMedia('(prefers-reduced-transparency: reduce)').matches;
}

/**
 * Bends the page at the rim of element's backdrop-filter. radiusFrom gives the
 * corners (a menu's clip takes its panel's); the lens follows both boxes'
 * layout size, which an animation by transform leaves as it is.
 */
export function attachSoapBubbleLens(
  element: HTMLElement,
  radiusFrom: HTMLElement,
  initial: SoapBubbleLensSettings,
) {
  let settings = initial;
  let key = '';
  let svg: SVGSVGElement | null = null;
  let frame = 0;
  let disposed = false;
  const clear = () => {
    svg?.remove();
    svg = null;
    key = '';
    element.style.removeProperty('--soap-bubble-liquid-lens');
  };
  const sync = () => {
    frame = 0;
    if (disposed) return;
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const short = Math.min(width, height);
    // A small control has no rim to speak of; a surface that holds its own
    // compositing layer would show the map instead of the bent page.
    if (short < 32 || getComputedStyle(element).willChange !== 'auto') return clear();
    const radius = Math.min(
      short / 2,
      parseFloat(getComputedStyle(radiusFrom).borderTopLeftRadius) || 0,
    );
    const rim = Math.max(4, Math.min(settings.rimWidth, short / 3.5));
    const next = `${width}|${height}|${radius}|${rim}|${settings.bend}|${settings.split}`;
    if (next === key) return;
    key = next;
    void lensMap(width, height, radius, rim).then((map) => {
      if (disposed || key !== next) return;
      const id = `soap-bubble-lens-${++nextFilter}`;
      const filter = lensFilter(id, width, height, map, settings);
      document.body.append(filter);
      svg?.remove();
      svg = filter;
      element.style.setProperty('--soap-bubble-liquid-lens', `url(#${id})`);
    });
  };
  const request = () => {
    frame ||= requestAnimationFrame(sync);
  };
  const resize = new ResizeObserver(request);
  resize.observe(element);
  if (radiusFrom !== element) resize.observe(radiusFrom);
  sync();
  return {
    update(next: SoapBubbleLensSettings) {
      settings = next;
      request();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      resize.disconnect();
      clear();
    },
  };
}
