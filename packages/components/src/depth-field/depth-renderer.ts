import {
  prepareDepthProjection,
  sampleTrackInto,
  depthPerspective,
  depthPlaneUnit,
  type DepthClock,
  type DepthLayoutOptions,
  type DepthTrack,
  type DepthViewport,
} from './depth-model';

const baseSize = 150;
type ImageState = { width: number; height: number; opacity?: number; transform?: string };
const imageStates = new WeakMap<HTMLImageElement, ImageState>();

/** Base geometry changes only when a decoded image's intrinsic dimensions change. */
export function prepareDepthImage(image: HTMLImageElement) {
  if (!image.naturalWidth || !image.naturalHeight) return;
  const aspect = image.naturalWidth / image.naturalHeight;
  const width = baseSize * Math.min(1, aspect);
  const height = baseSize / Math.max(1, aspect);
  const previous = imageStates.get(image);
  if (previous?.width === width && previous.height === height) return;
  image.style.setProperty('--depth-image-width', `${width}px`);
  image.style.setProperty('--depth-image-height', `${height}px`);
  if (previous) {
    previous.width = width;
    previous.height = height;
  } else imageStates.set(image, { width, height });
}

/** DOM/CSS renderer, independent of React and of the motion clock. */
export function renderDepthFrame(
  images: readonly (HTMLImageElement | null)[],
  tracks: readonly DepthTrack[],
  clock: DepthClock,
  viewport: DepthViewport,
  options: DepthLayoutOptions,
) {
  const projection = prepareDepthProjection(clock, viewport, options);
  const { originX, originY } = projection;
  const frame = { left: 0, top: 0, size: 0, opacity: 0, distance: 0 };
  for (let index = 0; index < tracks.length; index++) {
    const image = images[index];
    if (!image) continue;
    let geometry = imageStates.get(image);
    if (!geometry) {
      geometry = { width: 0, height: 0 };
      imageStates.set(image, geometry);
    }
    if (!geometry.width || !geometry.height) {
      if (geometry.opacity !== 0) {
        image.style.opacity = '0';
        geometry.opacity = 0;
      }
      continue;
    }
    sampleTrackInto(tracks[index], projection, frame);
    const projectedScale = frame.size / baseSize;
    const width = geometry.width * projectedScale;
    const height = geometry.height * projectedScale;
    const left = frame.left + (frame.size - width) / 2;
    const top = frame.top + (frame.size - height) / 2;
    const visible =
      frame.opacity > 0.002 &&
      left + width > 0 &&
      left < viewport.width &&
      top + height > 0 &&
      top < viewport.height;
    const opacity = visible ? frame.opacity : 0;
    if (geometry.opacity !== opacity) {
      image.style.opacity = String(opacity);
      geometry.opacity = opacity;
    }
    if (!visible) continue;
    // CSS perspective performs projection and depth sorting. Compensate its
    // scale here so the screen position and size match the established scene.
    const inverseProjection = (frame.distance * depthPlaneUnit) / depthPerspective;
    const x = originX + (left - originX) * inverseProjection;
    const y = originY + (top - originY) * inverseProjection;
    const z = depthPerspective - frame.distance * depthPlaneUnit;
    const scale = projectedScale * inverseProjection;
    const transform = `translate3d(${x}px, ${y}px, ${z}px) scale(${scale})`;
    if (geometry.transform !== transform) {
      image.style.transform = transform;
      geometry.transform = transform;
    }
  }
}
