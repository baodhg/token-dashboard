import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: 40,
          background: "linear-gradient(135deg, #34d399 0%, #06b6d4 50%, #2563eb 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="120" height="120" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 6C4 4.89543 4.89543 4 6 4H18C19.1046 4 20 4.89543 20 6V18C20 19.1046 19.1046 20 18 20H6C4.89543 20 4 19.1046 4 18V6Z"
            stroke="white"
            strokeWidth="1.2"
            opacity="0.5"
          />
          <path
            d="M7.5 9L9.5 11L7.5 13"
            stroke="white"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="14.5" cy="12" r="3.2" fill="white" />
          <path d="M14.5 8.8V7"   stroke="white" strokeWidth="0.8" opacity="0.4" />
          <path d="M17.7 12H19"   stroke="white" strokeWidth="0.8" opacity="0.4" />
          <path d="M14.5 15.2V17" stroke="white" strokeWidth="0.8" opacity="0.4" />
          <circle cx="14.5" cy="7"  r="1.1" fill="white" opacity="0.8" />
          <circle cx="19"   cy="12" r="1.1" fill="white" opacity="0.8" />
          <circle cx="14.5" cy="17" r="1.1" fill="white" opacity="0.8" />
        </svg>
      </div>
    ),
    { ...size }
  );
}
