"use client";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: ErrorProps) {
  return (
    <html>
      <body>
        <main className="bg-dark py-5 vh-100">
          <div className="container px-5">
            <div className="row gx-5 align-items-center justify-content-center">
              <div className="col-lg-8 text-center">
                <div className="my-5">
                  <h2 className="fw-bolder text-white mb-4">Something went wrong</h2>
                  <p className="lead text-white-50 mb-4">
                    An unexpected error occurred. Please try again, or contact the site admin if the problem persists.
                  </p>
                  {error.digest && (
                    <p className="text-white-50 small mb-4">Error reference: {error.digest}</p>
                  )}
                  <button className="btn btn-primary btn-lg" onClick={reset}>
                    Try again
                  </button>
                </div>
              </div>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
