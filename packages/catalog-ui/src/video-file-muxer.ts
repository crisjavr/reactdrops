// Writes encoded video chunks into a playable MP4 (H.264) or WebM (VP9/VP8) file.
// WebCodecs encodes the frames but leaves the container to the page; these two
// writers cover a single video track held in memory, which is all an export needs.

export type MuxedChunk = {
  data: Uint8Array;
  /** Presentation time in microseconds. */
  timestamp: number;
  key: boolean;
};

export type MuxerTrack = {
  width: number;
  height: number;
  fps: number;
  /** Seconds the file lasts: the last frame stays on screen until then. */
  duration: number;
};

const ascii = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

// ---------------------------------------------------------------- MP4 (ISO BMFF)

function u8(value: number) {
  return Uint8Array.of(value & 255);
}
function u16(value: number) {
  return Uint8Array.of((value >> 8) & 255, value & 255);
}
function u32(value: number) {
  return Uint8Array.of((value >>> 24) & 255, (value >> 16) & 255, (value >> 8) & 255, value & 255);
}
function box(type: string, ...content: Uint8Array[]) {
  const body = concat(content);
  return concat([u32(body.length + 8), ascii(type), body]);
}
function fullBox(type: string, version: number, flags: number, ...content: Uint8Array[]) {
  return box(type, u8(version), u8(flags >> 16), u16(flags & 0xffff), ...content);
}
const matrix = concat([0x10000, 0, 0, 0, 0x10000, 0, 0, 0, 0x40000000].map(u32));

/**
 * An H.264 MP4 with its index first, so it starts playing before it has fully
 * loaded. `avcC` is the decoder configuration WebCodecs reports with the first chunk.
 */
export function muxMp4(chunks: MuxedChunk[], avcC: Uint8Array, track: MuxerTrack) {
  // Integer ticks per frame keep every duration exact.
  const timescale = Math.round(track.fps) * 100;
  const delta = timescale / Math.round(track.fps);
  const count = chunks.length;
  const total = Math.max(count * delta, Math.round(track.duration * timescale));
  const ticks = (microseconds: number) => Math.round((microseconds * timescale) / 1e6);
  // Chunks arrive in decode order. Frames shown later than they decode (B-frames)
  // need composition offsets; a shift keeps those offsets positive.
  const offsets = chunks.map((chunk, index) => ticks(chunk.timestamp) - index * delta);
  const shift = Math.min(0, ...offsets);
  const reordered = offsets.some((offset) => offset !== offsets[0]);
  const lastDelta = total - (count - 1) * delta;
  const stts =
    lastDelta === delta || count < 2
      ? [[count, delta]]
      : [
          [count - 1, delta],
          [1, lastDelta],
        ];
  const keys = chunks.flatMap((chunk, index) => (chunk.key ? [index + 1] : []));
  const movieDuration = Math.round((total / timescale) * 1000);
  const moov = (dataOffset: number) =>
    box(
      'moov',
      fullBox(
        'mvhd',
        0,
        0,
        u32(0),
        u32(0),
        u32(1000),
        u32(movieDuration),
        u32(0x10000),
        u16(0x100),
        new Uint8Array(10),
        matrix,
        new Uint8Array(24),
        u32(2),
      ),
      box(
        'trak',
        fullBox(
          'tkhd',
          0,
          3,
          u32(0),
          u32(0),
          u32(1),
          u32(0),
          u32(movieDuration),
          new Uint8Array(8),
          u16(0),
          u16(0),
          u16(0),
          u16(0),
          matrix,
          u32(track.width * 0x10000),
          u32(track.height * 0x10000),
        ),
        ...(shift || reordered
          ? [
              // Starts playback at the first frame shown rather than the first decoded.
              box(
                'edts',
                fullBox('elst', 0, 0, u32(1), u32(movieDuration), u32(-shift), u32(0x10000)),
              ),
            ]
          : []),
        box(
          'mdia',
          fullBox('mdhd', 0, 0, u32(0), u32(0), u32(timescale), u32(total), u16(0x55c4), u16(0)),
          fullBox('hdlr', 0, 0, u32(0), ascii('vide'), new Uint8Array(12), ascii('VideoHandler\0')),
          box(
            'minf',
            fullBox('vmhd', 0, 1, new Uint8Array(8)),
            box('dinf', fullBox('dref', 0, 0, u32(1), fullBox('url ', 0, 1))),
            box(
              'stbl',
              fullBox(
                'stsd',
                0,
                0,
                u32(1),
                box(
                  'avc1',
                  new Uint8Array(6),
                  u16(1),
                  new Uint8Array(16),
                  u16(track.width),
                  u16(track.height),
                  u32(0x480000),
                  u32(0x480000),
                  u32(0),
                  u16(1),
                  new Uint8Array(32),
                  u16(0x18),
                  u16(0xffff),
                  box('avcC', avcC),
                ),
              ),
              fullBox(
                'stts',
                0,
                0,
                u32(stts.length),
                ...stts.flatMap(([n, d]) => [u32(n), u32(d)]),
              ),
              ...(reordered || shift
                ? [
                    fullBox(
                      'ctts',
                      0,
                      0,
                      u32(count),
                      ...offsets.flatMap((offset) => [u32(1), u32(offset - shift)]),
                    ),
                  ]
                : []),
              ...(keys.length < count
                ? [fullBox('stss', 0, 0, u32(keys.length), ...keys.map(u32))]
                : []),
              fullBox('stsc', 0, 0, u32(1), u32(1), u32(count), u32(1)),
              fullBox('stsz', 0, 0, u32(0), u32(count), ...chunks.map((c) => u32(c.data.length))),
              fullBox('stco', 0, 0, u32(1), u32(dataOffset)),
            ),
          ),
        ),
      ),
    );
  const ftyp = box('ftyp', ascii('isom'), u32(0x200), ascii('isomiso2avc1mp41'));
  const media = concat(chunks.map((chunk) => chunk.data));
  // The index's size does not depend on the offset it records.
  const size = moov(0).length;
  const header = concat([ftyp, moov(ftyp.length + size + 8)]);
  return concat([header, u32(media.length + 8), ascii('mdat'), media]);
}

// ---------------------------------------------------------------- WebM (Matroska)

type Ebml = [id: number, value: number | string | Uint8Array | Ebml[] | { float: number }];

function idBytes(id: number) {
  const bytes: number[] = [];
  for (let rest = id; rest > 0; rest = Math.floor(rest / 256)) bytes.unshift(rest & 255);
  return Uint8Array.from(bytes);
}
/** Element sizes always take 8 bytes, which any size fits. */
function sizeBytes(size: number) {
  const out = new Uint8Array(8);
  out[0] = 1;
  for (let index = 7, rest = size; index > 0; index--, rest = Math.floor(rest / 256)) {
    out[index] = rest & 255;
  }
  return out;
}
function uint(value: number) {
  const bytes: number[] = [];
  for (let rest = value; rest > 0 || !bytes.length; rest = Math.floor(rest / 256)) {
    bytes.unshift(rest & 255);
  }
  return Uint8Array.from(bytes);
}
function ebml([id, value]: Ebml): Uint8Array {
  const body =
    typeof value === 'number'
      ? uint(value)
      : typeof value === 'string'
        ? ascii(value)
        : value instanceof Uint8Array
          ? value
          : Array.isArray(value)
            ? concat(value.map(ebml))
            : (() => {
                const bytes = new Uint8Array(8);
                new DataView(bytes.buffer).setFloat64(0, value.float);
                return bytes;
              })();
  return concat([idBytes(id), sizeBytes(body.length), body]);
}

/** A VP9 or VP8 WebM, one cluster per keyframe so seeking lands on one. */
export function muxWebm(
  chunks: MuxedChunk[],
  codec: 'V_VP9' | 'V_VP8',
  track: MuxerTrack,
  codecPrivate?: Uint8Array,
) {
  const clusters: Ebml[] = [];
  let cluster: Ebml[] = [];
  let clusterTime = 0;
  for (const chunk of chunks) {
    const time = Math.round(chunk.timestamp / 1000);
    // Block times are 16-bit offsets from their cluster.
    if (!cluster.length || chunk.key || time - clusterTime > 30000) {
      if (cluster.length) clusters.push([0x1f43b675, cluster]);
      clusterTime = time;
      cluster = [[0xe7, time]];
    }
    const head = new Uint8Array(4);
    head[0] = 0x81;
    new DataView(head.buffer).setInt16(1, time - clusterTime);
    head[3] = chunk.key ? 0x80 : 0;
    cluster.push([0xa3, concat([head, chunk.data])]);
  }
  if (cluster.length) clusters.push([0x1f43b675, cluster]);
  return concat([
    ebml([
      0x1a45dfa3,
      [
        [0x4286, 1],
        [0x42f7, 1],
        [0x42f2, 4],
        [0x42f3, 8],
        [0x4282, 'webm'],
        [0x4287, 4],
        [0x4285, 2],
      ],
    ]),
    ebml([
      0x18538067,
      [
        [
          0x1549a966,
          [
            [0x2ad7b1, 1000000],
            [0x4d80, 'ReactDrops'],
            [0x5741, 'ReactDrops'],
            [0x4489, { float: track.duration * 1000 }],
          ],
        ],
        [
          0x1654ae6b,
          [
            [
              0xae,
              [
                [0xd7, 1],
                [0x73c5, 1],
                [0x83, 1],
                [0x86, codec],
                ...(codecPrivate?.length ? ([[0x63a2, codecPrivate]] as Ebml[]) : []),
                [0x23e383, Math.round(1e9 / track.fps)],
                [
                  0xe0,
                  [
                    [0xb0, track.width],
                    [0xba, track.height],
                  ],
                ],
              ],
            ],
          ],
        ],
        ...clusters,
      ],
    ]),
  ]);
}
