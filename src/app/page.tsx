import Link from "next/link";
import { redirect } from "next/navigation";
import { Globe, MonitorDown } from "lucide-react";
import { getAuthProfile } from "@/lib/audit";
import { createClient } from "@/lib/supabase/server";

const APP_DOWNLOAD_URL =
  process.env.NEXT_PUBLIC_APP_DOWNLOAD_URL ||
  "https://drive.google.com/uc?export=download&id=1rE6WSFwZCDvp8NiZVVhFrAb2fVLtbcnZ";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const profile = await getAuthProfile();
    redirect(profile ? "/dashboard" : "/login");
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--color-bg)",
        padding: "1.5rem",
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

      <div style={{ position: "relative", zIndex: 1, width: "100%", maxWidth: "720px" }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div
            aria-hidden="true"
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              background: "var(--color-text-primary)",
              color: "#FFFBF8",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "1.75rem",
              marginBottom: "0.85rem",
            }}
          >
            P
          </div>
          <h1 className="page-title" style={{ fontSize: "3rem" }}>Payroll</h1>
          <p className="text-secondary text-sm font-medium" style={{ marginTop: "0.35rem" }}>
            Use it in the browser, or download the Windows app
          </p>
        </div>

        <div className="landing-choices">
          <Link href="/login" className="landing-choice">
            <span className="landing-choice__icon">
              <Globe size={28} strokeWidth={2.25} />
            </span>
            <strong>Use the web app</strong>
            <span>Open Payroll in your browser and sign in as usual.</span>
          </Link>

          <a href={APP_DOWNLOAD_URL} className="landing-choice">
            <span className="landing-choice__icon">
              <MonitorDown size={28} strokeWidth={2.25} />
            </span>
            <strong>Download the app</strong>
            <span>Windows app download. Unzip if needed, then install or run Payroll.</span>
          </a>
        </div>
      </div>
    </div>
  );
}
