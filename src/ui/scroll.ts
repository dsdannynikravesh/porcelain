import type { ScrollBoxRenderable } from "@opentui/core";

// A replacement for OpenTUI's ScrollBox.scrollChildIntoView, whose
// nearest-edge math reads the target row's position without accounting for
// the box's current scroll offset. That works the first time (scrollTop is
// still 0) but desyncs the moment anything has scrolled, so a fast-moving
// selection loses its highlighted row off-screen for several steps before
// (sometimes) resyncing. Doing the arithmetic ourselves against fixed-height
// rows sidesteps it entirely.
export function ensureRowVisible(
  box: ScrollBoxRenderable | null | undefined,
  index: number,
  rowHeight: number,
): void {
  if (!box || index < 0) return;
  const top = index * rowHeight;
  const bottom = top + rowHeight;
  const viewportHeight = box.viewport.height;
  if (top < box.scrollTop) {
    box.scrollTop = top;
  } else if (bottom > box.scrollTop + viewportHeight) {
    box.scrollTop = bottom - viewportHeight;
  }
}
