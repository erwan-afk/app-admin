/**
 * Logo — image statique servie depuis public/logo-gbb.png. Sizer via className (ex. h-5).
 */
export function Logo({ className }: { className?: string }) {
  return <img src="/logo-gbb.png" alt="Logo" className={className} />;
}
