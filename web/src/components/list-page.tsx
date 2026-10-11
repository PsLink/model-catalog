// The catalog's lists: the models (/) and the variants (/variants.html).
// Both have the same summary, filters, and card and table views over the
// list's entries; the filters live in the URL, so a view can be shared, and
// carry over to the other list.
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import type { Catalog } from "@/types";
import { latestVersion } from "@/lib/catalog";
import { countBy, sortDir, sorters, type Facet } from "@/lib/facets";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Toggle } from "@/components/ui/toggle";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FilterSelect, GpuToggles, Summary } from "./catalog";
import { icons } from "./icons";
import { ListTabs, SiteFooter, SiteHeader } from "./site";

type View = "cards" | "table";

interface State {
  q: string;
  family: string;
  engine: string;
  tag: string;
  hidedep: boolean;
  sort: string;
  view: View;
  hardware: string[];
}

const DEFAULTS = { sort: "uplift", view: "table" };

export type SortHead = (col: string, label: string, opts?: { className?: string; title?: string; sub?: string }) => ReactElement;

export interface ListConfig {
  noun: string;
  facets: Facet[];
  search: string;
  sorts: Array<[string, string]>;
  // What a GPU toggle counts, for its tooltip.
  gpuWhat: string;
  // The card grid's narrowest column.
  cardWidth: number;
  head: (th: SortHead) => ReactNode;
  // Entry i, hidden when the filters leave it out. Every entry stays
  // rendered, so a filter only flips the ones it changes.
  card: (i: number, hidden: boolean) => ReactElement;
  row: (i: number, hidden: boolean) => ReactElement;
}

function matches(m: Facet, st: State): boolean {
  const terms = st.q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.every((t) => m.text.includes(t))) return false;
  if (st.family && m.family !== st.family) return false;
  if (st.engine && !m.engines.includes(st.engine)) return false;
  if (st.hardware.length && !st.hardware.some((h) => m.hardware.includes(h))) return false;
  if (st.tag && !m.tags.includes(st.tag)) return false;
  if (st.hidedep && m.deprecated) return false;
  return true;
}

// The query string for a state: what differs from the defaults.
function queryOf(st: State): string {
  const params = new URLSearchParams();
  for (const k of ["q", "family", "engine", "tag", "hidedep", "sort", "view"] as const) {
    const v = st[k];
    if (v === true) params.set(k, "1");
    else if (v && v !== DEFAULTS[k as keyof typeof DEFAULTS]) params.set(k, v);
  }
  for (const h of st.hardware) params.append("hardware", h);
  return params.toString();
}

// On phones, two selects share a row.
const field = "max-[560px]:w-full max-[560px]:flex-[1_1_calc(50%-0.25rem)]";

export function ListPage({ catalog, cfg }: { catalog: Catalog; cfg: ListConfig }) {
  const { facets, noun } = cfg;
  const html = document.documentElement;
  const [params] = useSearchParams();
  const options = useMemo(
    () => ({
      family: facets.map((f) => f.family).filter((f): f is string => !!f),
      engine: facets.flatMap((f) => [...new Set(f.engines)]),
      tag: facets.flatMap((f) => f.tags),
      hardware: countBy(facets.flatMap((f) => f.hardware)),
    }),
    [facets]
  );
  const hasDeprecated = facets.some((f) => f.deprecated);

  // From the URL; a value no control offers is dropped. The boot script in
  // index.html already picked the view from the URL or storage.
  const [st, setSt] = useState<State>(() => {
    const pick = (k: string, allowed: string[], fallback: string) => {
      const v = params.get(k);
      return v != null && allowed.includes(v) ? v : fallback;
    };
    return {
      q: params.get("q") ?? "",
      family: pick("family", ["", ...options.family], ""),
      engine: pick("engine", ["", ...options.engine], ""),
      tag: pick("tag", ["", ...options.tag], ""),
      hidedep: hasDeprecated && params.get("hidedep") === "1",
      sort: pick("sort", cfg.sorts.map(([v]) => v), DEFAULTS.sort),
      view: pick("view", ["cards", "table"], html.dataset.view === "cards" ? "cards" : "table") as View,
      hardware: params.getAll("hardware").filter((h) => h in options.hardware),
    };
  });
  const set = (patch: Partial<State>) => setSt((s) => ({ ...s, ...patch }));

  // The filters are kept in the URL by replacing it in place, not by a router
  // navigation: one would re-render the whole route on every keystroke. The
  // history entry keeps the router's state, so Back and Forward still find
  // the filters in the URL.
  const qs = queryOf(st);
  useEffect(() => {
    html.dataset.view = st.view;
    const url = location.pathname + (qs ? `?${qs}` : "") + location.hash;
    if (url !== location.pathname + location.search + location.hash) history.replaceState(history.state, "", url);
  }, [qs, st.view, html]);

  // "/" focuses the search; Escape clears it.
  const search = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = document.activeElement;
      if (e.key === "/" && !/^(INPUT|SELECT|TEXTAREA)$/.test(t?.tagName ?? "")) {
        e.preventDefault();
        search.current?.focus();
      } else if (e.key === "Escape" && t === search.current && search.current?.value) {
        set({ q: "" });
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const sorter = sorters[st.sort] || sorters[DEFAULTS.sort];
  const order = useMemo(() => facets.map((_, i) => i).sort((a, b) => sorter(facets[a], facets[b])), [facets, sorter]);
  const shown = order.filter((i) => matches(facets[i], st));
  const visible = new Set(shown);
  // A view, once shown, stays rendered and is only hidden while the other is
  // on, so switching back is immediate.
  const kept = useRef(new Set<View>());
  kept.current.add(st.view);

  // Tag, family and GPU chips set their filter; table headers set the sort.
  const onResultsClick = (e: MouseEvent) => {
    const target = e.target as Element;
    const chip = target.closest<HTMLElement>("[data-filter]");
    if (chip) {
      const { filter, value = "" } = chip.dataset;
      if (filter === "hardware") {
        if (value in options.hardware && !st.hardware.includes(value)) set({ hardware: [...st.hardware, value] });
      } else if (filter === "family" || filter === "engine" || filter === "tag") {
        if (options[filter].includes(value)) set({ [filter]: value });
      }
      form.current?.scrollIntoView({ block: "nearest" });
      return;
    }
    const sort = target.closest<HTMLElement>("[data-sort]");
    if (sort) set({ sort: sort.dataset.sort });
  };

  const th: SortHead = (col, label, { className, title, sub } = {}) => {
    const dir = col === st.sort ? sortDir[col] : undefined;
    return (
      <TableHead aria-sort={dir} className={className} title={title}>
        <Button variant="bare" size="none" data-sort={col} className={cn("hover:text-foreground", dir && "text-foreground")}>
          {label}
          <span className="inline-block w-[0.7em]" aria-hidden="true">
            {dir === "ascending" ? "↑" : dir === "descending" ? "↓" : ""}
          </span>
        </Button>
        {sub && <span className="mt-[0.1rem] block text-[0.68rem] font-normal text-faint">{sub}</span>}
      </TableHead>
    );
  };

  const variants = catalog.models.reduce((n, m) => n + latestVersion(m).variants.length, 0);
  const select = (name: "family" | "engine" | "tag", all: string) => (
    <FilterSelect
      label={name[0].toUpperCase() + name.slice(1)}
      all={all}
      values={options[name]}
      value={st[name]}
      onChange={(value) => set({ [name]: value })}
      className={field}
    />
  );

  return (
    <>
      <SiteHeader
        title={
          <>
            Model <em>catalog</em>
          </>
        }
        description={
          <>
            The models{" "}
            <a href="https://github.com/modelsphere/swiss" target="_blank" rel="noopener">
              swiss
            </a>{" "}
            can deploy, and how to serve each one: engine, image, flags, GPUs and tuned variants.
          </>
        }
      />
      <main className="wrap">
        <ListTabs query={qs ? `?${qs}` : ""} models={catalog.count} variants={variants} />
        <Summary items={shown.map((i) => facets[i])} />
        <form
          role="search"
          ref={form}
          onSubmit={(e) => e.preventDefault()}
          className="sticky top-0 z-[5] mb-2 grid gap-[0.6rem] bg-[color-mix(in_srgb,var(--background)_90%,transparent)] py-3 backdrop-blur-[10px]"
        >
          {/* The search has a line of its own; "/" anywhere goes to it. */}
          <label className="relative block">
            <span className="sr-only">Search {noun}</span>
            <Input
              type="search"
              name="q"
              placeholder={cfg.search}
              autoComplete="off"
              ref={search}
              value={st.q}
              onChange={(e) => set({ q: e.target.value })}
              className="peer"
            />
            <Kbd aria-hidden="true" className="absolute top-1/2 right-[0.6rem] -translate-y-1/2 peer-focus:hidden peer-[:not(:placeholder-shown)]:hidden">
              /
            </Kbd>
          </label>
          {/* What to show on the left; how many, in what order and how, on the right. */}
          <div className="flex flex-wrap items-center gap-2">
            {select("family", "All families")}
            {select("engine", "All engines")}
            {select("tag", "All tags")}
            {hasDeprecated && (
              <Toggle className="hue-red" pressed={st.hidedep} onPressedChange={(on) => set({ hidedep: on })}>
                Hide deprecated
              </Toggle>
            )}
            <span className="flex-[1_1_auto] max-[560px]:hidden"></span>
            <p aria-live="polite" className="mx-1 text-[0.85rem] text-muted-foreground tabular-nums">
              {shown.length === facets.length ? `${facets.length} ${noun}` : `${shown.length} of ${facets.length} ${noun}`}
            </p>
            <Select value={st.sort} onValueChange={(sort) => set({ sort })}>
              <SelectTrigger aria-label="Sort by" className={field}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {cfg.sorts.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ToggleGroup
              type="single"
              variant="segment"
              aria-label="View"
              value={st.view}
              onValueChange={(value: string) => {
                if (value !== "cards" && value !== "table") return;
                try {
                  localStorage.setItem("view", value);
                } catch {
                  // Storage unavailable: the view still applies for this visit.
                }
                set({ view: value });
              }}
            >
              <ToggleGroupItem value="cards" title="Card view">
                {icons.cards}
                <span>Cards</span>
              </ToggleGroupItem>
              <ToggleGroupItem value="table" title="Table view">
                {icons.table}
                <span>Table</span>
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <GpuToggles counts={options.hardware} what={cfg.gpuWhat} selected={st.hardware} onChange={(hardware) => set({ hardware })} />
            <span className="flex-[1_1_auto] max-[560px]:hidden"></span>
            <Button
              type="button"
              variant="ghost"
              size="none"
              className="px-[0.35rem] py-[0.4rem] text-[0.85rem]"
              // Reset clears the filters but keeps the view.
              onClick={() => set({ q: "", family: "", engine: "", tag: "", hidedep: false, sort: DEFAULTS.sort, hardware: [] })}
            >
              Reset
            </Button>
          </div>
        </form>
        <div onClick={onResultsClick}>
          {kept.current.has("cards") && (
            <div
              hidden={st.view !== "cards"}
              className="grid gap-4"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(min(100%, ${cfg.cardWidth}px), 1fr))` }}
            >
              {order.map((i) => cfg.card(i, !visible.has(i)))}
            </div>
          )}
          {kept.current.has("table") && (
            <div hidden={st.view !== "table"}>
              <Table className="min-w-[820px]">
                <TableHeader>
                  <TableRow>{cfg.head(th)}</TableRow>
                </TableHeader>
                <TableBody>{order.map((i) => cfg.row(i, !visible.has(i)))}</TableBody>
              </Table>
            </div>
          )}
        </div>
        {shown.length === 0 && (
          <p className="rounded-2xl border border-dashed border-input px-4 py-12 text-center text-muted-foreground">No {noun} match these filters.</p>
        )}
      </main>
      <SiteFooter>
        Generated from <code>models/</code> by <code>npm run build:site</code>. This site is also the catalog swiss reads:{" "}
        <a href={`${import.meta.env.BASE_URL}index.json`}>index.json</a>.
      </SiteFooter>
    </>
  );
}
