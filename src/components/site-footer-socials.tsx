import {
  EnvelopeSimple,
  GithubLogo,
  InstagramLogo,
  LinkedinLogo,
} from "@phosphor-icons/react/dist/ssr";
import { DEVELOPER_EMAIL, DEVELOPER_NAME, DEVELOPER_SOCIALS } from "@/lib/constants/developer";

const SOCIAL_ICONS = {
  GitHub: GithubLogo,
  Instagram: InstagramLogo,
  LinkedIn: LinkedinLogo,
} as const;

export function SiteFooterSocials() {
  return (
    <div className="rf-footer-socials">
      <span className="text-sm text-muted">{DEVELOPER_NAME}</span>
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {DEVELOPER_SOCIALS.map((link) => {
          const Icon = SOCIAL_ICONS[link.label];
          return (
            <li key={link.label}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="rf-footer-social-link"
              >
                <Icon className="size-4" weight="regular" aria-hidden />
                {link.label}
              </a>
            </li>
          );
        })}
        <li>
          <a href={`mailto:${DEVELOPER_EMAIL}`} className="rf-footer-social-link">
            <EnvelopeSimple className="size-4" weight="regular" aria-hidden />
            Email
          </a>
        </li>
      </ul>
    </div>
  );
}
