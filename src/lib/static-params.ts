/**
 * With Cache Components, `generateStaticParams` must return at least one
 * entry, or the build fails. A build that sees no published pieces (a new
 * shop, or a deploy whose database is empty) still needs to succeed, so it
 * gets one made-up entry instead; the page answers that address with
 * notFound(), like any other unknown one. Real pieces still render on demand.
 */
export const PLACEHOLDER_PARAM = "__none__";

export function atLeastOne<K extends string>(key: K, values: readonly string[]): Record<K, string>[] {
  const list = values.length ? values : [PLACEHOLDER_PARAM];
  return list.map((value) => ({ [key]: value }) as Record<K, string>);
}
