import { devicesById } from "../data/devices";
import { wallOutletId, wallOutletLayouts, type WallOutletConfig } from "../data/wallOutlets";

export function WallOutletOptions({ deviceId, onChange }: {
  deviceId: string;
  onChange: (deviceId: string) => void;
}) {
  const config = devicesById[deviceId]?.wallOutlet;
  if (!config) return null;
  const change = (patch: Partial<WallOutletConfig>) => {
    const next = { ...config, ...patch };
    const layouts = wallOutletLayouts.filter((layout) => layout.gangs === next.gangs);
    if (!layouts.some((layout) => layout.sockets === next.sockets)) next.sockets = 2;
    const nextId = wallOutletId(next);
    if (devicesById[nextId]) onChange(nextId);
  };
  return (
    <div className="space-y-2 rounded-md border border-white/10 bg-ink-900/40 p-2">
      <div className="label">Network Wall Outlet</div>
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2 text-[11px] text-ink-300">
          Faceplate
          <select className="input mt-1" value={config.gangs} onChange={(event) => change({ gangs: Number(event.target.value) as WallOutletConfig["gangs"] })}>
            <option value={1}>Single-gang</option>
            <option value={2}>Double-gang</option>
          </select>
        </label>
        <label className="text-[11px] text-ink-300">
          RJ45 sockets
          <select className="input mt-1" value={config.sockets} onChange={(event) => change({ sockets: Number(event.target.value) as WallOutletConfig["sockets"] })}>
            {wallOutletLayouts.filter((layout) => layout.gangs === config.gangs).map((layout) => (
              <option key={layout.sockets} value={layout.sockets}>{layout.sockets}</option>
            ))}
          </select>
        </label>
        <label className="text-[11px] text-ink-300">
          Cable category
          <select className="input mt-1" value={config.category} onChange={(event) => change({ category: event.target.value as WallOutletConfig["category"] })}>
            <option value="cat5e">Cat5e</option>
            <option value="cat6">Cat6</option>
          </select>
        </label>
      </div>
      <p className="text-[10px] text-ink-400">Connect permanent cable to a rear terminal and equipment to the matching front socket. Cable runs are selected separately.</p>
    </div>
  );
}
