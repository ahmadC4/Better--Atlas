// Provide a default `from` to quiet PostCSS warnings from plugins that
// re-parse CSS without passing a filename. We do not rely on PostCSS URL
// rewriting, so this is safe and prevents noisy build output.
export default {
  from: undefined,
  map: false,
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
