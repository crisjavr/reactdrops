import { prepareLogoPixels, type LogoCutSettings, type LogoPixels } from './glass-slab-logo-slices';

self.onmessage = ({ data }: MessageEvent<{ pixels: LogoPixels; settings: LogoCutSettings }>) => {
  const prepared = prepareLogoPixels(data.pixels, data.settings);
  const buffers: Transferable[] = [];
  if (prepared) {
    const { coverage, layout } = prepared;
    buffers.push(coverage.data.buffer);
    if (coverage.tone) buffers.push(coverage.tone.buffer);
    if (coverage.white) buffers.push(coverage.white.buffer);
    if (layout.inlay) buffers.push(layout.inlay.data.buffer, layout.inlay.widths.buffer);
  }
  self.postMessage(prepared, { transfer: buffers });
};
