"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    setLoading(false);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <main className="flex-grow-1">
        <div className="container px-5 py-5">
          <div className="row justify-content-center">
            <div className="col-md-6 col-lg-4">
              <div className="card bg-secondary text-white p-4 text-center">
                <h3 className="mb-3">Check your email</h3>
                <p className="text-light mb-4">
                  If an account exists with that email address, a password reset link has been sent.
                  The link will expire in 15 minutes.
                </p>
                <Link href="/auth/signin" className="btn btn-primary btn-lg w-100">
                  Back to sign in
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
          <div className="col-md-6 col-lg-4">
            <div className="card bg-secondary text-white p-4">
              <h3 className="mb-3 text-center">Forgot password</h3>
              <p className="text-light mb-3">
                Enter your email address and we&apos;ll send you a link to reset your password.
              </p>

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
                <button
                  type="submit"
                  className="btn btn-primary btn-lg w-100"
                  disabled={loading}
                >
                  {loading ? "Sending..." : "Send reset link"}
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
