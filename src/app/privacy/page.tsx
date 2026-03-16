export default function PrivacyPage() {
  return (
    <main className="bg-dark py-5">
      <div className="container px-5">
        <div className="row gx-5 align-items-center justify-content-center">
          <div className="col-8">
            <div className="my-5 text-body fw-normal text-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="img-fluid rounded-3 ml-5 mb-5 float-end" src="/img/G1000_screen.jpg" width={300} alt="G1000 MFD & PFD set into a cockpit instrument panel" />
              <h2 className="fw-bolder mb-2 text-white">Simionic G1000 Profile Database Privacy Policy</h2>
              <h4 className="text-white mt-4">Our contact details</h4>
              <p className="text-white ml-3">
                Site Administrator<br />
                Email: admin@g1000profiledb.com
              </p>
              <p className="text-white mb-5">(This notice updated February 2026)</p>
              <h4 className="text-white mt-4">The types of personal information we collect</h4>
              <p className="text-white">We currently collect and process the following types of personal information:</p>
              <p className="text-white ml-3">
                <b>Your display name</b> (as provided by you when registering an account)<br />
                <i>This is recorded on profiles you create that are saved to this site, which are visible to any visitor to the site.</i>
              </p>
              <p className="text-white ml-3">
                <b>Your email address</b> (as provided by you when registering an account)<br />
                <i>Used for account login and password reset. Your email address is not shared with third parties and is not displayed publicly.</i>
              </p>
              <p className="text-white ml-3">
                <b>A secure hash of your password</b><br />
                <i>Your plaintext password is never stored. Only a one-way cryptographic hash is retained, which cannot be reversed to recover your original password.</i>
              </p>
              <p className="text-white">We do not collect or store any other personal information.</p>
              <p className="text-white">IP addresses may be used for rate limiting purposes (to prevent abuse) but are not persisted to disk or stored in the database.</p>
              <p className="text-white">This site does not create or use any permanent cookies. Temporary session cookies are used when you log in and expire after your session ends.</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
