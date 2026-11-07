import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/", "_site/"] },
  js.configs.recommended,
  {
    files: ["src/**/*.js", "sw.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
    },
  },
  {
    files: ["sw.js"],
    languageOptions: { globals: globals.serviceworker },
  },
  {
    files: ["tests/**/*.js", "scripts/**/*.mjs", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
  },
];
