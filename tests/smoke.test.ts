import { describe, expect, test } from 'vitest';
import { createProgram } from '../src/cli';

describe('CLI scaffold', () => {
  test('exposes the package CLI name', () => {
    expect(createProgram().name()).toBe('cc-settings-preset');
  });
});
