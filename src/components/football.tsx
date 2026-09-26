/** The app's football: marks the team with the ball. Drawn level-tilted, as on the Game sheet canvas (#265). */
export function Football({ size = 18, label = "Has the ball" }: { size?: number; label?: string }) {
  return (
    <svg role="img" aria-label={label} width={size} height={size} viewBox="0 0 24 24" className="block">
      <title>{label}</title>
      <ellipse cx="12" cy="12" rx="10.5" ry="6.2" transform="rotate(-35 12 12)" fill="var(--secondary)" />
      <path
        d="M8.7 14.3 15.3 9.7M9.8 12.1l1.4 2M11.3 11l1.4 2M12.8 9.9l1.4 2"
        stroke="var(--card)"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
