import { useEffect, useState } from "react";
import { useProjectStore, selectActiveSheet } from "../store/projectStore";
import { distancePts } from "../lib/geometry";
import { Ruler, X } from "lucide-react";

interface Props {
  points: { x: number; y: number }[];
  onClose: () => void;
}

export function CalibrationDialog({ points, onClose }: Props) {
  const sheet = useProjectStore(selectActiveSheet);
  const setCalibration = useProjectStore((s) => s.setCalibration);
  const pushToast = useProjectStore((s) => s.pushToast);
  const [val, setVal] = useState("");
  const [unit, setUnit] = useState<"ft" | "in" | "m" | "cm">("ft");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!sheet || points.length !== 2) return null;
  const lenPts = distancePts(points[0], points[1]);

  const submit = () => {
    const n = parseFloat(val);
    if (!isFinite(n) || n <= 0) {
      pushToast("error", "Enter a valid positive distance");
      return;
    }
    let realFeet = n;
    if (unit === "in") realFeet = n / 12;
    if (unit === "m") realFeet = n * 3.28084;
    if (unit === "cm") realFeet = (n / 100) * 3.28084;
    const pixelsPerFoot = lenPts / realFeet;
    setCalibration(sheet.id, {
      p1: points[0],
      p2: points[1],
      realFeet,
      pixelsPerFoot,
    });
    pushToast(
      "success",
      `Calibrated: ${pixelsPerFoot.toFixed(2)} px/ft (${(1 / pixelsPerFoot * 12).toFixed(3)} in/px)`,
    );
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-midnight/70 backdrop-blur-sm flex items-center justify-center animate-fade-in"
      onClick={onClose}
    >
      <div
        className="panel rounded-xl w-[420px] p-6 animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-amber-knox/15 text-amber-knox flex items-center justify-center">
              <Ruler className="w-5 h-5" />
            </div>
            <div>
              <div className="font-semibold text-ink-50">Calibrate Scale</div>
              <div className="text-xs text-ink-400">
                Enter the real-world distance between the two points you clicked.
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-50">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-3">
          <div className="bg-ink-900 rounded-md p-3 font-mono text-xs text-ink-300 flex items-center justify-between">
            <span>Pixel distance</span>
            <span className="text-ink-50">{lenPts.toFixed(2)} pt</span>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <div className="label mb-1">Real Distance</div>
              <input
                autoFocus
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submit()}
                placeholder="e.g. 38"
                inputMode="decimal"
                className="input"
              />
            </div>
            <div className="w-24">
              <div className="label mb-1">Unit</div>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as any)}
                className="input"
              >
                <option value="ft">feet</option>
                <option value="in">inches</option>
                <option value="m">meters</option>
                <option value="cm">cm</option>
              </select>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="btn">
            Cancel
          </button>
          <button onClick={submit} className="btn-primary">
            Apply Calibration
          </button>
        </div>
      </div>
    </div>
  );
}
