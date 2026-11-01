import { expect, it, vi } from 'vitest';
import {
  subscribeBackdrop,
  wantCoveredBackdrop,
  type SoapBubbleBackdrop,
} from '../packages/components/src/soap-bubble/soap-bubble-gl';

type CapturedBackdrop = SoapBubbleBackdrop & {
  covered: Map<Element | null, { canvas: HTMLCanvasElement | null }>;
};

it('keeps a moving close icon out of the transparency capture without hiding other controls', async () => {
  const page = document.createElement('div');
  page.style.cssText =
    'position:fixed;left:0;top:0;width:360px;height:160px;background:white;display:flex;align-items:center;gap:20px';
  const group = document.createElement('span');
  group.dataset.soapBubbleGroup = '';
  group.dataset.movingBubble = '';
  group.style.cssText = 'width:80px;flex:none;color:#222;font:60px sans-serif';
  group.textContent = '×';
  const other = document.createElement('span');
  other.dataset.soapBubble = '';
  other.style.cssText = 'color:#222;font:40px sans-serif';
  other.textContent = '+';
  page.append(group, other);
  document.body.append(page);

  let backdrop: CapturedBackdrop | undefined;
  let wanted = false;
  const release = subscribeBackdrop(page, (value) => {
    backdrop = value as CapturedBackdrop;
  });
  const serialize = XMLSerializer.prototype.serializeToString;
  const snapshot = vi
    .spyOn(XMLSerializer.prototype, 'serializeToString')
    .mockImplementation(function (this: XMLSerializer, node: Node) {
      const svg = serialize.call(this, node);
      // Move after the DOM snapshot, before its asynchronous rasterisation
      // finishes. Erasing at the live position used to leave the old icon.
      if (svg.includes('data-moving-bubble')) group.style.transform = 'translateX(240px)';
      return svg;
    });

  try {
    await expect.poll(() => backdrop?.size, { timeout: 10000 }).toBeTruthy();
    wantCoveredBackdrop(backdrop!, null, true);
    wanted = true;
    await expect.poll(() => backdrop?.covered.get(null)?.canvas, { timeout: 10000 }).toBeTruthy();
    const canvas = backdrop!.covered.get(null)!.canvas!;
    const pixels = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
    const scale = canvas.width / 360;
    let ghost = 0;
    let neighbour = 0;
    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (pixels.data[i] >= 150 || pixels.data[i + 3] <= 200) continue;
        if (x < 80 * scale) ghost++;
        if (x >= 100 * scale && x < 180 * scale) neighbour++;
      }
    }
    expect(group.style.transform).toBe('translateX(240px)');
    expect(ghost).toBe(0);
    expect(neighbour).toBeGreaterThan(20);
  } finally {
    snapshot.mockRestore();
    if (wanted) wantCoveredBackdrop(backdrop!, null, false);
    release();
    page.remove();
  }
});
