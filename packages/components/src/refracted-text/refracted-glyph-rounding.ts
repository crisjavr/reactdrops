// Round the glyph silhouette before generating its refraction and light masks.
// An elliptical brush follows the font's own scale, including flattened text.
export function roundGlyphCorners(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  radiusX: number,
  radiusY: number,
) {
  if (!Number.isFinite(radiusX) || !Number.isFinite(radiusY) || Math.min(radiusX, radiusY) <= 0.5)
    return;
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] < 128) continue;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left) return;
  // Keep small punctuation and narrow stems from disappearing at high values.
  const limit = Math.min(1, (right - left + 1) / (radiusX * 4), (bottom - top + 1) / (radiusY * 4));
  radiusX *= limit;
  radiusY *= limit;
  left = Math.max(0, left - Math.ceil(radiusX) - 2);
  right = Math.min(width - 1, right + Math.ceil(radiusX) + 2);
  top = Math.max(0, top - Math.ceil(radiusY) - 2);
  bottom = Math.min(height - 1, bottom + Math.ceil(radiusY) + 2);
  const cropWidth = right - left + 1;
  const cropHeight = bottom - top + 1;
  const size = cropWidth * cropHeight;
  let ink = new Uint8Array(size);
  let next = new Uint8Array(size);
  let originalArea = 0;
  for (let y = 0; y < cropHeight; y++) {
    for (let x = 0; x < cropWidth; x++) {
      const alpha = pixels[((y + top) * width + x + left) * 4 + 3];
      const value = alpha >= 128 ? 1 : 0;
      ink[y * cropWidth + x] = value;
      originalArea += value;
    }
  }
  const horizontal = new Float64Array(size);
  const distances = new Float64Array(size);
  const length = Math.max(cropWidth, cropHeight);
  const line = new Float64Array(length);
  const result = new Float64Array(length);
  const sites = new Int32Array(length);
  const edges = new Float64Array(length + 1);

  // Exact squared Euclidean distances in linear time, with separate x/y scales.
  function transform(count: number, scale: number) {
    let last = -1;
    for (let q = 0; q < count; q++) {
      if (!Number.isFinite(line[q])) continue;
      let crossing = -Infinity;
      while (last >= 0) {
        const site = sites[last];
        crossing =
          (line[q] - line[site] + scale * (q * q - site * site)) / (2 * scale * (q - site));
        if (crossing > edges[last]) break;
        last--;
      }
      last++;
      sites[last] = q;
      edges[last] = last === 0 ? -Infinity : crossing;
      edges[last + 1] = Infinity;
    }
    if (last < 0) {
      result.fill(Infinity, 0, count);
      return;
    }
    let siteIndex = 0;
    for (let q = 0; q < count; q++) {
      while (edges[siteIndex + 1] < q) siteIndex++;
      const site = sites[siteIndex];
      result[q] = line[site] + scale * (q - site) ** 2;
    }
  }

  function distanceTo(value: number) {
    for (let y = 0; y < cropHeight; y++) {
      const offset = y * cropWidth;
      for (let x = 0; x < cropWidth; x++) line[x] = ink[offset + x] === value ? 0 : Infinity;
      transform(cropWidth, 1 / (radiusX * radiusX));
      horizontal.set(result.subarray(0, cropWidth), offset);
    }
    for (let x = 0; x < cropWidth; x++) {
      for (let y = 0; y < cropHeight; y++) line[y] = horizontal[y * cropWidth + x];
      transform(cropHeight, 1 / (radiusY * radiusY));
      for (let y = 0; y < cropHeight; y++) distances[y * cropWidth + x] = result[y];
    }
  }

  function offset(dilate: boolean, radius: number) {
    distanceTo(dilate ? 1 : 0);
    const threshold = radius * radius;
    for (let index = 0; index < size; index++) {
      next[index] = (dilate ? distances[index] <= threshold : distances[index] > threshold) ? 1 : 0;
    }
    [ink, next] = [next, ink];
  }

  // A smaller inward radius keeps letter apertures open. Opening rounds the
  // outer corners without adding a stroke or moving the straight edges.
  offset(true, 0.35);
  offset(false, 0.35);
  offset(false, 1);
  distanceTo(1);
  const coverage = new Uint8Array(size);
  const antialiasScale = Math.min(radiusX, radiusY);
  let roundedArea = 0;
  for (let index = 0; index < size; index++) {
    coverage[index] = Math.round(
      Math.max(0, Math.min(1, 0.5 + (1 - Math.sqrt(distances[index])) * antialiasScale)) * 255,
    );
    if (coverage[index] >= 128) roundedArea++;
  }
  // Preserve delicate glyphs if the requested radius would erase their stems.
  if (roundedArea < originalArea * 0.65) return;
  for (let y = 0; y < cropHeight; y++) {
    for (let x = 0; x < cropWidth; x++) {
      pixels[((y + top) * width + x + left) * 4 + 3] = coverage[y * cropWidth + x];
    }
  }
}
