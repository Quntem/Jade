"use client"
import { AuthState, useAuth } from "keystone-lib";
import { createContext, useContext, useEffect, useState } from "react";

export const authContext = createContext({
    authState: null as AuthState | null,
    sessionCookieReady: false,
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [sessionCookieReady, setSessionCookieReady] = useState(false)
    const auth = useAuth({
        appId: process.env.NEXT_PUBLIC_APP_ID!,
        keystoneUrl: process.env.NEXT_PUBLIC_KEYSTONE_URL!,
    })
    useEffect(() => {
        if (!auth.loaded) {
            setSessionCookieReady(false)
            return
        }

        if (auth.data?.sessionId) {
            document.cookie = `keystone.sid=${encodeURIComponent(auth.data.sessionId)}; Path=/; SameSite=Lax`
            setSessionCookieReady(true)
            return
        }

        document.cookie = "keystone.sid=; Path=/; Max-Age=0; SameSite=Lax"
        setSessionCookieReady(true)
    }, [auth.loaded, auth.data?.sessionId])

    if (auth.loaded && auth.error) {
        window.location.href = process.env.NEXT_PUBLIC_KEYSTONE_URL! + "/auth/signin?redirectTo=" + encodeURIComponent(window.location.href);
    }
    return (
        <authContext.Provider value={{ authState: auth, sessionCookieReady }}>
            {children}
        </authContext.Provider>
    )
}

export function useAuthContext() {
    return useContext(authContext)
}
