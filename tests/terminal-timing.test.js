import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTerminalTranscript, terminalMinimumHoldSeconds, terminalTimeline, terminalFrameState } from '../packages/composition/src/terminal.js';
test('transcript preserves blank lines, CRLF and output-only rows', () => {
  assert.deepEqual(parseTerminalTranscript('$ echo hi\r\n\r\n hi').map(r => [r.kind, r.text]), [['command', '$ echo hi'], ['output', ''], ['output', ' hi']]);
  assert.equal(parseTerminalTranscript('log')[0].kind, 'output');
});
test('typing respects grapheme boundaries and deterministic backwards seeks', () => {
  const inputs = { transcript: '$ 👨‍👩‍👧‍👦é', typingSpeed: 10 };
  const early = terminalFrameState(inputs, .1, 5);
  terminalFrameState(inputs, 4, 5);
  assert.deepEqual(terminalFrameState(inputs, .1, 5), early);
  assert.equal(early.stages[0].rows[0].text, '$ 👨‍👩‍👧‍👦');
});
test('minimum preserves all typing and settled stages with handoff', () => {
  const inputs = { transcript: '$ abc', secondTranscript: '$ def', typingSpeed: 10 };
  assert.ok(Math.abs(terminalMinimumHoldSeconds(inputs) - 5.2) < 1e-9);
  const timeline = terminalTimeline(inputs, 8);
  assert.equal(timeline.duration, 8);
  assert.equal(terminalFrameState(inputs, 8, 8).stages[1].rows[0].text, '$ def');
  assert.throws(() => terminalTimeline(inputs, 2), /hold/i);
});
test('output reveal is sequential and final frame includes every blank and long row', () => {
  const inputs = { transcript: `first\n\n${'x'.repeat(400)}\nlast`, secondTranscript: '', typingSpeed: 45 };
  const minimum = terminalMinimumHoldSeconds(inputs);
  assert.equal(terminalTimeline(inputs).stages.length, 1);
  assert.deepEqual(terminalFrameState(inputs, minimum, minimum).stages[0].rows.map(row => row.text).join('\n'), inputs.transcript);
  assert.equal(terminalFrameState(inputs, .01, minimum).stages[0].rows.filter(row => row.visible).length, 1);
});
test('long header and status reserve reading time independently of typing', () => {
  const inputs = { transcript: '$ ok', title: 'one two three four five six seven eight nine ten eleven twelve', status: 'ready now' };
  assert.ok(terminalMinimumHoldSeconds(inputs) >= 14 / 3 + 1);
  assert.throws(() => terminalFrameState(inputs, NaN), /finite/);
});
test('scroll preserves earlier rows until overflow and seeks smoothly without history', async () => {
  const { terminalScrollOffset } = await import('../packages/composition/src/terminal.js');
  const events = [0, .2, .4, .6, .8];
  assert.equal(terminalScrollOffset(events, .4, 3), 0);
  assert.ok(terminalScrollOffset(events, .66, 3) > 0 && terminalScrollOffset(events, .66, 3) < 1);
  assert.equal(terminalScrollOffset(events, 2, 3), 2);
  assert.equal(terminalScrollOffset(events, .4, 3), 0);
});
test('long output streams across its duration instead of jumping to its final page', () => {
  const inputs = { transcript: 'x'.repeat(1000) };
  const minimum = terminalMinimumHoldSeconds(inputs);
  const early = terminalFrameState(inputs, .5, minimum).stages[0].rows[0];
  const middle = terminalFrameState(inputs, 4, minimum).stages[0].rows[0];
  assert.equal(early.text.length, 60);
  assert.equal(middle.text.length, 480);
  assert.equal(middle.typing, false);
  assert.equal(terminalFrameState(inputs, minimum, minimum).stages[0].rows[0].text.length, 1000);
});
test('wrapped output arrival schedule progresses across pages with the stream', async () => {
  const { terminalVisualRowArrival, terminalScrollOffset } = await import('../packages/composition/src/terminal.js');
  const stage = terminalTimeline({ transcript: 'x'.repeat(1000) }).stages[0];
  const events = Array.from({ length: 20 }, (_, i) => terminalVisualRowArrival(stage, stage.rows[0], i * 50));
  assert.ok(events[12] > 5);
  assert.equal(terminalScrollOffset(events, 1, 12), 0);
  assert.ok(terminalScrollOffset(events, 6, 12) > 0 && terminalScrollOffset(events, 6, 12) < 4);
  assert.equal(terminalScrollOffset(events, 9, 12), 8);
});
