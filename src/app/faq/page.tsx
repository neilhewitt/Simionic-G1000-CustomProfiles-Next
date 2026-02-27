"use client";

import { useState } from "react";

interface FAQEntry {
  question: string;
  answer: string[];
}

/**
 * Renders a paragraph that may contain simple <a> tags.
 * This replaces dangerouslySetInnerHTML with explicit React rendering,
 * eliminating the latent XSS risk if content were ever loaded dynamically.
 */
function FAQParagraph({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  const linkRegex = /<a\s+href="([^"]*)"(?:\s+[^>]*)?>([^<]*)<\/a>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = linkRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const href = match[1];
    const label = match[2];
    const isExternal = href.startsWith("http");
    parts.push(
      <a
        key={match.index}
        href={href}
        {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {label}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return <p className="text-white">{parts}</p>;
}

const faqEntries: FAQEntry[] = [
  {
    question: "How do I use these profiles with my Simionic apps?",
    answer: [
      "To use the profiles stored here with your apps, you need to first make sure you're on the latest version of the app. Some older iPads cannot run the latest versions and may not be able to use custom profile data. Once you have this, touch the spot at the top-right of the PFD / MFD screen to access the settings. You should see a tab marked 'Aircraft' - select this. At the top should be an option 'Customisation'. Enabling this requires an in-app purchase.",
      "Once you have paid for the feature and it's available, you can touch 'Customisation' and this will open a dialog box where you can choose the settings for your custom aircraft profile. The profile page on this site is layed out similarly to the custom profile dialog in the app. You can transpose the options and data from the profile screen here into the dialog in your app. You can also import profiles using the Custom Profile Manager tool.",
    ],
  },
  {
    question: "Do I have to log in to use this site?",
    answer: [
      "No, not to search and use profiles.",
      'However, if you want to <a href="/create">create a profile</a>, or edit a profile you have created previously, then you do need to log in. You can register for a free account using your email address and a password of your choice. Click the \'Log In\' link in the navigation bar to sign in or register a new account.',
    ],
  },
  {
    question: "How do I share a profile with the community?",
    answer: [
      "There are two ways to share a profile.",
      'The simplest is to install the <a href="/downloads">Simionic Custom Profile Manager</a> desktop app and use this to export your profile to a JSON file, which you can then <a href="/import">import</a> into the site. The profile will be immediately saved to the database as a draft that you can publish when you\'re ready.',
      'Alternatively, you can <a href="/create">create</a> a new empty profile. Give your profile a name (you can change this later), and click the \'create\' button.',
      "This will open the profile editing screen. Fill out the details, and when you're ready, you can click 'save draft' at the bottom of the form. This will save your work to the database, but in a draft (unpublished) state so that only you can see it. When you're happy with your new profile, you can set the status to 'published' using the button at the top of the form, and then save again. This will publish your profile for everyone to see.",
      "If you want to edit a profile you created, once logged in, you will see 'edit' buttons on every profile you have contributed on the browse profiles screen. You can filter the view to show just your profiles, or just your profiles in draft. Click 'edit' to open the edit view, make your changes, and hit 'save' again to save changes. Once saved, previous changes are lost. You can also un-publish a published profile, but for the sake of the community we would ask that you don't do that without a good reason.",
    ],
  },
  {
    question: "Does the site store my personal data, such as passwords?",
    answer: [
      "The site stores the minimum data necessary to operate your account: your display name, your email address, and a secure hash of your password. Your plaintext password is never stored — only a one-way Argon2 hash is retained, which cannot be reversed to recover your original password.",
      "Your display name is stored on any profiles that you create and is visible to other users. Your email address is used only for account management (login, password reset) and is never shared with third parties.",
    ],
  },
  {
    question: "How do I contact the site administrator?",
    answer: [
      'If you need to contact us, please use the email on our <a href="/contact">Contact Us</a> page. We will try to reply as quickly as possible, but remember that this site is run by volunteers purely as a hobby project.',
    ],
  },
  {
    question: "Can I donate to help with the running costs?",
    answer: [
      "It's nice of you to ask, but we aren't looking for donations at the moment! If running the site becomes expensive and the site is popular, we may set up a donation link.",
    ],
  },
];

function FAQItem({ entry, index }: { entry: FAQEntry; index: number }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <h5 className="text-white mt-2">
        <a
          className="text-decoration-none text-white"
          href={`#faq${index}`}
          role="button"
          aria-expanded={isOpen}
          onClick={(e) => {
            e.preventDefault();
            setIsOpen(!isOpen);
          }}
        >
          {entry.question}
        </a>
      </h5>
      {isOpen && (
        <div>
          {entry.answer.map((para, i) => (
            <FAQParagraph key={i} text={para} />
          ))}
        </div>
      )}
    </>
  );
}

export default function FAQPage() {
  return (
    <main className="bg-dark py-5">
      <div className="container px-5">
        <div className="row gx-5 align-items-center justify-content-center">
          <div className="col-10">
            <div className="my-5 text-body fw-normal">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img className="img-fluid rounded-3 ml-5 mb-5 float-end" src="/img/G1000_screen.jpg" width={300} alt="G1000 MFD & PFD set into a cockpit instrument panel" />
              <h3 className="fw-bolder text-white mb-5">Frequently Asked Questions</h3>
              {faqEntries.map((entry, i) => (
                <FAQItem key={i} entry={entry} index={i + 1} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
