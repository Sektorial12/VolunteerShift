import type { Metadata } from "next";
import "./globals.css";
import SideNav from "../components/SideNav";

export const metadata: Metadata = {
  title: "VolunteerShift Dashboard",
  description: "Autonomous volunteer coordination agent",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="flex min-h-screen bg-gray-50">
          <SideNav />
          <main className="flex-1 p-6 max-w-7xl overflow-x-hidden">{children}</main>
        </div>
      </body>
    </html>
  );
}