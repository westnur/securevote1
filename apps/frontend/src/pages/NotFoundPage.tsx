import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <p className="text-sm text-blue-400">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-white">Page not found</h1>
      <Link to="/app" className="mt-4 text-sm text-blue-300 hover:underline">
        Back to dashboard
      </Link>
    </div>
  );
}
