"use client"

import { useCallback, useEffect, useState } from "react"

export type ServerStatus =
    | "Unknown"
    | "Online"
    | "Offline"
    | "Degraded"
    | "Maintenance"

export type AgentStatus = "Unknown" | "Online" | "Offline" | "Degraded"

export type ServerAgent = {
    id: string
    serverId: string
    name: string
    version: string | null
    wireguardPublicKey: string | null
    status: AgentStatus
    lastSeenAt: string | null
    capabilities: unknown
    metadata: unknown
    createdAt: string
    updatedAt: string
    deletedAt: string | null
}

export type VpnHubSummary = {
    id: string
    name: string
    endpointHost: string
    endpointPort: number
    status: "Unknown" | "Online" | "Offline" | "Degraded"
}

export type VpnConfigRevision = {
    id: string
    peerId: string
    hubId: string
    revision: number
    desiredStateVersion: number
    renderedConfig: string
    payload: unknown
    deliveryStatus: "Pending" | "Delivered" | "Acknowledged" | "Failed"
    agentJobId: string | null
    acknowledgedAt: string | null
    lastError: string | null
    createdAt: string
    updatedAt: string
}

export type VpnPeer = {
    id: string
    serverId: string
    hubId: string
    tunnelIp: string
    publicKey: string
    status: "Pending" | "Ready" | "Delivered" | "Degraded" | "Disabled"
    enabled: boolean
    lastConfigRevisionId: string | null
    createdAt: string
    updatedAt: string
    deletedAt: string | null
    hub: VpnHubSummary
    configRevisions: VpnConfigRevision[]
}

export type ServerCapability = {
    id: string
    serverId: string
    type: string
    provider: string
    available: boolean
    data: unknown
    createdAt: string
    updatedAt: string
}

export type JadeServer = {
    id: string
    name: string
    scopeId: string | null
    status: ServerStatus
    hostname: string | null
    os: string | null
    arch: string | null
    cpuCores: number | null
    memoryBytes: string | number | null
    storageBytes: string | number | null
    lastSeenAt: string | null
    labels: unknown
    annotations: unknown
    metadata: unknown
    createdAt: string
    updatedAt: string
    deletedAt: string | null
    agents: ServerAgent[]
    capabilities: ServerCapability[]
    vpnPeers: VpnPeer[]
}

export type ListServersOptions = {
    scopeId?: string | null
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

function createServersUrl({ scopeId }: ListServersOptions = {}) {
    if (!scopeId) {
        return "/api/v1/servers"
    }

    const params = new URLSearchParams({ scopeId })
    return `/api/v1/servers?${params.toString()}`
}

export async function listServers(
    options: ListServersOptions = {},
): Promise<JadeServer[]> {
    return fetchJson<JadeServer[]>(createServersUrl(options))
}

export async function getServer(id: string): Promise<JadeServer> {
    return fetchJson<JadeServer>(`/api/v1/servers/id/${encodeURIComponent(id)}`)
}

export type SpokeVpnConfig = {
    serverId: string
    tunnelIp: string
    endpoint: string
    allowedIps: string[]
    renderedConfig: string
}

export async function provisionVpnPeer(serverId: string): Promise<VpnPeer> {
    return fetchJson<VpnPeer>(
        `/api/v1/vpn/peers/${encodeURIComponent(serverId)}/provision`,
        { method: "POST", body: JSON.stringify({}) },
    )
}

export async function deliverVpnConfig(
    serverId: string,
): Promise<{ configRevisionId: string; agentJobId: string }> {
    return fetchJson<{ configRevisionId: string; agentJobId: string }>(
        `/api/v1/vpn/peers/${encodeURIComponent(serverId)}/deliver-config`,
        { method: "POST", body: JSON.stringify({}) },
    )
}

export async function getVpnConfig(serverId: string): Promise<SpokeVpnConfig> {
    return fetchJson<SpokeVpnConfig>(
        `/api/v1/vpn/peers/${encodeURIComponent(serverId)}/config`,
    )
}

export type SearchResult = {
    type: "vpn_client" | "vpn_peer" | "server" | "scope" | "resource"
    id: string
    name: string
    scopeId: string | null
    hubId: string | null
    status?: string
}

export async function searchResources(query: string): Promise<SearchResult[]> {
    const params = new URLSearchParams({ q: query })
    const response = await fetchJson<{ results: SearchResult[] }>(
        `/api/v1/vpn/search?${params.toString()}`,
    )
    return response.results
}

export function useSearchResources(
    query: string,
    options: { enabled?: boolean } = {},
): AsyncState<SearchResult[]> {
    const { enabled = true } = options
    const [state, setState] = useState<Omit<AsyncState<SearchResult[]>, "reload">>({
        data: null,
        loaded: false,
        error: null,
    })

    const reload = useCallback(async () => {
        if (!enabled || !query.trim()) {
            setState({ data: null, loaded: false, error: null })
            return
        }

        try {
            const data = await searchResources(query)
            setState({ data, loaded: true, error: null })
        } catch (error) {
            setState({
                data: null,
                loaded: true,
                error:
                    error instanceof Error
                        ? error
                        : new Error("Unable to search resources"),
            })
        }
    }, [enabled, query])

    useEffect(() => {
        const timer = setTimeout(() => {
            reload()
        }, 300)

        return () => clearTimeout(timer)
    }, [reload])

    return { ...state, reload }
}

export function useServers(
    options: ListServersOptions & { enabled?: boolean } = {},
): AsyncState<JadeServer[]> {
    const { enabled = true, scopeId = null } = options
    const [state, setState] = useState<Omit<AsyncState<JadeServer[]>, "reload">>({
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
            const data = await listServers({ scopeId })
            setState({ data, loaded: true, error: null })
        } catch (error) {
            setState({
                data: null,
                loaded: true,
                error:
                    error instanceof Error
                        ? error
                        : new Error("Unable to load servers"),
            })
        }
    }, [enabled, scopeId])

    useEffect(() => {
        reload()
    }, [reload])

    return { ...state, reload }
}

export function useServer(
    id: string | null,
    options: { enabled?: boolean } = {},
): AsyncState<JadeServer> {
    const { enabled = true } = options
    const [state, setState] = useState<Omit<AsyncState<JadeServer>, "reload">>({
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
            const data = await getServer(id)
            setState({ data, loaded: true, error: null })
        } catch (error) {
            setState({
                data: null,
                loaded: true,
                error:
                    error instanceof Error
                        ? error
                        : new Error("Unable to load server"),
            })
        }
    }, [enabled, id])

    useEffect(() => {
        reload()
    }, [reload])

    return { ...state, reload }
}
