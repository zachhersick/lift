// A live mesh-gradient background (Paper Shaders) in the accent colors. It
// renders at a capped pixel count, stops animating when it's off screen or
// the app is in the background, and stays still under Reduce Motion.
import { MeshGradient } from "@paper-design/shaders-react";
import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { settings } from "@/lib/store.js";
import { isDark, tintColors } from "@/lib/theme.js";
import { useValue } from "@/lib/use-signal";

export default function MeshHero({ className, intensity = 1 }: { className?: string; intensity?: number }) {
  const s = useValue(settings);
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [awake, setAwake] = useState(typeof document === "undefined" || document.visibilityState === "visible");

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    const onVis = () => setAwake(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  const [a, b, c] = tintColors(s.tint);
  const base = isDark(s.theme) ? "#07080a" : "#f5f6f8";
  const running = visible && awake && !reduce;
  return (
    <div className={className} ref={box}>
      <MeshGradient
        colors={[base, a, b, c, base]}
        distortion={0.85 * intensity}
        grainMixer={0}
        grainOverlay={0.12}
        maxPixelCount={360 * 360}
        speed={running ? 0.35 : 0}
        style={{ width: "100%", height: "100%" }}
        swirl={0.35 * intensity}
      />
    </div>
  );
}
