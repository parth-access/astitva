import { Fragment, type ReactNode } from "react";

export const GRID = "rise-grid grid grid-cols-2 gap-x-4 gap-y-14 sm:gap-x-8 lg:grid-cols-3 lg:gap-x-12 lg:[&>li:nth-child(3n+2)]:translate-y-16";

/** How many cards between editorial breaks: two rows on wide screens, three on phones. */
export const BREAK_EVERY = 6;

/**
 * Cards in rows, with an editorial break after every BREAK_EVERY cards
 * (while there are breaks left and cards after them). Each run of cards is
 * its own list, so the stepped middle column lines up in every run.
 * Works on the server and in the browser.
 */
export function GridRows({ cards, breaks = [] }: { cards: { id: string; card: ReactNode }[]; breaks?: ReactNode[] }) {
  // Split only where a break goes: after each full run, while breaks last and cards remain.
  const runs: (typeof cards)[] = [];
  let from = 0;
  while (runs.length < breaks.length && cards.length - from > BREAK_EVERY) {
    runs.push(cards.slice(from, from + BREAK_EVERY));
    from += BREAK_EVERY;
  }
  runs.push(cards.slice(from));
  return (
    <>
      {runs.map((run, k) => (
        <Fragment key={run[0]?.id ?? k}>
          <ul className={GRID}>
            {run.map((c) => (
              <li key={c.id} className="rise">
                {c.card}
              </li>
            ))}
          </ul>
          {k < runs.length - 1 && breaks[k] ? breaks[k] : null}
        </Fragment>
      ))}
    </>
  );
}
