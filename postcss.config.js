export default {
  // Never load sourceMappingURL input from CSS into the build process.
  // Vite's default css.devSourcemap=false preserves this PostCSS option.
  map: false,
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
