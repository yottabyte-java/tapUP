// WHY: Production uses Webpack; a Turbopack-only loader leaves Tailwind directives uncompiled.
const config = { plugins: { "@tailwindcss/postcss": {} } };
export default config;
