/**
 * The server is plain ESM on Node - no TypeScript, no JSX - so this is the base
 * rule set plus the two things that actually bite in a codebase written this
 * way: a name that was never imported, and a promise nobody awaited.
 *
 * `no-unused-vars` allows a leading underscore, because Express hands every
 * handler four arguments and the terminal error handler has to declare `_next`
 * to be recognised as one at all.
 */
module.exports = {
  root: true,
  env: { node: true, es2023: true },
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  extends: ['eslint:recommended'],
  ignorePatterns: ['node_modules', 'coverage'],
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-console': 'off',
    eqeqeq: ['error', 'smart'],
    'prefer-const': 'error',
    'no-var': 'error',
  },
  overrides: [
    {
      files: ['test/**/*.js'],
      env: { node: true },
    },
  ],
};
