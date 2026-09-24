import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'react/index': 'src/react/index.ts',
    webhook: 'src/webhook.ts',
  },
  format: ['esm', 'cjs'],
  dts: {
    resolve: true,
    compilerOptions: {
      skipLibCheck: true,
      noImplicitAny: false,
    },
  },
  sourcemap: true,
  clean: true,
});
