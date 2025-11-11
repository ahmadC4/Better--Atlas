import * as React from 'react';

export const AtlasVoiceIcon = React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(
  (props, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M3 12c1.5-4 3-4 4.5 0s3 4 4.5 0 3-4 4.5 0 3 4 4.5 0" />
      <path d="M12 5v14" />
      <circle cx="12" cy="12" r="2.25" />
    </svg>
  )
);

AtlasVoiceIcon.displayName = 'AtlasVoiceIcon';

export default AtlasVoiceIcon;
