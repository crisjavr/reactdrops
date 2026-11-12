import { expect, it } from 'vitest';
import {
  subscribeBackdrop,
  type SoapBubbleBackdrop,
} from '../packages/components/src/soap-bubble/soap-bubble-gl';

type CapturedBackdrop = SoapBubbleBackdrop & { source: HTMLCanvasElement };

it('captures a positioned flex backdrop without moving content or collapsing hidden controls', async () => {
  const page = document.createElement('div');
  page.style.cssText =
    'position:fixed;left:73px;top:51px;width:360px;height:220px;margin:9px;background:black;display:flex;flex-direction:column';
  const group = document.createElement('div');
  group.dataset.soapBubbleGroup = '';
  group.style.cssText = 'height:24px;flex:none;background:lime';
  const control = document.createElement('div');
  control.dataset.soapBubble = '';
  control.style.cssText = 'height:44px;flex:none;background:lime';
  const marker = document.createElement('div');
  marker.style.cssText = 'width:30px;height:20px;flex:none;background:red';
  page.append(group, control, marker);
  document.body.append(page);
  let backdrop: CapturedBackdrop | undefined;
  const release = subscribeBackdrop(page, (value) => {
    backdrop = value as CapturedBackdrop;
  });
  try {
    await expect.poll(() => backdrop?.size, { timeout: 10000 }).toBeTruthy();
    const canvas = backdrop!.source;
    const scale = canvas.width / 360;
    const pixel = (x: number, y: number) =>
      Array.from(
        canvas.getContext('2d')!.getImageData(Math.floor(x * scale), Math.floor(y * scale), 1, 1)
          .data,
      );
    expect(pixel(15, 78)).toEqual([255, 0, 0, 255]);
    expect(pixel(15, 12)).toEqual([0, 0, 0, 255]);
    expect(pixel(15, 46)).toEqual([0, 0, 0, 255]);
    expect(marker.getBoundingClientRect().top - page.getBoundingClientRect().top).toBe(68);
  } finally {
    release();
    page.remove();
  }
});
