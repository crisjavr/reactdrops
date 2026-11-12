import { fireEvent, render, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import {
  SoapBubbleIconButton,
  SoapBubbleMaterial,
  SoapBubbleMenu,
  SoapBubbleSurface,
  type SoapBubbleRenderer,
} from '../packages/components/src/soap-bubble';
import {
  soapBubbleMenuFrame,
  soapBubbleContactStrength,
  stepSoapBubblePress,
} from '../packages/components/src/soap-bubble/soap-bubble-motion';
import { soapBubbleContext } from '../packages/components/src/soap-bubble/soap-bubble-gl';

it('keeps an independent glint on the upper rim of a search-shaped control', async () => {
  const view = (intensity: number) => (
    <div data-theme="dark">
      <SoapBubbleSurface
        style={{ width: 300, height: 60, fontSize: 16 }}
        radius={9999}
        paused
        wobble={0}
        tilt={0}
        maxDpr={1}
        glass={1}
        tint="#111111"
        opacity={1}
        reflectivity={0.65}
        iridescence={0}
        oilOpacity={0}
        windowLight={false}
        windowTwin={false}
        keyLight={false}
        bottomShade={false}
        glintShape="auto"
        glintIntensity={intensity}
        glintSize={1.65}
        glintHeight={0.65}
      />
    </div>
  );
  const result = render(view(0));
  const host = result.container.querySelector<HTMLElement>('[data-soap-bubble]')!;
  const canvas = host.querySelector('canvas')!;
  const frame = () => canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  await waitFor(() => {
    expect(host).toHaveAttribute('data-soap-bubble-ready');
    expect(frame().some((value, i) => i % 4 === 3 && value === 255)).toBe(true);
  });
  const before = frame().slice();
  result.rerender(view(1));
  await waitFor(() => {
    const after = frame();
    const canvasBox = canvas.getBoundingClientRect(),
      hostBox = host.getBoundingClientRect();
    const depths: number[] = [];
    for (let y = 0; y < canvas.height; y++)
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        const added =
          after[i] + after[i + 1] + after[i + 2] - before[i] - before[i + 1] - before[i + 2];
        if (added > 30)
          depths.push(canvasBox.top + ((y + 0.5) * canvasBox.height) / canvas.height - hostBox.top);
      }
    expect(depths.length).toBeGreaterThan(4);
    expect(Math.max(...depths)).toBeLessThan(7);
    expect(Math.min(...depths)).toBeGreaterThanOrEqual(0);
  });
});

for (const theme of ['light', 'dark'] as const) {
  it(`removes every reflected highlight at zero Reflectivity in ${theme} mode`, async () => {
    const view = (reflectivity: number) => (
      <div data-theme={theme}>
        <SoapBubbleMaterial reflectivity={reflectivity}>
          <SoapBubbleSurface
            style={{ width: 160, height: 100, fontSize: 16 }}
            paused
            wobble={0}
            tilt={0}
            glass={0.95}
            radius={24}
            tint="#16b148"
            opacity={1}
            iridescence={3}
            soapColor="#8b5cf6"
            windowLight
            keyLight
            windowTwin
            bottomShade
            bottomShadeColor="auto"
            glintIntensity={2}
            windowIntensity={2}
            clearCenter={0}
            oilEdge={0}
          />
        </SoapBubbleMaterial>
      </div>
    );
    const result = render(view(1.3));
    const canvas = result.container.querySelector('canvas')!;
    await waitFor(() => expect(canvas.parentElement).toHaveAttribute('data-soap-bubble-ready'));
    result.rerender(view(0));
    const assertFlat = () => {
      const image = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height);
      let opaque = 0;
      for (let i = 0; i < image.data.length; i += 4) {
        if (image.data[i + 3] < 250) continue;
        opaque++;
        for (const [channel, expected] of [22, 177, 72].entries())
          expect(Math.abs(image.data[i + channel] - expected)).toBeLessThan(3);
      }
      expect(opaque).toBeGreaterThan(2000);
    };
    await waitFor(assertFlat);
  });
}

it('uses resting spacing, with no contact at the separation in the supplied example', () => {
  const circle = { x: 0, y: 0, width: 152, height: 152, radius: 76 };
  const close = { ...circle, x: 182.4 };
  const far = { ...circle, x: 216 };
  expect(soapBubbleContactStrength(circle, close)).toBe(1);
  expect(soapBubbleContactStrength(circle, far)).toBe(0);
  expect(soapBubbleContactStrength(circle, { ...far, width: 376, x: 328 })).toBe(0);
  expect(soapBubbleContactStrength(circle, { ...circle, x: 152, y: 152 })).toBe(0);
  const medium = soapBubbleContactStrength(circle, { ...circle, x: 195 });
  expect(medium).toBeGreaterThan(0);
  expect(medium).toBeLessThan(1);
  const scale = (box: typeof circle) =>
    Object.fromEntries(
      Object.entries(box).map(([key, value]) => [key, value * 0.5]),
    ) as typeof circle;
  expect(soapBubbleContactStrength(scale(circle), scale(close))).toBe(1);
  expect(soapBubbleContactStrength(scale(circle), scale(far))).toBe(0);
});

it('leaves a distant neighbour completely unchanged while the pressed button still grows', async () => {
  const result = render(
    <div style={{ display: 'flex', gap: 20, padding: 32, fontSize: 16 }}>
      <SoapBubbleMaterial
        paused
        tilt={0}
        iridescence={0}
        reflectivity={0}
        tint="#16b148"
        opacity={1}
      >
        <SoapBubbleIconButton aria-label="Neighbour">C</SoapBubbleIconButton>
        <SoapBubbleIconButton aria-label="Add">+</SoapBubbleIconButton>
      </SoapBubbleMaterial>
    </div>,
  );
  const other = result.getByRole('button', { name: 'Neighbour' });
  const add = result.getByRole('button', { name: 'Add' });
  await waitFor(() => expect(add).toHaveAttribute('data-soap-bubble-ready'));
  const canvas = other.querySelector('canvas')!;
  const pixels = () =>
    canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
  const before = pixels().slice();
  fireEvent.pointerDown(add);
  await waitFor(() =>
    expect(Number(add.style.getPropertyValue('--soap-bubble-press'))).toBeGreaterThan(0.99),
  );
  expect(pixels()).toEqual(before);
  fireEvent.pointerCancel(add);
  await waitFor(
    () =>
      expect(Math.abs(Number(add.style.getPropertyValue('--soap-bubble-press')))).toBeLessThan(
        0.001,
      ),
    { timeout: 2500 },
  );
});

it('matches the measured menu width, vertical stretch and focus landmarks', () => {
  // Native recording: 132 px trigger, 750 × 313 px panel. The samples are
  // taken after release, independently of the component's font size.
  const samples = [
    [0.042, 288, 248],
    [0.058, 381, 282],
    [0.092, 538, 313],
    [0.158, 704, 316],
    [0.275, 768, 309],
    [0.5, 750, 313],
  ];
  for (const [time, width, height] of samples) {
    const frame = soapBubbleMenuFrame(time, true);
    expect(Math.abs(132 + 618 * frame.growth - width) / 750).toBeLessThan(0.02);
    expect(Math.abs(132 + 181 * frame.height - height) / 313).toBeLessThan(0.02);
  }
  expect(soapBubbleMenuFrame(0.05, true).focus).toBe(0);
  expect(soapBubbleMenuFrame(0.25, true).focus).toBe(1);
  expect(soapBubbleMenuFrame(0.34, false).done).toBe(true);
  expect(soapBubbleMenuFrame(0.275, true, 0).growth).toBe(1);
});

it('holds at the native 1.36 swell and returns with the same rebound at 60 and 120 Hz', () => {
  const results = [60, 120].map((fps) => {
    const spring = { value: 0, velocity: 0 };
    let peak = 0;
    for (let i = 0; i < fps; i++) {
      stepSoapBubblePress(spring, true, 1 / fps);
      peak = Math.max(peak, 1 + 0.36 * spring.value);
    }
    expect(1 + 0.36 * spring.value).toBeCloseTo(1.36, 3);
    expect(peak).toBeGreaterThan(1.38);
    expect(peak).toBeLessThan(1.42);
    let minimum = 1;
    for (let i = 0; i < fps; i++) {
      stepSoapBubblePress(spring, false, 1 / fps);
      minimum = Math.min(minimum, 1 + 0.36 * spring.value);
    }
    expect(minimum).toBeGreaterThan(0.88);
    expect(minimum).toBeLessThan(0.94);
    expect(Math.abs(spring.value)).toBeLessThan(0.001);
    return { peak, minimum };
  });
  expect(Math.abs(results[0].peak - results[1].peak)).toBeLessThan(0.003);
  expect(Math.abs(results[0].minimum - results[1].minimum)).toBeLessThan(0.003);
});

function alphaAt(canvas: HTMLCanvasElement, x: number, y: number) {
  const box = canvas.getBoundingClientRect();
  const px = Math.round(((x - box.left) * canvas.width) / box.width);
  const py = Math.round(((y - box.top) * canvas.height) / box.height);
  return canvas.getContext('2d')!.getImageData(px, py, 1, 1).data[3];
}

for (const theme of ['light', 'dark'] as const) {
  it(`keeps the liquid neck free of an internal rim in the ${theme} theme`, async () => {
    const result = render(
      <div
        data-theme={theme}
        style={{
          display: 'flex',
          gap: 8.8,
          padding: 32.37,
          fontSize: 16,
          background: theme === 'light' ? '#f7f7f8' : '#000',
        }}
      >
        <SoapBubbleMaterial paused tilt={0} tint="#16b148" opacity={1} windowLight keyLight>
          <SoapBubbleIconButton aria-label="Camera">C</SoapBubbleIconButton>
          <SoapBubbleIconButton aria-label="Add">+</SoapBubbleIconButton>
        </SoapBubbleMaterial>
      </div>,
    );
    const add = result.getByRole('button', { name: 'Add' });
    await waitFor(() => expect(add).toHaveAttribute('data-soap-bubble-ready'));
    const box = result.getByRole('button', { name: 'Camera' }).getBoundingClientRect();
    const x = box.right + 1,
      y = box.top + box.height / 2;
    fireEvent.pointerDown(add);
    await waitFor(() =>
      expect(Number(add.style.getPropertyValue('--soap-bubble-press'))).toBeGreaterThan(0.99),
    );
    await waitFor(() => {
      const pixels = [...result.container.querySelectorAll('canvas')]
        .map((canvas) => {
          const rect = canvas.getBoundingClientRect();
          return canvas
            .getContext('2d')!
            .getImageData(
              Math.round(((x - rect.left) * canvas.width) / rect.width),
              Math.round(((y - rect.top) * canvas.height) / rect.height),
              1,
              1,
            ).data;
        })
        .filter((pixel) => pixel[3] > 240);
      expect(pixels.length).toBeGreaterThan(0);
      // The shared interior keeps its tint, without either button's old
      // white/black bevel or highlight crossing through the connection.
      for (const pixel of pixels) {
        expect(Math.abs(pixel[0] - 22)).toBeLessThan(5);
        expect(Math.abs(pixel[1] - 177)).toBeLessThan(5);
        expect(Math.abs(pixel[2] - 72)).toBeLessThan(5);
      }
    });
    fireEvent.pointerUp(add);
  });
}

it('joins nearby buttons during a hold, preserves glyph size, then clears the neck', async () => {
  const result = render(
    <div style={{ display: 'flex', gap: 12, padding: 32, fontSize: 16 }}>
      <SoapBubbleMaterial
        paused
        tilt={0}
        iridescence={0}
        reflectivity={0}
        tint="#16b148"
        opacity={1}
      >
        <SoapBubbleIconButton aria-label="Camera">C</SoapBubbleIconButton>
        <SoapBubbleIconButton aria-label="Add">+</SoapBubbleIconButton>
      </SoapBubbleMaterial>
    </div>,
  );
  const camera = result.getByRole('button', { name: 'Camera' });
  const add = result.getByRole('button', { name: 'Add' });
  await waitFor(() => expect(add).toHaveAttribute('data-soap-bubble-ready'));
  const films = [camera, add].map((button) => button.querySelector('canvas')!);
  const box = camera.getBoundingClientRect();
  const x = box.right + 2;
  const y = box.top + box.height / 2;
  const glyph = add.querySelector('.soap-bubble-button-content')!;
  const before = glyph.getBoundingClientRect().width;
  expect(Math.max(...films.map((film) => alphaAt(film, x, y)))).toBeLessThan(16);
  fireEvent.pointerDown(add);
  await waitFor(() =>
    expect(Number(add.style.getPropertyValue('--soap-bubble-press'))).toBeGreaterThan(0.99),
  );
  await waitFor(() =>
    expect(Math.max(...films.map((film) => alphaAt(film, x, y)))).toBeGreaterThan(240),
  );
  expect(glyph.getBoundingClientRect().width).toBe(before);
  expect(Number(getComputedStyle(glyph).opacity)).toBeLessThan(0.4);
  fireEvent.pointerUp(add);
  await waitFor(
    () =>
      expect(Math.abs(Number(add.style.getPropertyValue('--soap-bubble-press')))).toBeLessThan(
        0.001,
      ),
    { timeout: 2500 },
  );
  await waitFor(() =>
    expect(Math.max(...films.map((film) => alphaAt(film, x, y)))).toBeLessThan(16),
  );
  // The same behaviour belongs to the neighbouring button, including keys.
  camera.focus();
  fireEvent.keyDown(camera, { key: ' ' });
  await waitFor(() =>
    expect(Number(camera.style.getPropertyValue('--soap-bubble-press'))).toBeGreaterThan(0.99),
  );
  await waitFor(() =>
    expect(Math.max(...films.map((film) => alphaAt(film, x, y)))).toBeGreaterThan(240),
  );
  fireEvent.keyUp(camera, { key: ' ' });
  fireEvent.blur(camera);
  await waitFor(
    () =>
      expect(Math.abs(Number(camera.style.getPropertyValue('--soap-bubble-press')))).toBeLessThan(
        0.001,
      ),
    { timeout: 2500 },
  );
});

it('opens immediately without motion when reduced motion is requested', async () => {
  const matchMedia = window.matchMedia.bind(window);
  const media = vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
    const result = matchMedia(query);
    if (query === '(prefers-reduced-motion: reduce)')
      Object.defineProperty(result, 'matches', { value: true });
    return result;
  });
  try {
    const result = render(
      <SoapBubbleMenu round label="•••" triggerLabel="More" items={[{ label: 'Select chats' }]} />,
    );
    fireEvent.click(result.getByRole('button', { name: 'More' }));
    expect(result.getByRole('menu').querySelector('.soap-bubble-menu-content')).toHaveStyle({
      opacity: '1',
    });
    fireEvent.pointerDown(document.body);
    expect(result.queryByRole('menu')).toBeNull();
  } finally {
    media.mockRestore();
  }
});

it('keeps the menu usable through keyboard navigation and an interrupted close', async () => {
  const result = render(
    <div style={{ padding: 32 }}>
      <SoapBubbleMenu
        round
        label="•••"
        triggerLabel="More"
        items={[{ label: 'Select chats' }, { label: 'Read all' }]}
      />
    </div>,
  );
  const trigger = result.getByRole('button', { name: 'More' });
  fireEvent.keyDown(trigger, { key: 'ArrowDown' });
  await waitFor(() => expect(result.getByRole('menuitem', { name: 'Select chats' })).toHaveFocus());
  fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
  expect(result.getByRole('menuitem', { name: 'Read all' })).toHaveFocus();
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  expect(trigger).toHaveFocus();
  fireEvent.click(trigger);
  await waitFor(() => expect(trigger).toHaveAttribute('aria-expanded', 'true'));
  await waitFor(
    () =>
      expect(result.getByRole('menu').querySelector('.soap-bubble-menu-content')).toHaveStyle({
        opacity: '1',
      }),
    { timeout: 2000 },
  );
  fireEvent.pointerDown(document.body);
  await waitFor(() => expect(result.queryByRole('menu')).toBeNull(), { timeout: 2000 });
});

for (const refraction of [0, 1]) {
  it(`keeps the glass face fixed and bounds rim displacement at Refraction ${refraction}`, async () => {
    const background = document.createElement('canvas');
    background.width = 360;
    background.height = 240;
    background.style.cssText = 'position:fixed;left:0;top:0;width:360px;height:240px';
    const context = background.getContext('2d')!;
    const image = context.createImageData(360, 240);
    for (let y = 0; y < 240; y++)
      for (let x = 0; x < 360; x++) {
        const i = (y * 360 + x) * 4;
        image.data.set([Math.min(x, 255), y, 0, 255], i);
      }
    context.putImageData(image, 0, 0);
    document.body.append(background);
    const engine = { current: null as SoapBubbleRenderer | null };
    const result = render(
      <SoapBubbleSurface
        backdrop={background}
        rendererRef={engine}
        data-theme="dark"
        style={{ position: 'fixed', left: 40, top: 40, width: 220, height: 140, fontSize: 16 }}
        paused
        wobble={0}
        tilt={0}
        glass={0.95}
        bevel={14}
        radius={24}
        refraction={refraction}
        reflectivity={0}
        iridescence={0}
        opacity={0}
        mirage={0}
        oilOpacity={0}
        bottomShade={false}
        windowLight={false}
        keyLight={false}
      />,
    );
    const canvas = result.container.querySelector('canvas')!;
    const sample = (x: number, y: number) => {
      const rect = canvas.getBoundingClientRect();
      return canvas
        .getContext('2d')!
        .getImageData(
          Math.floor(((x - rect.left) * canvas.width) / rect.width),
          Math.floor(((y - rect.top) * canvas.height) / rect.height),
          1,
          1,
        ).data;
    };
    try {
      await waitFor(() => expect(canvas).toHaveAttribute('data-backdrop', 'captured'));
      for (const shape of [null, { x: 0, y: 0, width: 180, height: 120 }, null]) {
        engine.current!.setShape(shape);
        await waitFor(() => {
          const face = sample(100, 100);
          expect(Math.abs(face[0] - 100)).toBeLessThan(3);
          expect(Math.abs(face[1] - 100)).toBeLessThan(3);
          const rim = sample(44, 100);
          expect(Math.abs(rim[0] - 44)).toBeLessThan(refraction === 0 ? 3 : 8);
          expect(Math.abs(rim[1] - 100)).toBeLessThan(3);
        });
      }
    } finally {
      result.unmount();
      background.remove();
    }
  });
}

it('lets a menu capture the backdrop without capturing it in its trigger', async () => {
  const background = document.createElement('canvas');
  background.width = background.height = 200;
  document.body.append(background);
  const result = render(
    <SoapBubbleMenu
      label="More"
      panelMaterial={{ backdrop: background, backdropBlur: 8 }}
      items={[{ label: 'First action' }]}
    />,
  );
  try {
    const panelCanvas = result.container.querySelector('.soap-bubble-menu-panel canvas')!;
    await waitFor(() => expect(panelCanvas).toHaveAttribute('data-backdrop', 'captured'));
    const triggerCanvas = result.getByRole('button', { name: 'More' }).querySelector('canvas')!;
    expect(triggerCanvas).not.toHaveAttribute('data-backdrop');
  } finally {
    result.unmount();
    background.remove();
  }
});

it('moves softened fine detail by one pixel without snapping it to a coarse texture grid', async () => {
  const backgrounds = [100, 101].map((x) => {
    const image = document.createElement('canvas');
    image.width = 200;
    image.height = 180;
    image.style.cssText = 'position:fixed;left:0;top:0;width:200px;height:180px';
    const context = image.getContext('2d')!;
    context.fillStyle = 'black';
    context.fillRect(0, 0, 200, 180);
    context.fillStyle = 'white';
    context.fillRect(x, 0, 1, 180);
    document.body.append(image);
    return image;
  });
  const engine = { current: null as SoapBubbleRenderer | null };
  const result = render(
    <SoapBubbleSurface
      backdrop={backgrounds[0]}
      rendererRef={engine}
      data-theme="dark"
      style={{ position: 'fixed', left: 40, top: 40, width: 120, height: 100, fontSize: 16 }}
      paused
      wobble={0}
      tilt={0}
      glass={0.95}
      bevel={14}
      radius={24}
      backdropBlur={4}
      reflectivity={0}
      iridescence={0}
      opacity={0}
      mirage={0}
      oilOpacity={0}
      bottomShade={false}
      windowLight={false}
      keyLight={false}
    />,
  );
  const canvas = result.container.querySelector('canvas')!;
  const profile = (shift: number) => {
    const rect = canvas.getBoundingClientRect();
    return Array.from(
      { length: 21 },
      (_, i) =>
        canvas
          .getContext('2d')!
          .getImageData(
            Math.floor(((90 + i + shift - rect.left) * canvas.width) / rect.width),
            Math.floor(((90 - rect.top) * canvas.height) / rect.height),
            1,
            1,
          ).data[0],
    );
  };
  try {
    await waitFor(() => expect(canvas).toHaveAttribute('data-backdrop', 'captured'));
    let before: number[] = [];
    await waitFor(() => {
      before = profile(0);
      expect(Math.max(...before)).toBeGreaterThan(40);
    });
    engine.current!.setBackdrop(backgrounds[1]);
    await waitFor(() => {
      const after = profile(1);
      expect(Math.max(...after)).toBeGreaterThan(40);
      expect(Math.max(...before.map((value, i) => Math.abs(value - after[i])))).toBeLessThan(5);
    });
  } finally {
    result.unmount();
    backgrounds.forEach((image) => image.remove());
  }
});

it('lays live glass under the film and captures no backdrop for it', async () => {
  const page = document.createElement('div');
  document.body.append(page);
  const result = render(
    <div data-theme="dark">
      <SoapBubbleMaterial backdrop={page} surface="bubble-liquid" liquidBlur={6}>
        <SoapBubbleIconButton aria-label="Live" />
      </SoapBubbleMaterial>
    </div>,
  );
  try {
    const host = result.container.querySelector<HTMLElement>('[data-soap-bubble]')!;
    const canvas = host.querySelector('canvas')!;
    await waitFor(() => expect(host).toHaveAttribute('data-soap-bubble-ready'));
    expect(host.dataset.soapBubbleGlass).toBe('bubble-liquid');
    expect(getComputedStyle(host).backdropFilter).toContain('blur(6px)');
    // Live glass reads the page as it is: the film never asks for a capture.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(canvas).not.toHaveAttribute('data-backdrop');
  } finally {
    result.unmount();
    page.remove();
  }
});

it('draws liquid glass on its own without WebGL', async () => {
  const result = render(
    <div data-theme="light">
      <SoapBubbleSurface surface="liquid-glass" style={{ width: 120, height: 60 }} />
    </div>,
  );
  const host = result.container.querySelector<HTMLElement>('[data-soap-bubble]')!;
  await waitFor(() => expect(host.dataset.soapBubbleGlass).toBe('liquid-glass'));
  expect(host).toHaveAttribute('data-soap-bubble-glass-light');
  expect(getComputedStyle(host.querySelector('canvas')!).display).toBe('none');
  await new Promise((resolve) => setTimeout(resolve, 300));
  expect(host).not.toHaveAttribute('data-soap-bubble-ready');
  result.unmount();
});

it('keeps the last frame through a lost context and draws whole once it is back', async () => {
  const view = (tint: string) => (
    <div data-theme="dark">
      <SoapBubbleSurface
        style={{ width: 160, height: 80, fontSize: 16 }}
        paused
        wobble={0}
        tilt={0}
        maxDpr={1}
        tint={tint}
        opacity={1}
        iridescence={0}
        oilOpacity={0}
      />
    </div>
  );
  const result = render(view('#2050ff'));
  const host = result.container.querySelector<HTMLElement>('[data-soap-bubble]')!;
  const canvas = host.querySelector('canvas')!;
  // Mean colour of the opaque pixels, which the tint fills.
  const body = () => {
    const data = canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data;
    const sum = [0, 0, 0];
    let count = 0;
    for (let i = 0; i < data.length; i += 4)
      if (data[i + 3] > 250) {
        sum[0] += data[i];
        sum[1] += data[i + 1];
        sum[2] += data[i + 2];
        count++;
      }
    return { count, red: sum[0] / Math.max(1, count), blue: sum[2] / Math.max(1, count) };
  };
  const context = soapBubbleContext()!;
  const lose = context.gl.getExtension('WEBGL_lose_context')!;
  try {
    await waitFor(() => expect(body().blue).toBeGreaterThan(body().red + 60));
    const shown = body();
    lose.loseContext();
    await waitFor(() => expect(context.lostSince()).toBeGreaterThan(0));
    // A redraw asked for while the context is gone wipes nothing.
    result.rerender(view('#ff3020'));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(body()).toEqual(shown);
    lose.restoreContext();
    await waitFor(() => expect(context.lostSince()).toBe(0));
    // Back, it is drawn whole with the material it has now.
    await waitFor(() => expect(body().red).toBeGreaterThan(body().blue + 60));
  } finally {
    if (context.gl.isContextLost()) lose.restoreContext();
    result.unmount();
  }
});
