import { tsNodeConfig, commonIgnores } from "@asd14/eslint-config/typescript"

const SRC_FILES = ["src/**/*.ts", "bin/**/*.js"]
const TEST_FILES = ["src/**/*.test.ts"]
const DEV_FILES = ["eslint.config.js"]

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: [...commonIgnores],
  },
  {
    ...tsNodeConfig,
    files: [...SRC_FILES, ...DEV_FILES, ...TEST_FILES],
  },
]
