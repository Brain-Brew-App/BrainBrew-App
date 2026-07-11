/**
 * Shared test fixtures: given a full puzzle (answer included), produce a perfect
 * and an imperfect play as BOTH a raw client submission (what a cloud client
 * sends) and the equivalent local `Answer` (what the app scorer takes). Used by
 * the scoring contract and the gameplay simulation so a single definition of
 * "a perfect OBS_004 play" backs both.
 */

/** The private answer key the server reconstructs from answer_payload + public fields. */
export function keyFor(p) {
  return {
    oddTileId: p.oddTileId,
    correctOptionId: p.correctOptionId,
    pairTileIds: p.pairTileIds,
    wrongIndex: p.wrongIndex,
    correctOrder: p.correctOrder,
    targetIds: p.targetIds,
    orderMatters: p.orderMatters,
    symbols: p.symbols ? p.symbols.map((s) => ({ id: s.id, isTarget: s.isTarget })) : undefined,
    items: p.items ? p.items.map((i) => ({ id: i.id, bucket: i.bucket })) : undefined,
  };
}

/** [perfectPlay, imperfectPlay], each { raw, answer }. */
export function playsFor(p, elapsedMs) {
  const eng = p.engineId;
  const single = (id) => ({ raw: { selectedId: id }, answer: { kind: 'choice', selectedId: id, elapsedMs } });
  const seq = (ids) => ({ raw: { selectedIds: ids }, answer: { kind: 'sequence', selectedIds: ids, elapsedMs } });

  if (eng === 'OBS_001') {
    const wrong = p.tiles.find((t) => t.id !== p.oddTileId).id;
    return [single(p.oddTileId), single(wrong)];
  }
  if (['OBS_003', 'PAT_001', 'PAT_002', 'LOG_001', 'LOG_002', 'LNG_001', 'LNG_002'].includes(eng)) {
    const wrong = p.options.find((o) => o.id !== p.correctOptionId).id;
    return [single(p.correctOptionId), single(wrong)];
  }
  if (eng === 'PAT_003') {
    const wrongIdx = p.wrongIndex === 1 ? 2 : 1;
    return [single(`term-${p.wrongIndex}`), single(`term-${wrongIdx}`)];
  }
  if (eng === 'OBS_004') {
    const other = p.tiles.find((t) => !p.pairTileIds.includes(t.id)).id;
    return [seq([...p.pairTileIds]), seq([p.pairTileIds[0], other])];
  }
  if (eng === 'LOG_003' || eng === 'LNG_003') {
    const swapped = [...p.correctOrder];
    [swapped[0], swapped[1]] = [swapped[1], swapped[0]];
    return [seq([...p.correctOrder]), seq(swapped)];
  }
  if (eng === 'ATT_002') {
    const distractor = p.board.find((t) => !p.targetIds.includes(t.id)).id;
    return [seq([...p.targetIds]), seq([p.targetIds[0], distractor])];
  }
  if (eng === 'ATT_001') {
    const targets = p.symbols.filter((s) => s.isTarget).map((s) => s.id);
    const distractor = p.symbols.find((s) => !s.isTarget).id;
    const sweep = (tapped) => {
      const hits = tapped.filter((id) => targets.includes(id)).length;
      return {
        raw: { tappedIds: tapped },
        answer: { kind: 'sweep', hits, falsePositives: tapped.length - hits, totalTargets: targets.length, tappedIds: [...tapped], elapsedMs },
      };
    };
    return [sweep(targets), sweep([targets[0], distractor])];
  }
  if (eng === 'ATT_003') {
    const classify = (subset) => {
      const classifications = subset.map((i) => ({ itemId: i.id, bucket: i.bucket }));
      return {
        raw: { classifications },
        answer: { kind: 'classify', correct: subset.length, attempted: subset.length, total: p.items.length, classifications, elapsedMs },
      };
    };
    return [classify(p.items), classify(p.items.slice(0, Math.ceil(p.items.length / 2)))];
  }
  throw new Error(`no play generator for ${eng}`);
}
