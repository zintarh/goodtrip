// Reusable loading indicator built from the app's own logo mark (the giraffe
// tile shown on the home screen) instead of generic "Loading…" text —
// pulsating so it still reads as "busy" without spinner/text noise.
import { Logo } from "./Logo";

export function LoadingIcon({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <Logo
      size={size}
      pulse
      role="status"
      ariaLabel="Loading"
      className={`mx-auto ${className}`}
    />
  );
}
