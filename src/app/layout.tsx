import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";
import { THEME_BOOT_SCRIPT } from "@/lib/theme";

const beVietnam = Be_Vietnam_Pro({
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin", "vietnamese"],
});

export const metadata: Metadata = {
  title: "Project Timeline",
  description: "Enter task data, get a month-by-month timeline, export to Excel",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Zoom left unlocked: the calendar is dense and users need to pinch in.
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // suppressHydrationWarning: the boot script below sets data-theme on this
    // element before React hydrates, so the server markup never matches. The
    // attribute is the only difference, and it is deliberate.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${beVietnam.variable} h-full antialiased`}
    >
      <head>
        {/* Runs before first paint. The page is prerendered, so the saved theme
            is unknown server-side; without this the app would flash white on
            every load for dark-mode users. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
