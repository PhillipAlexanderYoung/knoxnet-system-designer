import { useEffect, useState } from "react";
import { COARSE_POINTER_MEDIA, TOUCH_CONTROL_SCALE } from "../lib/touchControls";

export function useTouchControlScale(): number {
  const [scale, setScale] = useState(() =>
    typeof window !== "undefined" && window.matchMedia?.(COARSE_POINTER_MEDIA)?.matches
      ? TOUCH_CONTROL_SCALE
      : 1,
  );

  useEffect(() => {
    const mq = window.matchMedia(COARSE_POINTER_MEDIA);
    const sync = () => setScale(mq.matches ? TOUCH_CONTROL_SCALE : 1);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return scale;
}
