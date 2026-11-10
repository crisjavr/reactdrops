/** Image sequence shared by the home ticker and component previews. */
export const homeCarouselItems = [
  { src: '/assets/hero-artwork/01.webp?v=topographic-first-frame-v2', width: 240 * 640 / 344, alt: 'Topographic preview with flowing gray contours on black' },
  { src: '/assets/hero-artwork/02.webp', width: 260, alt: 'Blue grain gradient' },
  { src: '/assets/hero-artwork/03.webp?v=pro', width: 240 * 16 / 9, alt: 'Chrome PRO refracted text' },
  {
    src: '/assets/hero-artwork/04.webp?v=orb-idle-updated',
    width: 460,
    alt: 'Liquid Glass Orb preview with agent state controls',
  },
  {
    src: '/assets/hero-artwork/fractal-glass.webp',
    width: 240 * 1600 / 1060,
    alt: 'Fractal Glass preview with refracted glass on the left and Himalayan mountains on the right',
  },
  {
    src: '/assets/hero-artwork/05.webp?v=orbit-tunnel-poster-v3',
    width: 240 * 3024 / 1628,
    alt: 'Orbit Tunnel component preview',
  },
] as const;
