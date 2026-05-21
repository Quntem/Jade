"use client"

import { useCallback, useEffect, useState } from "react"
import type { VpnHubSummary } from "@/lib/servers"

export type VpnClientStatus =
    | "Pending"
    | "Ready"
    | "Delivered"
    | "Degraded"
    | "Disabled"

export type VpnClientCreationMode = "secure" | "regular"

export type VpnClientScopeSummary = {
    id: string
    name: string
    type: string
}

export type VpnClient = {
    id: string
    scopeId: string
    hubId: string
    name: string
    tunnelIp: string
    publicKey: string
    status: VpnClientStatus
    enabled: boolean
    createdAt: string
    updatedAt: string
    deletedAt: string | null
    privateKeyStored: boolean
    hub: VpnHubSummary
    scope: VpnClientScopeSummary
}

export type CreatedVpnClient = VpnClient & {
    privateKey: string
    renderedConfig: string
    configFileName: string
}

export type VpnClientConfig = {
    renderedConfig: string
    configFileName: string
}

export type ListVpnClientsOptions = {
    scopeId?: string | null
    includeInactive?: boolean
}

export type CreateVpnClientInput = {
    scopeId: string
    name: string
    creationMode?: VpnClientCreationMode
}

export type UpdateVpnClientInput = {
    name?: string
    publicKey?: string
    hubId?: string | null
    status?: VpnClientStatus
    enabled?: boolean
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

function createVpnClientsUrl({
    scopeId,
    includeInactive,
}: ListVpnClientsOptions = {}) {
    const params = new URLSearchParams()

    if (scopeId) {
        params.set("scopeId", scopeId)
    }

    if (includeInactive) {
        params.set("includeInactive", "true")
    }

    const query = params.toString()
    return query ? `/api/v1/vpn/clients?${query}` : "/api/v1/vpn/clients"
}

function normalizeClientId(id: string) {
    return encodeURIComponent(id)
}

export async function listVpnClients(
    options: ListVpnClientsOptions = {},
): Promise<VpnClient[]> {
    return fetchJson<VpnClient[]>(createVpnClientsUrl(options))
}

export async function getVpnClient(id: string): Promise<VpnClient> {
    return fetchJson<VpnClient>(`/api/v1/vpn/clients/id/${normalizeClientId(id)}`)
}

export async function createVpnClient(
    input: CreateVpnClientInput,
): Promise<CreatedVpnClient> {
    return fetchJson<CreatedVpnClient>("/api/v1/vpn/clients", {
        method: "POST",
        body: JSON.stringify(input),
    })
}

export async function getVpnClientConfig(
    id: string,
): Promise<VpnClientConfig> {
    return fetchJson<VpnClientConfig>(
        `/api/v1/vpn/clients/id/${normalizeClientId(id)}/config`,
    )
}

export function downloadVpnClientConfig(config: VpnClientConfig | null) {
    if (!config || typeof window === "undefined") {
        return
    }

    const blob = new Blob([config.renderedConfig], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = config.configFileName || "vpn-client.conf"
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

export async function updateVpnClient(
    id: string,
    input: UpdateVpnClientInput,
): Promise<VpnClient> {
    return fetchJson<VpnClient>(`/api/v1/vpn/clients/id/${normalizeClientId(id)}`, {
        method: "PATCH",
        body: JSON.stringify(input),
    })
}

export async function deleteVpnClient(id: string): Promise<VpnClient> {
    return fetchJson<VpnClient>(`/api/v1/vpn/clients/id/${normalizeClientId(id)}`, {
        method: "DELETE",
    })
}

export function useVpnClients(
    options: ListVpnClientsOptions & { enabled?: boolean } = {},
): AsyncState<VpnClient[]> {
    const { enabled = true, scopeId = null, includeInactive = false } = options
    const [state, setState] = useState<Omit<AsyncState<VpnClient[]>, "reload">>({
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
            const data = await listVpnClients({ scopeId, includeInactive })
            setState({ data, loaded: true, error: null })
        } catch (error) {
            setState({
                data: null,
                loaded: true,
                error:
                    error instanceof Error
                        ? error
                        : new Error("Unable to load VPN clients"),
            })
        }
    }, [enabled, includeInactive, scopeId])

    useEffect(() => {
        reload()
    }, [reload])

    return { ...state, reload }
}

export function useVpnClient(
    id: string | null,
    options: { enabled?: boolean } = {},
): AsyncState<VpnClient> {
    const { enabled = true } = options
    const [state, setState] = useState<Omit<AsyncState<VpnClient>, "reload">>({
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
            const data = await getVpnClient(id)
            setState({ data, loaded: true, error: null })
        } catch (error) {
            setState({
                data: null,
                loaded: true,
                error:
                    error instanceof Error
                        ? error
                        : new Error("Unable to load VPN client"),
            })
        }
    }, [enabled, id])

    useEffect(() => {
        reload()
    }, [reload])

    return { ...state, reload }
}

export function useCreateVpnClient(): MutationState<CreateVpnClientInput, CreatedVpnClient> {
    const [data, setData] = useState<CreatedVpnClient | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<Error | null>(null)

    const mutate = useCallback(async (input: CreateVpnClientInput) => {
        setLoading(true)
        setError(null)

        try {
            const client = await createVpnClient(input)
            setData(client)
            return client
        } catch (error) {
            const nextError =
                error instanceof Error
                    ? error
                    : new Error("Unable to create VPN client")

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

export function useUpdateVpnClient(): MutationState<
    { id: string; input: UpdateVpnClientInput },
    VpnClient
> {
    const [data, setData] = useState<VpnClient | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<Error | null>(null)

    const mutate = useCallback(async ({ id, input }: { id: string; input: UpdateVpnClientInput }) => {
        setLoading(true)
        setError(null)

        try {
            const client = await updateVpnClient(id, input)
            setData(client)
            return client
        } catch (error) {
            const nextError =
                error instanceof Error
                    ? error
                    : new Error("Unable to update VPN client")

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

export function useDeleteVpnClient(): MutationState<string, VpnClient> {
    const [data, setData] = useState<VpnClient | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<Error | null>(null)

    const mutate = useCallback(async (id: string) => {
        setLoading(true)
        setError(null)

        try {
            const client = await deleteVpnClient(id)
            setData(client)
            return client
        } catch (error) {
            const nextError =
                error instanceof Error
                    ? error
                    : new Error("Unable to delete VPN client")

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
