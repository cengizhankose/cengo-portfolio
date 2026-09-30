// ESLint flat config for the React SPA (FE-22, T-02 quality net).
//
// Scope: browser code under src/ (JS/JSX only). The TypeScript API/DB code
// (src/api, src/db) is type-checked and tested separately (BE-17).
//
// jsx-a11y rules stay at their recommended severity ("error"); remaining
// violations are fixed by their owning tasks (FE-02, FE-10, FE-11, FE-15),
// never silenced by downgrading rules to "warn".
//
// CommonJS on purpose: package.json has no "type": "module", and an ESM file
// here would make Node print MODULE_TYPELESS_PACKAGE_JSON on every lint run.
const js = require("@eslint/js");
const prettier = require("eslint-config-prettier");
const jsxA11y = require("eslint-plugin-jsx-a11y");
const react = require("eslint-plugin-react");
const reactHooks = require("eslint-plugin-react-hooks");
const globals = require("globals");

const SRC = ["src/**/*.{js,jsx}"];

module.exports = [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "src/api/**",
      "src/db/**",
    ],
  },
  { files: SRC, ...js.configs.recommended },
  { files: SRC, ...react.configs.flat.recommended },
  { files: SRC, ...react.configs.flat["jsx-runtime"] },
  { files: SRC, ...reactHooks.configs.flat.recommended },
  { files: SRC, ...jsxA11y.flatConfigs.recommended },
  {
    files: SRC,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      "react/prop-types": "off",
    },
  },
  // Must stay last: turns off stylistic rules that Prettier owns.
  prettier,
];
