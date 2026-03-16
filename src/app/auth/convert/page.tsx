"use client";

import { useState } from "react";
import Link from "next/link";

export default function ConvertPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    await fetch("/api/auth/convert/request", {
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
            <div className="col-md-6 col-lg-5">
              <div className="card bg-white text-black p-4 text-center">
                <h3 className="mb-3">Check your email</h3>
                <p className="mb-4">
                  If applicable, a conversion email has been sent to the address provided.
                  The link in the email will expire in 24 hours.
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
          <div className="col-md-6 col-lg-5">
            <div className="card bg-white text-black p-4">
              <h3 className="mb-3 text-center">Microsoft account conversion</h3>
              <p className="mb-4">
                If you previously signed in with a Microsoft account and created profiles under this identity, you must convert your account
                to use a local email and password. Enter the email address associated with your
                Microsoft account below and we&apos;ll send you a link to complete the conversion.
              </p>
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
                <button
                  type="submit"
                  className="btn btn-primary btn-lg w-100"
                  disabled={loading}
                >
                  {loading ? "Sending..." : "Send conversion email"}
                </button>
              </form>

              <div className="mt-4 text-center">
                <p className="mb-3"><Link href="/auth/signin" className="text-dark">Back to sign in</Link></p>
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
