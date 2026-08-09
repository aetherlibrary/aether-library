// Pure geometry for the production app split (the draggable separator
// between the library scene and the workspace — see initAppSplitDivider()
// in public/app.js, which mirrors these two functions inline because it is
// a plain global-scope browser script and can't import an ES module; same
// convention as src/services/animationPlayback.js and animationBehavior.js).
// This file is the math's Node-testable home.
//
// Historical note, because it is the whole reason this math is now
// exercised by real tests: dragging appeared completely non-functional in
// the real app. The pointer chain was never at fault (pointerdown,
// setPointerCapture, pointermove, pointerup all fired correctly, verified
// with trusted CDP input). The right panel's rendered width was being
// capped at 560px by #chat-panel's own `max-width` — with the minimum
// pinned to the ~487px default, that left ~73px of usable travel leftward
// and exactly zero rightward, which reads as "the separator does nothing".
// The cap is now lifted while resized (body.app-split-resized, style.css)
// and clampRightPanelWidth below is the sole authority instead.

// The scene's floor. Deliberately conservative: comfortably under the 900px
// viewport breakpoint where the app abandons side-by-side layout entirely,
// and wide enough that the 16:9 cover-fit scene still reads as a scene.
export const MIN_SCENE_WIDTH_PX = 640;

// min = the layout's own default right-panel width (measured live from the
// untouched CSS ratio, never hardcoded), so the default split doubles as
// "as narrow as the workspace may get".
// max = whatever remains once the scene keeps its floor.
// The Math.max guards a viewport too narrow for both constraints at once:
// the range collapses to a single value and dragging degrades to a no-op
// rather than inverting and corrupting the layout.
export function clampRightPanelWidth({
  requestedPx,
  defaultWidthPx,
  containerWidthPx,
  dividerWidthPx = 0,
  minSceneWidthPx = MIN_SCENE_WIDTH_PX,
}) {
  const min = defaultWidthPx;
  const max = Math.max(min, containerWidthPx - dividerWidthPx - minSceneWidthPx);
  return Math.min(max, Math.max(min, requestedPx));
}

// Absolute pointer -> width mapping: the right panel is simply everything
// from the pointer to the container's right edge. Deliberately NOT a
// start-delta accumulation — with delta math, dragging far past a clamp and
// back leaves the split desynced from the cursor by however many pixels
// were clamped away. Half the divider's width is subtracted so the visible
// line sits centered under the cursor instead of trailing it.
export function rightPanelWidthForPointer({
  pointerX,
  containerRightPx,
  dividerWidthPx = 0,
  ...clampArgs
}) {
  return clampRightPanelWidth({
    requestedPx: containerRightPx - pointerX - dividerWidthPx / 2,
    dividerWidthPx,
    ...clampArgs,
  });
}
