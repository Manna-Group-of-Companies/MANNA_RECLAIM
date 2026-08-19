import { Link } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import { useSupervisor } from '@/hooks/useSupervisor';
import { userPaths } from '@/config/paths';
import { Icon } from '@/components/ui';
import { cn } from '@/utils/cn';

/**
 * The company mark at the top of the prototype.
 *
 * The tile keeps Manna's green - it is the company's identity, not a theme
 * colour, and it reads cleanly against the dark bar. The wordmark beside it
 * does not: it was drawn as dark green on white, which is invisible here, so
 * the two runs of text take --ink and --ink-faint and follow the theme.
 */
function BrandPlate() {
  return (
    <div className="brandplate">
      <svg
        viewBox="0 0 210 44"
        className="brandmark"
        role="img"
        aria-label="Manna Production Management"
      >
        <defs>
          <linearGradient id="mannaLogo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6cb83f" />
            <stop offset="1" stopColor="#3f8a22" />
          </linearGradient>
        </defs>
        <rect x="2" y="4" width="36" height="36" rx="10" fill="url(#mannaLogo)" />
        <g
          transform="translate(8,10)"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </g>
        <text x="50" y="26" fontSize="20" fontWeight="800" fill="var(--ink)" letterSpacing="-0.3">
          Manna
        </text>
        <text x="51" y="38" fontSize="8.3" fontWeight="700" letterSpacing="2" fill="var(--ink-faint)">
          PRODUCTION MGMT
        </text>
      </svg>
    </div>
  );
}

/** Sticky plate: brand, who is signing, how many machines are turning. */
export function Header() {
  const running = useAppSelector((s) => s.runs.active.length);
  const user = useAppSelector((s) => s.auth.user);
  const online = useAppSelector((s) => s.ui.online);
  const { name: signingAs, isAccount } = useSupervisor();

  return (
    <header className="plate">
      <BrandPlate />
      {/*
       * Who is on the floor, not just what kind of account this is.
       *
       * The bar used to say "SUPERVISOR" and nothing else, which named the role
       * and never the person - so the one thing worth checking at a glance, that
       * the records being written are going out under the right name, was only
       * visible inside Settings and inside the sheets that use it. Which is to
       * say: at the moment it is too late to notice it is wrong. It says so
       * here, on every tab, exactly as the app's plate does.
       *
       * The name is the signing name rather than the account's, because those
       * two part on the shift where a browser signed in this morning is being
       * used by whoever is holding it, and the name that goes on the record is
       * the one that should be on the bar.
       */}
      <div className="who">
        <span className="nm">
          <b className={cn(!signingAs && 'muted')}>{signingAs || 'no supervisor set'}</b>
          {/* Switched away from the account signed in here, and marked as
              switched: it is a deliberate act at the start of a shift and it
              stays put until somebody changes it back. */}
          {!isAccount && (
            <span className="sw" title="Switched from the account signed in here">
              <Icon name="pencil" size={12} strokeWidth={2} />
            </span>
          )}
        </span>
        <span className="linetag">signing · {user?.role ?? 'shop floor'}</span>
      </div>
      {!online && <span className="pill warn">Offline</span>}
      <span className={cn('runcount', !running && 'zero')}>{running} running</span>
      <Link to={userPaths.settings} aria-label="Settings" className="iconbtn">
        <Icon name="settings" size={20} strokeWidth={1.8} />
      </Link>
    </header>
  );
}

export default Header;
