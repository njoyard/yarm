module.exports = {
  root: true,
  extends: ["eslint:recommended"],
  env: {
    node: true,
    es6: true
  },
  parserOptions: {
    ecmaVersion: 2017,
    sourceType: "module"
  },
  rules: {
    "arrow-parens": ["error", "always"],
    "eol-last": ["error", "always"],
    "generator-star-spacing": ["error", { before: false, after: true }],
    "no-var": "error",
    "no-useless-rename": "error",
    "object-shorthand": ["error", "always"],
    "prefer-destructuring": "error",
    "prefer-spread": "error",
    "prefer-template": "error"
  }
};
