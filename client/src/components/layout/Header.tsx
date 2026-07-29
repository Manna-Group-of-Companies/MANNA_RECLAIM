import { Link } from 'react-router-dom';
import { useAppSelector } from '@/app/hooks';
import { userPaths } from '@/config/paths';
import { Icon } from '@/components/ui';
import { cn } from '@/utils/cn';

/** The white plate and wordmark from the top of the prototype. */
function BrandPlate() {
  return (
    <div className="brandplate">
      <svg
        viewBox="0 0 210 44"
        style={{ height: 30, width: 'auto', display: 'block' }}
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
        <text x="50" y="26" fontSize="20" fontWeight="800" fill="#2f6b1b" letterSpacing="-0.3">
          Manna
        </text>
        <text x="51" y="38" fontSize="8.3" fontWeight="700" letterSpacing="2" fill="#5f6b53">
          PRODUCTION MGMT
        </text>
      </svg>
    </div>
  );
}

/** Sticky plate: brand, who is signed in, how many machines are turning. */
export function Header() {
  const running = useAppSelector((s) => s.runs.active.length);
  const user = useAppSelector((s) => s.auth.user);
  const online = useAppSelector((s) => s.ui.online);

  return (
    <header className="plate">
      <BrandPlate />
      <div className="spacer" />
      <span className="linetag">{user?.role ?? 'shop floor'}</span>
      {!online && <span className="pill warn">Offline</span>}
      <span className={cn('runcount', !running && 'zero')}>{running} running</span>
      <Link to={userPaths.settings} aria-label="Settings" className="iconbtn">
        <Icon name="settings" size={20} strokeWidth={1.8} />
      </Link>
    </header>
  );
}

export default Header;
