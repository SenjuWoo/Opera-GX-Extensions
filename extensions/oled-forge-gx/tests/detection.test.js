'use strict';
const assert = require('node:assert/strict');
const C = require('../lib/color.js');
const D = require('../lib/detection.js');
const textGradient = 'linear-gradient(100deg, rgb(85, 85, 85), rgb(153, 153, 153))';
for (const backdrop of ['rgb(67, 67, 67)', 'rgb(0, 0, 0)']) {
  const background = C.parseColor(backdrop);
  const corrected = D.readableTextGradient(textGradient, background);
  assert.match(corrected, /^linear-gradient\(100deg,/);
  const stops = D.extractCssColors(corrected);
  assert.ok(stops.every(color => C.contrastRatio(color, background) >= 4.5));
  assert.ok(C.colorDistance(stops[0], stops[1]) > 5, 'readability correction must preserve the gradient');
}
assert.equal(D.readableTextGradient('linear-gradient(rgb(220, 30, 40), rgb(80, 15, 180))', C.parseColor('rgb(0, 0, 0)')), null);
assert.equal(D.readableTextGradient('linear-gradient(rgba(255, 255, 255, 0), rgb(255, 255, 255))', C.parseColor('rgb(0, 0, 0)')), null);

const neutralGradient = D.analyzeGradient(
  'linear-gradient(180deg, rgb(38, 39, 43) 0%, rgb(20, 21, 24) 100%)',
  'dark'
);
assert.ok(neutralGradient, 'neutral dark gradients should be removable');
assert.ok(C.isNearNeutral(neutralGradient.average));

const brandedGradient = D.analyzeGradient(
  'linear-gradient(90deg, rgb(220, 30, 40), rgb(80, 15, 180))',
  'dark'
);
assert.equal(brandedGradient, null, 'branded gradients must remain untouched');

assert.equal(D.shouldMergeSurface(
  C.parseColor('rgb(43, 44, 48)'),
  C.parseColor('rgb(0, 0, 0)'),
  { pageKind: 'dark', pureBlack: true, tagName: 'DIV', area: 28000, maxContrast: 2.15, maxLuminance: 0.23 }
), true, 'low-chroma nested cards should merge into the OLED surface cluster');

assert.equal(D.shouldMergeSurface(
  C.parseColor('rgb(54, 54, 58)'),
  C.parseColor('rgb(0, 0, 0)'),
  { pageKind: 'dark', pureBlack: true, tagName: 'BUTTON', area: 3000, maxContrast: 2.15, maxLuminance: 0.23 }
), false, 'small controls should retain separation');

assert.equal(D.isLikelyPrimaryProse({
  text: 'This is a longer video description with enough words to represent readable paragraph content.',
  fontSize: 14,
  width: 560,
  height: 46,
  tagName: 'SPAN',
  hint: 'description-inline-expander'
}), true);

assert.equal(D.isLikelyPrimaryProse({
  text: '1.2K views',
  fontSize: 12,
  width: 80,
  height: 18,
  tagName: 'SPAN',
  hint: 'metadata view-count'
}), false);

console.log('detection tests passed');
