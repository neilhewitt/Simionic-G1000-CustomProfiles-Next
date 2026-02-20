"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SignInContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const error = searchParams.get("error");

  return (
    <main className="flex-grow-1">
      <div className="container px-5 py-5">
        <div className="row justify-content-center">
          <div className="col-md-6 col-lg-4">
            <div className="card bg-secondary text-white text-center p-4">
              <h3 className="mb-3">Sign in</h3>
              <p className="text-light mb-4">
                Sign in with your Microsoft account to create, import, and manage your custom profiles.
              </p>
              {error && (
                <div className="alert alert-danger" role="alert">
                  <strong>Error:</strong> {error}
                  <br />
                  {error === "OAuthSignin" && "Error starting the sign-in flow."}
                  {error === "OAuthCallback" && "Error during the sign-in callback."}
                  {error === "OAuthAccountNotLinked" && "This account is linked to a different provider."}
                  {error === "Callback" && "Error in the auth callback handler."}
                </div>
              )}
              <button
                onClick={() => signIn("azure-ad", { callbackUrl })}
                className="btn btn-primary btn-lg w-100"
              >
                <span className="bi-microsoft me-2" />
                Sign in with Microsoft
              </button>
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
