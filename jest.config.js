/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testTimeout: 120000,
  // @noble/* and @scure/* (pulled in by xrpl) ship ESM only, so they have to be transpiled for Jest.
  transform: {
    '^.+\\.ts$': ['ts-jest', {}],
    '^.+\\.js$': [
      'ts-jest',
      { tsconfig: { allowJs: true, module: 'commonjs', target: 'ES2022', esModuleInterop: true } },
    ],
  },
  transformIgnorePatterns: ['/node_modules/(?!.*(@noble|@scure)/)'],
};
