import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkCases } from '../scripts/benchmark-first-slice.mjs';

test('the benchmark fixes two briefs and three formats with identical copy and evidence',async()=>{
  const {definition,cases}=await benchmarkCases();
  assert.equal(definition.briefs.length,2); assert.equal(definition.formats.length,3);
  assert.equal(cases.length,6); assert.equal(new Set(cases.map(item=>item.id)).size,6);
  assert.equal(new Set(cases.map(item=>item.contentDigest)).size,2);
});
