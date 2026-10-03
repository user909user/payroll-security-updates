import type { Metadata } from "next";
import EmployeeDetailClient from "./EmployeeDetailClient";

export const metadata: Metadata = { title: "Employee Details" };

export default async function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EmployeeDetailClient employeeId={id} />;
}
