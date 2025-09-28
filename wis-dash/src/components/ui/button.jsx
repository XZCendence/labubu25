export function Button({ children, className = "", ...props }) {
  return (
    <button
      className={`bg-primary text-primary-foreground px-4 py-2 rounded-lg hover:opacity-90 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
