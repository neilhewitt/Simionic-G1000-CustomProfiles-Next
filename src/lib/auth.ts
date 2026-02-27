import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { findUserByEmail } from "./user-store";
import { verifyPassword } from "./password";

if (!process.env.NEXTAUTH_SECRET) {
  throw new Error("NEXTAUTH_SECRET environment variable is not set");
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    strategy: "jwt",
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email as string;
        const password = credentials.password as string;

        const user = await findUserByEmail(email);
        if (!user) return null;

        const valid = await verifyPassword(user.passwordHash, password);
        if (!valid) return null;

        return {
          id: user.ownerId,
          email: user.email,
          name: user.name,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // user.id is the ownerId returned from authorize()
        token.ownerId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.ownerId) {
        session.ownerId = token.ownerId as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
});
