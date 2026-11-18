export const SplitIcon = ({ size = 14, className }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className={className}
  >
    <path d="M8 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3" />
    <path d="M16 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3" />
    <path d="M12 2v20" />
  </svg>
)

export const IrsimMark = ({ size = 16, className }: { size?: number; className?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 64 64"
    fill="currentColor"
    aria-hidden="true"
    className={className}
  >
    <path d="M6.8 43.6L8.6 43.2L7.9 42.2C13 40.6 17 41 21 40.2C27.5 38.8 32 35 36.5 28.8C42.5 20.8 49.5 14 59 9.5C51 15.5 46 22.8 41.5 30.2C36.5 38.6 30.5 47 21 50.6C17 52 13 52.4 9.8 51.7L10.4 50.9L7.6 50.2L8.3 49.1L6.2 47.6L7.4 46.6L6.1 45.4Z" />
    <path d="M44 20.5C49 15.5 54 12 60.5 10C56 13 51.5 16.5 47.5 21Z" opacity=".55" />
    <path d="M40 26C45 19 50 14.5 57 11.5C51.5 15.5 47 20 43.5 25.5Z" opacity=".35" />
    <path d="M9 47.5C15 45.5 22 45.8 29 42.5C24 46.3 17 47.8 9 47.5Z" opacity=".25" />
  </svg>
)
