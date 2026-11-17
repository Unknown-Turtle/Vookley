import type { SVGProps } from "react";

const base = (p: SVGProps<SVGSVGElement>) => ({
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});

export const Logo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base({ width: 26, height: 26, strokeWidth: 2.4, viewBox: "0 0 32 32", ...p })}>
    <path d="M4 13c3.2 0 3.6 9 6.8 9S14.200 7 17.400 7s3.400 13 6 13 2.400-4.500 4.600-4.500" />
  </svg>
);
export const Play = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base({ fill: "currentColor", stroke: "none", ...p })}>
    <path d="M8 5.2v13.600a.8.8 0 0 0 1.220.680l10.800-6.800a.8.8 0 0 0 0-1.360L9.220 4.520A.8.8 0 0 0 8 5.200z" />
  </svg>
);
export const Pause = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base({ fill: "currentColor", stroke: "none", ...p })}>
    <rect x="6.500" y="5" width="4" height="14" rx="1" />
    <rect x="13.500" y="5" width="4" height="14" rx="1" />
  </svg>
);
export const Upload = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 16V4m0 0L7 9m5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
  </svg>
);
export const Sun = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.900 4.900l1.400 1.400m11.400 11.400 1.400 1.400m0-14.200-1.400 1.400M6.300 17.700l-1.400 1.400" />
  </svg>
);
export const Moon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M20 14.500A8 8 0 0 1 9.500 4a8 8 0 1 0 10.500 10.500z" />
  </svg>
);
export const Arrow = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 12h14m0 0-5-5m5 5-5 5" />
  </svg>
);
export const Trash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13" />
  </svg>
);
export const Download = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 4v12m0 0 5-5m-5 5-5-5M4 20h16" />
  </svg>
);
export const Alert = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 8v5m0 3.500v.010M10.300 3.900 2.600 17.500A2 2 0 0 0 4.300 20.500h15.400a2 2 0 0 0 1.700-3L13.700 3.900a2 2 0 0 0-3.400 0z" />
  </svg>
);
export const Lock = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </svg>
);
export const Wave = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M3 12h2m3-5v10m4-14v18m4-13v8m3-5h2" />
  </svg>
);
export const Compare = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M8 4v16M16 4v16M3 9l5-5 5 5M11 15l5 5 5-5" />
  </svg>
);
export const Flask = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.800 3h10.400a2 2 0 0 0 1.800-3l-5-9V3M7.500 15h9" />
  </svg>
);
