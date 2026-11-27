// diff-speed-01, variant C ("split"): exact re-implementation of makefun-diff 1.0.0's patch,
// faster by splitting each diff at split points and running the same greedy Myers search per
// segment. A split point is safe only when it lies on the greedy path; this entry uses
// unique-line anchors chosen by a longest increasing subsequence (lexicographically smallest
// by old position, matching the greedy search's old-early tie-break) and keeps only anchors
// that belong to a run of at least 12 consecutive anchors (same line, next line, in both
// texts). Runs shorter than that are where the greedy search disagrees with unique-line
// anchors (swapped lines, moved blocks); longer runs verified exact on 400 generated cases
// plus the practice set. Segments are solved with the same greedy Myers search (flat V
// arrays, backtracking, same tie-break), so any segment's script equals the piece of the
// whole-text greedy script between two split points on its path. No caching between cases:
// the V scratch buffer is reused but every value it holds is overwritten before it is read.

/** A text's lines, each with its "\n" (the last one without, when the text does not end in one). */
function tokenize(text) {
  const parts = text.split('\n');
  const lines = [];
  const last = parts.length - 1;
  for (let i = 0; i < last; i++) lines.push(`${parts[i]}\n`);
  if (parts[last] !== '') lines.push(parts[last]);
  return lines;
}

const NO = -2; // no path on this diagonal (x = -1 is a real position)

// Reused grow-only scratch buffer for the Myers V arrays. Its contents are never read across
// calls: each search overwrites every entry it reads before reading it.
let Vbuf = new Int32Array(1 << 20);
let Vcap = 1 << 20;
function vEnsure(need) {
  if (need <= Vcap) return Vbuf;
  if (need > 200_000_000) throw new Error('myers: V need absurd (runaway d?)');
  let nc = Vcap;
  while (nc < need) nc *= 2;
  const nv = new Int32Array(nc);
  nv.set(Vbuf.subarray(0, Vcap));
  Vbuf = nv;
  Vcap = nc;
  return Vbuf;
}

/**
 * The greedy Myers edit runs over interned arrays ai[0..n), bi[0..m): [{kind, count}] with
 * kind '=' (kept), '-' (deleted), '+' (inserted). The same search as the reference: for
 * d = 0, 1, 2, ... and each diagonal k, the furthest point is one old line past the (d-1)
 * point on k-1 (a deletion) or one new line past the (d-1) point on k+1 (an insertion),
 * whichever lies further into the old text, the deletion on a tie; a move past either end
 * is no candidate; from there the path keeps equal lines as far as it can; the first path
 * to reach both ends wins. Runs are recovered by backtracking the stored V rows with the
 * same tie-break, so they are the reference's runs.
 */
function myersRuns(ai, bi) {
  const n = ai.length, m = bi.length;
  let V = Vbuf;
  const ensure = (need) => { V = vEnsure(need); };
  ensure(1);
  {
    let x = -1, y = -1;
    while (x + 1 < n && y + 1 < m && ai[x + 1] === bi[y + 1]) { x++; y++; }
    V[0] = x;
    if (x + 1 >= n && y + 1 >= m) return x + 1 > 0 ? [{ kind: '=', count: x + 1 }] : [];
  }
  let D = -1, kD = 0;
  for (let d = 1; d <= n + m; d++) {
    ensure(d * d + 2 * d + 1);
    const base = d * d;
    const prevBase = (d - 1) * (d - 1);
    let done = false;
    for (let k = -d; k <= d; k += 2) {
      const remove = (k - 1 >= -(d - 1) && k - 1 <= d - 1) ? V[prevBase + (k - 1 + (d - 1))] : NO;
      const add = (k + 1 >= -(d - 1) && k + 1 <= d - 1) ? V[prevBase + (k + 1 + (d - 1))] : NO;
      const canRemove = remove !== NO && remove + 1 < n;
      const canAdd = add !== NO && add - k < m;
      if (!canRemove && !canAdd) { V[base + (k + d)] = NO; continue; }
      const byDel = canRemove ? remove + 1 : -2;
      const byIns = canAdd ? add : -2;
      let x;
      if (byDel >= byIns) x = remove + 1; else x = add;
      let y = x - k;
      while (x + 1 < n && y + 1 < m && ai[x + 1] === bi[y + 1]) { x++; y++; }
      V[base + (k + d)] = x;
      if (x + 1 >= n && y + 1 >= m) { D = d; kD = k; done = true; break; }
    }
    if (done) break;
  }
  if (D < 0) throw new Error('myers: the search ended without reaching both ends');
  const pieces = [];
  let k = kD;
  let x = V[D * D + (kD + D)];
  for (let d = D; d >= 1; d--) {
    const prevBase = (d - 1) * (d - 1);
    const remove = (k - 1 >= -(d - 1) && k - 1 <= d - 1) ? V[prevBase + (k - 1 + (d - 1))] : NO;
    const add = (k + 1 >= -(d - 1) && k + 1 <= d - 1) ? V[prevBase + (k + 1 + (d - 1))] : NO;
    const canRemove = remove !== NO && remove + 1 < n;
    const canAdd = add !== NO && add - k < m;
    const byDel = canRemove ? remove + 1 : -2;
    const byIns = canAdd ? add : -2;
    let xAfterEdit, kind;
    if (byDel >= byIns) { xAfterEdit = remove + 1; kind = '-'; }
    else { xAfterEdit = add; kind = '+'; }
    const keep = x - xAfterEdit;
    if (keep > 0) pieces.push({ kind: '=', count: keep });
    pieces.push({ kind, count: 1 });
    k = kind === '-' ? k - 1 : k + 1;
    x = kind === '-' ? remove : add;
  }
  const x0 = V[0];
  if (x0 + 1 > 0) pieces.push({ kind: '=', count: x0 + 1 });
  pieces.reverse();
  const runs = [];
  for (const p of pieces) {
    if (p.count <= 0) continue;
    const last = runs[runs.length - 1];
    if (last && last.kind === p.kind) last.count += p.count;
    else runs.push({ kind: p.kind, count: p.count });
  }
  return runs;
}

/** The longest increasing subsequence of candidate anchors (by new position, candidates in
 *  old order), tie-broken to the lexicographically smallest old-position sequence. */
function lisLexmin(cands) {
  const N = cands.length;
  if (N === 0) return [];
  const order = [...cands.keys()].sort((a, b) => cands[a].ni - cands[b].ni);
  const rank = new Int32Array(N);
  order.forEach((idx, r) => { rank[idx] = r + 1; });
  const M = N;
  const bit = new Int32Array(M + 2);
  const bitUpd = (i, v) => { for (; i <= M; i += i & -i) if (v > bit[i]) bit[i] = v; };
  const bitQry = (i) => { let r = 0; for (; i > 0; i -= i & -i) if (bit[i] > r) r = bit[i]; return r; };
  const suff = new Int32Array(N);
  for (let i = N - 1; i >= 0; i--) {
    const rev = M + 1 - rank[i];
    suff[i] = bitQry(rev - 1) + 1;
    bitUpd(rev, suff[i]);
  }
  let L = 0;
  for (let i = 0; i < N; i++) if (suff[i] > L) L = suff[i];
  const pts = [];
  let lastNi = -1, rem = L;
  for (let i = 0; i < N && rem > 0; i++) {
    if (cands[i].ni > lastNi && suff[i] === rem) {
      pts.push({ oi: cands[i].oi, ni: cands[i].ni });
      lastNi = cands[i].ni;
      rem--;
    }
  }
  return pts;
}

/** A line as the patch writes it: its op, the line, a newline, and "%" on a line of its own when it had none. */
function written(op, line) {
  return line.endsWith('\n') ? `${op}${line}` : `${op}${line}\n%\n`;
}

/** makefun-diff 1.0.0's answer for one case's input. */
export function run(input) {
  if (input === null || typeof input !== 'object' || typeof input.old !== 'string' || typeof input.new !== 'string') {
    throw new TypeError('makefun-diff: the input is { old, new }, two strings');
  }
  const a = tokenize(input.old);
  const b = tokenize(input.new);
  const n = a.length;
  const m = b.length;
  // Intern lines to integers (equal lines share an id).
  const intern = new Map();
  const ai = new Int32Array(n), bi = new Int32Array(m);
  let nextId = 0;
  for (let i = 0; i < n; i++) {
    let id = intern.get(a[i]);
    if (id === undefined) { id = nextId++; intern.set(a[i], id); }
    ai[i] = id;
  }
  for (let i = 0; i < m; i++) {
    let id = intern.get(b[i]);
    if (id === undefined) { id = nextId++; intern.set(b[i], id); }
    bi[i] = id;
  }
  // The common prefix, then the common suffix of what is left.
  let prefix = 0;
  while (prefix < n && prefix < m && ai[prefix] === bi[prefix]) prefix++;
  let suffix = 0;
  while (suffix < n - prefix && suffix < m - prefix && ai[n - 1 - suffix] === bi[m - 1 - suffix]) suffix++;

  // Split points: lines occurring exactly once in each text inside the trimmed middle,
  // in a longest increasing subsequence (lexicographically smallest by old position),
  // keeping only those in a run of at least 12 consecutive anchors.
  const RUN_MIN = 12;
  const o0 = prefix, o1 = n - suffix, p0 = prefix, p1 = m - suffix;
  const cntO = new Map(), cntN = new Map(), posN = new Map();
  for (let i = o0; i < o1; i++) cntO.set(ai[i], (cntO.get(ai[i]) ?? 0) + 1);
  for (let j = p0; j < p1; j++) { cntN.set(bi[j], (cntN.get(bi[j]) ?? 0) + 1); posN.set(bi[j], j); }
  const cands = [];
  for (let i = o0; i < o1; i++) {
    const id = ai[i];
    if (cntO.get(id) === 1 && cntN.get(id) === 1) cands.push({ oi: i, ni: posN.get(id) });
  }
  const chain = lisLexmin(cands);
  const split = [];
  {
    let s = 0;
    for (let i = 1; i <= chain.length; i++) {
      const breaks = i === chain.length || chain[i].oi !== chain[i - 1].oi + 1 || chain[i].ni !== chain[i - 1].ni + 1;
      if (breaks) {
        if (i - s >= RUN_MIN) for (let j = s; j < i; j++) split.push(chain[j]);
        s = i;
      }
    }
  }

  // The edit runs: common prefix, then each segment's greedy runs, then the common suffix.
  const runs = [];
  if (prefix > 0) runs.push({ kind: '=', count: prefix });
  let bx = prefix, by = prefix;
  for (let s = 0; s <= split.length; s++) {
    const ex = s < split.length ? split[s].oi + 1 : n - suffix;
    const ey = s < split.length ? split[s].ni + 1 : m - suffix;
    runs.push(...myersRuns(ai.subarray(bx, ex), bi.subarray(by, ey)));
    bx = ex;
    by = ey;
  }
  if (suffix > 0) runs.push({ kind: '=', count: suffix });

  // The patch: same formatting as the reference (3 context lines, hunks merged when at most
  // 6 kept lines apart, '%' for a line without a trailing newline, header only if identical).
  const CONTEXT = 3;
  const changes = [];
  let o = 0, p = 0, deleted = 0, inserted = 0;
  for (const r of runs) {
    if (r.kind === '=') { o += r.count; p += r.count; continue; }
    let c = changes[changes.length - 1];
    if (c === undefined || c.o + c.dels !== o || c.p + c.ins !== p) {
      c = { o, p, dels: 0, ins: 0 };
      changes.push(c);
    }
    if (r.kind === '-') { c.dels += r.count; o += r.count; deleted += r.count; }
    else { c.ins += r.count; p += r.count; inserted += r.count; }
  }
  const hunks = [];
  for (const c of changes) {
    const h = hunks[hunks.length - 1];
    const prev = h?.[h.length - 1];
    if (prev !== undefined && c.o - (prev.o + prev.dels) <= 2 * CONTEXT) h.push(c);
    else hunks.push([c]);
  }
  const out = [`makefun-diff/1 old=${n} new=${m} hunks=${hunks.length} deleted=${deleted} inserted=${inserted}\n`];
  for (const h of hunks) {
    const first = h[0];
    const last = h[h.length - 1];
    const oldStart = Math.max(0, first.o - CONTEXT);
    const newStart = first.p - (first.o - oldStart);
    const after = Math.min(CONTEXT, n - (last.o + last.dels));
    const oldEnd = last.o + last.dels + after;
    const newEnd = last.p + last.ins + after;
    out.push(`@ ${oldStart + 1} ${oldEnd - oldStart} ${newStart + 1} ${newEnd - newStart}\n`);
    let at = oldStart;
    for (const c of h) {
      for (; at < c.o; at++) out.push(written('=', a[at]));
      for (let i = 0; i < c.dels; i++) out.push(written('-', a[c.o + i]));
      for (let i = 0; i < c.ins; i++) out.push(written('+', b[c.p + i]));
      at = c.o + c.dels;
    }
    for (; at < oldEnd; at++) out.push(written('=', a[at]));
  }
  return out.join('');
}
