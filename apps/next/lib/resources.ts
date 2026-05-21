"use client"

import { useCallback, useEffect, useState } from "react"

export type ResourcePhase =
    | "Pending"
    | "Planning"
    | "Scheduled"
    | "Deploying"
    | "Running"
    | "Degraded"
    | "Failed"
    | "Deleting"
    | "Deleted"

export type ResourceHealth = "Unknown" | "Healthy" | "Warning" | "Unhealthy"

export type Resource = {
    id: string
    type: string
    name: string
    scopeId: string
    spec: unknown
    status: unknown
    desiredVersion: number
    observedVersion: number
    phase: ResourcePhase
    health: ResourceHealth
    provider: string | null
    targetId: string | null
    labels: unknown
    annotations: unknown
    createdBy: string | null
    createdAt: string
    updatedAt: string
    deletedAt: string | null
    lastError: string | null
}

export type ListResourcesOptions = {
    scopeId?: string | null
    type?: string | null
    includeDeleted?: boolean
}

export type CreateResourceInput = {
    scopeId: string
    type: string
    name: string
    spec: unknown
    status?: unknown
    provider?: string | null
    targetId?: string | null
    labels?: unknown
    annotations?: unknown
    createdBy?: string | null
}

export type UpdateResourceInput = {
    type?: string
    name?: string
    scopeId?: string
    spec?: unknown
    status?: unknown
    desiredVersion?: number
    observedVersion?: number
    phase?: ResourcePhase
    health?: ResourceHealth
    provider?: string | null
    targetId?: string | null
    labels?: unknown
    annotations?: unknown
    createdBy?: string | null
    lastError?: string | null
    deletedAt?: string | null
}

type AsyncState<T> = {
    data: T | null
    loaded: boolean
    error: Error | null
    reload: () => Promise<void>
}

type MutationState<TInput, TResult> = {
    data: TResult | null
    loading: boolean
    error: Error | null
    mutate: (input: TInput) => Promise<TResult>
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

function createResourcesUrl({
    scopeId,
    type,
    includeDeleted,
}: ListResourcesOptions = {}) {
    const params = new URLSearchParams()

    if (scopeId) {
        params.set("scopeId", scopeId)
    }

    if (type) {
        params.set("type", type)
    }

    if (includeDeleted) {
        params.set("includeDeleted", "true")
    }

    const query = params.toString()
    return query ? `/api/v1/resources?${query}` : "/api/v1/resources"
}

function normalizeResourceId(id: string) {
    return encodeURIComponent(id)
}

export async function listResources(options: ListResourcesOptions = {}): Promise<Resource[]> {
    return fetchJson<Resource[]>(createResourcesUrl(options))
}

export async function getResource(id: string): Promise<Resource> {
    return fetchJson<Resource>(`/api/v1/resources/id/${normalizeResourceId(id)}`)
}

export async function createResource(input: CreateResourceInput): Promise<Resource> {
    return fetchJson<Resource>("/api/v1/resources", {
        method: "POST",
        body: JSON.stringify(input),
    })
}

export async function updateResource(
    id: string,
    input: UpdateResourceInput,
): Promise<Resource> {
    return fetchJson<Resource>(`/api/v1/resources/id/${normalizeResourceId(id)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
    })
}

export function useResources(
    options: ListResourcesOptions & { enabled?: boolean } = {},
): AsyncState<Resource[]> {
    const { enabled = true, scopeId = null, type = null, includeDeleted = false } = options
    const [state, setState] = useState<Omit<AsyncState<Resource[]>, "reload">>({
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
            const data = await listResources({ scopeId, type, includeDeleted })
            setState({ data, loaded: true, error: null })
        } catch (error) {
            setState({
                data: null,
                loaded: true,
                error:
                    error instanceof Error
                        ? error
                        : new Error("Unable to load resources"),
            })
        }
    }, [enabled, includeDeleted, scopeId, type])

    useEffect(() => {
        reload()
    }, [reload])

    return { ...state, reload }
}

export function useResource(
    id: string | null,
    options: { enabled?: boolean } = {},
): AsyncState<Resource> {
    const { enabled = true } = options
    const [state, setState] = useState<Omit<AsyncState<Resource>, "reload">>({
        data: null,
        loaded: false,
        error: null,
    })

    const reload = useCallback(async () => {
        if (!enabled) {
            setState({ data: null, loaded: false, error: null })
            return
        }

        if (!id) {
            setState({ data: null, loaded: true, error: null })
            return
        }

        try {
            const data = await getResource(id)
            setState({ data, loaded: true, error: null })
        } catch (error) {
            setState({
                data: null,
                loaded: true,
                error:
                    error instanceof Error
                        ? error
                        : new Error("Unable to load resource"),
            })
        }
    }, [enabled, id])

    useEffect(() => {
        reload()
    }, [reload])

    return { ...state, reload }
}

export function useCreateResource(): MutationState<CreateResourceInput, Resource> {
    const [data, setData] = useState<Resource | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<Error | null>(null)

    const mutate = useCallback(async (input: CreateResourceInput) => {
        setLoading(true)
        setError(null)

        try {
            const resource = await createResource(input)
            setData(resource)
            return resource
        } catch (error) {
            const nextError =
                error instanceof Error
                    ? error
                    : new Error("Unable to create resource")

            setError(nextError)
            throw nextError
        } finally {
            setLoading(false)
        }
    }, [])

    const reset = useCallback(() => {
        setData(null)
        setError(null)
        setLoading(false)
    }, [])

    return { data, loading, error, mutate, reset }
}

export function useUpdateResource(): MutationState<
    { id: string; input: UpdateResourceInput },
    Resource
> {
    const [data, setData] = useState<Resource | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<Error | null>(null)

    const mutate = useCallback(async ({ id, input }: { id: string; input: UpdateResourceInput }) => {
        setLoading(true)
        setError(null)

        try {
            const resource = await updateResource(id, input)
            setData(resource)
            return resource
        } catch (error) {
            const nextError =
                error instanceof Error
                    ? error
                    : new Error("Unable to update resource")

            setError(nextError)
            throw nextError
        } finally {
            setLoading(false)
        }
    }, [])

    const reset = useCallback(() => {
        setData(null)
        setError(null)
        setLoading(false)
    }, [])

    return { data, loading, error, mutate, reset }
}
