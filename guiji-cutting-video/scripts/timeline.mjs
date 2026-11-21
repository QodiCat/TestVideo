export const clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));

export function randomFromSeed(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function makeTimeline(cuts, seconds) {
  let start = 0;
  return cuts.map((count, index) => {
    const duration = seconds[index];
    const base = Math.floor(count / 3);
    const extra = count % 3;
    const axes = [base + Number(extra >= 1), base + Number(extra === 2), base];
    const stage = { count, axes, start, duration, lead: 0.16, cutting: duration - 0.92 };
    start += duration;
    return stage;
  });
}

export function stageAt(timeline, time) {
  return timeline.findLastIndex(stage => time >= stage.start);
}

export function cutProgress(stage, localTime) {
  return clamp((localTime - stage.lead) / stage.cutting) * stage.count;
}

export function impactTime(stage, cut) {
  return stage.lead + (cut + 0.62) / stage.count * stage.cutting;
}

export function layerCut(stage, layerFromFront) {
  const [alongX, horizontal, alongZ] = stage.axes;
  return alongX + horizontal + Math.min(layerFromFront, alongZ - 1);
}
