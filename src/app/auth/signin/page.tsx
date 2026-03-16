"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import Link from "next/link";

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const registered = searchParams.get("registered") === "true";
  const passwordReset = searchParams.get("passwordReset") === "true";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const unableToSignInMessage = "Unable to sign in right now. Please try again.";

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        setError("Invalid email or password.");
      } else if (result?.url) {
        window.location.href = result.url;
      } else {
        setError(unableToSignInMessage);
      }
    } catch {
      setError(unableToSignInMessage);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex-grow-1">
      <div className="container px-5 py-5">
        <div className="row justify-content-center">
          <div className="col-md-6 col-lg-4">
            <div className="card bg-white text-black p-4">
              <h3 className="mb-3 text-center">Sign in</h3>

              {registered && (
                <div className="alert alert-success" role="alert">
                  Account created successfully. Please sign in.
                </div>
              )}

              {passwordReset && (
                <div className="alert alert-success" role="alert">
                  Password reset successfully. Please sign in with your new password.
                </div>
              )}

              {error && (
                <div className="alert alert-danger" role="alert">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label htmlFor="email" className="form-label">Email address</label>
                  <input
                    id="email"
                    type="email"
                    className="form-control"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
                <div className="mb-3">
                  <label htmlFor="password" className="form-label">Password</label>
                  <input
                    id="password"
                    type="password"
                    className="form-control"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary btn-lg w-100"
                  disabled={loading}
                >
                  {loading ? "Signing in..." : "Sign in"}
                </button>
              </form>

              <div className="mt-3 text-center">
                <p className="mb-1">
                  <Link href="/auth/register" className="text-dark">Create an account</Link>
                </p>
                <p className="mb-3">
                  <Link href="/auth/forgot-password" className="text-dark">Forgot password?</Link>
                </p>
                <p className="mb-3">
                  If you previously used a <b>Microsoft account</b>,<br /><Link href="/auth/convert" className="text-dark">click here</Link> to convert to a site login.
                </p>
                <p className="mb-0 small text-muted"> 
                  Find out more about the move away from Microsoft accounts <Link className="text-dark" href="/faq#faq4">here</Link>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInContent />
    </Suspense>
  );
}
