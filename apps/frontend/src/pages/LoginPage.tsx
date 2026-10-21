import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation, useNavigate } from "react-router";
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { NOTICE } from "../components/EducationalNotice";
import { Alert, Badge, Button, Field, Input } from "../components/ui";

const schema = z.object({
  email: z.email("Enter a valid e-mail address"),
  password: z.string().min(1, "Password is required"),
});
type FormValues = z.infer<typeof schema>;

interface DemoAccount {
  email: string;
  displayName: string;
  roles: string[];
  organizations: string[];
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const demo = useQuery({
    queryKey: ["demo-accounts"],
    queryFn: () => api.get<{ accounts: DemoAccount[] }>("/api/auth/demo-accounts").then((r) => r.accounts),
    retry: false,
  });
  const {
    register,
    handleSubmit,
    setValue,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      await login(values.email, values.password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from.startsWith("/app") ? from : "/app", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    }
  };

  return (
    <div className="min-h-screen">
      <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200" role="note">
        {NOTICE}
      </div>
      <div className="mx-auto grid max-w-5xl gap-8 px-6 py-12 md:grid-cols-2">
        <div>
          <Link to="/" className="mb-8 inline-flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="h-8 w-8" />
            <span className="text-lg font-semibold text-white">SecureVote</span>
          </Link>
          <h1 className="text-2xl font-semibold text-white">Sign in to the demo</h1>
          <p className="mt-2 text-sm text-slate-400">
            Demo authentication for fictional accounts only. There is no real identity verification.
          </p>
          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4" noValidate>
            <Field label="E-mail" htmlFor="email" error={errors.email?.message}>
              <Input id="email" type="email" autoComplete="username" {...register("email")} aria-invalid={!!errors.email} />
            </Field>
            <Field
              label="Password"
              htmlFor="password"
              error={errors.password?.message}
              hint="The demo password is SEED_DEMO_PASSWORD from your local .env file."
            >
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register("password")}
                aria-invalid={!!errors.password}
              />
            </Field>
            {error && <Alert tone="red">{error}</Alert>}
            <Button type="submit" className="w-full" loading={isSubmitting}>
              Sign in
            </Button>
          </form>
        </div>

        <div className="rounded-xl border border-navy-700 bg-navy-900/70 p-5">
          <h2 className="text-sm font-semibold text-white">Demo accounts (synthetic)</h2>
          <p className="mt-1 text-xs text-slate-400">Select an account to fill in its e-mail address.</p>
          {demo.isError && (
            <p className="mt-4 text-sm text-slate-400">Demo account list unavailable (DEMO_MODE disabled or API offline).</p>
          )}
          <ul className="mt-4 space-y-2">
            {demo.data?.map((a) => (
              <li key={a.email}>
                <button
                  type="button"
                  className="w-full rounded-lg border border-navy-700 px-3 py-2 text-left hover:border-blue-500/60 hover:bg-navy-800"
                  onClick={() => {
                    setValue("email", a.email, { shouldValidate: true });
                    setFocus("password");
                  }}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-slate-100">{a.displayName}</span>
                    {a.roles.map((r) => (
                      <Badge key={r} tone="blue">
                        {r.toLowerCase()}
                      </Badge>
                    ))}
                  </span>
                  <span className="block text-xs text-slate-400">
                    {a.email} · {a.organizations.join(", ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
