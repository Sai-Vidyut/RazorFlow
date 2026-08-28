import { SiteFooterSocials } from "@/components/site-footer-socials";

export function SiteFooter({ merchantName }: { merchantName?: string }) {
  const deskLabel = merchantName ? `${merchantName} desk` : "Buyer desk";
  return (
    <footer className="border-t border-line/70">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 px-4 py-8 md:px-6">
        <div className="flex flex-col gap-3 text-sm text-muted md:flex-row md:items-center md:justify-between">
          <p translate="no">
            RazorFlow · {deskLabel}
          </p>
          <p>
            Built for the Razorpay Buildathon, AI Growth & Agentic Commerce.
          </p>
        </div>
        <SiteFooterSocials />
      </div>
    </footer>
  );
}
