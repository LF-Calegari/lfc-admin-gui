module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true,
    jest: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'import', 'sonarjs'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ],
  settings: {
    react: {
      version: 'detect',
    },
  },
  ignorePatterns: ['build/', 'coverage/', 'node_modules/'],
  overrides: [
    {
      // Alinha com `sonar.exclusions=**/*.test.*,**/*.spec.*` em sonar-project.properties:
      // strings repetidas em assertions e setups complexos de teste são legítimos.
      files: ['tests/**/*.{ts,tsx,js,jsx}'],
      rules: {
        'sonarjs/no-duplicate-string': 'off',
        'sonarjs/cognitive-complexity': 'off',
      },
    },
  ],
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'error',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],
    'import/no-named-as-default': 'off',
    // Aliases TS (`@/...`) são resolvidos pelo `tsc --noEmit`; o resolver
    // `node` do `eslint-plugin-import` não interpreta `paths` do tsconfig,
    // por isso ignoramos esse padrão para evitar falso-positivo no lint
    // sem precisar adicionar `eslint-import-resolver-typescript` (que tem
    // conflito de peer deps com a versão atual do `@typescript-eslint`).
    'import/no-unresolved': ['error', { ignore: ['^@/'] }],
    'import/order': [
      'error',
      {
        groups: [
          'builtin',
          'external',
          'internal',
          'parent',
          'sibling',
          'index',
          'object',
          'type',
        ],
        'newlines-between': 'always',
        alphabetize: {
          order: 'asc',
          caseInsensitive: true,
        },
      },
    ],
    // sonarjs — subset curado, mapeado a BLOCKERs históricos do SonarCloud.
    // Limiares (15 / 3) coincidem com os padrões do Sonar para evitar drift CI/local.
    'sonarjs/cognitive-complexity': ['error', 15],
    'sonarjs/no-identical-functions': 'error',
    'sonarjs/no-duplicate-string': ['error', { threshold: 3 }],
    'sonarjs/no-identical-expressions': 'error',
    'sonarjs/no-redundant-jump': 'error',
    'sonarjs/no-useless-catch': 'error',
    'sonarjs/prefer-immediate-return': 'error',
    'sonarjs/no-collapsible-if': 'error',
  },
};
