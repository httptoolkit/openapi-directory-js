module.exports = (wallaby) => {

  return {
    files: [
      'package.json',
      'src/**/*.ts',
      'test/**/*.ts',
      '!test/**/*.spec.ts'
    ],
    tests: [
      '!test/integration.spec.ts',
      'test/**/*.spec.ts'
    ],

    testFramework: 'mocha',
    env: {
      type: 'node'
    },
    debug: true
  };
};