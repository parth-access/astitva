"use client";

import { useState } from "react";
import { MEASUREMENT_FIELDS } from "@/modules/catalog-admin/fields";

/**
 * Colours × sizes for one style, as the seller has them. Add any colours and
 * any sizes; the grid holds how many of each combination are in hand. A blank
 * cell means that combination isn't made; 0 means sold out for now.
 *
 * Field names follow modules/catalog-admin/input.ts. Row numbers are stable
 * ids, so removing a row doesn't shift the others' errors.
 */

type Colour = { id: number; name: string; hex: string; was: string };
type Size = { id: number; name: string; was: string; measures: Record<string, string> };

const QUICK_SIZES = ["XS", "S", "M", "L", "XL"];
const SWATCH_FALLBACK = "#d9c7ad";

function rowsFrom(values: Record<string, string>, prefix: "c" | "s") {
  return [...new Set(Object.keys(values).flatMap((k) => new RegExp(`^${prefix}\\.(\\d+)\\.`).exec(k)?.[1] ?? []))]
    .map(Number)
    .sort((a, b) => a - b);
}

export function VariantBuilder({
  values,
  errors,
}: {
  /** Form values (saved, or as typed before a failed save). */
  values: Record<string, string>;
  errors: Record<string, string>;
}) {
  const [colours, setColours] = useState<Colour[]>(() => {
    const ids = rowsFrom(values, "c");
    return ids.length
      ? ids.map((id) => ({ id, name: values[`c.${id}.name`] ?? "", hex: values[`c.${id}.hex`] ?? "", was: values[`c.${id}.was`] ?? "" }))
      : [{ id: 0, name: "", hex: "", was: "" }];
  });
  const [sizes, setSizes] = useState<Size[]>(() => {
    const ids = rowsFrom(values, "s");
    return ids.length
      ? ids.map((id) => ({
          id,
          name: values[`s.${id}.name`] ?? "",
          was: values[`s.${id}.was`] ?? "",
          measures: Object.fromEntries(MEASUREMENT_FIELDS.map(([k]) => [k, values[`s.${id}.${k}`] ?? ""])),
        }))
      : [{ id: 0, name: "", was: "", measures: {} }];
  });
  const [stock, setStock] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(values).filter(([k]) => k.startsWith("stock."))),
  );
  const [nextId, setNextId] = useState(() => Math.max(0, ...rowsFrom(values, "c"), ...rowsFrom(values, "s")) + 1);

  const cell = (c: Colour, s: Size) => stock[`stock.${c.id}.${s.id}`] ?? "";
  const setCell = (c: Colour, s: Size, v: string) => setStock((m) => ({ ...m, [`stock.${c.id}.${s.id}`]: v.replace(/[^0-9]/g, "") }));
  const total = (cells: string[]) => cells.reduce((n, v) => n + (Number(v) || 0), 0);

  function addColour() {
    setColours((list) => [...list, { id: nextId, name: "", hex: "", was: "" }]);
    setNextId((n) => n + 1);
  }
  function addSize(name = "") {
    if (name && sizes.some((s) => s.name.toLowerCase() === name.toLowerCase())) return;
    // Replace a single unnamed placeholder size rather than adding beside it.
    if (name && sizes.length === 1 && !sizes[0]!.name && !sizes[0]!.was) {
      setSizes([{ ...sizes[0]!, name }]);
      return;
    }
    setSizes((list) => [...list, { id: nextId, name, was: "", measures: {} }]);
    setNextId((n) => n + 1);
  }
  /** Fill every empty cell with a number (handy when everything came in at once). */
  function fillEmpty(n: string) {
    setStock((m) => {
      const out = { ...m };
      for (const c of colours) for (const s of sizes) if (!out[`stock.${c.id}.${s.id}`]) out[`stock.${c.id}.${s.id}`] = n;
      return out;
    });
  }

  const err = (k: string) => errors[k];

  return (
    <div className="space-y-8">
      {/* Colours */}
      <div>
        <div className="flex items-baseline justify-between gap-4">
          <h3 className="font-medium">Colours</h3>
          <button type="button" className="link text-sm" onClick={addColour}>
            Add a colour
          </button>
        </div>
        <p className="mt-1 text-xs text-espresso-soft">
          {colours.length === 1 ? "One colour? You can leave its name blank." : "Customers choose between these, by name and swatch."}
        </p>
        <ul className="mt-3 space-y-2">
          {colours.map((c) => (
            <li key={c.id} className="flex items-start gap-2">
              <input type="hidden" name={`c.${c.id}.was`} value={c.was} />
              <label className="relative mt-0.5 block size-11 shrink-0 cursor-pointer overflow-hidden rounded-full border border-taupe" title="Pick the swatch colour">
                <span className="absolute inset-0" style={{ backgroundColor: /^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : SWATCH_FALLBACK }} />
                <input
                  type="color"
                  aria-label={`Swatch for ${c.name || "this colour"}`}
                  value={/^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : SWATCH_FALLBACK}
                  onChange={(e) => setColours((list) => list.map((x) => (x.id === c.id ? { ...x, hex: e.target.value } : x)))}
                  className="absolute inset-0 cursor-pointer opacity-0"
                />
              </label>
              <input type="hidden" name={`c.${c.id}.hex`} value={c.hex} />
              <div className="flex-1">
                <input
                  name={`c.${c.id}.name`}
                  value={c.name}
                  onChange={(e) => setColours((list) => list.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))}
                  placeholder="Colour name, e.g. Sage"
                  maxLength={48}
                  aria-label="Colour name"
                  aria-invalid={err(`c.${c.id}.name`) ? true : undefined}
                  className="block min-h-11 w-full rounded-[1px] border border-taupe bg-ivory px-3 text-base focus:border-espresso aria-invalid:border-burgundy"
                />
                {err(`c.${c.id}.name`) ? <span className="mt-1 block text-xs font-medium text-burgundy">{err(`c.${c.id}.name`)}</span> : null}
              </div>
              {colours.length > 1 ? (
                <button
                  type="button"
                  className="mt-3 text-sm text-espresso-soft hover:text-burgundy"
                  aria-label={`Remove ${c.name || "this colour"}`}
                  onClick={() => setColours((list) => list.filter((x) => x.id !== c.id))}
                >
                  Remove
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {/* Sizes */}
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="font-medium">Sizes</h3>
          <div className="flex flex-wrap gap-2 text-sm">
            {QUICK_SIZES.map((q) => (
              <button
                key={q}
                type="button"
                disabled={sizes.some((s) => s.name.toLowerCase() === q.toLowerCase())}
                onClick={() => addSize(q)}
                className="min-h-9 min-w-9 border border-taupe px-2 transition-colors hover:border-espresso disabled:opacity-35"
              >
                {q}
              </button>
            ))}
            <button type="button" className="min-h-9 border border-taupe px-2 hover:border-espresso" onClick={() => addSize("Free size")} disabled={sizes.some((s) => s.name === "Free size")}>
              Free size
            </button>
            <button type="button" className="link" onClick={() => addSize()}>
              Other…
            </button>
          </div>
        </div>
        <ul className="mt-3 flex flex-wrap gap-2">
          {sizes.map((s) => (
            <li key={s.id} className="flex items-center border border-taupe bg-ivory">
              <input type="hidden" name={`s.${s.id}.was`} value={s.was} />
              <input
                name={`s.${s.id}.name`}
                value={s.name}
                onChange={(e) => setSizes((list) => list.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))}
                placeholder={sizes.length === 1 ? "One size" : "Size"}
                maxLength={24}
                aria-label="Size"
                aria-invalid={err(`s.${s.id}.name`) ? true : undefined}
                className="min-h-10 w-24 bg-transparent px-3 text-base aria-invalid:text-burgundy"
              />
              {sizes.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Remove size ${s.name}`}
                  className="px-2 text-espresso-soft hover:text-burgundy"
                  onClick={() => setSizes((list) => list.filter((x) => x.id !== s.id))}
                >
                  ×
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {sizes.map((s) =>
          err(`s.${s.id}.name`) ? (
            <span key={s.id} className="mt-1 block text-xs font-medium text-burgundy">
              {s.name || "A size"}: {err(`s.${s.id}.name`)}
            </span>
          ) : null,
        )}
      </div>

      {/* Stock grid */}
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h3 className="font-medium">In stock</h3>
          <div className="flex gap-3 text-sm">
            <button type="button" className="link" onClick={() => fillEmpty("1")}>
              Fill empty with 1
            </button>
            <button type="button" className="link" onClick={() => fillEmpty("0")}>
              with 0
            </button>
          </div>
        </div>
        <p className="mt-1 text-xs text-espresso-soft">How many you have of each. Leave a box empty if that colour isn&apos;t made in that size; 0 shows it as sold out.</p>
        {err("stock") ? <p className="mt-2 text-xs font-medium text-burgundy">{err("stock")}</p> : null}
        <div className="mt-3 overflow-x-auto">
          <table className="border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 bg-ivory pr-3 text-left font-normal text-espresso-soft" />
                {sizes.map((s) => (
                  <th key={s.id} className="min-w-16 px-1 pb-2 text-center font-medium">
                    {s.name || "One size"}
                  </th>
                ))}
                <th className="px-2 pb-2 text-right font-normal text-espresso-soft">Total</th>
              </tr>
            </thead>
            <tbody>
              {colours.map((c) => (
                <tr key={c.id}>
                  <th scope="row" className="sticky left-0 bg-ivory py-1 pr-3 text-left font-normal">
                    <span className="flex items-center gap-2">
                      <span className="inline-block size-3.5 rounded-full border border-taupe" style={{ backgroundColor: /^#[0-9a-f]{6}$/i.test(c.hex) ? c.hex : SWATCH_FALLBACK }} />
                      {c.name || (colours.length === 1 ? "All" : "Unnamed")}
                    </span>
                  </th>
                  {sizes.map((s) => {
                    const name = `stock.${c.id}.${s.id}`;
                    const value = cell(c, s);
                    return (
                      <td key={s.id} className="px-1 py-1">
                        <input
                          name={name}
                          value={value}
                          onChange={(e) => setCell(c, s, e.target.value)}
                          inputMode="numeric"
                          placeholder="—"
                          aria-label={`${c.name || "Stock"} in ${s.name || "one size"}`}
                          aria-invalid={err(name) ? true : undefined}
                          title={err(name)}
                          className={`block h-11 w-16 rounded-[1px] border text-center text-base tabular-nums transition-colors focus:border-espresso aria-invalid:border-burgundy ${
                            value === "" ? "border-dashed border-taupe bg-transparent" : value === "0" ? "border-taupe bg-champagne text-espresso-soft" : "border-taupe bg-ivory"
                          }`}
                        />
                      </td>
                    );
                  })}
                  <td className="px-2 text-right tabular-nums text-espresso-soft">{total(sizes.map((s) => cell(c, s)))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {Object.entries(errors)
          .filter(([k]) => k.startsWith("stock."))
          .map(([k, m]) => (
            <p key={k} className="mt-1 text-xs font-medium text-burgundy">
              {m}
            </p>
          ))}
      </div>

      {/* Measurements per size */}
      <details>
        <summary className="cursor-pointer font-medium">Measurements (cm), per size</summary>
        <p className="mt-1 text-xs text-espresso-soft">Garment measurements, laid flat and doubled where it wraps around. Shown on the piece page.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr>
                <th />
                {MEASUREMENT_FIELDS.map(([, label]) => (
                  <th key={label} className="px-1 pb-2 font-normal text-espresso-soft">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sizes.map((s) => (
                <tr key={s.id}>
                  <th scope="row" className="pr-3 text-left font-medium">
                    {s.name || "One size"}
                  </th>
                  {MEASUREMENT_FIELDS.map(([key, label]) => (
                    <td key={key} className="px-1 py-1">
                      <input
                        name={`s.${s.id}.${key}`}
                        value={s.measures[key] ?? ""}
                        onChange={(e) =>
                          setSizes((list) => list.map((x) => (x.id === s.id ? { ...x, measures: { ...x.measures, [key]: e.target.value } } : x)))
                        }
                        inputMode="decimal"
                        aria-label={`${label}, size ${s.name || "one size"}`}
                        aria-invalid={err(`s.${s.id}.${key}`) ? true : undefined}
                        className="block h-10 w-16 border border-taupe bg-ivory text-center tabular-nums aria-invalid:border-burgundy"
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
