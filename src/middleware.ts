import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
    // Get the auth token from NextAuth
    const token = await getToken({
        req: request,
        secret: process.env.NEXTAUTH_SECRET,
    });

    const { pathname } = request.nextUrl;

    // Paths that do not require authentication
    const isLandingPage = pathname === "/";
    const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/signup");
    const isApiAuthRoute = pathname.startsWith("/api/auth");
    const isPublicAsset = pathname.startsWith("/_next") || pathname.includes("favicon.ico");

    // Allow public assets and NextAuth internal routes to pass through
    if (isPublicAsset || isApiAuthRoute) {
        return NextResponse.next();
    }

    // Allow landing page for everyone
    if (isLandingPage) {
        return NextResponse.next();
    }

    // If the user is on an auth page (login/signup)
    if (isAuthPage) {
        // If they are already logged in, redirect them to the app
        if (token) {
            return NextResponse.redirect(new URL("/app", request.url));
        }
        // Otherwise, allow them to view the login/signup pages
        return NextResponse.next();
    }

    // For any other route (like root '/' or '/api/agent/*'), require authentication
    if (!token) {
        // Redirect to login page if unauthenticated
        let from = request.nextUrl.pathname;
        if (request.nextUrl.search) {
            from += request.nextUrl.search;
        }

        return NextResponse.redirect(
            new URL(`/login?from=${encodeURIComponent(from)}`, request.url)
        );
    }

    // Allow authenticated users to proceed
    return NextResponse.next();
}

export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         * - public folder files
         */
        "/((?!_next/static|_next/image|favicon.ico).*)",
    ],
};
