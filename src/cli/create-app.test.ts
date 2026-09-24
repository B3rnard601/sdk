/**
 * Tests for dorisio init CLI scaffolding.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  buildScaffoldFiles,
  generateDorisioConfig,
  generateEnvExample,
  generateUseCreatorHook,
} from './templates/index';
import { parseArgs, writeScaffold } from './create-app';

describe('dorisio init templates', () => {
  it('builds expected files for react/jwt/none', () => {
    const files = buildScaffoldFiles({
      framework: 'react',
      auth: 'jwt',
      database: 'none',
      cwd: '/tmp',
    });
    const paths = files.map((f) => f.path);
    expect(paths).toContain('src/config/dorisio.ts');
    expect(paths).toContain('src/hooks/useCreator.ts');
    expect(paths).toContain('.env.example');
    expect(paths).toContain('.env.local');
  });

  it('uses lib path for vanilla instead of hooks', () => {
    const files = buildScaffoldFiles({
      framework: 'vanilla',
      auth: 'session',
      database: 'sqlite',
      cwd: '/tmp',
    });
    const paths = files.map((f) => f.path);
    expect(paths).toContain('src/lib/creators.ts');
    expect(paths).not.toContain('src/hooks/useCreator.ts');
  });

  it('embeds auth and database choices in config', () => {
    const cfg = generateDorisioConfig({
      framework: 'next',
      auth: 'custom',
      database: 'postgres',
    });
    expect(cfg).toContain("auth: 'custom'");
    expect(cfg).toContain("database: 'postgres'");
    expect(cfg).toContain('NEXT_PUBLIC_DORISIO_API_URL');
    expect(cfg).toContain('createAppDorisioClient');
  });

  it('generates jwt env keys for react', () => {
    const env = generateEnvExample({
      framework: 'react',
      auth: 'jwt',
      database: 'none',
    });
    expect(env).toContain('VITE_DORISIO_API_URL');
    expect(env).toContain('VITE_DORISIO_JWT_SECRET');
  });

  it('generates a re-export hook for react', () => {
    const hook = generateUseCreatorHook('react');
    expect(hook).toContain("from 'dorisio-sdk/react'");
    expect(hook).toContain('useCreator');
  });
});

describe('parseArgs', () => {
  it('parses init flags', () => {
    const parsed = parseArgs([
      'node',
      'dorisio',
      'init',
      '--framework',
      'next',
      '--auth',
      'session',
      '--database',
      'postgres',
      '--yes',
    ]);
    expect(parsed.command).toBe('init');
    expect(parsed.framework).toBe('next');
    expect(parsed.auth).toBe('session');
    expect(parsed.database).toBe('postgres');
    expect(parsed.yes).toBe(true);
  });

  it('defaults to init for create-dorisio-app bin', () => {
    const parsed = parseArgs(['node', '/usr/bin/create-dorisio-app']);
    expect(parsed.command).toBe('init');
  });
});

describe('writeScaffold', () => {
  it('writes syntactically non-empty files into cwd', () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dorisio-init-'));
    const written = writeScaffold({
      framework: 'react',
      auth: 'jwt',
      database: 'none',
      cwd,
    });
    expect(written.length).toBeGreaterThanOrEqual(4);
    for (const rel of written) {
      const abs = path.join(cwd, rel);
      expect(fs.existsSync(abs)).toBe(true);
      expect(fs.readFileSync(abs, 'utf-8').length).toBeGreaterThan(20);
    }
    fs.rmSync(cwd, { recursive: true, force: true });
  });
});
