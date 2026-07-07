// GoodTrip logo — a clean giraffe mark on the brand-purple app tile.
// The tile keeps the original rounded-square + bottom-shadow depth; the
// giraffe is a white silhouette (long neck, two ossicones, muzzle, ear)
// with a few purple patches so it reads unmistakably as a giraffe.
//
// Sizing: pass `size` (px) for a fixed square with a proportional corner
// radius (used by LoadingIcon at small sizes), or `className` with Tailwind
// width/height for layout-driven sizing (used on the landing page).

export function Logo({
  size,
  className = "",
  pulse = false,
  role = "img",
  ariaLabel = "GoodTrip logo",
}: {
  size?: number;
  className?: string;
  pulse?: boolean;
  role?: string;
  ariaLabel?: string;
}) {
  // Fixed rounded-2xl corners look nearly circular at small sizes, so when a
  // pixel size is given we scale the radius with it instead.
  const sized = typeof size === "number";

  return (
    <div
      role={role}
      aria-label={ariaLabel}
      className={`relative overflow-hidden bg-gradient-to-b from-brand-purple to-brand-purpleDark border-b-4 border-brand-purpleDark ${
        sized ? "" : "rounded-2xl"
      } ${pulse ? "animate-logo-pulse" : ""} ${className}`}
      style={sized ? { width: size, height: size, borderRadius: size! * 0.28 } : undefined}
    >
      <svg
        viewBox="0 0 64 64"
        className="absolute inset-0 h-full w-full"
        fill="none"
        aria-hidden="true"
      >
        {/* neck — rooted at the tile's bottom edge, clipped by overflow-hidden */}
        <path
          d="M22,64 C23,49 26,34 33,25 L41,25 C37,35 34,50 33,64 Z"
          fill="#ffffff"
        />

        {/* giraffe patches on the neck */}
        <circle cx="28.5" cy="39" r="2.9" fill="#7C3AED" />
        <circle cx="30.5" cy="50" r="2.6" fill="#7C3AED" />
        <circle cx="27.5" cy="46" r="1.7" fill="#7C3AED" />

        {/* ear, tucked behind the head */}
        <path
          d="M31,15 C27,11 24,12 25,15 C27,18 30,18 31,15 Z"
          fill="#ffffff"
        />

        {/* ossicones (horns) with rounded knobs */}
        <g stroke="#ffffff" strokeWidth="3" strokeLinecap="round">
          <line x1="37" y1="14" x2="35" y2="7" />
          <line x1="42" y1="13" x2="42.5" y2="6" />
        </g>
        <circle cx="35" cy="6" r="2.4" fill="#ffffff" />
        <circle cx="42.5" cy="5" r="2.4" fill="#ffffff" />

        {/* head + muzzle */}
        <ellipse cx="41" cy="19" rx="12" ry="6.6" fill="#ffffff" />

        {/* eye + nostril, punched out in brand purple */}
        <circle cx="45" cy="18" r="1.8" fill="#5B21B6" />
        <circle cx="51" cy="20.5" r="1.15" fill="#5B21B6" />
      </svg>
    </div>
  );
}
