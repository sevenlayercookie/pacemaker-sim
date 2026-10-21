const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

// Exercise the existing browser functions without starting the ECG animation.
const source = fs.readFileSync(path.join(__dirname, '../javascript.js'), 'utf8');
function setup() {
  const dial = { id: 'bottomKnobImg', setAttribute() {} };
  const context = vm.createContext({
    document: { getElementById: () => dial },
    selectedOption: 'AsenseRow', currentBottomScreen: 'mainmenu',
    pacerOn: true, pacerLocked: false, knobTurnFactor: 1 / 36,
    aPacerSensitivity: 0.5, aPacerSensitivityDefault: 0.5,
    aPacerMaxSensitivity: 0.4, aPacerMinSensitivity: 10,
    vPacerSensitivity: 2, vPacerSensitivityDefault: 2,
    vPacerMaxSensitivity: 0.8, vPacerMinSensitivity: 20,
    AVInterval: 170, AVIntervalDefault: 170, AVImin: 20, AVImax: 300,
    PVARP: 300, PVARPDefault: 300, PVARPmin: 150, PVARPmax: 500,
    upperRateLimit: 110, upperRateLimitDefault: 110, URLmin: 80, URLmax: 230,
    RAPrate: 250, RAPrateDefault: 250, RAPrateMin: 80, RAPrateMax: 800,
    updateAllGUIValues() {},
  });
  for (const [start, end] of [
    ['function calcKnobParams(', '// Harrison Knob'],
    ['function knobAngleToResult(', '// initialze knob parameters'],
    ['function getBottomDialParameters(', 'getBottomDialParameters()'],
    ['function bottomKnobFunction(', '/*\nfunction rescaleFonts'],
  ]) {
    const offset = source.indexOf(start);
    vm.runInContext(source.slice(offset, source.indexOf(end, offset)), context);
  }
  function move(deg, first = false) {
    dial.deg = deg;
    dial.moveSteps = first ? 1 : 2;
    context.knobAngleToResult({}, dial);
  }
  return { context, dial, move };
}

test('switching from a heavily rotated row preserves every new row on grab', () => {
  const { context: c, dial, move } = setup();
  for (const [row, value] of [
    ['VsenseRow', 'vPacerSensitivity'], ['AVIrow', 'AVInterval'],
    ['PVARProw', 'PVARP'], ['URLrow', 'upperRateLimit'], ['RAPrateRow', 'RAPrate'],
    ['AsenseRow', 'aPacerSensitivity'],
  ]) {
    dial.cumulativeDegrees = -5000;
    c.selectedOption = row;
    const before = c[value];
    c.getBottomDialParameters(true);
    move(270, true);
    assert.ok(Math.abs(c[value] - before) < 1e-9, row);
  }
});

test('new grabs use the current value even after an automatic value change', () => {
  const { context: c, dial, move } = setup();
  c.getBottomDialParameters(true);
  move(100, true);
  move(90);
  c.aPacerSensitivity = 3;
  dial.cumulativeDegrees = -9000;
  c.getBottomDialParameters(true);
  move(350, true);
  assert.equal(c.aPacerSensitivity, 3);
  move(5);
  assert.ok(Math.abs(c.aPacerSensitivity - (3 - 15 / 108)) < 1e-9);
});

test('small adjustments accumulate for rounded AV intervals', () => {
  const { context: c, move } = setup();
  c.selectedOption = 'AVIrow';
  c.getBottomDialParameters(true);
  move(0, true);
  for (let angle = 10; angle <= 70; angle += 10) {
    c.getBottomDialParameters();
    move(angle);
  }
  assert.equal(c.AVInterval, 180);
});

test('limits and locked/off controls retain their behavior', () => {
  const { context: c, move } = setup();
  c.getBottomDialParameters(true);
  move(0, true);
  move(90);
  assert.equal(c.aPacerSensitivity, 0.4);
  move(80);
  assert.ok(c.aPacerSensitivity > 0.4);
  const before = c.aPacerSensitivity;
  c.pacerLocked = true;
  move(70);
  assert.equal(c.aPacerSensitivity, before);
  c.pacerLocked = false;
  c.pacerOn = false;
  move(60);
  assert.equal(c.aPacerSensitivity, before);
});
