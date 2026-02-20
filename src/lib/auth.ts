import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { findUserByEmail } from "./user-store";
import { verifyPassword } from "./password";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
  },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await findUserByEmail(credentials.email);
        if (!user) return null;

        const valid = await verifyPassword(user.passwordHash, credentials.password);
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
        (session as any).ownerId = token.ownerId;
      }
      return session;
    },
  },
  pages: {
    signIn: "/auth/signin",
  },
};
