import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-bg)",
        padding: "1rem",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "-10rem",
          right: "-8rem",
          width: "28rem",
          height: "28rem",
          borderRadius: "50%",
          background: "var(--color-surface-3)",
          opacity: 0.85,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          bottom: "-12rem",
          left: "-8rem",
          width: "26rem",
          height: "26rem",
          borderRadius: "50%",
          background: "var(--color-primary)",
          opacity: 0.18,
        }}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: "22%",
          left: "-4rem",
          width: "14rem",
          height: "14rem",
          borderRadius: "50%",
          background: "var(--color-accent-light)",
          opacity: 0.9,
        }}
      />

      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}
