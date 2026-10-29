// Keep render-target allocation bounded independently of CSS size and phone DPR.
export function graphicsProfile(safe = false) {
  return {
    antialias: !safe,
    alpha: false,
    stencil: false,
    powerPreference: "default",
    maxRatio: safe ? 1 : 1.5,
    maxPixels: safe ? 1000000 : 2000000,
  };
}

export function drawingSize(width, height, dpr, profile, maxDimension = 4096) {
  const w = Math.max(1, Number.isFinite(width) ? width : 1);
  const h = Math.max(1, Number.isFinite(height) ? height : 1);
  const ratio = Math.min(
    Math.max(1, Number.isFinite(dpr) ? dpr : 1),
    profile.maxRatio,
    Math.sqrt(profile.maxPixels / (w * h)),
    maxDimension / w,
    maxDimension / h,
  );
  return {
    width: Math.max(1, Math.floor(w * ratio)),
    height: Math.max(1, Math.floor(h * ratio)),
  };
}

export function surfaceFailure(gl) {
  if (!gl || gl.isContextLost()) return "The graphics connection was lost.";
  if (gl.drawingBufferWidth < 1 || gl.drawingBufferHeight < 1)
    return "The browser could not allocate the racing view.";
  return null;
}
