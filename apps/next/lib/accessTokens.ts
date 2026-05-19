"use client"

import { useCallback, useEffect, useState } from "react"

export type AccessToken = {
    id: string
    name: string
    description: string | null
    scopeId: string
    createdBy: string
    expiresAt: string
    usedAt: string | null
    revokedAt: string | null
    createdAt: string
    updatedAt: string
}

export type CreatedAccessToken = AccessToken & {
    token: string
}

export type CreateAccessTokenInput = {
    scopeId: string
    name?: string
    description?: string | null
    expiresInMinutes?: number
}

export type ListAccessTokensOptions = {
    scopeId?: string | null
    includeInactive?: boolean
}

type AsyncState<T> = {
    data: T | null
    loaded: boolean
    error: Error | null
    reload: () => Promise<void>
}

type CreateAccessTokenState = {
    data: CreatedAccessToken | null
    creating: boolean
    error: Error | null
    create: (input: CreateAccessTokenInput) => Promise<CreatedAccessToken>
    reset: () => void
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const sessionId = getCookie("keystone.sid")
    const response = await fetch(url, {
        credentials: "include",
        ...init,
        headers: {
            "Content-Type": "application/json",
            ...(sessionId ? { "x-keystone-session-id": sessionId } : {}),
            ...init?.headers,
        },
    })

    if (!response.ok) {
        let message = `HTTP error! status: ${response.status}`

        try {
            const body = await response.json()
            if (typeof body.error === "string") {
                message = body.error
            }
        } catch {
            // Keep the status-based fallback when the server does not return JSON.
        }

        throw new Error(message)
    }

    return response.json()
}

function getCookie(name: string): string | null {
    if (typeof document === "undefined") {
        return null
    }

    return document.cookie
        .split(";")
        .map((cookie) => cookie.trim())
        .filter(Boolean)
        .map((cookie) => {
            const [cookieName, ...value] = cookie.split("=")
            return [cookieName, decodeURIComponent(value.join("="))] as const
        })
        .find(([cookieName]) => cookieName === name)?.[1] ?? null
}

function createAccessTokensUrl({
    scopeId,
    includeInactive,
}: ListAccessTokensOptions = {}) {
    const params = new URLSearchParams()

    if (scopeId) {
        params.set("scopeId", scopeId)
    }

    if (includeInactive === false) {
        params.set("includeInactive", "false")
    }

    const query = params.toString()
    return query ? `/api/v1/enrollment-tokens?${query}` : "/api/v1/enrollment-tokens"
}

export async function listAccessTokens(
    options: ListAccessTokensOptions = {},
): Promise<AccessToken[]> {
    return fetchJson<AccessToken[]>(createAccessTokensUrl(options))
}

export async function createAccessToken(
    input: CreateAccessTokenInput,
): Promise<CreatedAccessToken> {
    return fetchJson<CreatedAccessToken>("/api/v1/enrollment-tokens", {
        method: "POST",
        body: JSON.stringify(input),
    })
}

export function useAccessTokens(
    options: ListAccessTokensOptions & { enabled?: boolean } = {},
): AsyncState<AccessToken[]> {
    const { enabled = true, scopeId = null, includeInactive = true } = options
    const [state, setState] = useState<Omit<AsyncState<AccessToken[]>, "reload">>({
        data: null,
        loaded: false,
        error: null,
    })

    const reload = useCallback(async () => {
        if (!enabled) {
            setState({ data: null, loaded: false, error: null })
            return
        }

        try {
            const data = await listAccessTokens({ scopeId, includeInactive })
            setState({ data, loaded: true, error: null })
        } catch (error) {
            setState({
                data: null,
                loaded: true,
                error:
                    error instanceof Error
                        ? error
                        : new Error("Unable to load access tokens"),
            })
        }
    }, [enabled, includeInactive, scopeId])

    useEffect(() => {
        reload()
    }, [reload])

    return { ...state, reload }
}

export function useCreateAccessToken(): CreateAccessTokenState {
    const [data, setData] = useState<CreatedAccessToken | null>(null)
    const [creating, setCreating] = useState(false)
    const [error, setError] = useState<Error | null>(null)

    const create = useCallback(async (input: CreateAccessTokenInput) => {
        setCreating(true)
        setError(null)

        try {
            const token = await createAccessToken(input)
            setData(token)
            return token
        } catch (error) {
            const nextError =
                error instanceof Error
                    ? error
                    : new Error("Unable to create access token")

            setError(nextError)
            throw nextError
        } finally {
            setCreating(false)
        }
    }, [])

    const reset = useCallback(() => {
        setData(null)
        setError(null)
        setCreating(false)
    }, [])

    return { data, creating, error, create, reset }
}
