import next from "eslint-config-next";
export default [
  ...next,
  { rules: { "@typescript-eslint/no-explicit-any": "off" } },
  { ignores: [".next/**", "node_modules/**"] },
];
