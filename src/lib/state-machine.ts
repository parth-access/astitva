/**
 * Tiny explicit state machines. Every status change in the app goes through
 * `assertTransition`, so a forbidden move (e.g. delivered → pending_payment)
 * fails loudly instead of silently corrupting an order.
 */

export class InvalidTransitionError extends Error {
  readonly code = "invalid_transition";
  constructor(
    readonly machine: string,
    readonly from: string,
    readonly to: string,
  ) {
    super(`${machine}: cannot move from "${from}" to "${to}"`);
    this.name = "InvalidTransitionError";
  }
}

export type Machine<S extends string> = {
  readonly name: string;
  readonly states: readonly S[];
  readonly terminal: readonly S[];
  can(from: S, to: S): boolean;
  assertTransition(from: S, to: S): void;
  next(from: S): readonly S[];
};

export function defineMachine<S extends string>(
  name: string,
  transitions: { readonly [K in S]: readonly S[] },
): Machine<S> {
  const states = Object.keys(transitions) as S[];
  const terminal = states.filter((s) => transitions[s].length === 0);
  return {
    name,
    states,
    terminal,
    can: (from, to) => transitions[from]?.includes(to) ?? false,
    assertTransition(from, to) {
      if (!this.can(from, to)) throw new InvalidTransitionError(name, from, to);
    },
    next: (from) => transitions[from] ?? [],
  };
}
