/**
 * A small arithmetic evaluator for the launcher: + - * / % ^, parentheses,
 * unary minus, and a few functions and constants. No eval.
 */

const FUNCS = {
  sqrt: Math.sqrt, abs: Math.abs, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  sin: Math.sin, cos: Math.cos, tan: Math.tan, log: Math.log10, ln: Math.log, exp: Math.exp,
};
const CONSTS = { pi: Math.PI, e: Math.E };

function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ') { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9._]/.test(src[j])) j++;
      out.push({ t: 'num', v: parseFloat(src.slice(i, j).replace(/_/g, '')) });
      i = j;
    } else if (/[a-z]/i.test(c)) {
      let j = i;
      while (j < src.length && /[a-z]/i.test(src[j])) j++;
      out.push({ t: 'id', v: src.slice(i, j).toLowerCase() });
      i = j;
    } else if ('+-*/%^()×÷,'.includes(c)) {
      out.push({ t: 'op', v: c === '×' ? '*' : c === '÷' ? '/' : c });
      i++;
    } else {
      return null;
    }
  }
  return out;
}

export function evaluate(src) {
  const toks = tokenize(String(src).trim().replace(/^=/, ''));
  if (!toks || toks.length === 0) return null;
  let p = 0;
  const peek = () => toks[p];
  const eat = (v) => {
    if (toks[p] && toks[p].v === v) { p++; return true; }
    return false;
  };

  function primary() {
    const tk = toks[p++];
    if (!tk) throw new Error('end');
    if (tk.t === 'num') return tk.v;
    if (tk.t === 'id') {
      if (tk.v in CONSTS) return CONSTS[tk.v];
      if (tk.v in FUNCS && eat('(')) {
        const v = expr();
        if (!eat(')')) throw new Error(')');
        return FUNCS[tk.v](v);
      }
      throw new Error('id');
    }
    if (tk.v === '(') {
      const v = expr();
      if (!eat(')')) throw new Error(')');
      return v;
    }
    if (tk.v === '-') return -unary();
    if (tk.v === '+') return unary();
    throw new Error('tok');
  }
  function unary() {
    return primary();
  }
  function power() {
    const b = unary();
    if (eat('^')) return Math.pow(b, power());
    return b;
  }
  function term() {
    let v = power();
    for (;;) {
      if (eat('*')) v *= power();
      else if (eat('/')) v /= power();
      else if (eat('%')) v %= power();
      else if (peek() && (peek().t === 'num' || peek().v === '(' || peek().t === 'id')) v *= power();
      else return v;
    }
  }
  function expr() {
    let v = term();
    for (;;) {
      if (eat('+')) v += term();
      else if (eat('-')) v -= term();
      else return v;
    }
  }

  try {
    const v = expr();
    if (p !== toks.length || !Number.isFinite(v)) return null;
    // A lone number is not a calculation.
    if (toks.length === 1) return null;
    return v;
  } catch (_) {
    return null;
  }
}

export function formatNumber(v) {
  if (Number.isInteger(v)) return String(v);
  const s = v.toPrecision(12);
  return String(parseFloat(s));
}
