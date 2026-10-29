// Babel config used only by Jest to transform ESM-only packages in node_modules.
// ts-jest handles TypeScript files; babel-jest handles the ESM node_modules
// that stellar-sdk 17.x depends on (uint8array-extras, @exodus/bytes, etc.).
module.exports = {
  plugins: [
    ['@babel/plugin-transform-modules-commonjs', { lazy: false }],
  ],
};
