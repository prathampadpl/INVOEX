import { describe, it, expect } from 'vitest';
import { cn } from './utils';

describe('cn utility function', () => {
  it('should merge basic class names', () => {
    expect(cn('class1', 'class2')).toBe('class1 class2');
  });

  it('should handle conditional classes', () => {
    expect(cn('class1', true && 'class2', false && 'class3')).toBe('class1 class2');
    expect(cn('class1', { class2: true, class3: false })).toBe('class1 class2');
  });

  it('should properly merge tailwind classes using twMerge', () => {
    // twMerge logic: later classes overwrite earlier ones if they conflict
    expect(cn('p-2 p-4')).toBe('p-4');
    expect(cn('bg-red-500 bg-blue-500')).toBe('bg-blue-500');
    expect(cn('text-sm text-lg')).toBe('text-lg');
  });

  it('should handle arrays of classes', () => {
    expect(cn(['class1', 'class2'], 'class3')).toBe('class1 class2 class3');
  });

  it('should ignore undefined, null, and empty string values', () => {
    expect(cn('class1', undefined, null, '', 'class2')).toBe('class1 class2');
  });

  it('should merge conditional tailwind classes correctly', () => {
    expect(cn('px-2 py-1 bg-red-500', true && 'p-3 bg-blue-500')).toBe('p-3 bg-blue-500');
  });
});
