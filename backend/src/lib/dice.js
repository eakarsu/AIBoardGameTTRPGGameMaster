/**
 * Dice roller engine.
 * Supports expressions like: 2d6+3, d20, 4d6kh3 (keep highest 3), 1d8-1
 */

function rollSingle(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * Parse and evaluate a dice expression string.
 * Returns { expression, rolls, modifier, total, details }
 */
function rollDice(expression) {
  if (!expression || typeof expression !== 'string') {
    throw new Error('Invalid dice expression');
  }

  const expr = expression.trim().toLowerCase().replace(/\s+/g, '');

  // Handle keep-highest: NdMkhK
  const khMatch = expr.match(/^(\d+)d(\d+)kh(\d+)([+-]\d+)?$/);
  if (khMatch) {
    const count = parseInt(khMatch[1], 10);
    const sides = parseInt(khMatch[2], 10);
    const keep = parseInt(khMatch[3], 10);
    const mod = parseInt(khMatch[4] || '0', 10);

    const rolls = Array.from({ length: count }, () => rollSingle(sides));
    const sorted = [...rolls].sort((a, b) => b - a);
    const kept = sorted.slice(0, keep);
    const total = kept.reduce((s, r) => s + r, 0) + mod;

    return {
      expression,
      rolls,
      kept,
      modifier: mod,
      total,
      details: `Rolled [${rolls.join(', ')}], kept highest ${keep}: [${kept.join(', ')}]${mod !== 0 ? ` ${mod > 0 ? '+' : ''}${mod}` : ''}`,
    };
  }

  // Handle keep-lowest: NdMklK
  const klMatch = expr.match(/^(\d+)d(\d+)kl(\d+)([+-]\d+)?$/);
  if (klMatch) {
    const count = parseInt(klMatch[1], 10);
    const sides = parseInt(klMatch[2], 10);
    const keep = parseInt(klMatch[3], 10);
    const mod = parseInt(klMatch[4] || '0', 10);

    const rolls = Array.from({ length: count }, () => rollSingle(sides));
    const sorted = [...rolls].sort((a, b) => a - b);
    const kept = sorted.slice(0, keep);
    const total = kept.reduce((s, r) => s + r, 0) + mod;

    return {
      expression,
      rolls,
      kept,
      modifier: mod,
      total,
      details: `Rolled [${rolls.join(', ')}], kept lowest ${keep}: [${kept.join(', ')}]${mod !== 0 ? ` ${mod > 0 ? '+' : ''}${mod}` : ''}`,
    };
  }

  // Standard: [N]dM[+-modifier]
  const stdMatch = expr.match(/^(\d*)d(\d+)([+-]\d+)?$/);
  if (stdMatch) {
    const count = Math.max(1, parseInt(stdMatch[1] || '1', 10));
    const sides = parseInt(stdMatch[2], 10);
    const mod = parseInt(stdMatch[3] || '0', 10);

    if (sides < 2) throw new Error('Die must have at least 2 sides');
    if (count > 100) throw new Error('Cannot roll more than 100 dice at once');

    const rolls = Array.from({ length: count }, () => rollSingle(sides));
    const sum = rolls.reduce((s, r) => s + r, 0);
    const total = sum + mod;

    return {
      expression,
      rolls,
      modifier: mod,
      total,
      details: count === 1
        ? `Rolled d${sides}: ${rolls[0]}${mod !== 0 ? ` ${mod > 0 ? '+' : ''}${mod} = ${total}` : ''}`
        : `Rolled ${count}d${sides}: [${rolls.join(', ')}] = ${sum}${mod !== 0 ? ` ${mod > 0 ? '+' : ''}${mod} = ${total}` : ''}`,
    };
  }

  // Pure number
  const num = parseInt(expr, 10);
  if (!isNaN(num)) {
    return { expression, rolls: [], modifier: num, total: num, details: `Flat value: ${num}` };
  }

  throw new Error(`Cannot parse dice expression: "${expression}"`);
}

/**
 * Roll multiple expressions at once.
 */
function rollMultiple(expressions) {
  return expressions.map((expr) => {
    try {
      return { ...rollDice(expr), error: null };
    } catch (e) {
      return { expression: expr, error: e.message };
    }
  });
}

module.exports = { rollDice, rollMultiple };
