import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create your account",
  description:
    "Join Brand Promotion to access 100% refund brand campaigns on Amazon, Flipkart and Myntra.",
  alternates: { canonical: "/signup" },
  robots: { index: false, follow: true },
};

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
