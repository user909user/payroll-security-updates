import type { Metadata } from "next";
import AttendanceClient from "./AttendanceClient";

export const metadata: Metadata = { title: "Attendance" };

export default function AttendancePage() {
  return <AttendanceClient />;
}
