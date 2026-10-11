// What every page has around its content: the header, with the GitHub link
// and the theme button, and the footer; and the lists' tabs.
import { useEffect, useState, type ReactNode } from "react";
import { NavLink } from "react-router";
import { StarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { icons } from "./icons";

type Theme = "system" | "light" | "dark";
const THEMES: Theme[] = ["system", "light", "dark"];

// Cycles system -> light -> dark. The choice is stored per browser; the boot
// script in index.html applies it before first paint.
function ThemeButton() {
  const html = document.documentElement;
  const [theme, setTheme] = useState<Theme>(() => (html.dataset.theme as Theme) || "system");
  const next = () => {
    const t = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
    if (t === "system") delete html.dataset.theme;
    else html.dataset.theme = t;
    try {
      if (t === "system") localStorage.removeItem("theme");
      else localStorage.setItem("theme", t);
    } catch {
      // Storage can be unavailable (private mode); the toggle still works for this visit.
    }
    setTheme(t);
  };
  return (
    <Button
      type="button"
      id="theme-toggle"
      title={`Theme: ${theme} (click to change)`}
      onClick={next}
      className={topButton}
    >
      {THEMES.map((t) => (
        <span key={t} data-icon={t} hidden={t !== theme} className="inline-flex">
          {icons[t]}
        </span>
      ))}
      <span className="max-[560px]:hidden">{theme[0].toUpperCase() + theme.slice(1)}</span>
    </Button>
  );
}

// The header's top-right buttons share one look.
const topButton = "gap-[0.4rem] px-3 py-[0.4rem] text-[0.85rem] text-muted-foreground hover:border-input hover:text-foreground [&_svg]:size-4";

// The repository's stars, asked of GitHub once per visit; null until known,
// or when GitHub will not say (rate limit, offline): the link shows without.
let starsAsked: Promise<number | null> | null = null;
function useStars(): number | null {
  const [stars, setStars] = useState<number | null>(null);
  useEffect(() => {
    starsAsked ??= fetch(__REPO__.replace("https://github.com/", "https://api.github.com/repos/"))
      .then((res) => (res.ok ? res.json() : null))
      .then((repo) => (typeof repo?.stargazers_count === "number" ? repo.stargazers_count : null))
      .catch(() => null);
    starsAsked.then(setStars);
  }, []);
  return stars;
}

const compact = (n: number) => (n < 1000 ? String(n) : `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`);

// GitHub's mark, from its own icon set.
const githubMark = (
  <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
  </svg>
);

// The catalog's source on GitHub, with its stars.
function GitHubLink() {
  const stars = useStars();
  return (
    <Button asChild className={topButton}>
      <a href={__REPO__} target="_blank" rel="noopener" title="Source on GitHub">
        {githubMark}
        <span className="max-[560px]:hidden">{__REPO__.split("/").pop()}</span>
        {stars != null && (
          <span className="ml-[0.15rem] inline-flex items-center gap-1 border-l border-border pl-2 tabular-nums" title={`${stars} stars on GitHub`}>
            <StarIcon className="size-[0.95rem]!" aria-hidden="true" />
            {compact(stars)}
          </span>
        )}
      </a>
    </Button>
  );
}

// A page's header: its title centered, with a breadcrumb above when the page
// is not the catalog itself, then what it is. The GitHub link and
// the theme sit top right: beside the title on a wide screen, above it on a
// narrow one.
export function SiteHeader({ eyebrow, title, description }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode }) {
  return (
    <header className="pt-5 pb-6 min-[1024px]:pt-12 min-[1024px]:pb-8">
      <div className="wrap">
        <div className="relative">
          <div className="mb-4 flex justify-end gap-2 min-[1024px]:absolute min-[1024px]:-top-6 min-[1024px]:right-0 min-[1024px]:mb-0">
            <GitHubLink />
            <ThemeButton />
          </div>
          <div className="text-center">
            {eyebrow && (
              <p className="mb-2 text-[0.75rem] tracking-[0.08em] text-muted-foreground uppercase [&_a]:text-inherit">{eyebrow}</p>
            )}
            <h1 className="font-display text-[clamp(2.5rem,7vw,3.75rem)] leading-[1.05] font-semibold tracking-[-0.02em] [&_em]:text-primary [&_em]:italic">
              {title}
            </h1>
            {description && <p className="mx-auto mt-4 max-w-[46rem] text-[1.05rem] text-foreground/80">{description}</p>}
          </div>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter({ children }: { children: ReactNode }) {
  return (
    <footer className="wrap pt-10 pb-12 text-[0.84rem] text-faint">
      <p>{children}</p>
    </footer>
  );
}

// The lists' tabs. Each carries the filters over, so the other list opens on
// the same ones; a sort it lacks falls back.
export function ListTabs({ query, models, variants }: { query: string; models: number; variants: number }) {
  const tab = (to: string, label: string, n: number) => (
    <NavLink
      to={{ pathname: to, search: query }}
      end
      className="-mb-px inline-flex items-baseline gap-[0.4rem] border-b-2 border-transparent px-[0.85rem] py-[0.45rem] font-semibold text-muted-foreground hover:text-foreground hover:no-underline aria-[current=page]:border-primary aria-[current=page]:text-foreground"
    >
      {label}
      <span className="text-[0.8rem] font-medium text-faint tabular-nums">{n}</span>
    </NavLink>
  );
  return (
    <nav className="mb-4 flex gap-1 border-b border-border" aria-label="Catalog">
      {tab("/", "Models", models)}
      {tab("/variants.html", "Variants", variants)}
    </nav>
  );
}
