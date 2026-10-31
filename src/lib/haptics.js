// A light tap of haptic feedback. Safari on iOS 18+ plays the system haptic
// when a switch-style checkbox is toggled from a tap, so we keep a hidden one
// around and click its label. Elsewhere it falls back to navigator.vibrate.
let label = null;

function ensure() {
  if (label || typeof document === "undefined") return label;
  label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  label.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;pointer-events:none";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.tabIndex = -1;
  label.appendChild(input);
  document.body.appendChild(label);
  return label;
}

// The iOS app plays real haptics instead.
let nativeHaptic = null;
export function useNativeHaptic(play) {
  nativeHaptic = play;
}

export function haptic(pattern = 10) {
  if (nativeHaptic) return nativeHaptic(pattern);
  try {
    ensure()?.click();
    navigator.vibrate?.(pattern);
  } catch {}
}
