import { useEffect, useState } from "react";
import { loadMenu, type MenuCategoryView } from "../lib/reservations";

const CURRENCY = (import.meta.env["VITE_CURRENCY"] as string | undefined) || "ZAR";

function formatPrice(value: number): string {
  try {
    return new Intl.NumberFormat("en-ZA", { style: "currency", currency: CURRENCY }).format(value);
  } catch {
    return value.toFixed(2);
  }
}

export function MenuSection() {
  const [categories, setCategories] = useState<MenuCategoryView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [active, setActive] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setError("");
    loadMenu()
      .then((data) => {
        setCategories(data);
        setActive((current) => current ?? data[0]?.id ?? null);
      })
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : "Unable to load the menu."),
      )
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  const visible = categories.filter((c) => c.id === active);

  return (
    <div id="menu" className="mt-14 scroll-mt-8">
      <div className="flex items-end justify-between">
        <h3 className="font-display text-2xl">Menu</h3>
        <span className="text-sm text-foreground/50">Prices and availability are live</span>
      </div>

      {loading ? (
        <div className="mt-5 rounded-2xl border border-white/70 bg-white/55 p-8 text-center backdrop-blur-xl">
          <p className="text-sm text-foreground/50">Loading the menu…</p>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="mt-5 rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center"
        >
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            onClick={load}
            className="mt-3 rounded-full border border-foreground/15 px-4 py-1.5 text-xs font-medium hover:bg-white/70"
          >
            Try again
          </button>
        </div>
      ) : categories.length === 0 ? (
        <div className="mt-5 rounded-2xl border border-white/70 bg-white/55 p-8 text-center backdrop-blur-xl">
          <p className="text-sm text-foreground/50">
            The menu will appear here once dishes are added.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Menu categories">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={c.id === active}
                onClick={() => setActive(c.id)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  c.id === active
                    ? "bg-sage-deep text-primary-foreground"
                    : "border border-white/80 bg-white/60 text-foreground/70 hover:bg-white/80"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
          {visible.map((category) => (
            <div key={category.id} className="mt-5">
              {category.description && (
                <p className="mb-3 text-sm text-foreground/50">{category.description}</p>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                {category.items.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded-2xl border border-white/70 bg-white/55 p-5 backdrop-blur-xl ${
                      item.available ? "" : "opacity-60"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-display text-lg">{item.name}</p>
                      <span className="shrink-0 font-display text-lg">
                        {item.description?.toLowerCase().includes("market price")
                          ? "MP"
                          : formatPrice(item.price)}
                      </span>
                    </div>
                    {item.description && (
                      <p className="mt-1.5 text-sm text-foreground/60">{item.description}</p>
                    )}
                    <span
                      className={`mt-3 inline-block rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        item.available
                          ? "bg-sage/20 text-sage-deep"
                          : "bg-foreground/10 text-foreground/60"
                      }`}
                    >
                      {item.available ? "Available" : "Unavailable today"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
