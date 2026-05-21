"use client"

import { useEffect, useMemo, useState } from "react"
import { useAppContext } from "@/lib/appContext"
import { useResource, useResources } from "@/lib/resources"

export function ResourcePanel() {
    const { scope } = useAppContext()
    const resources = useResources({ scopeId: scope })
    const [selectedResourceId, setSelectedResourceId] = useState<string | null>(null)

    useEffect(() => {
        if (!selectedResourceId && resources.data?.length) {
            setSelectedResourceId(resources.data[0].id)
        }
    }, [resources.data, selectedResourceId])

    const resource = useResource(selectedResourceId)
    const selectedResource = useMemo(
        () => resources.data?.find((item) => item.id === selectedResourceId) ?? null,
        [resources.data, selectedResourceId],
    )

    return (
        <div className="flex h-full flex-1 flex-col">
            <div className="border-b border-[#e4e4e7] p-4">
                <div className="text-lg text-[#666666]">Resources</div>
                <div className="text-sm text-[#999999]">Resource explorer</div>
            </div>
            <div className="grid flex-1 grid-cols-[280px_minmax(0,1fr)]">
                <div className="border-r border-[#e4e4e7] p-4">
                    <div className="mb-3 text-sm font-medium text-[#666666]">All resources</div>
                    {resources.error ? (
                        <div className="text-sm text-destructive">{resources.error.message}</div>
                    ) : !resources.loaded ? (
                        <div className="text-sm text-[#999999]">Loading resources...</div>
                    ) : resources.data?.length ? (
                        <div className="flex flex-col gap-1">
                            {resources.data.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    className={`rounded-md px-3 py-2 text-left text-sm transition-colors ${
                                        item.id === selectedResourceId
                                            ? "bg-primary text-primary-foreground"
                                            : "text-[#666666] hover:bg-[#f5f5f5]"
                                    }`}
                                    onClick={() => setSelectedResourceId(item.id)}
                                >
                                    <div className="truncate font-medium">{item.name}</div>
                                    <div className="truncate text-xs opacity-70">
                                        {item.type} · {item.phase}
                                    </div>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="text-sm text-[#999999]">No resources found.</div>
                    )}
                </div>
                <div className="p-4">
                    {!selectedResourceId ? (
                        <div className="text-sm text-[#999999]">Select a resource to inspect it.</div>
                    ) : resource.error ? (
                        <div className="text-sm text-destructive">{resource.error.message}</div>
                    ) : !resource.loaded ? (
                        <div className="text-sm text-[#999999]">Loading resource...</div>
                    ) : selectedResource ? (
                        <div className="space-y-4">
                            <div>
                                <div className="text-xl font-medium text-[#444444]">{selectedResource.name}</div>
                                <div className="text-sm text-[#999999]">
                                    {selectedResource.type} · {selectedResource.phase}
                                </div>
                            </div>
                            <ResourceField label="ID" value={selectedResource.id} />
                            <ResourceField label="Scope" value={selectedResource.scopeId} />
                            <ResourceField label="Health" value={selectedResource.health} />
                            <ResourceField label="Provider" value={selectedResource.provider ?? "-"} />
                            <ResourceField label="Last error" value={selectedResource.lastError ?? "-"} />
                            <ResourceField label="Spec" value={JSON.stringify(selectedResource.spec, null, 2)} monospaced />
                        </div>
                    ) : (
                        <div className="text-sm text-[#999999]">Resource not found.</div>
                    )}
                </div>
            </div>
        </div>
    )
}

function ResourceField({
    label,
    value,
    monospaced = false,
}: {
    label: string
    value: string
    monospaced?: boolean
}) {
    return (
        <div className="rounded-md border border-[#e4e4e7] bg-[#fafafa] p-3">
            <div className="text-xs uppercase tracking-wide text-[#999999]">{label}</div>
            <div className={monospaced ? "mt-1 whitespace-pre-wrap font-mono text-sm text-[#444444]" : "mt-1 text-sm text-[#444444]"}>
                {value}
            </div>
        </div>
    )
}
