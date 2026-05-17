"use client"

import { useCallback, useEffect, useState } from "react"

export type ScopeType =
    | "Organization"
    | "Project"
    | "ResourceGroup"
    | "Folder"
    | "System"

export type Scope = {
    id: string
    type: ScopeType
    name: string
    description: string | null
    parentId: string | null
    ownerId: string | null
    defaultProvider: string | null
    defaultTargetId: string | null
    labels: unknown
    annotations: unknown
    createdAt: string
    updatedAt: string
    deletedAt: string | null
}

export type CreateScopeInput = {
    name: string
    description?: string | null
    type: ScopeType
    parentId?: string | null
}

type AsyncState<T> = {
    data: T | null
    loaded: boolean
    error: Error | null
    reload: () => Promise<void>
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
        throw new Error(`HTTP error! status: ${response.status}`)
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

export function useScopes(enabled = true): AsyncState<Scope[]> {
    const [state, setState] = useState<Omit<AsyncState<Scope[]>, "reload">>({
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
            const data = await fetchJson<Scope[]>("/api/v1/scopes")
            setState({ data, loaded: true, error: null })
        } catch (error) {
            setState({
                data: null,
                loaded: true,
                error: error instanceof Error ? error : new Error("Unable to load scopes"),
            })
        }
    }, [enabled])

    useEffect(() => {
        reload()
    }, [reload])

    return { ...state, reload }
}

export function useScope(id: string | null): AsyncState<Scope> {
    const [state, setState] = useState<Omit<AsyncState<Scope>, "reload">>({
        data: null,
        loaded: false,
        error: null,
    })

    const reload = useCallback(async () => {
        if (!id) {
            setState({ data: null, loaded: true, error: null })
            return
        }

        try {
            const data = await fetchJson<Scope>(`/api/v1/scopes/id/${encodeURIComponent(id)}`)
            setState({ data, loaded: true, error: null })
        } catch (error) {
            setState({
                data: null,
                loaded: true,
                error: error instanceof Error ? error : new Error("Unable to load scope"),
            })
        }
    }, [id])

    useEffect(() => {
        reload()
    }, [reload])

    return { ...state, reload }
}

export async function createScope(input: CreateScopeInput): Promise<Scope> {
    return fetchJson<Scope>("/api/v1/scopes", {
        method: "POST",
        body: JSON.stringify(input),
    })
}
