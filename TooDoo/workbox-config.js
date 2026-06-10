/** @type {import('workbox-build').GenerateSWOptions} */
module.exports = {
  globDirectory: 'dist/',
  globPatterns: ['**/*.{html,js,css,json,ico,png,svg,woff2,woff,ttf,webp,jpg,jpeg}'],
  globIgnores: ['**/sw.js'],
  swDest: 'dist/sw.js',
  skipWaiting: true,
  clientsClaim: true,
  cleanupOutdatedCaches: true,
  navigateFallback: null,
};
