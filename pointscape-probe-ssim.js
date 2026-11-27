(function (scope) {
  // Local SSIM on display luminance. Alpha supplies occupancy, even for black points.
  function compare(reference, candidate, size, radius = 3) {
    const stride = size + 1;
    const moments = Array.from({ length: 6 }, () => new Float64Array(stride ** 2));
    const row = new Float64Array(6);
    for (let y = 1; y <= size; y++) {
      row.fill(0);
      for (let x = 1; x <= size; x++) {
        const i = ((y - 1) * size + x - 1) * 4;
        const a = reference[i] * 0.2126 + reference[i + 1] * 0.7152 + reference[i + 2] * 0.0722;
        const b = candidate[i] * 0.2126 + candidate[i + 1] * 0.7152 + candidate[i + 2] * 0.0722;
        row[0] += Number(Boolean(reference[i + 3] || candidate[i + 3]));
        row[1] += a;
        row[2] += b;
        row[3] += a * a;
        row[4] += b * b;
        row[5] += a * b;
        const p = y * stride + x;
        for (let j = 0; j < moments.length; j++) moments[j][p] = moments[j][p - stride] + row[j];
      }
    }
    const error = new Uint8Array(size ** 2);
    const occupiedPixels = moments[0].at(-1);
    if (!occupiedPixels) return { score: null, error, occupiedPixels };
    const c1 = (0.01 * 255) ** 2;
    const c2 = (0.03 * 255) ** 2;
    let sum = 0;
    let count = 0;
    for (let y = 0; y < size; y++) {
      const top = Math.max(0, y - radius);
      const bottom = Math.min(size, y + radius + 1);
      for (let x = 0; x < size; x++) {
        const left = Math.max(0, x - radius);
        const right = Math.min(size, x + radius + 1);
        const tl = top * stride + left, tr = top * stride + right;
        const bl = bottom * stride + left, br = bottom * stride + right;
        const area = (right - left) * (bottom - top);
        const total = m => m[br] - m[bl] - m[tr] + m[tl];
        // The union mask expanded by the window radius excludes distant background.
        if (!total(moments[0])) continue;
        const a = total(moments[1]) / area;
        const b = total(moments[2]) / area;
        const va = Math.max(0, total(moments[3]) / area - a * a);
        const vb = Math.max(0, total(moments[4]) / area - b * b);
        const cov = total(moments[5]) / area - a * b;
        const local = Math.max(-1, Math.min(1,
          (2 * a * b + c1) * (2 * cov + c2) / ((a * a + b * b + c1) * (va + vb + c2))));
        sum += local;
        count++;
        error[y * size + x] = Math.round(255 * (1 - local) / 2);
      }
    }
    const score = sum / count;
    return { score: score > 1 - 1e-10 ? 1 : score, error, occupiedPixels };
  }

  if (typeof module !== "undefined") module.exports = { compare };
  else scope.onmessage = ({ data: { id, reference, candidate, size } }) => {
    const result = compare(reference, candidate, size);
    scope.postMessage({ id, ...result }, [result.error.buffer]);
  };
})(globalThis);
