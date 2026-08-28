import type { Metadata } from "next";
import { DeskApp } from "@/components/desk-app";

export const metadata: Metadata = {
  title: "Desk",
};

export default function DeskPage() {
  return <DeskApp />;
}
