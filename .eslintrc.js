module.exports = {
  root: true,
  env: {browser: true, es2022: true, node: true},
  parserOptions: {sourceType: 'module', ecmaFeatures: {jsx: true}},
  extends: ['eslint:recommended', 'plugin:react-hooks/recommended'],
  plugins: ['react'],
  rules: {
    'react/jsx-uses-react': 'error',
    'react/jsx-uses-vars': 'error',
  },
  overrides: [{files: ['**/__tests__/**/*.js'], env: {jest: true}}],
};
