import js from "@eslint/js";
import globals from "globals";
import prettierConfig from "eslint-config-prettier";

export default [
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      "dist/**",
      ".release/**",
      ".clean-process-ended/**",
      "audit-bundles/**",
      "evidence/**",
      "*.tgz",
    ],
  },
  js.configs.recommended,
  {
    files: ["bin/**/*.js", "src/**/*.js", "scripts/**/*.mjs", "test/**/*.js", "eslint.config.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      "no-console": "off",
      "consistent-return": "error",
      eqeqeq: "error",
      "no-implicit-coercion": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-var": "error",
      "prefer-const": "error",
    },
  },
  prettierConfig,
];
