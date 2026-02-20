"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

export default function ConvertCompletePage() {
  const params = useParams();
  const token = params.token as string;

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tokenValid, setTokenValid] = useState<boolean | null>(null);

  useEffect(() => {
    // Verify the token is still valid before showing the form
    async function checkToken() {
      try {
        const res = await fetch(`/api/auth/convert/check?token=${encodeURIComponent(token)}`);
        setTokenValid(res.ok);
      } catch {
        setTokenValid(false);
      }
    }
    checkToken();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/convert/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email, name: name.trim(), password }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Conversion failed.");
        setLoading(false);
        return;
      }

      setSuccess(true);
    } catch {
      setError("An unexpected error occurred.");
      setLoading(false);
    }
  }

  if (tokenValid === null) {
    return (
      <main className="flex-grow-1">
        <div className="container px-5 py-5 text-center">
          <p className="text-muted">Checking conversion link...</p>
        </div>
      </main>
    );
  }

  if (!tokenValid) {
    return (
      <main className="flex-grow-1">
        <div className="container px-5 py-5">
          <div className="row justify-content-center">
            <div className="col-md-6 col-lg-5">
              <div className="card bg-secondary text-white p-4 text-center">
                <h3 className="mb-3">Invalid or expired link</h3>
                <p className="text-light mb-4">
                  This conversion link is invalid or has expired. Please request a new one.
                </p>
                <Link href="/auth/convert" className="btn btn-primary btn-lg w-100">
                  Request new conversion link
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className="flex-grow-1">
        <div className="container px-5 py-5">
          <div className="row justify-content-center">
            <div className="col-md-6 col-lg-5">
              <div className="card bg-secondary text-white p-4 text-center">
                <h3 className="mb-3">Conversion complete</h3>
                <p className="text-light mb-4">
                  Your account has been converted and all your profiles have been migrated.
                  You can now sign in with your email and password.
                </p>
                <Link href="/auth/signin" className="btn btn-primary btn-lg w-100">
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-grow-1">
      <div className="container px-5 py-5">
        <div className="row justify-content-center">
          <div className="col-md-6 col-lg-5">
            <div className="card bg-secondary text-white p-4">
              <h3 className="mb-3 text-center">Complete account conversion</h3>
              <p className="text-light mb-3">
                Enter the email address you used with your Microsoft account, choose a display name,
                and set a password for your new local account. All your existing profiles will be
                migrated automatically.
              </p>

              {error && (
                <div className="alert alert-danger" role="alert">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label htmlFor="email" className="form-label">Microsoft account email</label>
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
                  <label htmlFor="name" className="form-label">Display name</label>
                  <input
                    id="name"
                    type="text"
                    className="form-control"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
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
                    minLength={8}
                  />
                  <div className="form-text text-light">At least 8 characters.</div>
                </div>
                <div className="mb-3">
                  <label htmlFor="confirmPassword" className="form-label">Confirm password</label>
                  <input
                    id="confirmPassword"
                    type="password"
                    className="form-control"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  className="btn btn-primary btn-lg w-100"
                  disabled={loading}
                >
                  {loading ? "Converting..." : "Complete conversion"}
                </button>
              </form>

              <div className="mt-4 text-center">
                <Link href="/auth/signin" className="text-light">Back to sign in</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
