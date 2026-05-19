"use client"

import { useCallback, useEffect, useState } from "react"

export type StorageFile = {
    name: string
    key: string
    size: number
    type: string
    kind: "file"
    lastModified?: number
    etag?: string
    metadata?: Record<string, string>
}

export type StorageFolder = {
    name: string
    key: string
    size: 0
    type: "folder"
    kind: "folder"
}

export type StorageItem = StorageFile | StorageFolder

export type FilesList = {
    items: StorageItem[]
    cursor?: string
}

export type UseFilesOptions = {
    resourceId: string | null
    location?: string
    cursor?: string
    limit?: number
    enabled?: boolean
}

type BrowseFilesResponse = {
    success: true
    files: FilesList
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

function createFilesUrl({ resourceId, location = "", cursor, limit }: UseFilesOptions): string | null {
    if (!resourceId) {
        return null
    }

    const params = new URLSearchParams()

    if (location) {
        params.set("location", location)
    }

    if (cursor) {
        params.set("cursor", cursor)
    }

    if (typeof limit === "number") {
        params.set("limit", String(limit))
    }

    const query = params.toString()
    const path = `/api/v1/storageexplorer/resource/${encodeURIComponent(resourceId)}/browse`

    return query ? `${path}?${query}` : path
}

export async function browseFiles(options: UseFilesOptions): Promise<FilesList> {
    const url = createFilesUrl(options)

    if (!url) {
        return { items: [] }
    }

    const response = await fetchJson<BrowseFilesResponse>(url)
    return response.files
}

export function useFiles(options: UseFilesOptions): AsyncState<FilesList> {
    const { enabled = true, resourceId, location = "", cursor, limit } = options
    const [state, setState] = useState<Omit<AsyncState<FilesList>, "reload">>({
        data: null,
        loaded: false,
        error: null,
    })

    const reload = useCallback(async () => {
        if (!enabled) {
            setState({ data: null, loaded: false, error: null })
            return
        }

        if (!resourceId) {
            setState({ data: { items: [] }, loaded: true, error: null })
            return
        }

        try {
            const data = await browseFiles({ resourceId, location, cursor, limit })
            setState({ data, loaded: true, error: null })
        } catch (error) {
            setState({
                data: null,
                loaded: true,
                error: error instanceof Error ? error : new Error("Unable to load files"),
            })
        }
    }, [cursor, enabled, limit, location, resourceId])

    useEffect(() => {
        reload()
    }, [reload])

    return { ...state, reload }
}
