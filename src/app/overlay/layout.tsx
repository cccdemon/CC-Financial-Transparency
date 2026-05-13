import type { Metadata } from "next";
import "../globals.css";
import "./overlay.css";

export const metadata: Metadata = {
  title: "Stream Overlay",
  robots: { index: false, follow: false },
};

export default function OverlayLayout({ children }: { children: React.ReactNode }) {
  return <div className="overlay-root">{children}</div>;
}
