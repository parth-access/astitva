import type { SVGProps } from "react";

/** The admin's few line icons, drawn at 24px on a 1.6 stroke. Decorative: the label beside them says what they are. */
function Icon({ children, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="size-5 shrink-0" {...props}>
      {children}
    </svg>
  );
}

export const HomeIcon = () => (
  <Icon>
    <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />
  </Icon>
);
export const OrdersIcon = () => (
  <Icon>
    <path d="M6 3h12a1 1 0 0 1 1 1v17l-3-2-2 2-2-2-2 2-2-2-3 2V4a1 1 0 0 1 1-1z" />
    <path d="M9 8h6M9 12h6" />
  </Icon>
);
export const HangerIcon = () => (
  <Icon>
    <path d="M12 7.5a2 2 0 1 1 2-2" />
    <path d="M12 7.5v1.2L3.6 15.2A1.6 1.6 0 0 0 4.6 18h14.8a1.6 1.6 0 0 0 1-2.8L12 8.7" />
  </Icon>
);
export const TagIcon = () => (
  <Icon>
    <path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1l8 8a1.4 1.4 0 0 1 0 2l-7 7a1.4 1.4 0 0 1-2 0z" />
    <circle cx="8.3" cy="8.3" r="1.3" />
  </Icon>
);
export const SettingsIcon = () => (
  <Icon>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Icon>
);
export const ShopIcon = () => (
  <Icon>
    <path d="M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </Icon>
);
