import { useEffect, useMemo, useState } from "react";
import { devices, type DeviceCategory, type DeviceType } from "../data/devices";
import { categoryColor, categoryLabel } from "../brand/tokens";
import { useProjectStore } from "../store/projectStore";
import { Search, X, Clock } from "lucide-react";
import { DeviceTile } from "./DeviceTile";

const CATEGORIES: DeviceCategory[] = [
  "cameras",
  "access",
  "network",
  "detection",
  "av",
  "audio",
  "lighting",
  "production",
  "wireless",
  "broadcast",
  "site",
];

const RECENTS_KEY = "knoxnet-system-designer:recent-devices";
const RECENTS_MAX = 8;

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.filter((x) => typeof x === "string").slice(0, RECENTS_MAX);
  } catch {
    /* ignore */
  }
  return [];
}

function saveRecents(ids: string[]) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(ids.slice(0, RECENTS_MAX)));
  } catch {
    /* ignore */
  }
}

/** Score how well a query matches a device. Higher = better match. */
function fuzzyScore(d: DeviceType, q: string): number {
  if (!q) return 0;
  const haystack = [
    d.label.toLowerCase(),
    d.shortCode.toLowerCase(),
    d.subcategory?.toLowerCase() ?? "",
    d.manufacturer?.toLowerCase() ?? "",
    ...(d.keywords ?? []).map((k) => k.toLowerCase()),
  ].join(" ");
  const lower = q.toLowerCase();
  // Strong prefix match on label
  if (d.label.toLowerCase().startsWith(lower)) return 100;
  if (d.shortCode.toLowerCase() === lower) return 95;
  if (haystack.includes(lower)) return 60;
  // Token-based scoring: every space-separated token in the query must
  // appear somewhere in the haystack
  const tokens = lower.split(/\s+/).filter(Boolean);
  let score = 0;
  for (const t of tokens) {
    if (haystack.includes(t)) score += 10;
    else return 0;
  }
  return score;
}

export function DevicePalette() {
  const activeDeviceId = useProjectStore((s) => s.activeDeviceId);
  const setActiveDevice = useProjectStore((s) => s.setActiveDevice);
  const togglePalette = useProjectStore((s) => s.togglePalette);
  const [filter, setFilter] = useState<DeviceCategory | "all" | "recents">("all");
  const [q, setQ] = useState("");
  const [recents, setRecents] = useState<string[]>(() => loadRecents());

  // Track recents — bump deviceId to top whenever user picks a device
  useEffect(() => {
    if (!activeDeviceId) return;
    setRecents((rs) => {
      const next = [activeDeviceId, ...rs.filter((id) => id !== activeDeviceId)].slice(0, RECENTS_MAX);
      saveRecents(next);
      return next;
    });
  }, [activeDeviceId]);

  const list = useMemo(() => {
    let pool = devices;
    if (filter === "recents") {
      // Preserve recents order
      const idx = new Map(recents.map((id, i) => [id, i] as const));
      pool = devices
        .filter((d) => idx.has(d.id))
        .sort((a, b) => (idx.get(a.id) ?? 0) - (idx.get(b.id) ?? 0));
    } else if (filter !== "all") {
      pool = devices.filter((d) => d.category === filter);
    }
    if (q) {
      const scored = pool
        .map((d) => ({ d, score: fuzzyScore(d, q) }))
        .filter((s) => s.score > 0)
        .sort((a, b) => b.score - a.score);
      return scored.map((s) => s.d);
    }
    return pool;
  }, [filter, q, recents]);

  // Group by subcategory when not searching
  const groups = useMemo(() => {
    if (q) return null; // search results stay flat
    const map = new Map<string, DeviceType[]>();
    for (const d of list) {
      const key = d.subcategory ?? "Other";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(d);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [list, q]);

  return (
    <div className="absolute left-4 top-20 bottom-16 w-80 panel rounded-xl flex flex-col z-20 animate-slide-up">
      <div className="px-3 py-2.5 border-b border-white/5 flex items-center justify-between">
        <div className="label">Device Library</div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-mono text-ink-400">
            {list.length} of {devices.length}
          </span>
          <button onClick={togglePalette} className="text-ink-400 hover:text-ink-50 ml-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="px-3 py-2 border-b border-white/5">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, model, or keyword…"
            className="input pl-8"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-400 hover:text-ink-50"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      <div className="px-3 py-2 border-b border-white/5 flex flex-wrap gap-1 max-h-24 overflow-y-auto">
        {recents.length > 0 && (
          <CategoryPill
            active={filter === "recents"}
            onClick={() => setFilter("recents")}
            color="#F4B740"
            icon={<Clock className="w-3 h-3" />}
          >
            Recent
          </CategoryPill>
        )}
        <CategoryPill active={filter === "all"} onClick={() => setFilter("all")} color="#94A0B8">
          All
        </CategoryPill>
        {CATEGORIES.map((c) => (
          <CategoryPill
            key={c}
            active={filter === c}
            onClick={() => setFilter(c)}
            color={categoryColor[c]!}
          >
            {categoryLabel[c]}
          </CategoryPill>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {q ? (
          <div className="grid grid-cols-2 gap-2">
            {list.map((d) => (
              <DeviceTile
                key={d.id}
                device={d}
                active={activeDeviceId === d.id}
                onClick={() =>
                  setActiveDevice(activeDeviceId === d.id ? null : d.id)
                }
              />
            ))}
            {list.length === 0 && (
              <div className="col-span-2 text-center text-xs text-ink-400 py-8">
                No devices match "{q}".
                <br />
                <span className="text-ink-500">Try a model number or category.</span>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {groups?.map(([sub, items]) => (
              <div key={sub}>
                {filter === "all" ? null : (
                  <div className="px-1 py-0.5 text-[10px] font-mono uppercase tracking-wider text-ink-500">
                    {sub}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {items.map((d) => (
                    <DeviceTile
                      key={d.id}
                      device={d}
                      active={activeDeviceId === d.id}
                      onClick={() =>
                        setActiveDevice(activeDeviceId === d.id ? null : d.id)
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
            {list.length === 0 && (
              <div className="text-center text-xs text-ink-400 py-8">
                {filter === "recents" ? "No recent devices yet." : "No devices."}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t border-white/5 text-[11px] text-ink-400 font-mono">
        {activeDeviceId
          ? `Click on the sheet to drop selected device`
          : `${devices.length} devices · type to search`}
      </div>
    </div>
  );
}

function CategoryPill({
  active,
  color,
  children,
  icon,
  onClick,
}: {
  active: boolean;
  color: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors flex items-center gap-1 ${active ? "bg-white/10 text-ink-50" : "text-ink-300 hover:text-ink-50 border-white/5"}`}
      style={{ borderColor: active ? color : undefined, color: active ? color : undefined }}
    >
      {icon}
      {children}
    </button>
  );
}
