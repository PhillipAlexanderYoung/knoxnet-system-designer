import { useEffect } from "react";
import { useProjectStore } from "./store/projectStore";
import { Workspace } from "./components/Workspace";
import { StartScreen } from "./components/StartScreen";
import { Toasts } from "./components/Toasts";
import { CommandPalette } from "./components/CommandPalette";
import { SettingsDrawer } from "./components/SettingsDrawer";
import { PagePreviewModal } from "./components/PagePreviewModal";
import { useGlobalHotkeys } from "./hooks/useGlobalHotkeys";

export default function App() {
  const project = useProjectStore((s) => s.project);
  useGlobalHotkeys();

  // Re-render guard: ensure body class follows mode
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <div className="h-full w-full flex flex-col">
      {project ? <Workspace /> : <StartScreen />}
      <Toasts />
      <CommandPalette />
      <SettingsDrawer />
      <PagePreviewModal />
    </div>
  );
}
