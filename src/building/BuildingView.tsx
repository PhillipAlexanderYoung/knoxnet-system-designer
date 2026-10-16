import { useEffect, useRef, useState } from "react";
import { Circle, Group, Layer, Line, Stage, Text } from "react-konva";
import type Konva from "konva";
import { useProjectStore, type DeviceMarkup, type Sheet } from "../store/projectStore";
import { SheetBackground } from "../components/SheetBackground";
import { cables, cablesById } from "../data/cables";
import { alignSheet, buildingMeasurementSheets, buildingToSheet, emptyBuilding, measureBuildingRoute, sheetToBuilding, type BuildingModel, type BuildingPoint, type BuildingRouteDraft, type SheetRegistration } from "../lib/building";

const newId = () => crypto.randomUUID();

function NumericField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="block text-xs text-ink-300">{label}<input key={value} className="input mt-1" type="number" step="any" defaultValue={value} onBlur={(event) => {
    const next = Number(event.target.value);
    if (event.target.value.trim() && Number.isFinite(next)) onChange(next);
    else event.target.value = String(value);
  }} /></label>;
}

export function BuildingView() {
  const project = useProjectStore((state) => state.project);
  const updateBuilding = useProjectStore((state) => state.updateBuilding);
  const saveRoute = useProjectStore((state) => state.saveBuildingRoute);
  const deleteRoute = useProjectStore((state) => state.deleteBuildingRoute);
  const setView = useProjectStore((state) => state.setView);
  const setActiveSheet = useProjectStore((state) => state.setActiveSheet);
  const pushToast = useProjectStore((state) => state.pushToast);
  const [sheetId, setSheetId] = useState(project?.sheets[0]?.id ?? "");
  const [overlayId, setOverlayId] = useState("");
  const [opacity, setOpacity] = useState(0.3);
  const [floorName, setFloorName] = useState("");
  const [riserName, setRiserName] = useState("");
  const [placingRiser, setPlacingRiser] = useState(false);
  const [riserId, setRiserId] = useState("");
  const [targetSheetId, setTargetSheetId] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [cableId, setCableId] = useState("cat6");
  const [label, setLabel] = useState("");
  const [draft, setDraft] = useState<BuildingRouteDraft | null>(null);
  const [alignment, setAlignment] = useState<{ reference: BuildingPoint[]; local: BuildingPoint[] } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const hostRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const [size, setSize] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => { setPan({ x: 0, y: 0 }); setZoom(1); setDeviceId(""); }, [sheetId]);
  useEffect(() => { if (overlayId === sheetId) setOverlayId(""); }, [sheetId, overlayId]);

  if (!project) return null;
  const building = project.building ?? emptyBuilding();
  const sheet = project.sheets.find((candidate) => candidate.id === sheetId);
  const registration = building.registrations[sheetId];
  const overlay = project.sheets.find((candidate) => candidate.id === overlayId);
  const overlayRegistration = building.registrations[overlayId];
  const referencePhase = alignment && alignment.reference.length < 2;
  const displaySheet = referencePhase ? overlay : sheet;
  const displayRegistration = referencePhase ? overlayRegistration : registration;
  const ready = !!sheet && !!registration && !!sheetToBuilding(sheet, registration, { x: 0, y: 0 });
  const devices = sheet?.markups.filter((markup): markup is DeviceMarkup => markup.kind === "device") ?? [];
  const selectedDevice = devices.find((device) => device.id === deviceId);
  const corners = displaySheet && displayRegistration ? [
    { x: 0, y: 0 }, { x: displaySheet.pageWidth, y: 0 },
    { x: 0, y: displaySheet.pageHeight }, { x: displaySheet.pageWidth, y: displaySheet.pageHeight },
  ].flatMap((point) => {
    const transformed = sheetToBuilding(displaySheet, displayRegistration, point);
    return transformed ? [transformed] : [];
  }) : [];
  const minX = corners.length ? Math.min(...corners.map((point) => point.x)) : 0;
  const minY = corners.length ? Math.min(...corners.map((point) => point.y)) : 0;
  const widthFt = corners.length ? Math.max(...corners.map((point) => point.x)) - minX : 100;
  const heightFt = corners.length ? Math.max(...corners.map((point) => point.y)) - minY : 100;
  const scale = Math.max(0.01, Math.min((size.width - 60) / Math.max(widthFt, 1), (size.height - 60) / Math.max(heightFt, 1))) * zoom;
  const stageX = 30 - minX * scale + pan.x;
  const stageY = 30 - minY * scale + pan.y;
  const warnings = buildingMeasurementSheets(project).warnings;

  const saveBuilding = (next: BuildingModel) => updateBuilding(next);
  const patchRegistration = (patch: Partial<SheetRegistration>) => {
    if (registration) saveBuilding({ ...building, registrations: { ...building.registrations, [sheetId]: { ...registration, ...patch } } });
  };
  const cancel = () => { setDraft(null); setAlignment(null); setPlacingRiser(false); };
  const pointer = () => {
    const position = stageRef.current?.getPointerPosition();
    if (!position || !displaySheet || !displayRegistration) return;
    const world = { x: (position.x - stageX) / scale, y: (position.y - stageY) / scale };
    const local = buildingToSheet(displaySheet, displayRegistration, world);
    if (!local) return;
    if (alignment) {
      if (referencePhase) setAlignment({ ...alignment, reference: [...alignment.reference, world] });
      else {
        const localPoints = [...alignment.local, local];
        if (localPoints.length === 2 && sheet && registration) {
          try {
            patchRegistration(alignSheet(sheet, registration, localPoints as [BuildingPoint, BuildingPoint], alignment.reference as [BuildingPoint, BuildingPoint]));
          } catch (error) { pushToast("error", error instanceof Error ? error.message : "Alignment failed."); }
          setAlignment(null);
        } else setAlignment({ ...alignment, local: localPoints });
      }
    } else if (placingRiser) {
      const riser = { id: newId(), name: riserName.trim() || `Riser ${building.risers.length + 1}`, ...world };
      if (saveBuilding({ ...building, risers: [...building.risers, riser] })) { setRiserId(riser.id); setPlacingRiser(false); }
    } else if (draft) {
      setDraft({ ...draft, segments: draft.segments.map((segment, index) => index === draft.segments.length - 1 ? { ...segment, points: [...segment.points, local] } : segment) });
    }
  };
  const continueRoute = () => {
    if (!draft || !sheet || !registration) return;
    const riser = building.risers.find((candidate) => candidate.id === riserId);
    const targetSheet = project.sheets.find((candidate) => candidate.id === targetSheetId);
    const targetRegistration = building.registrations[targetSheetId];
    if (!riser || !targetSheet || !targetRegistration || targetRegistration.floorId === registration.floorId) return;
    const end = buildingToSheet(sheet, registration, riser);
    const start = buildingToSheet(targetSheet, targetRegistration, riser);
    if (!end || !start) { pushToast("error", "Calibrate both drawings before routing between floors."); return; }
    setDraft({ ...draft, riserIds: [...draft.riserIds, riser.id], segments: [...draft.segments.map((segment, index) => index === draft.segments.length - 1 ? { ...segment, points: [...segment.points, end] } : segment), { sheetId: targetSheetId, points: [start] }] });
    setSheetId(targetSheetId);
    setTargetSheetId("");
  };
  const drawSheet = (drawing: Sheet, placed: SheetRegistration, alpha: number) => {
    const calibration = drawing.calibration?.pixelsPerFoot;
    if (!calibration || !Number.isFinite(calibration) || calibration <= 0) return null;
    return <Group key={drawing.id} x={placed.xFt} y={placed.yFt} rotation={placed.rotationDeg} scaleX={1 / calibration} scaleY={1 / calibration} opacity={alpha} listening={false}>
      <SheetBackground sheet={drawing} viewportScale={scale / calibration} />
      {drawing.markups.map((markup) => markup.kind === "cable" ? <Line key={markup.id} points={markup.points} stroke={cablesById[markup.cableId]?.color ?? "#4FB7FF"} strokeWidth={2 * calibration / scale} /> : markup.kind === "device" ? <Group key={markup.id} x={markup.x} y={markup.y}>
        <Circle radius={5 * calibration / scale} fill="#F4B740" stroke="#111827" strokeWidth={calibration / scale} />
        <Text text={markup.tag} y={7 * calibration / scale} fontSize={11 * calibration / scale} fill="#111827" />
      </Group> : null)}
      {draft?.segments.filter((segment) => segment.sheetId === drawing.id).map((segment, index) => <Line key={`draft-${index}`} points={segment.points.flatMap((point) => [point.x, point.y])} stroke="#EF4444" strokeWidth={3 * calibration / scale} />)}
    </Group>;
  };

  return <div className="flex-1 flex min-h-0 overflow-hidden">
    <aside className="w-80 max-w-[45vw] shrink-0 overflow-y-auto border-r border-white/10 p-3 space-y-4 bg-ink-900">
      <div><h2 className="text-sm font-semibold">Floors & risers</h2><p className="text-xs text-ink-400 mt-1">Import and calibrate drawings in Sheets, then align them here. All distances below are in feet.</p></div>
      <button className="btn-ghost" onClick={() => { cancel(); setActiveSheet(sheetId); setView("sheets"); }}>Open drawing in Sheets</button>
      <fieldset disabled={!!draft || !!alignment || placingRiser} className="space-y-2 disabled:opacity-50">
        <label className="block text-xs">Drawing<select aria-label="Drawing" className="input mt-1" value={sheetId} onChange={(event) => setSheetId(event.target.value)}><option value="">Choose drawing</option>{project.sheets.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
        <label className="block text-xs">New floor name<input className="input mt-1" value={floorName} onChange={(event) => setFloorName(event.target.value)} placeholder="Ground floor" /></label>
        <button className="btn-ghost" disabled={!floorName.trim()} onClick={() => {
          if (saveBuilding({ ...building, floors: [...building.floors, { id: newId(), name: floorName.trim(), elevationFt: 0 }] })) setFloorName("");
        }}>Add floor</button>
        {building.floors.map((floor) => <NumericField key={floor.id} label={`${floor.name} elevation (ft)`} value={floor.elevationFt} onChange={(elevationFt) => saveBuilding({ ...building, floors: building.floors.map((candidate) => candidate.id === floor.id ? { ...candidate, elevationFt } : candidate) })} />)}
        {sheet && <label className="block text-xs">Assign drawing to floor<select aria-label="Assign drawing to floor" className="input mt-1" value={registration?.floorId ?? ""} onChange={(event) => {
          if (event.target.value) saveBuilding({ ...building, registrations: { ...building.registrations, [sheetId]: { ...(registration ?? { xFt: 0, yFt: 0, rotationDeg: 0, routingHeightFt: 0 }), floorId: event.target.value } } });
        }}><option value="">Choose floor</option>{building.floors.map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}</select></label>}
        {registration && <>
          <div className="grid grid-cols-2 gap-2"><NumericField label="Origin X (ft)" value={registration.xFt} onChange={(xFt) => patchRegistration({ xFt })} /><NumericField label="Origin Y (ft)" value={registration.yFt} onChange={(yFt) => patchRegistration({ yFt })} /></div>
          <NumericField label="Rotation (degrees)" value={registration.rotationDeg} onChange={(rotationDeg) => patchRegistration({ rotationDeg })} />
          <NumericField label="Routing height above floor (ft)" value={registration.routingHeightFt} onChange={(routingHeightFt) => patchRegistration({ routingHeightFt })} />
        </>}
        <label className="block text-xs">Overlay / alignment reference<select aria-label="Overlay / alignment reference" className="input mt-1" value={overlayId} onChange={(event) => setOverlayId(event.target.value)}><option value="">None</option>{project.sheets.filter((candidate) => candidate.id !== sheetId && building.registrations[candidate.id]).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
        <label className="block text-xs">Overlay opacity<input className="w-full" type="range" min="0" max="1" step="0.05" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label>
        <button className="btn-ghost" disabled={!ready || !overlay || !overlayRegistration || !sheetToBuilding(overlay, overlayRegistration, { x: 0, y: 0 })} onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1); setAlignment({ reference: [], local: [] }); }}>Align using two matching points</button>
      </fieldset>
      {!ready && <p className="text-xs text-amber-knox">Assign this drawing to a floor and calibrate its scale in Sheets before aligning or routing.</p>}
      {ready && !alignment && <div className="space-y-2 border-t border-white/10 pt-3">
        <label className="block text-xs">Riser name<input className="input mt-1" value={riserName} onChange={(event) => setRiserName(event.target.value)} placeholder="Riser A" /></label>
        <button className="btn-ghost" disabled={placingRiser} onClick={() => setPlacingRiser(true)}>Place riser on drawing</button>
        <h3 className="text-xs font-semibold">Multi-floor cable</h3>
        {!draft && <>
          <label className="block text-xs">Cable label<input className="input mt-1" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="MF-001" /></label>
          <label className="block text-xs">Cable type<select aria-label="Cable type" className="input mt-1" value={cableId} onChange={(event) => setCableId(event.target.value)}>{cables.filter((cable) => cable.id !== "conduit").map((cable) => <option key={cable.id} value={cable.id}>{cable.label}</option>)}</select></label>
        </>}
        <label className="block text-xs">{draft ? "End device" : "Start device"}<select aria-label={draft ? "End device" : "Start device"} className="input mt-1" value={deviceId} onChange={(event) => setDeviceId(event.target.value)}><option value="">Choose device</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.tag}</option>)}</select></label>
        {!draft ? <button className="btn-primary" disabled={!selectedDevice || !label.trim() || placingRiser} onClick={() => selectedDevice && setDraft({ label: label.trim(), cableId, segments: [{ sheetId, points: [{ x: selectedDevice.x, y: selectedDevice.y }] }], riserIds: [], serviceLoopFt: 0, fromDeviceId: selectedDevice.id, toDeviceId: "" })}>Start cable</button> : <>
          <p className="text-xs text-ink-300">{draft.label}: click the drawing for route bends, then continue through a riser or finish at a device.</p>
          <label className="block text-xs">Through riser<select aria-label="Through riser" className="input mt-1" value={riserId} onChange={(event) => setRiserId(event.target.value)}><option value="">Choose riser</option>{building.risers.map((riser) => <option key={riser.id} value={riser.id}>{riser.name}</option>)}</select></label>
          <label className="block text-xs">Continue on drawing<select aria-label="Continue on drawing" className="input mt-1" value={targetSheetId} onChange={(event) => setTargetSheetId(event.target.value)}><option value="">Choose another floor</option>{project.sheets.filter((candidate) => building.registrations[candidate.id] && building.registrations[candidate.id].floorId !== registration?.floorId).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}</select></label>
          <button className="btn-ghost" disabled={!riserId || !targetSheetId || placingRiser} onClick={continueRoute}>Continue through riser</button>
          <NumericField label="Total service loops (ft)" value={draft.serviceLoopFt} onChange={(serviceLoopFt) => setDraft({ ...draft, serviceLoopFt })} />
          <p className="text-[11px] text-ink-400">Project slack applies once to the combined length. Routing height describes the horizontal pathway; include equipment drops in the allowance.</p>
          <button className="btn-primary" disabled={draft.segments.length < 2 || !selectedDevice || placingRiser} onClick={() => {
            if (!selectedDevice) return;
            const completed = { ...draft, toDeviceId: selectedDevice.id, segments: draft.segments.map((segment, index) => index === draft.segments.length - 1 ? { ...segment, points: [...segment.points, { x: selectedDevice.x, y: selectedDevice.y }] } : segment) };
            if (saveRoute(completed)) { setDraft(null); setLabel(""); pushToast("success", "Multi-floor cable saved"); }
          }}>Finish at device</button>
        </>}
      </div>}
      {(draft || alignment || placingRiser) && <button className="btn-ghost text-signal-red" onClick={cancel}>Cancel current operation</button>}
      <div className="border-t border-white/10 pt-3 space-y-2"><h3 className="text-xs font-semibold">Saved routes</h3>{building.routes.map((route) => {
        let summary: string;
        try { const length = measureBuildingRoute(project, route); summary = `${length.horizontalFt.toFixed(1)} ft horizontal + ${length.verticalFt.toFixed(1)} ft vertical`; }
        catch { summary = "Needs attention — see warning below"; }
        return <div key={route.id} className="rounded border border-white/10 p-2 text-xs"><strong>{route.label}</strong><p className="text-ink-400">{summary}</p><button className="btn-ghost text-signal-red" disabled={!!draft} onClick={() => deleteRoute(route.id)}>Remove complete route</button></div>;
      })}</div>
      {warnings.map((warning) => <p key={warning} role="alert" className="text-xs text-amber-knox">{warning}</p>)}
    </aside>
    <div ref={hostRef} className="relative flex-1 min-w-0 workspace-grid">
      <div className="absolute top-2 left-2 z-10 panel rounded p-2 text-xs flex gap-2 items-center">
        <span>{alignment ? referencePhase ? `Reference drawing: click point ${alignment.reference.length + 1} of 2` : `Active drawing: click matching point ${alignment.local.length + 1} of 2` : placingRiser ? "Click the riser position" : displaySheet?.name ?? "Upload drawings in Sheets"}</span>
        <button className="btn-ghost" onClick={() => setZoom((value) => Math.min(8, value * 1.25))}>Zoom in</button>
        <button className="btn-ghost" onClick={() => setZoom((value) => Math.max(0.2, value / 1.25))}>Zoom out</button>
        <button className="btn-ghost" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>Fit</button>
      </div>
      <Stage ref={stageRef} width={size.width} height={size.height} x={stageX} y={stageY} scaleX={scale} scaleY={scale} draggable={!draft && !alignment && !placingRiser} onDragEnd={(event) => setPan({ x: event.target.x() - (30 - minX * scale), y: event.target.y() - (30 - minY * scale) })} onClick={pointer} onTap={pointer}>
        <Layer>
          {displaySheet && displayRegistration && drawSheet(displaySheet, displayRegistration, 1)}
          {!alignment && overlay && overlayRegistration && overlay.id !== sheetId && drawSheet(overlay, overlayRegistration, opacity)}
          {building.risers.map((riser) => <Group key={riser.id} x={riser.x} y={riser.y} listening={false}><Circle radius={7 / scale} stroke="#DC2626" strokeWidth={2 / scale} /><Text text={riser.name} x={9 / scale} y={-6 / scale} fontSize={12 / scale} fill="#DC2626" /></Group>)}
          {alignment && (referencePhase ? alignment.reference : alignment.local.flatMap((point) => sheet && registration ? [sheetToBuilding(sheet, registration, point)].filter((candidate): candidate is BuildingPoint => !!candidate) : [])).map((point, index) => <Circle key={index} x={point.x} y={point.y} radius={5 / scale} fill="#DC2626" listening={false} />)}
        </Layer>
      </Stage>
    </div>
  </div>;
}
