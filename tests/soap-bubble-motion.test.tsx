import { fireEvent, render, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import {
  SoapBubbleIconButton,
  SoapBubbleMaterial,
  SoapBubbleMenu,
} from '../packages/components/src/soap-bubble';
import {
  soapBubbleMenuFrame,
  soapBubbleContactStrength,
  stepSoapBubblePress,
} from '../packages/components/src/soap-bubble/soap-bubble-motion';

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
