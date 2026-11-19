/**
 * For the photo most likely to be the page's largest paint (LCP): fetch it
 * now and first. Next 16's `priority` (now `preload`) only adds a
 * <link rel=preload> and leaves the fetch at normal priority; the image is
 * already in the server HTML, so priority is what makes the difference.
 * Use on one or two images a page, never on ones that start hidden.
 */
export function firstPaint(on: boolean | undefined) {
  return on ? ({ loading: "eager", fetchPriority: "high" } as const) : {};
}
