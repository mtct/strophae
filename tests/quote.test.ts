import { describe, expect, test } from 'bun:test';

import { appendQuote, quotePassage } from '../src/shared/quote';

describe('quotePassage', () => {
  test('names the voice and rules every line', () => {
    expect(quotePassage('Black Hat', 'first\nsecond'))
      .toBe('> Black Hat:\n> first\n> second');
  });

  test('keeps blank lines as bare marks', () => {
    expect(quotePassage('Iggy', 'one\n\ntwo'))
      .toBe('> Iggy:\n> one\n>\n> two');
  });

  test('trims the selection ends, keeps the indent inside it', () => {
    expect(quotePassage('Iggy', '\n one \n   two  \n\n'))
      .toBe('> Iggy:\n> one\n>    two');
  });

  test('an empty selection quotes nothing', () => {
    expect(quotePassage('Iggy', '   \n  ')).toBe('');
  });

  test('an unnamed voice still quotes', () => {
    expect(quotePassage('', 'text')).toBe('> text');
  });
});

describe('appendQuote', () => {
  test('an empty box opens with the quotation', () => {
    expect(appendQuote('', '> A:\n> x')).toBe('> A:\n> x\n\n');
  });

  test('a typed question keeps its place above the quotation', () => {
    expect(appendQuote('what do you think?', '> A:\n> x'))
      .toBe('what do you think?\n\n> A:\n> x\n\n');
  });

  test('quotations stack one blank line apart', () => {
    const first = appendQuote('', '> A:\n> x');
    expect(appendQuote(first, '> B:\n> y'))
      .toBe('> A:\n> x\n\n> B:\n> y\n\n');
  });

  test('nothing to quote leaves the box alone', () => {
    expect(appendQuote('draft', '')).toBe('draft');
  });
});
