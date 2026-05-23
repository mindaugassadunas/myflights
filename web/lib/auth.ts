import NextAuth, { type NextAuthConfig, type Session } from "next-auth";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";

/**
 * Multi-user Auth.js config. Anyone with a Google account can sign in;
 * the PrismaAdapter materialises a fresh User row on first sign-in and
 * all per-user data is scoped by `userId` at the data layer.
 */
const config: NextAuthConfig = {
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      // Google is our only provider, so letting it claim a pre-existing
      // user row keyed off the same verified email is safe — it just
      // back-fills the Account link instead of erroring out with
      // OAuthAccountNotLinked. Don't enable this if you ever add a
      // second provider; it's only "dangerous" in multi-provider setups.
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  session: { strategy: "database" },
  pages: { signIn: "/login" },
  callbacks: {
    async session({ session, user }): Promise<Session> {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(config);

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
    };
  }
}
